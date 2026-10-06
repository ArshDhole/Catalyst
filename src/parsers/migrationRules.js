// Catalyst migration rules — deterministic offline transforms.
// Used when ANTHROPIC_API_KEY is missing AND as pre-pass before Opus.
// Each rule: { match: RegExp|string, replace: string|fn, type, reason, confidence }

export const MIGRATION_PATHS = [
  { id: 'python2-to-python3', from: 'python2', to: 'python3', label: 'Python 2 → Python 3', engine: 'rules+ai' },
  { id: 'python3-upgrade', from: 'python3.x', to: 'python3.y', label: 'Python 3.x → 3.y', engine: 'rules+ai' },
  { id: 'js-modernize', from: 'es5/node-cjs', to: 'modern-js', label: 'ES5 / old Node / CJS → modern JS', engine: 'rules+ai' },
  { id: 'ts-upgrade', from: 'ts3/ts4', to: 'ts5', label: 'TypeScript → 5.x', engine: 'ai' },
  { id: 'react-upgrade', from: 'react-class/16/17/cra', to: 'hooks/18/vite', label: 'React upgrade', engine: 'ai' },
  { id: 'vue-upgrade', from: 'vue2', to: 'vue3', label: 'Vue 2 → 3', engine: 'ai' },
  { id: 'angular-upgrade', from: 'angular1/12', to: 'angular17', label: 'Angular → 17', engine: 'ai' },
  { id: 'rails-upgrade', from: 'rails4/5/6', to: 'rails7', label: 'Rails → 7', engine: 'ai' },
  { id: 'django-upgrade', from: 'django2/3', to: 'django4.2', label: 'Django → 4.2', engine: 'ai' },
  { id: 'spring-upgrade', from: 'spring1/2', to: 'spring3', label: 'Spring Boot → 3.x', engine: 'ai' },
  { id: 'laravel-upgrade', from: 'laravel5/6/8', to: 'laravel10/11', label: 'Laravel → 10/11', engine: 'ai' },
  { id: 'java-upgrade', from: 'java8/11', to: 'java17/21', label: 'Java → 17/21', engine: 'ai' },
  { id: 'go-upgrade', from: 'go1.x', to: 'go1.2x', label: 'Go → 1.20+', engine: 'ai' },
  { id: 'net-upgrade', from: 'netfx/5-7', to: 'net8', label: '.NET → 8', engine: 'ai' },
  { id: 'php-upgrade', from: 'php7', to: 'php8', label: 'PHP 7 → 8', engine: 'ai' },
  { id: 'ruby-upgrade', from: 'ruby2/3.0', to: 'ruby3.2', label: 'Ruby → 3.2', engine: 'ai' },
];

export function normalizeVersion(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9.+]/g, '');
}

export function resolvePathId(sourceVersion, targetVersion, migrationPath) {
  if (migrationPath) {
    const hit = MIGRATION_PATHS.find((p) => p.id === migrationPath || `${p.from}-to-${p.to}` === migrationPath);
    if (hit) return hit.id;
  }
  const s = normalizeVersion(sourceVersion);
  const t = normalizeVersion(targetVersion);
  const raw = `${String(sourceVersion || '').toLowerCase()} ${String(targetVersion || '').toLowerCase()}`;
  // Python 2 → 3 (any 3.x target)
  if (s.includes('python2') && t.includes('python3')) return 'python2-to-python3';
  // Python 3.x → 3.y modernization
  if (s.includes('python3') && t.includes('python3') && s !== t) return 'python3-upgrade';
  // Legacy JS: ES5 / old Node / CommonJS → modern
  if (
    (s.includes('es5') || s.includes('commonjs') || s.includes('cjs') || /^node(10|12|14)\b/.test(s) || s === 'node10' || s === 'node12' || s === 'node14') &&
    (t.includes('es20') || t.includes('esm') || t.includes('node18') || t.includes('node20'))
  ) return 'js-modernize';
  if (s.includes('es5') && (t.includes('2020') || t.includes('2024'))) return 'js-modernize';
  // TypeScript / frontend frameworks (AI-only: transforms need semantics)
  if (s.includes('ts3') || s.includes('ts4') || s.includes('typescript')) return 'ts-upgrade';
  if (raw.includes('react') || raw.includes('cra') || raw.includes('vite') || raw.includes('hooks')) return 'react-upgrade';
  if (raw.includes('vue')) return 'vue-upgrade';
  if (raw.includes('angular') || raw.includes('ng1')) return 'angular-upgrade';
  // Backends (AI-only)
  if (s.includes('rails')) return 'rails-upgrade';
  if (s.includes('django')) return 'django-upgrade';
  if (s.includes('spring')) return 'spring-upgrade';
  if (s.includes('laravel')) return 'laravel-upgrade';
  if (s.includes('java8') || s.includes('java11') || (s.includes('java') && t.includes('java'))) return 'java-upgrade';
  if (s.includes('go1') || s === 'go') return 'go-upgrade';
  if (s.includes('netfx') || s.includes('netframe') || s.includes('framework') || s.includes('net5') || s.includes('net6') || s.includes('net7')) return 'net-upgrade';
  if (s.includes('php7') || (s.includes('php') && t.includes('php8'))) return 'php-upgrade';
  if (s.includes('ruby2') || s.includes('ruby3')) return 'ruby-upgrade';
  return `${sourceVersion}-to-${targetVersion}`;
}

