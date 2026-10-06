import fs from 'fs-extra';
import path from 'path';
import { parseCodebase } from '../parsers/codeParser.js';
import { generateOfflinePlan } from '../parsers/pythonParser.js';
import { resolvePathId } from '../parsers/migrationRules.js';
import { complete, hasAnyKey, resolveProvider } from './providers.js';
import { executeChanges, revertChanges, applyTargetRenames } from '../executors/codeExecutor.js';
import { runTests } from '../validators/testRunner.js';
import { buildUnifiedDiffs } from '../utils/diff.js';
import { scoreConfidence } from '../utils/confidence.js';
import { buildRetriever, planQueries } from '../rag/retriever.js';
import { cacheGet, cacheSet } from '../utils/cache.js';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 3;
const RAG_ENABLED = !['0', 'false', 'no'].includes((process.env.RAG_ENABLED || '1').toLowerCase());

// Kept for backwards compat (tests / callers). Now means "any provider key".
export function hasApiKey() {
  return hasAnyKey();
}

export const CATALYST_SYSTEM_PROMPT = `You are an expert code migration specialist with deep knowledge of software versioning, deprecation patterns, and refactoring best practices.

Your job is to analyze codebases and generate precise, comprehensive migration plans that:
1. Transform code from one version/language/framework to another
2. Preserve all functionality, behavior, and semantics
3. Maintain and adapt dependency relationships
4. Follow idioms and best practices of the target version
5. Identify and mitigate risks and edge cases

RESPONSE FORMAT:
Always respond with valid JSON ONLY. No markdown. No explanations outside JSON.

{
  "strategy": "High-level approach",
  "riskLevel": "low|medium|high",
  "confidence": 0.85,
  "phases": [
    {
      "phase": 1,
      "description": "What this phase does",
      "changes": [
        {
          "file": "path/to/file",
          "type": "syntax|import|api|deprecation|idiom",
          "old": "Original code snippet",
          "new": "New code snippet",
          "reason": "Why this change",
          "confidence": 0.95
        }
      ]
    }
  ],
  "risks": [
    { "risk": "Description", "severity": "low|medium|high", "mitigation": "Solution" }
  ],
  "testStrategy": "How to validate",
  "dependencies": {
    "toAdd": ["new-lib>=1.0"],
    "toRemove": ["old-lib"],
    "toUpdate": [{"from": "lib@1.0", "to": "lib@2.0"}]
  },
  "postMigrationTasks": ["Task 1", "Task 2"]
}`;

/**
 * Catalyst orchestrator: Parse → Plan → Execute → Validate → (Fix & retry up to 3x)
 * - With any API key: full AI planning (+ offline rules merged in as phase 0)
 * - Without: deterministic offline plan (Python 2→3, ES5→ES2020, Py3.6→3.11)
 * opts: { migrationPath, provider, model }
 */
