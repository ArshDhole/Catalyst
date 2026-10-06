# Contributing to Catalyst

Thanks for helping modernize legacy code! 🎉

## Quick start

```bash
cp .env.example .env   # no key needed — offline rules work out of the box
npm install
npm test               # 21 tests incl. full API E2E
npm run dev            # backend on :3000
cd catalyst-frontend && npm install && npm run dev  # UI on :3001
```

## Adding a migration path

1. Add rules to `src/parsers/migrationRules.js` + `rulesForPath()` + `fileMatchesPath()`
2. Register the path id in `MIGRATION_PATHS`
3. Add cases to `tests/rules.test.js` and `tests/offline.test.js`
4. Run `npm test`

## Adding an AI provider

Implement in `src/core/providers.js` (fetch-only, no SDKs):
- registry entry in `PROVIDERS` (key envs, model envs, default model, protocol)
- reuse `openai-chat` protocol for any OpenAI-compatible endpoint
- cover with stubbed-fetch tests in `tests/providers.test.js`
- never log or return API keys (`GET /api/providers` must stay key-free)

## PR checklist

- [ ] `npm test` green
- [ ] `npx tsc --noEmit` green in `catalyst-frontend/`
- [ ] No secrets in diffs, logs, or responses
- [ ] README updated if you changed env vars or endpoints
