import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { logger } from './logger.js';

// Upload modes: single archive (.zip/.rar/.tar.gz/...) · loose files · whole folder.
// Multer gives us { path, originalname }[] — originalname carries the
// webkit relative path for folder uploads (client sends it as filename).

export const MAX_FILES = 2000;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

const CODE_EXTS = new Set([
  '.py', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue',
  '.rb', '.erb', '.rake', '.java', '.go', '.php', '.cs',
  '.txt', '.md', '.json', '.yml', '.yaml', '.toml', '.cfg', '.ini',
  '.xml', '.gradle', '.properties', '.sh', '.sql', '.html', '.css', '.scss',
]);

// Files that matter but have no (allowed) extension
const KNOWN_BASENAMES = new Set([
  'gemfile', 'dockerfile', 'makefile', 'rakefile', 'cmakelists.txt',
  'requirements.txt', 'package.json', 'pyproject.toml', 'setup.py', 'setup.cfg',
  'tox.ini', 'pytest.ini', 'pom.xml', 'build.gradle', 'go.mod', 'go.sum',
  'cargo.toml', '.gitignore', '.dockerignore',
]);

export function isArchiveName(name = '') {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.zip') || lower.endsWith('.rar') ||
    lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')
  );
}

export function isAllowedUpload(name = '') {
  if (isArchiveName(name)) return true;
  const base = path.basename(name).toLowerCase();
  if (KNOWN_BASENAMES.has(base)) return true;
  return CODE_EXTS.has(path.extname(base).toLowerCase());
}

export function uploadAcceptHint() {
  return 'archives (.zip, .rar, .tar.gz), code files, or a whole folder';
}

/** Strip traversal/absolute junk from client-supplied relative paths. Null = reject. */
export function sanitizeRel(rel = '') {
  const norm = path.normalize(rel).replace(/^[A-Za-z]:/, '');
  const parts = norm.split(path.sep).filter((p) => p && p !== '.' && p !== '..');
  if (parts.length === 0) return null;
  if (parts.some((p) => p.includes('\0'))) return null;
  return parts.join(path.sep);
}

/**
 * Lay uploaded files out as a working repo tree in destDir.
 * Returns { mode: 'archive'|'single'|'multi', fileCount }.
 */
export async function materializeUpload(files, destDir) {
  await fs.ensureDir(destDir);
  let totalBytes = 0;
  for (const f of files) totalBytes += (await fs.stat(f.path)).size;
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`Upload too large (${Math.round(totalBytes / 1024 / 1024)}MB — max ${MAX_TOTAL_BYTES / 1024 / 1024}MB total)`);
  }

  if (files.length === 1) {
    const f = files[0];
    if (isArchiveName(f.originalname)) {
      await extractArchive(f.path, destDir, f.originalname);
      return { mode: 'archive', fileCount: await countFiles(destDir) };
    }
    const rel = sanitizeRel(path.basename(f.originalname || 'upload.txt')) || 'upload.txt';
    await fs.copy(f.path, path.join(destDir, rel));
    return { mode: 'single', fileCount: 1 };
  }

  // Multi-file (loose files or webkitdirectory folder upload)
  let count = 0;
  for (const f of files) {
    const rel = sanitizeRel(f.originalname);
    if (!rel) {
      logger.warn(`Skipping unsafe filename: ${f.originalname}`);
      continue;
    }
    const dest = path.join(destDir, rel);
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(f.path, dest);
    count++;
  }
  if (count === 0) throw new Error('No usable files in upload');
  // NOTE: no top-level flattening here — a multi upload is an explicit tree.
  return { mode: 'multi', fileCount: count };
}

async function countFiles(dir) {
  let n = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += await countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

export async function extractArchive(archivePath, destDir, originalName = '') {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.zip')) {
    new AdmZip(archivePath).extractAllTo(destDir, true);
  } else if (lower.endsWith('.rar')) {
    await extractRar(archivePath, destDir);
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
    await tar.x({ file: archivePath, cwd: destDir });
  } else {
    try {
      new AdmZip(archivePath).extractAllTo(destDir, true);
    } catch {
      await tar.x({ file: archivePath, cwd: destDir });
    }
  }
  await flattenTopLevel(destDir);
}

async function extractRar(archivePath, destDir) {
  const { createExtractorFromFile } = await import('node-unrar-js');
  const extractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: destDir,
    // Belt + suspenders: neutralize any traversal inside the archive
    filenameTransform: (name) => sanitizeRel(name) || '_skipped',
  });
  const extracted = extractor.extract();
  for (const _f of extracted.files) { /* must drain iterator to free wasm objects */ }
}

async function flattenTopLevel(destDir) {
  try {
    const entries = await fs.readdir(destDir);
    if (entries.length === 1) {
      const only = path.join(destDir, entries[0]);
      if ((await fs.stat(only)).isDirectory()) {
        for (const f of await fs.readdir(only)) {
          await fs.move(path.join(only, f), path.join(destDir, f), { overwrite: true });
        }
        await fs.remove(only);
      }
    }
  } catch { /* best effort */ }
}
