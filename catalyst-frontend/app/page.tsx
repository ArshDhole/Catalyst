'use client';

import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import CatalystDiffViewer, { FileDiff } from '../components/CatalystDiffViewer';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

interface MigrationPath {
  from: string;
  to: string;
  category: string;
  description: string;
}

interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  defaultModel: string;
  note?: string;
}

const migrationPaths: MigrationPath[] = [
  { from: 'python2', to: 'python3', category: 'Python', description: 'Python 2 → 3' },
  { from: 'python36', to: 'python311', category: 'Python', description: 'Python 3.6 → 3.11' },
  { from: 'python37', to: 'python312', category: 'Python', description: 'Python 3.7 → 3.12' },
  { from: 'python38', to: 'python312', category: 'Python', description: 'Python 3.8 → 3.12' },
  { from: 'es5', to: 'es2020', category: 'JavaScript', description: 'ES5 → ES2020' },
  { from: 'es5', to: 'es2024', category: 'JavaScript', description: 'ES5 → ES2024' },
  { from: 'node10', to: 'node20', category: 'JavaScript', description: 'Node.js 10 → 20' },
  { from: 'node12', to: 'node18', category: 'JavaScript', description: 'Node.js 12 → 18' },
  { from: 'node14', to: 'node20', category: 'JavaScript', description: 'Node.js 14 → 20' },
  { from: 'cjs', to: 'esm', category: 'JavaScript', description: 'CommonJS → ESM' },
  { from: 'ts3x', to: 'ts5x', category: 'TypeScript', description: 'TypeScript 3.x → 5.x' },
  { from: 'ts4x', to: 'ts5x', category: 'TypeScript', description: 'TypeScript 4.x → 5.x' },
  { from: 'react-class', to: 'react-hooks', category: 'React', description: 'Class → Hooks' },
  { from: 'react16', to: 'react18', category: 'React', description: 'React 16 → 18' },
  { from: 'react17', to: 'react18', category: 'React', description: 'React 17 → 18' },
  { from: 'react-cra', to: 'react-vite', category: 'React', description: 'CRA → Vite' },
  { from: 'vue2', to: 'vue3', category: 'Vue', description: 'Vue 2 → 3' },
  { from: 'vue-class', to: 'vue-composition', category: 'Vue', description: 'Class → Composition API' },
  { from: 'angular1', to: 'angular17', category: 'Angular', description: 'Angular 1 → 17' },
  { from: 'angular12', to: 'angular17', category: 'Angular', description: 'Angular 12 → 17' },
  { from: 'rails4', to: 'rails7', category: 'Rails', description: 'Rails 4 → 7' },
  { from: 'rails5', to: 'rails7', category: 'Rails', description: 'Rails 5 → 7' },
  { from: 'rails6', to: 'rails7', category: 'Rails', description: 'Rails 6 → 7' },
  { from: 'django2', to: 'django4', category: 'Django', description: 'Django 2.2 → 4.2' },
  { from: 'django3', to: 'django4', category: 'Django', description: 'Django 3.x → 4.2' },
  { from: 'springboot1', to: 'springboot3', category: 'Spring Boot', description: 'Spring Boot 1.5 → 3.x' },
  { from: 'springboot2', to: 'springboot3', category: 'Spring Boot', description: 'Spring Boot 2.x → 3.x' },
  { from: 'laravel5', to: 'laravel10', category: 'Laravel', description: 'Laravel 5.x → 10.x' },
  { from: 'laravel6', to: 'laravel10', category: 'Laravel', description: 'Laravel 6.x → 10.x' },
  { from: 'laravel8', to: 'laravel11', category: 'Laravel', description: 'Laravel 8 → 11' },
  { from: 'java8', to: 'java21', category: 'Java', description: 'Java 8 → 21' },
  { from: 'java11', to: 'java21', category: 'Java', description: 'Java 11 → 21' },
  { from: 'java11', to: 'java17', category: 'Java', description: 'Java 11 → 17' },
  { from: 'go111', to: 'go120', category: 'Go', description: 'Go 1.11 → 1.20+' },
  { from: 'go12', to: 'go120', category: 'Go', description: 'Go 1.2+ → 1.20+' },
  { from: 'net-framework', to: 'net8', category: '.NET', description: '.NET Framework → 8' },
  { from: 'net5', to: 'net8', category: '.NET', description: '.NET 5/6/7 → 8' },
  { from: 'php7', to: 'php82', category: 'PHP', description: 'PHP 7.x → 8.2' },
  { from: 'php74', to: 'php83', category: 'PHP', description: 'PHP 7.4 → 8.3' },
  { from: 'ruby27', to: 'ruby32', category: 'Ruby', description: 'Ruby 2.7 → 3.2' },
  { from: 'ruby30', to: 'ruby32', category: 'Ruby', description: 'Ruby 3.0 → 3.2' },
];

