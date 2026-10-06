# Catalyst — migrate entire codebases, not files

**Catalyst is an AI-powered code migration engine.** Upload a legacy codebase,
pick source → target, and get back migrated, tested code — with unified diffs,
earned confidence scores, and version-aware file renames. It runs with any AI
provider, a per-run key pasted in the UI, or with no key at all.

```text
Python 2 → 3 · ES5 → ES2020 · Rails 4 → 7 · Java 8 → 21 · 41 paths, 15 ecosystems
```

[![CI](https://github.com/ArshDhole/Catalyst/actions/workflows/ci.yml/badge.svg)](https://github.com/ArshDhole/Catalyst/actions)
![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)
![Tests 68 passing](https://img.shields.io/badge/tests-68%20passing-brightgreen)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

---

## Why Catalyst (instead of manual work, or pasting files into a chatbot)

Manual migration of a legacy codebase costs weeks and is exactly the kind of
repetitive work humans do badly. Naive AI help is fast but untrustworthy: the
model can't see your whole repo, invents APIs from memory, and never proves its
output. Catalyst is built specifically to close that trust gap:

| Problem with raw LLMs | What Catalyst does instead |
|---|---|
| **Hallucinated APIs** — the model recalls migrations approximately | **Grounded retrieval (RAG):** the plan is written against retrieved code chunks cited as `file:start-end` plus a curated knowledge base of version mappings — the model looks at your code, not its memory |
| **Blind to the repo** — 50-file caps, truncated context, missed files | **Whole-repo indexing:** every code file is chunked (120-line windows, ≤800 chunks). No file cap; planning and retries retrieve what's relevant |
| **Confident guesses** — one flat score, or none | **Measured confidence:** `50% plan prior + 30% applied-rate + 20% test outcome`, capped at 97, with a visible breakdown (`plan 88 · applied 100 · tests 100`). Missed patterns and red tests *lower* the number |
| **No proof** — "looks right" | **Real validation:** your actual test suite runs (`pytest`, `jest`, `mocha`, `mvn`, `rspec`, `go test`…). Failures trigger up to 3 AI fix retries, each focused by failure-keyed retrieval |
| **Vague edits** — prose suggestions you apply by hand | **Exact-snippet edits:** every change is a verbatim `old → new` replacement; anything that doesn't match on disk is counted as a miss, not silently skipped |
| **Deterministic work wasted on AI** — paying per token for `print` → `print()` | **Offline rule packs:** Python 2→3, Python 3.x upgrades, and ES5→modern-JS run as audited regex transforms — free, instant, zero hallucination surface |
| **Merge anxiety** | **Human-in-the-loop output:** unified diffs, changed-file lists, `old → new` renames, and a ZIP download. Review, then merge |

---

## Features

- **Universal AI providers** — Anthropic, OpenAI, Gemini, OpenRouter, OpenCode Zen,
  or any OpenAI-compatible server. Auto-detect, per-request override, or…
- **Bring-your-own-key in the UI** — paste a key, it applies to that run only.
  Browser storage + server memory; never written to disk, never returned by any API
- **RAG pipeline** — chunk → embed → retrieve for planning *and* retries;
  local hashed-TF-IDF by default ($0, offline), provider vectors optional
- **41 migration paths** across Python, JavaScript, TypeScript, React, Vue,
  Angular, Rails, Django, Spring Boot, Laravel, Java, Go, .NET, PHP, Ruby
- **Flexible uploads** — `.zip` / `.rar` / `.tar.gz` archive, loose files, or a
  whole folder (structure preserved). Traversal-sanitized, capped, validated
- **Version-aware renames** — `test.python2 → test.python3`, `app.es5.js → app.es2020.js`,
  for all languages, with collision protection
- **Migration-aware downloads** — `test-python3.zip`, not `catalyst-<uuid>.zip`
- **Cost survival** — `MAX_TOKENS` budget, automatic shrink-and-retry on
  OpenRouter 402s, rate limiting, RAG context budgets, offline $0 mode
- **Clean API + DB-optional** — REST jobs with progress polling; Postgres
  persistence when `DATABASE_URL` is set, in-memory otherwise

---

## Run it

### Windows — one click

Double-click **`start.bat`**. It checks Node, installs dependencies, creates
`.env` if missing, opens the backend (`:3000`) and frontend (`:3001`) in their
own windows, and opens your browser. Close the two windows to stop.

### Manual

```bash
# Backend → http://localhost:3000
npm install
cp .env.example .env   # optional: add any provider key, or skip for offline mode
npm test               # 68 tests incl. full upload→migrate→download E2E
npm run dev

# Frontend → http://localhost:3001 (new terminal)
cd catalyst-frontend
npm install
npm run dev
```

### Docker (API + Postgres)

```bash
docker compose up --build
# API → http://localhost:3000 (set keys via .env)
```

> Backend and frontend both need a restart after `.env` changes. Keys pasted
> in the UI need no restart — they apply to that run immediately.

---

## Using it

1. **Upload** — pick *archive*, *loose files*, or *folder*. (50 MB/file, 300 MB total, 2000 files)
2. **Pick a path** — search 41 migrations, click one (e.g. Python 2 → 3)
3. **Configure** — provider on Auto, a specific one, or paste a key + optional model override
4. **Run** — watch the pipeline (queued → analyzing → planning → executing → validating → ship)
5. **Review** — confidence meter with breakdown, unified diffs, renamed files, test results
6. **Download** the migrated ZIP and merge with confidence

No key at all? Python 2→3, Python 3.x, and legacy-JS migrations still run
fully offline — rules, tests, diffs, download, everything.

---

## Configuration

All in `.env` (never committed — only `.env.example` is in git):

| Variable | Purpose | Default |
|---|---|---|
| `AI_PROVIDER` | `auto` or force a provider | `auto` |
| `MODEL` | Global model override (**must be valid on all providers you use**) | provider default |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `ZEN_API_KEY` | Provider keys (any subset) | — |
| `MAX_TOKENS` | Output budget per AI call (auto-shrinks on 402s) | `8000` |
| `RAG_ENABLED` | `0` disables retrieval (legacy full dump) | `1` |
| `RAG_EMBEDDING` | `auto` · `tfidf` (free/offline) · `provider` (real vectors) | `auto` |
| `RAG_TOP_K` / `RAG_CONTEXT_CHARS` | Retrieval breadth / prompt budget | `12` / `24000` |
| `DATABASE_URL` | Postgres persistence (else in-memory) | — |
| `PORT` | Backend port | `3000` |
| `NEXT_PUBLIC_API_BASE` | Where the frontend finds the API | `http://localhost:3000` |

Provider defaults: Claude `claude-opus-4-20250805` · OpenAI `gpt-4o` ·
Gemini `gemini-2.0-flash` · OpenRouter `anthropic/claude-opus-4.6` ·
Zen `big-pickle` (chat/completions models only — `/responses`-only models like
`gpt-*`/`muse-spark-*` are not supported) · Custom via `CUSTOM_BASE_URL`.

`GET /api/providers` always shows what's configured — keys are never exposed.

---

## How it works

```text
upload ─▶ stage ─▶ parse ─┬─▶ chunk + embed (repo + knowledge base)
                           │         │
                           │         ▼
                           │   retrieve top-K ─▶ plan (AI + offline rule pre-pass)
                           │                            │
                           └────────▶ execute ─▶ validate (real tests) ─▶ fix & retry (≤3x)
                                                                │
                                        renames ─▶ diffs ─▶ confidence ─▶ results + ZIP
```

- **Parse** (`src/parsers/`): structure, imports, dependencies, language detection.
- **Index** (`src/rag/`): overlapping 120-line chunks + curated guides
  (`python2-to-3.md`, `js-es5-modern.md`, `playbook.md`) in a vector store.
  Local TF-IDF vectors by default; provider embeddings when keyed.
- **Plan** (`src/core/orchestrator.js`): three targeted queries (deprecated APIs,
  import changes, relevant tests) build a cited, budgeted prompt. Offline mode
  uses deterministic rule packs instead — same downstream pipeline.
- **Execute** (`src/executors/`): verbatim snippet replacement with rollback
  snapshots; misses counted, never hidden.
- **Validate** (`src/validators/`): detects and runs your suite; failures feed a
  failure-keyed retrieval round for the fix plan.
- **Ship**: version-aware renames, unified diffs, earned confidence, ZIP download.

### API

| Method & path | Purpose |
|---|---|
| `POST /api/migrate` | Start a job (`repo` files + `relpath` + versions + optional `migrationPath`, `provider`, `model`, `apiKey`) → `{ jobId }` |
| `GET /api/providers` | Provider availability + defaults (no keys) |
| `GET /api/migration/:id` | Status, progress, engine, RAG stats |
| `GET /api/migration/:id/results` | Diffs, tests, confidence + breakdown, renames, files |
| `GET /api/migration/:id/download` | Migrated code as a sensibly-named `.zip` |
| `DELETE /api/migration/:id` | Cleanup job, files, and any per-run key |

Uploads: 20 req / 15 min per IP. Request keys live in memory for one run only.

---

## Project structure

```text
catalyst/
├── src/
│   ├── server.js            Express boot, health, graceful shutdown
│   ├── api/routes.js        Jobs, uploads, downloads, rate limits, validation
│   ├── core/orchestrator.js Parse → plan → execute → validate → retry
│   ├── core/providers.js    Universal AI layer (6 providers, BYOK, budgets)
│   ├── rag/                 Chunker, embeddings, vector store, retriever
│   │   └── knowledge/       Curated migration guides (the RAG corpus)
│   ├── parsers/             Code analysis + offline rule packs
│   ├── executors/           Change application, renames, rollback
│   ├── validators/          Test-framework detection + execution
│   └── utils/               Uploads, diffs, confidence, cache, db, logging
├── catalyst-frontend/       Next.js 14 + TS + Tailwind (41 paths, diffs, uploads)
├── tests/                   68 tests · 16 suites (`npm test`)
├── db/migrations/           Postgres schema (optional)
├── start.bat                One-click Windows launcher
└── docker-compose.yml       API + Postgres
```

### Tech stack

Backend: **Node.js 20+ · Express · Multer · Zod** · Frontend: **Next.js 14 ·
React 18 · TypeScript · Tailwind** · AI: **any provider via fetch-native layer**
(no SDK lock-in) · RAG: **in-house chunker + vector store** (TF-IDF local,
OpenAI/Gemini vectors optional) · Tests: **node:test, 68 green incl. live-API E2E**
· Deploy: **Docker, Vercel, Railway/Fly**

---

## Security notes

- `.env` is gitignored; only placeholder `.env.example` is committed
- Request keys: memory-only, deleted at job end, absent from every response and log
- Uploads: extension allowlist, path-traversal sanitization, size/count caps
- All inputs validated with Zod; absolute server paths never leave the API

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — adding a migration path is one rule
pack + one knowledge doc + tests. Bug reports with the job's `error` text and
`rag`/engine lines get fixed fastest.

## License

MIT — see [LICENSE](LICENSE).
