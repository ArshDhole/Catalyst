import fs from 'fs-extra';
import path from 'path';
import { getAllFiles, isCodeFile } from '../parsers/codeParser.js';

export const DEFAULT_CHUNK_LINES = 120;
export const DEFAULT_OVERLAP_LINES = 20;
export const MAX_FILE_BYTES = 500_000;
export const MAX_CHUNKS = 800;

/**
 * Split a repo into overlapping line-window chunks for retrieval.
 * Each chunk: { id, file, startLine, endLine, text }
 */
export function chunkText(text, file, { chunkLines = DEFAULT_CHUNK_LINES, overlap = DEFAULT_OVERLAP_LINES } = {}) {
  const lines = String(text || '').split('\n');
  if (lines.length === 0) return [];
  const chunks = [];
  const step = Math.max(1, chunkLines - overlap);
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + chunkLines);
    const slice = lines.slice(start, end).join('\n').trimEnd();
    if (!slice.trim()) continue;
    chunks.push({
      id: `${file}:L${start + 1}-${end}`,
      file,
      startLine: start + 1,
      endLine: end,
      text: slice,
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

export async function chunkRepo(repoPath, { chunkLines, overlap } = {}) {
  const allFiles = await getAllFiles(repoPath, repoPath);
  const chunks = [];
  for (const rel of allFiles) {
    if (!isCodeFile(rel)) continue;
    const abs = path.join(repoPath, rel);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory() || stat.size > MAX_FILE_BYTES) continue;
      const text = await fs.readFile(abs, 'utf8');
      const key = rel.replace(/\\/g, '/');
      for (const c of chunkText(text, key, { chunkLines, overlap })) {
        chunks.push(c);
        if (chunks.length >= MAX_CHUNKS) return chunks;
      }
    } catch { /* skip unreadable */ }
  }
  return chunks;
}
