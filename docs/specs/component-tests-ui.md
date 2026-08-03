# Component Tests for Frontend UI Components

**Source:** Zoho Sprints item Aut-I26 (project "Automation", sprint "Second")
**Autonomy tier:** A — test-only addition to `src/`; no public API contract change, no database/schema modification, no production secrets or deployment key touched. Doesn't match any `tiers.D_triggers` or `tiers.E_triggers` in `project.config.yml`.
**Hard rules in scope:** none beyond the repo-wide defaults (`no-live-data`, `no-pii-in-logs` — tests must not hit live endpoints and must not log/assert on real PII; use fixture data only).

## Change

Add a test setup to the main app (`src/` currently has none — see CLAUDE.md
"Tests" section) and write component tests for the existing reusable UI
components under `src/components/`:

- `src/components/AuthButtons.tsx`
- `src/components/Layout.tsx`
- `src/components/Pagination.tsx`
- `src/components/PrivateRoute.tsx`
- `src/components/StatusBadge.tsx`
- `src/components/TenantBadge.tsx`

Test setup: add Vitest + `@testing-library/react` + `@testing-library/jest-dom`
+ `jsdom` as devDependencies, a `vitest.config.ts` (jsdom environment), and a
`test` script in `package.json`. Follow the `lambda-authorizer/` precedent
(`lambda-authorizer/vitest.config.ts`) for config shape, adapted to a
React/jsdom environment instead of `node`.

## Acceptance Criteria

(Transcribed from the Zoho Sprints item description/scope/acceptance
criteria fields.)

- Component tests are added for all targeted components.
- Tests cover key rendering paths, user interactions, and edge cases:
  - Verify correct rendering for different props and states.
  - Test user interactions (e.g., clicks, input changes, selections).
  - Validate conditional rendering and error/empty/loading states where
    applicable.
  - Mock external dependencies, API calls, and context/providers as needed.
  - Ensure accessibility-related behaviors where applicable (keyboard
    interactions, ARIA attributes).
- All tests pass in the local and CI environments.
- No existing functionality is broken by the introduction of the tests.
- Test code adheres to the project's coding and testing standards.

## Scope Notes

- Mirrored-filename pattern per CLAUDE.md: one `*.test.tsx` per component,
  co-located under `src/components/` (e.g. `StatusBadge.test.tsx` next to
  `StatusBadge.tsx`) — same convention `lambda-authorizer/test/*.test.ts`
  follows, adapted to this repo's `src/` layout since main-app tests have
  no existing directory convention to match otherwise.
- `PrivateRoute.tsx` and `AuthButtons.tsx` depend on `@react-keycloak/web`
  auth context — mock the Keycloak hook/context rather than exercising
  real Keycloak; do not point tests at any live Keycloak/tenant endpoint
  (`no-live-data`).
- `TenantBadge.tsx` likely reads from tenant context (`src/context/`) —
  wrap with a test provider/mock rather than the real tenant-resolution
  flow.
- `Layout.tsx` likely composes `react-router-dom` — wrap tests in a
  `MemoryRouter` (or equivalent) rather than a real router.
- No new eslint config or Prettier introduction — match existing style by
  eye per CLAUDE.md.
- `any` is banned repo-wide — type mocks with `unknown` + narrowing, same
  as production code.
- Out of scope: adding tests for `src/pages/`, `src/hooks/`, or `src/api/`
  — this task is `src/components/` only, per the ticket's explicit scope.
- `package.json` and `pnpm-lock.yaml` changes are expected (new
  devDependencies) — these are in `permissions.ask_write_paths` /
  require approval, not a blocked path.
