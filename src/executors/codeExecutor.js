import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

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
    if (!(await fs.pathExists(fullPath))) {
      logger.warn(`Skipping missing file: ${filePath}`);
      changes.push({ file: filePath, changeCount: 0, status: 'skipped-missing' });
      continue;
    }
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      changes.push({ file: filePath, changeCount: 0, status: 'skipped-directory' });
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
    changes.push({ file: filePath, changeCount: applied, status: applied > 0 ? 'applied' : 'no-op' });
  }

  return {
    changedFiles: Object.keys(changesByFile).filter((f) =>
      changes.find((c) => c.file === f && c.status === 'applied')
    ),
    changes,
    originalContent,
  };
}

export async function revertChanges(repoPath, originalContent) {
  for (const [filePath, content] of Object.entries(originalContent || {})) {
    const full = path.join(repoPath, filePath);
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, content, 'utf8');
  }
}
