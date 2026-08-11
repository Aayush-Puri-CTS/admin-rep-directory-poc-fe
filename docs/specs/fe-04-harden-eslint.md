# Task Spec: FE-04 · Harden ESLint to enforce stated conventions

- **Source:** Zoho Sprints Aut-I31 (workspace 776405438, project Automation, sprint "Second")
- **Branch:** `chore/Aut-I31`
- **Autonomy tier:** **A** — ESLint rule tightening within the existing `.eslintrc.cjs` (no new dependency, no ESLint-major upgrade) plus behavior-neutral lint-compliance fixes to existing source. No Tier D/E trigger: no new runtime dependency, no runtime-architecture change, no auth/tenant-isolation logic change (the promise fixes are behavior-preserving `void` additions).
  - **Dependency-graph note (per ticket):** the sub-goal "forbid `eslint-disable` of the any rule" would require adding the `eslint-comments` ESLint plugin (a dev dependency). To avoid an unrequested dependency-graph change, that sub-goal is **deferred** to the ESLint-9 flat-config follow-up the ticket anticipates; it is already covered in intent by CLAUDE.md's `any` ban ("No `eslint-disable` to dodge it") and the Verifier's rule audit. This keeps FE-04 dependency-free and unambiguously Tier A.

## Change being made

`.eslintrc.cjs` (ESLint 8, eslintrc format) currently only warns via `recommended` and has no type-aware rules. Harden it to enforce two CLAUDE.md conventions:
1. Ban explicit `any` — `@typescript-eslint/no-explicit-any` set to **error** (currently `warn` via `recommended`).
2. Ban floating promises — `@typescript-eslint/no-floating-promises` set to **error** (requires type-aware linting).

Because `no-floating-promises` needs type information, add `parserOptions.project` **scoped to `src/**/*.{ts,tsx}` via an `overrides` block** — do NOT set `project` at the top level, or ESLint will try to type-check out-of-project files (`vitest.config.ts`, `scripts/*.mjs`, etc.) and fail.

Enabling the rule will surface **pre-existing floating promises** that must be fixed behavior-neutrally so `pnpm lint` stays green.

## Scope

### `.eslintrc.cjs`
- Add to `rules` (global): `'@typescript-eslint/no-explicit-any': 'error'`.
- Add an `overrides` entry:
  ```js
  overrides: [
    {
      files: ['src/**/*.{ts,tsx}'],
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: __dirname,
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
      },
    },
  ],
  ```
  (`tsconfig.app.json` has `include: ["src"]`, so all of `src` incl. tests is covered.)
- Do not remove existing rules/extends. Keep `react-refresh/only-export-components` as-is (its 3 pre-existing warnings in `TenantContext.tsx` are fine — warnings don't fail lint).

### Behavior-neutral floating-promise fixes (required for lint to pass)
Fix every site `no-floating-promises` flags. Known sites (confirm the full set by running lint):
- `src/api/client.ts:25` — `keycloak.login();`
- `src/api/client.ts:44` — `getKeycloak().login();`
- `src/keycloak.ts:25` — `instance!.updateToken(60).catch(() => instance!.login());`
- `src/hooks/useReps.ts` — six `queryClient.invalidateQueries({...})` calls (lines ~59,60,69,70,71,121)

**Fix method:** prefix the floating call with the `void` operator (e.g. `void keycloak.login();`). This is strictly behavior-preserving — it does not await, does not change control flow, does not alter mutation/onSuccess timing. **Do NOT** convert to `await`/`return` (that would change behavior), and **do NOT** change any auth or data-fetching logic. If a site is genuinely cleaner with a `.catch`/handler, keep the observable behavior identical and note it.

### Out of scope (do not do)
- No new npm dependencies (no `eslint-comments`, no ESLint 9 upgrade).
- No `package.json` change.
- No changes to `no-explicit-any`-triggering code (there is none today).

## Acceptance criteria

1. `@typescript-eslint/no-explicit-any` is `error`: introducing an explicit `any` fails `pnpm lint`. Prove with a temporary probe (add `const x: any = 1;` in a src file → lint errors), then remove it.
2. `@typescript-eslint/no-floating-promises` is `error`: an unhandled promise fails `pnpm lint`. Prove with a temporary probe (a floating `Promise.resolve()` statement in a src file → lint errors), then remove it.
3. `pnpm lint` (`eslint .`) exits 0 on the final tree (0 errors; pre-existing react-refresh warnings allowed).
4. `pnpm test` stays green; `pnpm exec tsc --noEmit -p tsconfig.app.json` passes (note: bare `tsc --noEmit` no-ops against the solution-style root tsconfig — use `-p tsconfig.app.json` for real signal).
5. All floating-promise fixes are behavior-neutral (`void` additions only); no auth/data-fetching logic changed.

## Applicable hard rules (from CLAUDE.md)

- `any` ban / no `eslint-disable` to dodge it: this change *enforces* the former in tooling. Do not add any `eslint-disable` comment anywhere in this change.
- `no-live-data`, `no-pii-in-logs`: n/a (config + `void` additions; confirm no PII logging introduced).

## Constraints

- Do NOT commit, push, or mutate git state.
- Touch only `.eslintrc.cjs` and the source files needing behavior-neutral floating-promise fixes. List every file you touched.
