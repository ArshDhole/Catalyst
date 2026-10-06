import fs from 'fs-extra';
import path from 'path';
import { applyRules, rulesForPath, fileMatchesPath } from './migrationRules.js';
import { renameForTarget } from '../executors/codeExecutor.js';
import { logger } from '../utils/logger.js';

/**
 * Catalyst offline planner — deterministic, zero-cost migration plan.
 * Used when ANTHROPIC_API_KEY is absent, and as a pre-pass otherwise.
 * Returns an Opus-compatible plan object so the executor works unchanged.
 */
export async function generateOfflinePlan(repoPath, pathId, sourceVersion, targetVersion) {
  const rules = rulesForPath(pathId);
  const { getAllFiles } = await import('./codeParser.js');
  const allFiles = await getAllFiles(repoPath, repoPath);
  // Extension match OR version token in the name (legacy.python2 IS python code)
  const candidates = allFiles.filter(
    (f) => fileMatchesPath(f, pathId) || renameForTarget(path.basename(f), sourceVersion, targetVersion)
  ).slice(0, 50);

  const changes = [];
  for (const file of candidates) {
    const abs = path.join(repoPath, file);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory() || stat.size > 500_000) continue;
      const content = await fs.readFile(abs, 'utf8');
      const { applied } = applyRules(content, rules);
      for (const a of applied.slice(0, 20)) {
        changes.push({ file: file.replace(/\\/g, '/'), ...a });
      }
    } catch (err) {
      logger.warn(`Offline plan: skipping ${file}: ${err.message}`);
    }
  }

  const usesRules = rules.length > 0;
  return {
    strategy: usesRules
      ? `Deterministic offline rules for ${sourceVersion} → ${targetVersion} (${changes.length} edits). Configure ANTHROPIC_API_KEY for full Opus 4.6 analysis.`
      : `No offline rules for ${sourceVersion} → ${targetVersion}. Configure ANTHROPIC_API_KEY for Opus 4.6 planning.`,
    riskLevel: usesRules ? 'low' : 'high',
    confidence: usesRules ? (changes.length > 0 ? 0.88 : 0.7) : 0.3,
    phases: [
      {
        phase: 1,
        description: usesRules ? `Apply ${pathId} rule transforms` : 'Awaiting AI plan (no offline rules matched)',
        changes,
      },
    ],
    risks: usesRules
      ? [{ risk: 'Regex transforms may need semantic review', severity: 'medium', mitigation: 'Run tests; review diffs before merging' }]
      : [{ risk: 'No offline rules for this path — AI key required', severity: 'high', mitigation: 'Set ANTHROPIC_API_KEY in .env' }],
    testStrategy: 'Run detected test framework; validate changed files compile/run',
    dependencies: { toAdd: [], toRemove: [], toUpdate: [] },
    postMigrationTasks: ['Review diffs', 'Run full test suite', 'Update CI to target version'],
    offline: true,
    pathId,
  };
}
