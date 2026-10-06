# Catalyst 🚀 — Transform legacy code into modern systems with AI precision

AI-powered code migration platform. Upload a repo, pick source → target, get back
migrated, tested code with unified diffs and confidence scores.

**Works with any key — or no key:** offline rule-based migrations (Python 2→3,
ES5→ES2020, Py3.6→3.11) run with zero config; add any AI provider for full planning.

## Quickstart

```bash
npm install
cp .env.example .env   # optional: add any API key below
npm test               # 21 tests incl. full upload→migrate→download E2E
npm run dev            # backend → http://localhost:3000

cd catalyst-frontend
npm install
npm run dev            # UI → http://localhost:3001
```

Or everything with Docker: `docker compose up --build` (API + Postgres).

## AI providers (universal keys)

| Provider | Key env | Model env | Default model |
|---|---|---|---|
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-opus-4-20250805` |
| OpenAI ChatGPT | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4o` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-2.0-flash` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `anthropic/claude-opus-4-6` |
| OpenCode Zen | `ZEN_API_KEY` | `ZEN_MODEL` | `big-pickle` |
| Custom OpenAI-compatible | `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` | `CUSTOM_MODEL` | `default` |

- `AI_PROVIDER=auto` (default) uses the first configured key; or force one per request.
- `MODEL=` overrides the model for whichever provider resolves.
- **No `.env` editing required:** paste a key into the UI's key field and it
  applies to that run only — kept in browser storage (if you tick remember)
  and server memory, never written to disk or returned by any endpoint.
  A key needs an explicit provider selected (auto + key is rejected as ambiguous).
- Zen note: use a `chat/completions` model (`big-pickle`, `kimi-k3`, `glm-5`…);
  `/responses`-only models (`gpt-*`, `muse-spark-*`) are not supported by this layer.
- `GET /api/providers` shows what's configured (keys never leak).

## API

- `POST /api/migrate` — `repo` files (up to 2000) + `relpath` tree positions +
  `sourceVersion`, `targetVersion`, optional `migrationPath`, `provider`, `model`
  → `{ jobId, status: 'queued' }` (20 req / 15 min per IP).
  Upload modes: one archive (`.zip`/`.rar`/`.tar.gz`), loose code files,
  or a whole folder (structure preserved). 50MB per file, 300MB total.
- `GET /api/providers` — provider availability + defaults
- `GET /api/migration/:id` — job status/progress
- `GET /api/migration/:id/results` — unified diffs, test results, confidence,
  `offline`, `provider`, `model`, `retries`
- `GET /api/migration/:id/download` — migrated code as `.zip`
- `DELETE /api/migration/:id` — cleanup job + files

## Flow

Parse → Index (RAG) → Plan (AI + offline rule pre-pass) → Execute → Validate
(tests) → Fix & retry (AI, max 3x). No key → deterministic offline plan.

RAG: every job chunks the repo (120-line windows) plus curated migration
knowledge (Python 2→3, modern JS, playbook) into a vector index. Planning and
retries retrieve top-K relevant chunks instead of a blind 60KB dump — no more
50-file cap. Embeddings are local hashed-TF-IDF by default ($0, offline);
set `RAG_EMBEDDING=provider` with an OpenAI/OpenRouter/Gemini key for real
vectors. `RAG_ENABLED=0` restores the legacy dump.

Supported paths (41 in the UI): Python 2→3 / 3.x→3.y, ES5→ES2020/24, Node 10–14→18/20,
CJS→ESM (rules + AI); TypeScript, React, Vue, Angular, Rails, Django, Spring,
Laravel, Java, Go, .NET, PHP, Ruby upgrades (AI, correct file scoping offline).

## Deploy

- Backend: `docker build -t catalyst .` / Railway / Fly.io (`PORT` respected)
- Frontend: Vercel (`catalyst-frontend/`, set `NEXT_PUBLIC_API_BASE`)
- DB (optional): `DATABASE_URL` enables Postgres persistence, else in-memory

See `CODE_MIGRATION_TOOL_GUIDE.md` for the full plan and `CONTRIBUTING.md` to help.