/** Apply rule list to text, return { text, applied: [{old,new,reason,type,confidence}] } */
export function applyRules(text, rules) {
  const applied = [];
  let out = text;
  for (const rule of rules) {
    if (typeof rule.match === 'string') {
      if (out.includes(rule.match)) {
        const replacement = typeof rule.replace === 'function' ? rule.replace(rule.match) : rule.replace;
        out = out.split(rule.match).join(replacement);
        applied.push({ old: rule.match, new: replacement, reason: rule.reason, type: rule.type, confidence: rule.confidence });
      }
    } else if (rule.match instanceof RegExp) {
      const flags = rule.match.flags.includes('g') ? rule.match.flags : rule.match.flags + 'g';
      const re = new RegExp(rule.match.source, flags);
      let m;
      const hits = [];
      while ((m = re.exec(out)) !== null) {
        hits.push(m[0]);
        if (m[0] === '') break;
        if (hits.length > 200) break; // safety cap
      }
      if (hits.length > 0) {
        const re2 = new RegExp(rule.match.source, flags);
        out = out.replace(re2, rule.replace);
        // record unique examples (cap 5) to keep plan JSON small
        for (const h of [...new Set(hits)].slice(0, 5)) {
          const tmpRe = new RegExp(rule.match.source, rule.match.flags.replace('g', ''));
          const exampleNew = h.replace(tmpRe, rule.replace);
          applied.push({ old: h, new: exampleNew, reason: rule.reason, type: rule.type, confidence: rule.confidence });
        }
      }
    }
  }
  return { text: out, applied };
}

