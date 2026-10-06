<div align="center">

# ⚗️ Catalyst

### Transform legacy code into modern systems — with AI precision

**Upload a codebase. Pick source → target. Get back migrated, tested code.**<br>
Unified diffs · Earned confidence scores · Version-aware renames · ZIP download

```
Python 2 → 3 · ES5 → ES2020 · Rails 4 → 7 · Java 8 → 21 · React Class → Hooks
Vue 2 → 3 · Django 2 → 4.2 · Spring Boot → 3 · Laravel → 11 · .NET → 8
────────── 41 migration paths · 15 ecosystems · 6 AI providers ──────────
```

[![CI](https://github.com/ArshDhole/Catalyst/actions/workflows/ci.yml/badge.svg)](https://github.com/ArshDhole/Catalyst/actions)
![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)
![Tests 68 passing](https://img.shields.io/badge/tests-68%20passing-brightgreen)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

[Quick Start](#-quick-start) · [Why Catalyst](#-why-catalyst--the-hallucination-problem) · [RAG Pipeline](#-rag-pipeline--how-catalyst-stays-grounded) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Contributing](#contributing)

</div>

---

## 🚀 Quick Start

### Windows — One Click

> Double-click **`start.bat`** and you're done.

It automatically:
1. Checks for Node.js 20+
2. Installs backend + frontend dependencies (`npm install`)
3. Creates `.env` from `.env.example` if missing
4. Starts backend on **`:3000`** and frontend on **`:3001`** in separate windows
5. Opens your browser to the Catalyst UI

```
═══════════════════════════════════════════════
 Catalyst is starting!
 UI:      http://localhost:3001
 API:     http://localhost:3000/api/health
 No API key? Offline Python 2→3 demo works.
 Close the two server windows to stop.
═══════════════════════════════════════════════
```

### Manual Setup

```bash
# 1. Backend → http://localhost:3000
git clone https://github.com/ArshDhole/Catalyst.git
cd Catalyst
npm install
cp .env.example .env          # add any provider key, or skip for offline mode
npm test                       # 68 tests incl. full upload→migrate→download E2E
npm run dev                    # starts Express with hot-reload

# 2. Frontend → http://localhost:3001  (new terminal)
cd catalyst-frontend
npm install
npm run dev                    # starts Next.js dev server
```

### Docker (API + Postgres)

```bash
docker compose up --build
# API → http://localhost:3000 (set keys via .env)
```

> **No API key at all?** Python 2→3, Python 3.x upgrades, and ES5→ES2020 migrations still run fully offline — rules, tests, diffs, download, everything. **$0 to start.**

---

## 🧠 Why Catalyst — The Hallucination Problem

Manual migration of a legacy codebase costs **weeks** and is exactly the kind of repetitive work humans do badly. But naively pasting files into an AI chatbot is **dangerous** — the model can't see your whole repo, invents APIs from memory, and never proves its output works.

**Catalyst exists to close that trust gap.** Every design decision targets a specific failure mode of raw LLMs:

| 🚫 Problem with raw LLMs | ✅ What Catalyst does instead |
|:---|:---|
| **Hallucinated APIs** — the model recalls migrations approximately, invents function signatures from training data | **Grounded retrieval (RAG)** — the plan is written against *retrieved code chunks* cited as `file:start-end` plus a curated knowledge base of version mappings. The model looks at **your code**, not its memory |
| **Blind to the repo** — 50-file context caps, truncated input, missed files | **Whole-repo indexing** — every code file is chunked (120-line windows, 20-line overlap, ≤800 chunks). No file cap; planning and retries retrieve what's relevant |
| **Confident guesses** — one flat score, or no score at all | **Measured, earned confidence** — formula: `50% plan prior + 30% applied-rate + 20% test outcome`, capped at 97%. Visible breakdown: `plan 88 · applied 100 · tests 100`. Missed patterns and red tests **lower** the number |
| **No proof** — "looks right" | **Real validation** — your actual test suite runs (`pytest`, `jest`, `mocha`, `mvn`, `rspec`, `go test`…). Failures trigger up to **3 AI fix retries**, each focused by failure-keyed retrieval |
| **Vague edits** — prose suggestions you apply by hand | **Exact-snippet replacements** — every change is a verbatim `old → new` replacement. Anything that doesn't match on disk is counted as a miss, not silently skipped |
| **Deterministic work wasted on AI** — paying per-token for `print` → `print()` | **Offline rule packs** — Python 2→3, Python 3.x, and ES5→modern-JS run as audited regex transforms. Free, instant, **zero hallucination surface** |
| **Merge anxiety** — how do you know what changed? | **Human-in-the-loop output** — unified diffs, changed-file lists, `old → new` renames, and a ZIP download. Review, then merge |

---

## 🔍 RAG Pipeline — How Catalyst Stays Grounded

Retrieval-Augmented Generation (RAG) is the core mechanism that prevents hallucination. Instead of asking the AI to recall migration patterns from memory, Catalyst **retrieves the relevant code** and **feeds it directly** into the prompt.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG PIPELINE                            │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Your     │───▶│   Chunker    │───▶│   Vector Store   │   │
│  │  Codebase │    │ 120-line     │    │ Cosine-similarity│   │
│  │           │    │ windows,     │    │ top-K retrieval  │   │
│  │           │    │ 20-line      │    │                  │   │
│  │           │    │ overlap      │    │                  │   │
│  └──────────┘    └──────────────┘    └────────┬─────────┘   │
│                                               │              │
│  ┌──────────────────┐                         │              │
│  │  Knowledge Base   │─────────────────────────┤              │
│  │  • playbook.md    │   Curated migration     │              │
│  │  • python2-to-3   │   guides chunked at     ▼              │
│  │  • js-es5-modern  │   40-line windows  ┌─────────────┐   │
│  └──────────────────┘                     │  Retriever   │   │
│                                           │  3 targeted  │   │
│                                           │  queries:    │   │
│                                           │  • deprecated│   │
│                                           │    APIs      │   │
│                                           │  • import    │   │
│                                           │    changes   │   │
│                                           │  • relevant  │   │
│                                           │    tests     │   │
│                                           └──────┬──────┘   │
│                                                  │           │
│                                                  ▼           │
│                                           ┌─────────────┐   │
│                                           │  AI Prompt   │   │
│                                           │  (grounded   │   │
│                                           │   context)   │   │
│                                           └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Embedding Strategies

| Mode | How it works | Cost | Best for |
|:---|:---|:---|:---|
| **`tfidf`** (default) | Hashed TF-IDF vectors — deterministic, 512-dimensional. Tokenizes code identifiers and hashes them into a fixed vector space with cosine similarity | **$0** | Offline use, code-heavy repos (identifiers match literally) |
| **`provider`** | Real embeddings via OpenAI (`text-embedding-3-small`), Gemini (`text-embedding-004`), or OpenRouter | API cost | Semantic search across natural language + code |
| **`auto`** | Uses provider vectors when a key exists for OpenAI/Gemini/OpenRouter, else falls back to local TF-IDF | Varies | Default — works with any configuration |

### Knowledge Base

Catalyst ships with curated migration guides that get indexed alongside your code:

- **`playbook.md`** — Universal migration rules (loaded for every path): preserve behavior first, keep edits minimal, never invent APIs, emit exact `old → new` snippets
- **`python2-to-3.md`** — Python 2→3 specific patterns, stdlib moves, encoding changes
- **`js-es5-modern.md`** — ES5→ES2020 patterns, module systems, new APIs

These serve as **grounding documents** — they teach the AI *how* to approach migrations safely, not just *what* to change.

### Failure-Keyed Retrieval (Fix Retries)

When tests fail after migration, Catalyst doesn't just re-run the same prompt. It:
1. Takes the test failure output
2. Runs a **new retrieval query** focused on the failure: `"code related to test failure: <error text>"`
3. Retrieves code chunks relevant to the failing test
4. Sends a targeted fix prompt with this fresh context
5. Reverts to original, applies the fixed plan, re-runs tests
6. Repeats up to **3 times**

---

## ⚡ Features

### 🤖 Universal AI Providers
Works with **any** major AI provider — or none at all:

| Provider | Model Default | Protocol |
|:---|:---|:---|
| Anthropic Claude | `claude-opus-4-20250805` | Native Messages API |
| OpenAI | `gpt-4o` | Chat Completions |
| Google Gemini | `gemini-2.0-flash` | Gemini API |
| OpenRouter | `anthropic/claude-opus-4.6` | OpenAI-compatible |
| OpenCode Zen | `big-pickle` | OpenAI-compatible |
| Custom | any model | OpenAI-compatible (Ollama, LM Studio, vLLM, Together, Groq, etc.) |

### 🔑 Bring-Your-Own-Key (BYOK)
Paste an API key in the UI — it applies to **that run only**. Keys live in browser storage + server memory; they're **never written to disk, never logged, never returned by any API endpoint**.

### 🎯 41 Migration Paths
Across **15 ecosystems**: Python, JavaScript, TypeScript, React, Vue, Angular, Rails, Django, Spring Boot, Laravel, Java, Go, .NET, PHP, Ruby.

### 📦 Flexible Uploads
- **Archive**: `.zip` / `.rar` / `.tar.gz` (up to 50 MB per file, 300 MB total)
- **Loose files**: Multi-select code files
- **Folder**: Entire directory with structure preserved (via `webkitdirectory`)
- Path-traversal sanitized, extension-allowlisted, size/count-capped

### 📊 Earned Confidence Scoring
Not a hardcoded number — mathematically derived from real signals:

```
confidence = min(0.50 × plan_score + 0.30 × applied_rate + 0.20 × test_outcome, 0.97)
```

| Component | Weight | What it measures |
|:---|:---|:---|
| `plan_score` | 50% | AI's self-assessed confidence in the migration plan |
| `applied_rate` | 30% | `applied_changes / attempted_changes` — how many edits matched |
| `test_outcome` | 20% | 1.0 if all tests pass, 0.45 if they fail |
| **Cap** | — | Hard ceiling at **97%** — no migration is ever "100% certain" |

### 🔄 Version-Aware Renames
Files referencing the source version get automatically renamed:
- `test.python2` → `test.python3`
- `app.es5.js` → `app.es2020.js`
- `util.cjs` → `util.esm`

### 💰 Cost Survival
- `MAX_TOKENS` budget per AI call (default: 8000)
- Auto-shrink on OpenRouter 402 errors (halves budget, floor 1000)
- `RAG_CONTEXT_CHARS` limit (default: 24000 chars per prompt)
- Rate limiting: 20 requests / 15 min per IP
- Full offline `$0` mode for supported paths

### 🗄️ DB-Optional
- **No database**: Works with in-memory job store out of the box
- **Postgres**: Set `DATABASE_URL` for persistent job storage (Docker Compose spins this up automatically)

---

## 🏗️ Architecture

### Pipeline Overview

```
upload ─▶ stage ─▶ parse ─┬─▶ chunk + embed (repo + knowledge base)
                           │         │
                           │         ▼
                           │   retrieve top-K ─▶ plan (AI + offline rule pre-pass)
                           │                            │
                           └────────▶ execute ─▶ validate (real tests) ─▶ fix & retry (≤3x)
                                                                │
                                        renames ─▶ diffs ─▶ confidence ─▶ results + ZIP
```

### Pipeline Stages

| Stage | Module | What happens |
|:---|:---|:---|
| **Parse** | `src/parsers/` | Analyze structure, imports, dependencies, language detection. Run offline rule pre-pass (Python 2→3, ES5→ES2020) as audited regex transforms |
| **Index** | `src/rag/` | Chunk repo into 120-line overlapping windows. Chunk knowledge base (migration guides) into 40-line windows. Embed everything into vectors (TF-IDF or provider). Build in-memory vector store |
| **Retrieve** | `src/rag/retriever.js` | Fire 3 targeted queries: deprecated APIs, import changes, relevant tests. Merge repo + KB hits. Budget-cap at `RAG_CONTEXT_CHARS` |
| **Plan** | `src/core/orchestrator.js` | Build grounded prompt with retrieved context. Get AI migration plan (JSON). Merge with offline rule edits as Phase 0. Cache result |
| **Execute** | `src/executors/` | Apply verbatim `old → new` snippet replacements. Track attempted vs. applied. Save originals for rollback |
| **Validate** | `src/validators/` | Auto-detect test framework (pytest, jest, mocha, maven, rspec, go test, etc.). Run the suite. On failure: revert, retrieve failure-relevant code, get AI fix, re-apply. Up to 3 retries |
| **Ship** | `src/utils/` | Generate unified diffs. Compute confidence with breakdown. Apply version-aware renames. Package as downloadable ZIP |

### Tech Stack

| Layer | Technology |
|:---|:---|
| **Backend** | Node.js 20+ · Express · Multer (uploads) · Zod (validation) |
| **Frontend** | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| **AI Layer** | Fetch-native universal provider (no SDK lock-in) — 6 providers, one interface |
| **RAG** | Custom chunker + vector store. Hashed TF-IDF (local, $0) or provider embeddings (OpenAI/Gemini) |
| **Testing** | Node.js built-in test runner · 68 tests · 8 suites |
| **Deploy** | Docker · Docker Compose (API + Postgres) · Vercel · Railway/Fly |

### Offline Rule Engine

For supported paths, Catalyst uses **deterministic regex-based transforms** that run without any AI:

**Python 2 → 3 Rules** (18 high-precision transforms):
- `print "hello"` → `print("hello")`
- `raw_input()` → `input()`
- `xrange()` → `range()`
- `dict.iteritems()` → `dict.items()`
- `except E, e:` → `except E as e:`
- `urllib2` → `urllib.request`
- `from StringIO import StringIO` → `from io import StringIO`
- `unicode()` → `str()`, `basestring` → `str`, and more...

**ES5 → ES2020 Rules:**
- `var` → `const` (with review flags for reassignments)
- `function name()` → `const name = () =>`
- `.indexOf(x) !== -1` → `.includes(x)`

These rules are **merged as Phase 0** before AI phases — free, instant, zero hallucination.

### Project Structure

```
catalyst/
├── src/
│   ├── server.js                Express boot, health, graceful shutdown
│   ├── api/routes.js            Jobs, uploads, downloads, rate limits, Zod validation
│   ├── core/
│   │   ├── orchestrator.js      Parse → Plan → Execute → Validate → Retry
│   │   └── providers.js         Universal AI layer (6 providers, BYOK, auto-shrink budgets)
│   ├── rag/
│   │   ├── chunker.js           120-line overlapping window chunker (≤800 chunks)
│   │   ├── embeddings.js        Hashed TF-IDF (local) + provider embeddings (OpenAI/Gemini)
│   │   ├── vectorStore.js       In-memory cosine-similarity vector store
│   │   ├── retriever.js         Multi-query retrieval with budget-capped context
│   │   └── knowledge/           Curated migration guides (RAG corpus)
│   │       ├── playbook.md      Universal migration rules
│   │       ├── python2-to-3.md  Python 2→3 patterns
│   │       └── js-es5-modern.md ES5→modern JS patterns
│   ├── parsers/
│   │   ├── codeParser.js        Code analysis, language detection
│   │   ├── migrationRules.js    41 path definitions + offline regex rule packs
│   │   └── pythonParser.js      Python-specific parser + offline plan generator
│   ├── executors/
│   │   └── codeExecutor.js      Snippet replacement, rollback, version-aware renames
│   ├── validators/
│   │   └── testRunner.js        Auto-detect & run test frameworks (10 supported)
│   └── utils/
│       ├── confidence.js        Earned confidence scoring formula
│       ├── diff.js              Unified diff generation
│       ├── uploads.js           Archive extraction, sanitization, size caps
│       ├── cache.js             Plan result caching
│       ├── db.js                Postgres persistence (optional)
│       └── logger.js            Structured logging
├── catalyst-frontend/           Next.js 14 + TypeScript + Tailwind
│   ├── app/page.tsx             Main UI: upload, path picker, provider config, results
│   └── components/
│       └── CatalystDiffViewer   Syntax-highlighted unified diff viewer
├── tests/                       68 tests · 8 suites
│   ├── api.test.js              Full upload→migrate→download E2E
│   ├── rag.test.js              Chunker, embeddings, retriever, vector store
│   ├── providers.test.js        Multi-provider resolution, BYOK, key cleaning
│   ├── confidence.test.js       Scoring formula edge cases
│   ├── rules.test.js            Offline regex transforms
│   ├── renames.test.js          Version-aware file renames
│   ├── uploads.test.js          Archive extraction, sanitization
│   └── offline.test.js          Full offline pipeline
├── db/migrations/               Postgres schema (optional)
├── start.bat                    One-click Windows launcher
├── docker-compose.yml           API + Postgres
├── Dockerfile                   Production image (Node 20 Alpine)
└── .github/workflows/ci.yml    CI pipeline
```

---

## 🔌 API Reference

| Method & Path | Purpose |
|:---|:---|
| `POST /api/migrate` | Start a migration job. Multipart: `repo` files + `relpath` + `sourceVersion` + `targetVersion` + optional `migrationPath`, `provider`, `model`, `apiKey` → `{ jobId }` |
| `GET /api/providers` | List available providers with status (keys never exposed) |
| `GET /api/health` | Health check |
| `GET /api/migration/:id` | Job status, progress, engine, RAG stats |
| `GET /api/migration/:id/results` | Diffs, tests, confidence + breakdown, renames, changed files |
| `GET /api/migration/:id/download` | Migrated code as a sensibly-named `.zip` (e.g. `test-python3.zip`) |
| `DELETE /api/migration/:id` | Cleanup job, files, and any per-run key |

**Rate Limits:** 20 uploads / 15 min per IP. Request keys live in memory for one run only.

---

## ⚙️ Configuration

All configuration lives in `.env` (never committed — only `.env.example` is tracked):

| Variable | Purpose | Default |
|:---|:---|:---|
| `AI_PROVIDER` | `auto` · `anthropic` · `openai` · `gemini` · `openrouter` · `zen` · `custom` | `auto` |
| `MODEL` | Global model override (must be valid on all providers you use) | provider default |
| `ANTHROPIC_API_KEY` | Anthropic Claude key | — |
| `OPENAI_API_KEY` | OpenAI key | — |
| `GEMINI_API_KEY` | Google Gemini key | — |
| `OPENROUTER_API_KEY` | OpenRouter key (many models, one key) | — |
| `ZEN_API_KEY` | OpenCode Zen key | — |
| `CUSTOM_BASE_URL` + `CUSTOM_API_KEY` | Any OpenAI-compatible server (Ollama, LM Studio, etc.) | — |
| `MAX_TOKENS` | Output budget per AI call (auto-shrinks on 402s) | `8000` |
| `RAG_ENABLED` | `1` to enable, `0` to disable (falls back to full dump) | `1` |
| `RAG_EMBEDDING` | `auto` · `tfidf` (free/offline) · `provider` (real vectors) | `auto` |
| `RAG_TOP_K` | How many chunks to retrieve per query | `12` |
| `RAG_CONTEXT_CHARS` | Max chars of retrieved context per prompt | `24000` |
| `DATABASE_URL` | Postgres connection string (omit for in-memory) | — |
| `PORT` | Backend port | `3000` |

---

## 🔐 Security

- **`.env`** is gitignored; only placeholder `.env.example` is committed
- **Request keys**: memory-only, deleted at job end, absent from every response and log
- **Key cleaning**: invisible paste junk (zero-width spaces, NBSP) is stripped automatically
- **Uploads**: extension allowlist, path-traversal sanitization, size/count caps (50MB/file, 300MB total, 2000 files)
- **Input validation**: all inputs validated with Zod; absolute server paths never leave the API
- **Rate limiting**: 20 uploads / 15 min per IP via `express-rate-limit`

---

## 📖 Using Catalyst

**Step-by-step:**

1. **Upload** — Pick *archive*, *loose files*, or *folder*
2. **Pick a path** — Search 41 migrations, click one (e.g., Python 2 → 3)
3. **Configure** — Provider on Auto, a specific one, or paste a key + optional model override
4. **Run** — Watch the pipeline: `queued → analyzing → planning → executing → validating → completed`
5. **Review** — Confidence meter with breakdown, unified diffs, renamed files, test results
6. **Download** the migrated ZIP and merge with confidence

> **Tip**: Upload the repo root, not a subfolder. Tests included = proof included.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — adding a migration path is one rule pack + one knowledge doc + tests. Bug reports with the job's `error` text and `rag`/engine lines get fixed fastest.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Built by [Arsh Dhole](https://github.com/ArshDhole)**

*Ship the upgrade. Skip the rewrite.*

</div>