export async function runMigration(repoPath, sourceVersion, targetVersion, jobId, onProgress, opts = {}) {
  const migrationPath = opts.migrationPath || resolvePathId(sourceVersion, targetVersion, opts.migrationPath);
  const pathId = resolvePathId(sourceVersion, targetVersion, migrationPath);
  const aiOpts = { provider: opts.provider, model: opts.model };
  let resolved = null;
  try { resolved = resolveProvider(aiOpts.provider, aiOpts.model); } catch { resolved = null; }
  logger.info(
    `Starting migration: ${sourceVersion} → ${targetVersion} [${pathId}]` +
    (resolved ? ` via ${resolved.id}/${resolved.model}` : ' (offline)'),
    jobId
  );
  const progress = (patch) => { try { onProgress?.(patch); } catch { /* ignore */ } };

  progress({ status: 'analyzing', progress: 10 });
  const codebaseAnalysis = await parseCodebase(repoPath, sourceVersion);

  // RAG: index the repo + migration knowledge once per job (local tfidf
  // by default — works with no API key; set RAG_ENABLED=0 to disable).
  let retriever = null;
  let ragStats = { enabled: false };
  if (RAG_ENABLED) {
    try {
      retriever = await buildRetriever(repoPath, pathId, { sourceVersion, targetVersion });
      ragStats = { enabled: true, ...retriever.stats };
    } catch (err) {
      logger.warn(`RAG index failed (${err.message}) — falling back to full dump`, jobId);
    }
  }

  progress({ status: 'planning', progress: 30 });
  let migrationPlan;
  if (resolved) {
    const offline = await generateOfflinePlan(repoPath, pathId, sourceVersion, targetVersion).catch(() => null);
    const aiPlan = await generateMigrationPlan(codebaseAnalysis, sourceVersion, targetVersion, { ...aiOpts, retriever });
    migrationPlan = mergePlans(offline, aiPlan);
    migrationPlan.provider = aiPlan.provider;
    migrationPlan.model = aiPlan.model;
  } else {
    logger.warn('No AI API key — using offline rule-based plan', jobId);
    migrationPlan = await generateMigrationPlan(codebaseAnalysis, sourceVersion, targetVersion, { repoPath, pathId });
  }

  progress({ status: 'executing', progress: 55 });
  let execResults = await executeChanges(repoPath, migrationPlan);

  progress({ status: 'validating', progress: 75 });
  let testResults = await runTests(repoPath);

  let attempt = 0;
  // AI retry only makes sense with a key; offline retry would just repeat
  const canRetry = !!resolved && !migrationPlan.offline;
  while (!testResults.passed && attempt < MAX_RETRIES && canRetry) {
    attempt++;
    logger.info(`Tests failed, asking ${resolved.id} to fix (attempt ${attempt}/${MAX_RETRIES})...`, jobId);
    progress({ status: 'validating', progress: 75, retryAttempt: attempt });
    const fixedPlan = await fixFailedMigration(codebaseAnalysis, migrationPlan, testResults, sourceVersion, targetVersion, { ...aiOpts, retriever });
    await revertChanges(repoPath, execResults.originalContent);
    execResults = await executeChanges(repoPath, fixedPlan);
    migrationPlan = fixedPlan;
    testResults = await runTests(repoPath);
  }

  progress({ status: 'completed', progress: 100 });

  // Rename files that reference the source version (test.python2 → test.python3)
  const { renames } = await applyTargetRenames(repoPath, sourceVersion, targetVersion).catch((err) => {
    logger.warn(`Renames skipped: ${err.message}`, jobId);
    return { renames: [] };
  });
  const renameMap = new Map(renames.map((r) => [path.normalize(r.from), r.to]));
  const remappedOriginal = {};
  for (const [k, v] of Object.entries(execResults.originalContent || {})) {
    remappedOriginal[renameMap.get(path.normalize(k)) || k] = v;
  }
  execResults.originalContent = remappedOriginal;
  execResults.changedFiles = execResults.changedFiles.map((f) => renameMap.get(path.normalize(f)) || f);

  const migratedContent = await readMigratedContent(repoPath, execResults.originalContent);
  const diffs = buildUnifiedDiffs(execResults.originalContent, migratedContent);

  const { score: confidence, breakdown: confidenceBreakdown } = scoreConfidence({
    planConfidence: migrationPlan.confidence ?? 0.8,
    attempted: execResults.attempted || 0,
    applied: execResults.applied || 0,
    testsPassed: testResults.passed,
  });

  return {
    status: 'completed',
    plan: migrationPlan,
    results: { changedFiles: execResults.changedFiles, changes: execResults.changes },
    diffs,
    testResults,
    confidence,
    confidenceBreakdown,
    changedFiles: execResults.changedFiles,
    renames,
    retries: attempt,
    rag: { ...ragStats, ...(retriever?.lastAsk || {}) },
    offline: !!migrationPlan.offline,
    pathId,
    provider: migrationPlan.provider || resolved?.id || null,
    model: migrationPlan.model || resolved?.model || null,
  };
}