// ---- Python 2 → 3 (high-precision regex set; mirrors key 2to3 fixers) ----
export const PYTHON2_TO_3_RULES = [
  {
    match: /print\s+"([^"\n]*)"/g, replace: 'print("$1")',
    type: 'syntax', reason: 'print statement → print() function', confidence: 0.99,
  },
  {
    match: /print\s+'([^'\n]*)'/g, replace: "print('$1')",
    type: 'syntax', reason: 'print statement → print() function', confidence: 0.99,
  },
  {
    match: /print\s+([A-Za-z_][A-Za-z0-9_.()\[\]"']*)\s*$/gm, replace: 'print($1)',
    type: 'syntax', reason: 'print statement → print() function', confidence: 0.9,
  },
  {
    match: /raw_input\(/g, replace: 'input(',
    type: 'api', reason: 'raw_input() removed in Python 3', confidence: 0.99,
  },
  {
    match: /xrange\(/g, replace: 'range(',
    type: 'api', reason: 'xrange() removed; range is lazy in Py3', confidence: 0.99,
  },
  {
    match: /([A-Za-z_][A-Za-z0-9_.]*)\.iteritems\(\)/g, replace: '$1.items()',
    type: 'api', reason: 'dict.iteritems() → dict.items()', confidence: 0.98,
  },
  {
    match: /([A-Za-z_][A-Za-z0-9_.]*)\.iterkeys\(\)/g, replace: '$1.keys()',
    type: 'api', reason: 'dict.iterkeys() → dict.keys()', confidence: 0.98,
  },
  {
    match: /([A-Za-z_][A-Za-z0-9_.]*)\.itervalues\(\)/g, replace: '$1.values()',
    type: 'api', reason: 'dict.itervalues() → dict.values()', confidence: 0.98,
  },
  {
    match: /has_key\(([^)]+)\)/g, replace: '$1 in ',
    type: 'api', reason: 'dict.has_key() removed', confidence: 0.85,
  },
  {
    match: /except\s+(\w[\w.]*)\s*,\s*(\w+)/g, replace: 'except $1 as $2',
    type: 'syntax', reason: 'except E, e → except E as e', confidence: 0.99,
  },
  {
    match: /raise\s+(\w[\w.]*)\s*,\s*(.+)/g, replace: 'raise $1($2)',
    type: 'syntax', reason: 'raise E, msg → raise E(msg)', confidence: 0.95,
  },
  {
    match: /urllib2/g, replace: 'urllib.request',
    type: 'import', reason: 'urllib2 merged into urllib in Py3', confidence: 0.9,
  },
  {
    match: /from\s+StringIO\s+import\s+StringIO/g, replace: 'from io import StringIO',
    type: 'import', reason: 'StringIO moved to io', confidence: 0.95,
  },
  {
    match: /import\s+cPickle\s+as\s+pickle/g, replace: 'import pickle',
    type: 'import', reason: 'cPickle merged into pickle', confidence: 0.95,
  },
  {
    match: /^import\s+cPickle$/gm, replace: 'import pickle',
    type: 'import', reason: 'cPickle merged into pickle', confidence: 0.95,
  },
  {
    match: /unicode\(/g, replace: 'str(',
    type: 'api', reason: 'unicode type removed; str is unicode in Py3', confidence: 0.9,
  },
  {
    match: /basestring/g, replace: 'str',
    type: 'api', reason: 'basestring removed', confidence: 0.9,
  },
  {
    match: /file\(/g, replace: 'open(',
    type: 'api', reason: 'file() removed; use open()', confidence: 0.9,
  },
];

// ---- Python 3.6 → 3.11 (idiom modernizations, safe) ----
export const PYTHON36_TO_311_RULES = [
  {
    match: /"%s"\s*%\s*\(([^)]+)\)/g, replace: 'f"{$1}"',
    type: 'idiom', reason: 'Consider f-strings (review manually)', confidence: 0.6,
  },
  {
    match: /from\s+typing\s+import\s+List/g, replace: 'from typing import List  # Py3.9+: use list[]',
    type: 'idiom', reason: 'PEP 585 builtin generics available', confidence: 0.7,
  },
];

// ---- ES5 → ES2020 ----
export const ES5_TO_ES2020_RULES = [
  {
    match: /\bvar\s+([A-Za-z_$][\w$]*)\s*=/g, replace: 'const $1 =',
    type: 'syntax', reason: 'var → const (review reassignments → let)', confidence: 0.75,
  },
  {
    match: /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g, replace: 'const $1 = ($2) => {',
    type: 'idiom', reason: 'function expression → arrow (review `this` usage)', confidence: 0.6,
  },
  {
    match: /([A-Za-z_$][\w$]*)\.indexOf\(([^)]+)\)\s*!==?\s*-1/g, replace: '$1.includes($2)',
    type: 'api', reason: 'indexOf !== -1 → includes()', confidence: 0.9,
  },
];

export function rulesForPath(pathId) {
  switch (pathId) {
    case 'python2-to-python3': return PYTHON2_TO_3_RULES;
    case 'python3-upgrade':
    case 'python36-to-python311': return PYTHON36_TO_311_RULES; // legacy id
    case 'js-modernize':
    case 'js-es5-to-es2020': return ES5_TO_ES2020_RULES; // legacy id
    // Framework / backend upgrades need semantic understanding — AI-only.
    // Offline mode returns an empty (no-op) plan rather than risky edits.
    default: return [];
  }
}

const EXT_BY_FAMILY = {
  python: ['.py'],
  js: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue'],
  rails: ['.rb', '.erb'],
  ruby: ['.rb', '.erb'],
  java: ['.java'],
  spring: ['.java'],
  go: ['.go'],
  php: ['.php'],
  laravel: ['.php'],
  net: ['.cs'],
  django: ['.py'],
};

export function fileMatchesPath(file, pathId) {
  const f = file.toLowerCase();
  for (const [family, exts] of Object.entries(EXT_BY_FAMILY)) {
    if (pathId.startsWith(family)) return exts.some((e) => f.endsWith(e));
  }
  if (pathId.startsWith('ts-') || pathId.startsWith('react') || pathId.startsWith('vue') || pathId.startsWith('angular')) {
    return EXT_BY_FAMILY.js.some((e) => f.endsWith(e));
  }
  return true;
}
