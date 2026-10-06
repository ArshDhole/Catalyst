import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';
import { normalizeVersion } from '../parsers/migrationRules.js';

/**
 * Catalyst executor: applies an Opus migration plan to files on disk.
 * - Groups changes per file, keeps original content for rollback
 * - Skips missing files (records as skipped, doesn't crash)
 * - Uses literal replacement; AST-based replacement is Week-2 work
 */
export async function executeChanges(repoPath, migrationPlan) {
  const originalContent = {};
  const changes = [];

  const allChanges = [];
  for (const phase of migrationPlan?.phases || []) {
    allChanges.push(...(phase.changes || []));
  }

  const changesByFile = {};
  for (const change of allChanges) {
    if (!change?.file) continue;
    // Safety: block path traversal
    const normalized = path.normalize(change.file).replace(/^(\.\.(\/|\\|$))+/, '');
    if (!changesByFile[normalized]) changesByFile[normalized] = [];
    changesByFile[normalized].push(change);
  }

  for (const [filePath, fileChanges] of Object.entries(changesByFile)) {
    const fullPath = path.join(repoPath, filePath);
    const attempted = fileChanges.filter(
      (c) => typeof c.old === 'string' && typeof c.new === 'string' && c.old !== ''
    ).length;
    if (!(await fs.pathExists(fullPath))) {
      logger.warn(`Skipping missing file: ${filePath}`);
      changes.push({ file: filePath, changeCount: 0, attempted, status: 'skipped-missing' });
      continue;
    }
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      changes.push({ file: filePath, changeCount: 0, attempted, status: 'skipped-directory' });
      continue;
    }

    const original = await fs.readFile(fullPath, 'utf8');
    originalContent[filePath] = original;

    let modified = original;
    let applied = 0;
    for (const change of fileChanges) {
      if (typeof change.old !== 'string' || typeof change.new !== 'string') continue;
      if (change.old === '') continue;
      if (modified.includes(change.old)) {
        // Replace all occurrences (split/join avoids regex-escaping issues)
        modified = modified.split(change.old).join(change.new);
        applied++;
      } else {
        logger.warn(`Pattern not found in ${filePath}: ${(change.old || '').slice(0, 60)}...`);
      }
    }

    if (modified !== original) {
      await fs.writeFile(fullPath, modified, 'utf8');
    }
    changes.push({ file: filePath, changeCount: applied, attempted, status: applied > 0 ? 'applied' : 'no-op' });
  }

  const attemptedTotal = changes.reduce((n, c) => n + (c.attempted || 0), 0);
  const appliedTotal = changes.reduce((n, c) => n + (c.changeCount || 0), 0);

  return {
    changedFiles: Object.keys(changesByFile).filter((f) =>
      changes.find((c) => c.file === f && c.status === 'applied')
    ),
    changes,
    originalContent,
    attempted: attemptedTotal,
    applied: appliedTotal,
  };
}

export async function revertChanges(repoPath, originalContent) {
  for (const [filePath, content] of Object.entries(originalContent || {})) {
    const full = path.join(repoPath, filePath);
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, content, 'utf8');
  }
}

// Word-only migrations (no version digits) — explicit allowlist so generic
// words like "class" or "hooks" never trigger renames.
const WORD_PAIRS = [
  { src: 'cjs', tgt: 'esm' },
  { src: 'cra', tgt: 'vite' },
];

// Short-form aliases keyed by normalized source id (py2 → py3, not py2 → python3).
const SOURCE_ALIASES = {
  python2: ['py2'],
  python3: ['py3'],
  'python3.6': ['py36'],
  'python3.11': ['py311'],
  'python3.7': ['py37'],
  'python3.12': ['py312'],
  'python3.8': ['py38'],
  commonjs: ['cjs'],
  reactcra: ['cra'],
};

/** Candidate source tokens, longest first: full, dotless, digit-bearing parts, aliases. */
function sourceTokens(sourceVersion) {
  const n = normalizeVersion(sourceVersion);
  const dotless = n.replace(/\./g, '');
  const parts = String(sourceVersion).toLowerCase().split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2 && /\d/.test(p));
  const toks = [n];
  if (dotless && dotless !== n) toks.push(dotless);
  for (const p of parts) if (!toks.includes(p)) toks.push(p);
  for (const a of SOURCE_ALIASES[n] || []) if (!toks.includes(a)) toks.push(a);
  return toks.filter(Boolean).sort((a, b) => b.length - a.length);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * New basename with the source-version token swapped for the target one.
 * Returns null when the name carries no version token (most files).
 *   renameForTarget('test.python2','python2','python3') → 'test.python3'
 *   renameForTarget('app.es5.js','js-es5','js-es2020') → 'app.es2020.js'
 *   renameForTarget('util.cjs','commonjs','esm')       → 'util.esm'
 */
export function renameForTarget(filename, sourceVersion, targetVersion) {
  const base = String(filename || '');
  if (!base) return null;
  const tN = normalizeVersion(targetVersion);
  const toks = sourceTokens(sourceVersion);

  // Word-pair migrations first (cjs→esm, cra→vite)
  for (const { src, tgt } of WORD_PAIRS) {
    if (toks.includes(src) && tN.includes(tgt)) {
      const re = new RegExp(escapeRegExp(src), 'gi');
      if (re.test(base)) {
        const out = base.replace(new RegExp(escapeRegExp(src), 'gi'), (m) =>
          m === m.toUpperCase() ? tgt.toUpperCase() : tgt
        );
        if (out !== base) return out;
      }
    }
  }

  for (const token of toks) {
    const re = new RegExp(escapeRegExp(token), 'gi');
    if (!re.test(base)) continue;
    const m = token.match(/^([a-z]+)(\d.*)$/);
    const replacement = !m
      ? tN
      : token.includes('.')
        ? tN
        : m[1] + tN.replace(/[^0-9]/g, '');
    if (!replacement || replacement.toLowerCase() === token.toLowerCase()) continue;
    const out = base.replace(new RegExp(escapeRegExp(token), 'gi'), replacement);
    if (out !== base) return out;
  }
  return null;
}

/**
 * Rename migrated files whose names reference the source version
 * (test.python2 → test.python3). Skips collisions. Returns { renames }.
 */
export async function applyTargetRenames(repoPath, sourceVersion, targetVersion) {
  const renames = [];
  for (const rel of await listFiles(repoPath, repoPath)) {
    const dir = path.dirname(rel);
    const next = renameForTarget(path.basename(rel), sourceVersion, targetVersion);
    if (!next) continue;
    const from = path.join(repoPath, rel);
    const to = path.join(repoPath, dir === '.' ? next : path.join(dir, next));
    if (await fs.pathExists(to)) {
      logger.warn(`Rename skipped (target exists): ${rel} → ${next}`);
      continue;
    }
    await fs.move(from, to);
    renames.push({ from: rel, to: path.relative(repoPath, to) });
    logger.info(`Renamed ${rel} → ${path.relative(repoPath, to)}`);
  }
  return { renames };
}

async function listFiles(root, dir, out = []) {
  for (const entry of await fs.readdir(dir)) {
    if (entry === '.git') continue;
    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) await listFiles(root, full, out);
    else out.push(path.relative(root, full));
  }
  return out;
}