export async function generateMigrationPlan(codebaseAnalysis, sourceVersion, targetVersion, opts = {}) {
  const providerKey = opts.provider || process.env.AI_PROVIDER || 'auto';
  const modelKey = opts.model || process.env.MODEL || '';
  const cacheKey = `plan:${providerKey}:${modelKey}:${sourceVersion}:${targetVersion}:${codebaseAnalysis.totalFiles}:${(codebaseAnalysis.files[0]?.preview || '').slice(0, 64)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let resolved = null;
  try { resolved = resolveProvider(opts.provider, opts.model); } catch { resolved = null; }
  if (!resolved) {
    if (!opts.repoPath) throw new Error('No AI API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, ZEN_API_KEY, or CUSTOM_API_KEY.');
    const plan = await generateOfflinePlan(opts.repoPath, opts.pathId || resolvePathId(sourceVersion, targetVersion), sourceVersion, targetVersion);
    cacheSet(cacheKey, plan);
    return plan;
  }
  // RAG context replaces the blind 60KB dump: retrieved chunks + KB hits.
  // Falls back to the structure dump when retrieval is disabled/empty.
  let ragContext = '';
  let ragUsed = null;
  if (opts.retriever) {
    try {
      const res = await opts.retriever.ask(planQueries(sourceVersion, targetVersion, codebaseAnalysis));
      ragContext = res.context;
      ragUsed = res.stats;
      logger.info(`RAG plan context: ${res.stats.used} chunks, ${res.stats.chars} chars (${res.stats.mode})`);
    } catch (err) {
      logger.warn(`RAG retrieval failed (${err.message}) — using structure dump`);
    }
  }
  const codebaseBlock = ragContext || JSON.stringify(codebaseAnalysis, null, 2).slice(0, 60000);
  const userPrompt = `Analyze this codebase and generate a migration plan from ${sourceVersion} to ${targetVersion}.

CODEBASE CONTEXT (retrieved chunks as file:start-end, plus migration knowledge):
${codebaseBlock}

REPOSITORY OVERVIEW:
${JSON.stringify({ totalFiles: codebaseAnalysis.totalFiles, language: codebaseAnalysis.language, dependencies: codebaseAnalysis.dependencies }, null, 2).slice(0, 2000)}

Generate a migration plan JSON with this exact structure:
{
  "strategy": "Brief description of overall approach",
  "riskLevel": "low|medium|high",
  "confidence": 0.95,
  "phases": [
    {
      "phase": 1,
      "description": "Phase description",
      "changes": [
        {
          "file": "path/to/file.py",
          "type": "syntax|import|api|deprecation|idiom",
          "old": "original code snippet",
          "new": "new code snippet",
          "reason": "why this change is needed",
          "confidence": 0.98
        }
      ]
    }
  ],
  "risks": [{ "risk": "description", "severity": "low|medium|high", "mitigation": "how to handle" }],
  "testStrategy": "How to validate the migration",
  "dependencies": { "toAdd": [], "toRemove": [], "toUpdate": [] },
  "postMigrationTasks": ["step 1", "step 2"]
}`;

  const { text, provider, model } = await complete({
    system: CATALYST_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 8000,
    provider: opts.provider,
    model: opts.model,
  });

  const plan = parseJsonFromModel(text);
  plan.provider = provider;
  plan.model = model;
  if (ragUsed) plan.rag = ragUsed;
  cacheSet(cacheKey, plan);
  return plan;
}

export async function fixFailedMigration(codebaseAnalysis, originalPlan, testResults, sourceVersion, targetVersion, opts = {}) {
  // Focus the retry on chunks matching the failure output (RAG over the repo).
  let failureContext = '';
  if (opts.retriever) {
    try {
      const failText = String(testResults.failures || testResults.message || '').slice(0, 2000);
      const res = await opts.retriever.ask([
        `code related to test failure: ${failText.slice(0, 500)}`,
        `migrate ${sourceVersion} to ${targetVersion} fix test failures`,
      ]);
      failureContext = `\n\nRETRIEVED CODE RELEVANT TO THE FAILURE:\n${res.context}`;
    } catch { /* retry works without it */ }
  }
  const userPrompt = `The migration from ${sourceVersion} to ${targetVersion} failed.

ORIGINAL PLAN:
${JSON.stringify(originalPlan, null, 2).slice(0, 30000)}

TEST FAILURES:
${JSON.stringify(testResults.failures || testResults, null, 2).slice(0, 20000)}

CODEBASE:
${JSON.stringify(codebaseAnalysis, null, 2).slice(0, 20000)}${failureContext}

Generate a corrected migration plan (same JSON structure as before) that fixes these issues. Respond with JSON ONLY.`;

  const { text, provider, model } = await complete({
    system: 'You are a debugging expert. The code migration failed tests. Analyze the failures and generate a corrected migration plan. Respond ONLY with valid JSON, no markdown.',
    user: userPrompt,
    maxTokens: 8000,
    provider: opts.provider,
    model: opts.model,
  });

  const fixed = parseJsonFromModel(text);
  fixed.provider = provider;
  fixed.model = model;
  return fixed;
}

export function parseJsonFromModel(text) {
  let cleaned = String(text).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Failed to parse migration plan JSON: no JSON object in model response');
  }
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new Error(`Failed to parse migration plan JSON: ${err.message}`);
  }
}

function mergePlans(offline, aiPlan) {
  if (!offline || !offline.phases?.[0]?.changes?.length) return aiPlan;
  // Offline deterministic edits first, AI plan after (executor applies in order)
  return {
    ...aiPlan,
    strategy: `${aiPlan.strategy || ''} [Pre-pass: ${offline.phases[0].changes.length} deterministic rule edits]`.trim(),
    phases: [{ phase: 0, description: offline.phases[0].description, changes: offline.phases[0].changes }, ...(aiPlan.phases || [])],
  };
}

async function readMigratedContent(repoPath, originalContent) {
  const out = {};
  for (const file of Object.keys(originalContent || {})) {
    try {
      out[file] = await fs.readFile(path.join(repoPath, file), 'utf8');
    } catch { /* file deleted — treat as empty */ out[file] = ''; }
  }
  return out;
}

export { revertChanges };