const categoryIndex: { [key: string]: string } = {
  Python: 'PY', JavaScript: 'JS', TypeScript: 'TS', React: 'RX', Vue: 'VU',
  Angular: 'NG', Rails: 'RB', Django: 'DJ', 'Spring Boot': 'SB', Laravel: 'LV',
  Java: 'JV', Go: 'GO', '.NET': 'DN', PHP: 'PH', Ruby: 'RU',
};

const FALLBACK_PROVIDERS: ProviderInfo[] = [
  { id: 'anthropic', label: 'Anthropic Claude (Opus 4.6)', configured: false, defaultModel: 'claude-opus-4-20250805' },
  { id: 'openai', label: 'OpenAI', configured: false, defaultModel: 'gpt-4o' },
  { id: 'gemini', label: 'Google Gemini', configured: false, defaultModel: 'gemini-2.0-flash' },
  { id: 'openrouter', label: 'OpenRouter', configured: false, defaultModel: 'anthropic/claude-opus-4-6' },
  { id: 'zen', label: 'OpenCode Zen', configured: false, defaultModel: 'big-pickle' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', configured: false, defaultModel: 'default' },
];

type JobStatus = 'queued' | 'analyzing' | 'planning' | 'executing' | 'validating' | 'completed' | 'failed';

interface MigrationJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  error?: string;
  confidence?: number;
  confidenceBreakdown?: { plan: number; application: number; tests: number };
  renames?: { from: string; to: string }[];
  diffs?: FileDiff[];
  testResults?: { passed?: boolean; framework?: string; message?: string };
  changedFiles?: string[];
  retries?: number;
  offline?: boolean;
  provider?: string | null;
  model?: string | null;
}

const STAGES: { id: string; label: string; detail: string }[] = [
  { id: 'queued', label: 'Queued', detail: 'Job accepted' },
  { id: 'analyzing', label: 'Analyze', detail: 'Structure + dependencies' },
  { id: 'planning', label: 'Plan', detail: 'AI migration strategy' },
  { id: 'executing', label: 'Execute', detail: 'Apply transformations' },
  { id: 'validating', label: 'Validate', detail: 'Run test suite' },
  { id: 'done', label: 'Ship', detail: 'Diffs + download' },
];

function stageIndex(status: JobStatus): number {
  const order: JobStatus[] = ['queued', 'analyzing', 'planning', 'executing', 'validating', 'completed', 'failed'];
  const i = order.indexOf(status);
  return status === 'completed' || status === 'failed' ? 5 : i;
}

function CatalystMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#16130E" />
      <path d="M8 10.5h12.5l-3.2-3.2" stroke="#E4571D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 10.5l0 0" stroke="#E4571D" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 21.5h12.5l-3.2-3.2M20.5 21.5l-3.2 3.2" stroke="#F6F4EE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="8" cy="10.5" r="1.8" fill="#E4571D" />
      <circle cx="8" cy="21.5" r="1.8" fill="#F6F4EE" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faded">{children}</p>
  );
}

