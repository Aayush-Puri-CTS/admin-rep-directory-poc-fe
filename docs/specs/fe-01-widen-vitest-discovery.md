# Task Spec: FE-01 · Widen Vitest discovery to `*.test.{ts,tsx}`

- **Source:** Zoho Sprints Aut-I28 (workspace 776405438, project Automation, sprint "Second")
- **Branch:** `chore/Aut-I28`
- **Autonomy tier:** **A** — test-tooling config change, no runtime source touched. Does not match any Tier D trigger (not a build/dependency-graph change affecting *runtime* architecture — this only affects the test runner's file globbing) or Tier E trigger.

## Change being made

`vitest.config.ts:8` currently sets `include: ['src/**/*.test.tsx']`. This means pure-logic `*.test.ts` files (e.g. for `extractErrorMessage`, `resolveTenant`, `getTenantId`, `keycloak`) are silently never collected — a false-green. Widen the glob so both `.ts` and `.tsx` test files are discovered.

## Scope

- Edit `vitest.config.ts` only.
- Change `include` to `['src/**/*.test.{ts,tsx}']`.
- **No source/application changes.** Do not add or modify any `src/**` runtime file.

## Acceptance criteria

1. A trivial `*.test.ts` file placed under `src/` is discovered and executed by `stack.test_cmd` (`pnpm test` / `vitest run`).
2. The full existing test suite stays green.
3. `pnpm exec tsc --noEmit` passes.

To demonstrate criterion 1 you may add a tiny throwaway `.test.ts` to confirm discovery, but **it must not remain** in the final change — the only file this task leaves modified is `vitest.config.ts`.

## Applicable hard rules (from CLAUDE.md)

- `no-live-data` (blocking): tests use mocks/fixtures only — not relevant here since no test logic is added, but do not introduce any live endpoint.
- `no-pii-in-logs` (blocking): n/a for this change.

## Notes

- This unblocks downstream FE-05..FE-08 (not in this sprint's To Do set).
