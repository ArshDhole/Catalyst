import { createTwoFilesPatch } from 'diff';

/**
 * Catalyst diff builder — unified diffs for the results API + frontend viewer.
 * originalContent: { relPath: originalText } captured by the executor.
 * currentFiles: read from disk after migration (passed in as map).
 */
export function buildUnifiedDiffs(originalContent = {}, migratedContent = {}) {
  const diffs = [];
  const allFiles = new Set([...Object.keys(originalContent), ...Object.keys(migratedContent)]);
  for (const file of allFiles) {
    const oldText = originalContent[file] ?? '';
    const newText = migratedContent[file] ?? '';
    if (oldText === newText) continue;
    const patch = createTwoFilesPatch(file, file, oldText, newText, 'original', 'migrated');
    diffs.push({
      file,
      patch,
      additions: countLines(patch, '+'),
      deletions: countLines(patch, '-'),
    });
  }
  return diffs;
}

function countLines(patch, prefix) {
  return patch
    .split('\n')
    .filter((l) => l.startsWith(prefix) && !l.startsWith(`+++`) && !l.startsWith(`---`)).length;
}