export default function Catalyst() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<'archive' | 'files' | 'folder'>('archive');
  const [selectedFrom, setSelectedFrom] = useState('python2');
  const [selectedTo, setSelectedTo] = useState('python3');
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('');
  const [providers, setProviders] = useState<ProviderInfo[]>(FALLBACK_PROVIDERS);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/health`).then(() => setApiOnline(true)).catch(() => setApiOnline(false));
    axios.get(`${API_BASE}/api/providers`).then((r) => {
      if (Array.isArray(r.data.providers) && r.data.providers.length > 0) setProviders(r.data.providers);
      if (r.data.envDefault) setProvider(r.data.envDefault);
    }).catch(() => {});
  }, []);

  const selectedProvider = providers.find((p) => p.id === provider);
  const configuredCount = providers.filter((p) => p.configured).length;

  const filteredPaths = useMemo(() => {
    if (!searchTerm) return migrationPaths;
    const q = searchTerm.toLowerCase();
    return migrationPaths.filter(
      (p) => p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [searchTerm]);

  const grouped = useMemo(() => {
    const groups: { category: string; paths: MigrationPath[] }[] = [];
    for (const p of filteredPaths) {
      const g = groups.find((x) => x.category === p.category);
      if (g) g.paths.push(p);
      else groups.push({ category: p.category, paths: [p] });
    }
    return groups;
  }, [filteredPaths]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
    e.target.value = ''; // allow re-picking the same selection
  };

  const stagedBytes = files.reduce((n, f) => n + f.size, 0);
  const stagedLabel =
    files.length === 0
      ? null
      : files.length === 1
        ? files[0].name
        : `${files.length} files · ${(stagedBytes / 1024).toFixed(1)} KB`;

  const handleMigrate = async () => {
    if (files.length === 0) {
      alert('Please select files to migrate');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    for (const f of files) {
      // NB: servers keep only the basename of each part — send the tree
      // position (webkit relative path) as a parallel field in file order.
      const rel = ((f as unknown) as { webkitRelativePath?: string }).webkitRelativePath || f.name;
      formData.append('repo', f);
      formData.append('relpath', rel);
    }
    formData.append('sourceVersion', selectedFrom);
    formData.append('targetVersion', selectedTo);
    formData.append('migrationPath', `${selectedFrom}-to-${selectedTo}`);
    formData.append('provider', provider);
    if (model.trim()) formData.append('model', model.trim());

    try {
      const response = await axios.post(`${API_BASE}/api/migrate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setJob({ jobId: response.data.jobId, status: 'queued', progress: 0 });
      const interval = setInterval(async () => {
        try {
          const statusResponse = await axios.get(`${API_BASE}/api/migration/${response.data.jobId}`);
          const updatedJob = { jobId: response.data.jobId, ...statusResponse.data } as MigrationJob;
          setJob(updatedJob);
          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            clearInterval(interval);
            setLoading(false);
            if (updatedJob.status === 'completed') {
              try {
                const results = await axios.get(`${API_BASE}/api/migration/${response.data.jobId}/results`);
                setJob((prev) => (prev ? { ...prev, ...results.data } : prev));
              } catch { /* results optional */ }
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    } catch (error) {
      console.error(error);
      alert('Migration failed to start. Is the Catalyst backend running on :3000?');
      setLoading(false);
    }
  };

  const selectedPath = migrationPaths.find((p) => p.from === selectedFrom && p.to === selectedTo);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ── Masthead ─────────────────────────────────────────── */}
      <header className="border-b border-hairline bg-paper/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CatalystMark />
            <div className="leading-none">
              <p className="font-display font-bold text-[19px] tracking-tight">Catalyst</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faded mt-1">Migration Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-mono text-[11px] text-faded border border-hairline rounded-full px-3 py-1.5 bg-white">
              {provider === 'auto' ? 'auto-provider' : provider}{model ? ` / ${model}` : ''}
            </span>
            <span className="font-mono text-[11px] border border-hairline rounded-full px-3 py-1.5 bg-white flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-moss' : 'bg-faded'}`} />
              {apiOnline ? 'api · online' : 'api · offline'}
            </span>
          </div>
        </div>
      </header>

      {!job ? (
        <main className="max-w-6xl mx-auto px-5">
          {/* ── Hero ─────────────────────────────────────────── */}
          <section className="pt-14 pb-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] items-center">
            <div>
              <Eyebrow>Parse → Plan → Execute → Validate</Eyebrow>
              <h1 className="font-display font-bold tracking-tight text-5xl sm:text-6xl leading-[1.02] mt-4">
                Ship the upgrade.<br />
                Skip the <span className="text-ember">rewrite.</span>
              </h1>
              <p className="text-soot text-lg mt-5 max-w-xl leading-relaxed">
                Catalyst migrates entire codebases — dependencies, idioms, and all —
                then proves it with your test suite. Forty-one paths, fifteen ecosystems, one upload.
              </p>
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-8 font-mono text-[12px] text-soot">
                <span><strong className="font-display text-2xl text-ink tabular">41</strong> paths</span>
                <span><strong className="font-display text-2xl text-ink tabular">15</strong> ecosystems</span>
                <span><strong className="font-display text-2xl text-ink tabular">6</strong> AI providers</span>
                <span><strong className="font-display text-2xl text-ink tabular">$0</strong> to start offline</span>
              </div>
            </div>

            {/* Terminal vignette */}
            <div className="rounded-xl overflow-hidden border border-ink/80 shadow-[8px_8px_0_#16130E] bg-ink text-[13px] leading-6">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                <span className="ml-3 font-mono text-[11px] text-white/50">catalyst — main.py · py2 → py3</span>
                <span className="ml-auto font-mono text-[11px] text-ember">● migrating</span>
              </div>
              <pre className="p-5 font-mono overflow-x-auto">
                <code>
                  <span className="text-white/35">@@ main.py · confidence 0.98 @@{'\n'}</span>
                  <span className="text-red-300">- print "Hello, World!"{'\n'}</span>
                  <span className="text-emerald-300">+ print("Hello, World!"){'\n'}</span>
                  <span className="text-white/35">  {'\n'}</span>
                  <span className="text-red-300">- name = raw_input("name: "){'\n'}</span>
                  <span className="text-emerald-300">+ name = input("name: "){'\n'}</span>
                  <span className="text-white/35">  {'\n'}</span>
                  <span className="text-white/80">$ pytest -q <span className="caret-blink">▊</span>{'\n'}</span>
                  <span className="text-emerald-300">✓ 14 passed · 0 failed</span>
                </code>
              </pre>
            </div>
          </section>

          {/* ── Console ──────────────────────────────────────── */}
          <section className="pb-6 grid gap-5 lg:grid-cols-3">
            {/* 01 Source */}
            <div className="bg-white border border-hairline rounded-xl p-6 flex flex-col">
              <div className="flex items-baseline justify-between">
                <Eyebrow>01 — Source</Eyebrow>
                <span className="font-display font-bold text-faded/60 text-xl">01</span>
              </div>
              <h2 className="font-display font-bold text-xl mt-1">Drop the legacy</h2>
              <div className="flex gap-1 mt-5 bg-paper border border-hairline rounded-lg p-1 font-mono text-[11px]">
                {(['archive', 'files', 'folder'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setUploadMode(m); setFiles([]); }}
                    className={`flex-1 py-1.5 rounded-md capitalize transition ${
                      uploadMode === m ? 'bg-ink text-paper font-semibold' : 'text-faded hover:text-ink'
                    }`}
                  >
                    {m === 'files' ? 'loose files' : m}
                  </button>
                ))}
              </div>
              {uploadMode === 'archive' && (
                <label className="mt-3 block border-[1.5px] border-dashed border-ink/25 rounded-lg p-7 hover:border-ember hover:bg-ember-soft/40 cursor-pointer transition text-center">
                  <input type="file" onChange={handleFileChange} className="hidden" accept=".zip,.rar,.tar,.tar.gz,.tgz" />
                  <p className="font-mono text-[13px] font-medium break-all">{stagedLabel || '＋ choose archive'}</p>
                  <p className="font-mono text-[11px] text-faded mt-2">.zip · .rar · .tar.gz — 50 MB max</p>
                </label>
              )}
              {uploadMode === 'files' && (
                <label className="mt-3 block border-[1.5px] border-dashed border-ink/25 rounded-lg p-7 hover:border-ember hover:bg-ember-soft/40 cursor-pointer transition text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".py,.js,.jsx,.ts,.tsx,.mjs,.cjs,.vue,.rb,.erb,.java,.go,.php,.cs,.txt,.md,.json,.yml,.yaml,.toml,.cfg,.ini,.xml,.gradle,.zip,.rar"
                  />
                  <p className="font-mono text-[13px] font-medium break-all">{stagedLabel || '＋ choose files'}</p>
                  <p className="font-mono text-[11px] text-faded mt-2">code files · multi-select OK</p>
                </label>
              )}
              {uploadMode === 'folder' && (
                <label className="mt-3 block border-[1.5px] border-dashed border-ink/25 rounded-lg p-7 hover:border-ember hover:bg-ember-soft/40 cursor-pointer transition text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    ref={(el) => { if (el) el.setAttribute('webkitdirectory', ''); }}
                  />
                  <p className="font-mono text-[13px] font-medium break-all">{stagedLabel || '＋ choose folder'}</p>
                  <p className="font-mono text-[11px] text-faded mt-2">whole repo dir · structure kept</p>
                </label>
              )}
              {files.length > 0 && (
                <p className="font-mono text-[11px] text-moss mt-3">✓ {files.length} file{files.length === 1 ? '' : 's'} · {(stagedBytes / 1024).toFixed(1)} KB staged</p>
              )}
              <div className="mt-auto pt-6">
                <p className="font-mono text-[11px] text-faded leading-relaxed">
                  TIP — push the repo root, not a subfolder. Tests included = proof included.
                </p>
              </div>
            </div>

            {/* 02 Target */}
            <div className="bg-white border border-hairline rounded-xl p-6 flex flex-col min-h-[480px]">
              <div className="flex items-baseline justify-between">
                <Eyebrow>02 — Target</Eyebrow>
                <span className="font-display font-bold text-faded/60 text-xl">02</span>
              </div>
              <h2 className="font-display font-bold text-xl mt-1">Pick the destination</h2>
              <div className="relative mt-5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-faded text-sm">⌕</span>
                <input
                  type="text"
                  placeholder="Filter — try “rails”, “go”, “hooks”…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-paper border border-hairline rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-faded focus:outline-none focus:border-ember focus:ring-2 focus:ring-ember/20"
                />
              </div>
              <div className="mt-4 space-y-5 overflow-y-auto max-h-[380px] pr-1 tick-scroll">
                {grouped.length === 0 && <p className="font-mono text-[12px] text-faded py-8 text-center">no matches for “{searchTerm}”</p>}
                {grouped.map((g) => (
                  <div key={g.category}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faded mb-2">
                      <span className="inline-block bg-ink text-paper rounded px-1.5 py-0.5 mr-2">{categoryIndex[g.category]}</span>
                      {g.category}
                    </p>
                    <div className="space-y-1">
                      {g.paths.map((p) => {
                        const active = p.from === selectedFrom && p.to === selectedTo;
                        return (
                          <button
                            key={`${p.from}-to-${p.to}`}
                            onClick={() => { setSelectedFrom(p.from); setSelectedTo(p.to); }}
                            className={`w-full text-left pl-3 pr-3 py-2 rounded-md text-[13.5px] transition border-l-[3px] flex items-center justify-between gap-2 ${
                              active
                                ? 'border-ember bg-ember-soft/60 font-semibold'
                                : 'border-transparent hover:bg-parchment/70 hover:border-hairline'
                            }`}
                          >
                            <span>{p.description}</span>
                            {active && <span className="font-mono text-ember text-sm">→</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 03 Run */}
            <div className="bg-ink text-paper rounded-xl p-6 flex flex-col">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/50">03 — Run</p>
                <span className="font-display font-bold text-white/25 text-xl">03</span>
              </div>
              <h2 className="font-display font-bold text-xl mt-1">Configure & fire</h2>

              <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50 mt-6 mb-2 block">Engine</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-sm text-paper focus:outline-none focus:border-ember [&>option]:text-black"
              >
                <option value="auto">Auto{configuredCount > 0 ? ` — ${configuredCount} key${configuredCount === 1 ? '' : 's'} live` : ' — offline rules'}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{p.configured ? ' ✓' : ''}</option>
                ))}
              </select>

              <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50 mt-5 mb-2 block">Model override</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={selectedProvider?.defaultModel || 'provider default'}
                className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 text-sm font-mono placeholder:text-white/30 focus:outline-none focus:border-ember"
              />
              {provider === 'zen' && (
                <p className="font-mono text-[11px] text-white/40 mt-2">zen → chat/completions models only (e.g. big-pickle)</p>
              )}

              <div className="mt-6 border-t border-white/10 pt-5 font-mono text-[12px] text-white/70 space-y-1.5">
                <p><span className="text-white/40">from</span> {selectedFrom}</p>
                <p><span className="text-white/40">to&nbsp;&nbsp;</span> {selectedTo}</p>
                <p className="text-white/90">{selectedPath?.description}</p>
              </div>

              <button
                onClick={handleMigrate}
                disabled={files.length === 0 || loading}
                className="mt-auto w-full bg-ember hover:bg-ember-deep disabled:opacity-30 disabled:cursor-not-allowed text-white font-display font-bold text-lg py-3.5 rounded-lg transition mt-6"
              >
                {loading ? 'Migrating…' : 'Run migration →'}
              </button>
              <p className="font-mono text-[11px] text-white/40 mt-3 text-center">no key? offline rules still run</p>
            </div>
          </section>

          {/* ── How it works ─────────────────────────────────── */}
          <section className="py-12 border-t border-hairline mt-6">
            <Eyebrow>The pipeline</Eyebrow>
            <div className="grid sm:grid-cols-5 gap-6 mt-6">
              {[
                ['Parse', 'Dependencies, imports, patterns.'],
                ['Plan', 'AI strategy + confidence.'],
                ['Execute', 'Deterministic transforms.'],
                ['Validate', 'Your tests, run for real.'],
                ['Ship', 'Diffs + ZIP download.'],
              ].map(([label, desc], i) => (
                <div key={label} className="border-t-2 border-ink pt-4">
                  <p className="font-display font-bold text-3xl text-ink/15 tabular">0{i + 1}</p>
                  <p className="font-display font-bold mt-1">{label}</p>
                  <p className="text-sm text-soot mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="border-t border-hairline py-8 flex flex-col sm:flex-row justify-between gap-2 font-mono text-[11px] text-faded">
            <p>CATALYST — MIGRATION ENGINE V0.1 · MIT</p>
            <p>SET IN SPACE GROTESK & JETBRAINS MONO</p>
          </footer>
        </main>
      ) : (
        <JobView job={job} onReset={() => { setJob(null); setFiles([]); }} />
      )}
    </div>
  );
}

function JobView({ job, onReset }: { job: MigrationJob; onReset: () => void }) {
  const idx = stageIndex(job.status);
  const failed = job.status === 'failed';
  const done = job.status === 'completed';
  const conf = Math.round((job.confidence || 0) * 100);

  return (
    <main className="max-w-6xl mx-auto px-5 py-12">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Pipeline */}
        <div className="bg-white border border-hairline rounded-xl p-7">
          <Eyebrow>Migration · {job.jobId.slice(0, 8)}</Eyebrow>
          <h2 className="font-display font-bold text-2xl mt-2">
            {failed ? 'Stopped at validation.' : done ? 'Shipped.' : 'Migration in motion.'}
          </h2>
          <div className="mt-7 space-y-0">
            {STAGES.map((s, i) => {
              const state = failed && i === 5 ? 'failed' : i < idx ? 'done' : i === idx ? 'active' : 'todo';
              return (
                <div key={s.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[12px] border ${
                      state === 'done' ? 'bg-moss text-white border-moss'
                      : state === 'active' ? 'bg-ember text-white border-ember'
                      : state === 'failed' ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-faded border-hairline'
                    }`}>
                      {state === 'done' ? '✓' : state === 'failed' ? '✕' : i + 1}
                    </span>
                    {i < STAGES.length - 1 && (
                      <span className={`w-px flex-1 min-h-[22px] ${i < idx ? 'bg-moss' : 'bg-hairline'}`} />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className={`font-display font-bold text-[15px] ${state === 'todo' ? 'text-faded' : ''}`}>{s.label}</p>
                    <p className="font-mono text-[11px] text-faded">{s.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {job.error && <p className="font-mono text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mt-2">{job.error}</p>}
          {failed && (
            <button onClick={onReset} className="mt-4 w-full bg-ink text-paper font-display font-bold py-3 rounded-lg">Try again →</button>
          )}
        </div>

        {/* Results */}
        <div className="space-y-5">
          <div className="bg-white border border-hairline rounded-xl p-7">
            <div className="flex items-baseline justify-between">
              <Eyebrow>{done ? 'Result' : 'Progress'}</Eyebrow>
              <span className="font-mono text-[12px] tabular">{job.progress}%</span>
            </div>
            <div className="h-1.5 bg-parchment rounded-full mt-3 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-red-500' : 'bg-ember'}`} style={{ width: `${job.progress}%` }} />
            </div>

            {done && (
              <div className="mt-6">
                <div className="flex items-end justify-between">
                  <p className="font-display font-bold text-lg">Confidence</p>
                  <p className={`font-display font-bold text-4xl tabular ${conf >= 90 ? 'text-moss' : conf >= 70 ? 'text-ember' : 'text-red-600'}`}>{conf}<span className="text-lg text-faded">%</span></p>
                </div>
                <div className="flex gap-1 mt-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i} className={`h-2.5 flex-1 rounded-sm ${i < Math.round(conf / 10) ? (conf >= 90 ? 'bg-moss' : conf >= 70 ? 'bg-ember' : 'bg-red-500') : 'bg-parchment'}`} />
                  ))}
                </div>
                {job.confidenceBreakdown && (
                  <p className="font-mono text-[11px] text-faded mt-2">
                    plan {Math.round(job.confidenceBreakdown.plan * 100)} · applied {Math.round(job.confidenceBreakdown.application * 100)} · tests {Math.round(job.confidenceBreakdown.tests * 100)}
                  </p>
                )}
                <div className="mt-5 font-mono text-[12px] text-soot space-y-1.5 border-t border-hairline pt-4">
                  <p><span className="text-faded">engine&nbsp;&nbsp;</span>{job.offline ? 'offline rules' : `${job.provider} / ${job.model || 'default'}`}</p>
                  {typeof job.retries === 'number' && job.retries > 0 && (
                    <p><span className="text-faded">retries&nbsp;</span>{job.retries} auto-fix{job.retries === 1 ? '' : 'es'}</p>
                  )}
                  {job.testResults && (
                    <p><span className="text-faded">tests&nbsp;&nbsp;&nbsp;</span>{job.testResults.framework} — {job.testResults.message}</p>
                  )}
                  {job.changedFiles && job.changedFiles.length > 0 && (
                    <div>
                      <p className="text-faded">files&nbsp;&nbsp;&nbsp;{job.changedFiles.length} changed</p>
                      <ul className="mt-1 space-y-0.5">
                        {job.changedFiles.map((f) => {
                          const ren = (job.renames || []).find((r) => r.to === f || r.to.endsWith('/' + f) || r.to.endsWith('\\' + f));
                          return <li key={f} className="truncate">· {ren ? `${ren.from} → ${ren.to}` : f}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <a
                    href={`${API_BASE}/api/migration/${job.jobId}/download`}
                    className="text-center bg-moss text-white font-display font-bold py-3 rounded-lg hover:brightness-110 transition"
                  >
                    ↓ Download ZIP
                  </a>
                  <button onClick={onReset} className="bg-ink text-paper font-display font-bold py-3 rounded-lg hover:bg-black transition">
                    New run →
                  </button>
                </div>
              </div>
            )}
          </div>

          {done && job.diffs && job.diffs.length > 0 && (
            <div className="bg-white border border-hairline rounded-xl p-7">
              <Eyebrow>Diffs · {job.diffs.length} file{job.diffs.length === 1 ? '' : 's'}</Eyebrow>
              <div className="mt-4"><CatalystDiffViewer diffs={job.diffs} /></div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
