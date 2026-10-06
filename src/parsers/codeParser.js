import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { cacheGet, cacheSet } from '../utils/cache.js';
import { logger } from '../utils/logger.js';

const SUPPORTED_EXTENSIONS = {
  python: ['.py'],
  javascript: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
  java: ['.java'],
  ruby: ['.rb'],
  go: ['.go'],
};

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'target', 'vendor',
]);

const ALL_CODE_EXTS = new Set(Object.values(SUPPORTED_EXTENSIONS).flat());

/**
 * Catalyst parser: walks a repo, detects language, extracts imports + deps.
 * Caps file reads at 50 files / 500 char preview to control Opus token cost.
 */
export async function parseCodebase(repoPath, sourceVersion) {
  const cacheKey = `parse:${sourceVersion}:${await fingerprint(repoPath)}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    logger.info('Using cached codebase analysis', null);
    return cached;
  }

  logger.info(`Parsing codebase at ${repoPath}`);

  const files = await getAllFiles(repoPath, repoPath);
  const codeFiles = files.filter((f) => isCodeFile(f));

  const analysis = {
    totalFiles: codeFiles.length,
    totalScanned: files.length,
    language: detectLanguage(sourceVersion),
    files: [],
    imports: [],
    dependencies: [],
    patterns: detectPatterns(repoPath, sourceVersion),
  };

  for (const file of codeFiles.slice(0, 50)) {
    const abs = path.join(repoPath, file);
    let content = '';
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue; // skip unreadable / binary
    }
    analysis.files.push({
      path: file,
      size: content.length,
      lines: content.split('\n').length,
      preview: content.substring(0, 2000),
    });

    const imports = extractImports(content, sourceVersion);
    for (const imp of imports) analysis.imports.push({ file, ...imp });
  }

  analysis.dependencies = await detectDependencies(repoPath, sourceVersion);

  cacheSet(cacheKey, analysis);
  return analysis;
}

async function fingerprint(repoPath) {
  // Content-based: path + size + head sample, so different repos never share cache
  try {
    const files = await getAllFiles(repoPath, repoPath);
    const h = crypto.createHash('sha1');
    for (const f of files.slice(0, 200)) {
      try {
        const abs = path.join(repoPath, f);
        const st = await fs.stat(abs);
        if (st.isDirectory()) continue;
        const head = (await fs.readFile(abs, 'utf8')).slice(0, 512);
        h.update(`${f}${st.size}${head}\n`);
      } catch {
        h.update(`${f}\n`);
      }
    }
    return h.digest('hex').slice(0, 16);
  } catch {
    return 'unknown';
  }
}

export async function getAllFiles(root, dir, fileList = []) {
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) await getAllFiles(root, full, fileList);
    } else {
      fileList.push(path.relative(root, full));
    }
  }
  return fileList;
}

export function isCodeFile(filePath) {
  return ALL_CODE_EXTS.has(path.extname(filePath).toLowerCase());
}

export function detectLanguage(sourceVersion) {
  const v = String(sourceVersion || '').toLowerCase();
  if (v.includes('python')) return 'python';
  if (v.includes('rails') || v.includes('ruby')) return 'ruby';
  if (v.includes('es5') || v.includes('js') || v.includes('node') || v.includes('typescript') || v.includes('ts'))
    return 'javascript';
  if (v.includes('java')) return 'java';
  if (v.includes('go')) return 'go';
  return 'unknown';
}

export function extractImports(content, sourceVersion) {
  const imports = [];
  const lang = detectLanguage(sourceVersion);

  if (lang === 'python') {
    const re = /^(?:from\s+(\S+)\s+import\s+(.+)|import\s+(.+))$/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      imports.push({ type: 'import', value: (m[1] || m[3] || '').trim() });
    }
  } else if (lang === 'javascript') {
    let m;
    const importRe = /^import\s+(?:.+?\s+from\s+)?['"](.+?)['"]/gm;
    while ((m = importRe.exec(content)) !== null) imports.push({ type: 'import', value: m[1] });
    const requireRe = /require\(\s*['"](.+?)['"]\s*\)/g;
    while ((m = requireRe.exec(content)) !== null) imports.push({ type: 'require', value: m[1] });
  } else if (lang === 'java') {
    let m;
    const re = /^import\s+(.+);/gm;
    while ((m = re.exec(content)) !== null) imports.push({ type: 'import', value: m[1].trim() });
  } else if (lang === 'ruby') {
    let m;
    const re = /^(?:require|require_relative|gem)\s+['"](.+?)['"]/gm;
    while ((m = re.exec(content)) !== null) imports.push({ type: 'require', value: m[1] });
  } else if (lang === 'go') {
    let m;
    const re = /^\s*(?:"(.+?)"|`(.+?)`)/gm;
    // best-effort; full Go import parsing needs AST
    void m; void re;
  }
  return imports;
}

export async function detectDependencies(repoPath, sourceVersion) {
  const dependencies = [];
  const lang = detectLanguage(sourceVersion);

  try {
    if (lang === 'python') {
      for (const f of ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']) {
        const p = path.join(repoPath, f);
        if (await fs.pathExists(p)) {
          const content = await fs.readFile(p, 'utf8');
          if (f === 'requirements.txt') {
            dependencies.push(
              ...content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
            );
          } else {
            dependencies.push(`${f}:present (${content.length} chars)`);
          }
        }
      }
    } else if (lang === 'javascript') {
      const pkgFile = path.join(repoPath, 'package.json');
      if (await fs.pathExists(pkgFile)) {
        const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8'));
        dependencies.push(...Object.keys(pkg.dependencies || {}).map((d) => `${d}@${pkg.dependencies[d]}`));
      }
    } else if (lang === 'ruby') {
      const gemFile = path.join(repoPath, 'Gemfile');
      if (await fs.pathExists(gemFile)) {
        const content = await fs.readFile(gemFile, 'utf8');
        dependencies.push(...content.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('gem ')));
      }
    } else if (lang === 'java') {
      for (const f of ['pom.xml', 'build.gradle']) {
        if (await fs.pathExists(path.join(repoPath, f))) dependencies.push(`${f}:present`);
      }
    }
  } catch (err) {
    logger.warn(`Dependency detection warning: ${err.message}`);
  }
  return dependencies;
}

function detectPatterns(repoPath, sourceVersion) {
  // Placeholder for Week 2 AST-based detection (2to3 patterns, etc.)
  void repoPath;
  return [`migration-source:${sourceVersion}`];
}
