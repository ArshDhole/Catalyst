# Migration playbook (applies to every path)

## Rules of a safe migration
1. Preserve behavior first, modernize idioms second. Never do both in one edit unless trivial.
2. Keep edits minimal and local: one concern per change so diffs stay reviewable.
3. Prefer mechanical transforms with exact old→new snippets over prose descriptions.
4. Never invent APIs: if the target equivalent is uncertain, say so and keep the old code untouched.

## How to emit a change
- `old` must be an exact substring of the file as provided — copy it verbatim.
- `new` must be complete replacement code, not a sketch or a diff.
- `confidence` below 0.7 means "needs human review" — still emit it, flagged honestly.

## Risk triage
- Changed public API signatures, serialization formats, and database queries are high severity.
- Syntax-only transforms (print functions, var→const, import moves) are low severity.
- Anything touching money, auth, or migrations needs a human reviewer regardless of confidence.

## Test strategy template
- Run the repo's own suite first (pytest / jest / mocha / mvn / rspec / go test).
- If no suite exists, at least byte-compile or typecheck every changed file.
- Grep for leftover source-version patterns after applying changes.
