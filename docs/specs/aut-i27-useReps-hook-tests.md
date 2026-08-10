# Task Spec: Unit test coverage for the `useReps.ts` hook set

- **Source:** Aut-I27 (Zoho Sprints — Automation project, Sprint "Second")
- **Type:** chore (additive, test-only) → branch `chore/Aut-I27`
- **Autonomy Tier:** **A** — test addition only, no production/hook implementation
  changes, no config changes. Checked against `tiers.D_triggers` (no API-contract,
  DTO, auth/tenant-isolation, architecture, or build/dependency change) and
  `tiers.E_triggers` (none) — no triggers fire. Classified A, not B, because it adds
  no behavior within the architecture; it only tests existing behavior.

## Change being made

Add a single co-located Vitest + Testing Library test file exercising every exported
query and mutation hook in `src/hooks/useReps.ts`. **No implementation changes to any
hook, API module, or config** — additive test file only.

### File to add
- `src/hooks/useReps.test.tsx` (colocated with `src/hooks/useReps.ts`)

**Filename note (resolves ticket AC #7):** the ticket AC says `useReps.test.ts`, but
`vitest.config.ts` collects only `src/**/*.test.tsx` and the hook tests require JSX
provider wrappers. Per Coordinator decision, use the `.tsx` extension to match the
existing include glob and the Aut-I26 component-test precedent. **Do not modify
`vitest.config.ts`.**

### Hook name mapping (ticket → actual exports)
The ticket lists some names that differ from the real exports. Test the **actual
exports**:

| Ticket name | Actual export in `useReps.ts` |
| --- | --- |
| `useRepDirectory` | `useRepDirectory` |
| `searchReps` | `useSearchReps` |
| `useRepById` | `useRep` |
| `useGroupsServicedByRep` | `useRepGroups` |
| `useCreateRep` | `useCreateRep` |
| `useUpdatePersonalInfo` | `useUpdatePersonalInfo` |
| `useUpdateBusinessInfo` | `useUpdateBusinessInfo` |
| `useUpdateAccessControl` | `useUpdateAccessControl` |
| `useSoftDeleteRep` | `useSoftDeleteRep` |
| `useRestoreRep` | `useRestoreRep` |
| `useLinkRepToGroup` | `useLinkRepToGroup` |

## Implementation notes / constraints

- **Mocking:** mock the `src/api/reps.ts` module (`vi.mock('../api/reps')`) so no HTTP
  is issued. This is the recommended approach (leaves `apiClient` untouched — see "Off
  limits"). The choice between mocking `reps.ts` vs. `apiClient` is the implementer's,
  but the shared `apiClient`/interceptor logic must not be exercised against any real
  endpoint.
- **Wrappers:** hooks depend on both TanStack Query and tenant context. Wrap
  `renderHook` in a `<TenantProvider config={...}>` + `<QueryClientProvider>`. Build a
  fresh `QueryClient` per test with `retry: false` so rejected queries settle into
  error state promptly. `TenantProvider` takes `config: TenantConfig` (see
  `src/context/TenantContext.tsx` / `src/tenant/resolveTenant.ts`); use a fixture
  tenant config with a known `tenantId` value so query-key assertions can check it.
- **Query-key assertions:** verify each query hook's key array literally includes the
  active `tenantId` (keys are `['reps', tenantId, <kind>, ...]`).
- **Invalidation assertions:** spy on `QueryClient.prototype.invalidateQueries` (or the
  instance's method) to assert the expected keys are invalidated `onSuccess`, and that
  invalidation does **not** occur when the mutation rejects.
- Use `waitFor` / `result.current` from `@testing-library/react`'s `renderHook`.
- Follow repo conventions: relative imports, `import type` for types, single quotes,
  2-space indent, semicolons, no `any` (use `unknown` + narrowing), no `eslint-disable`.
- Fixtures/mocked responses only — **never live endpoints or real PII**
  (hard rule `no-live-data`, `no-pii-in-logs`).

## Acceptance criteria (from ticket Aut-I27)

1. Each query hook (`useRepDirectory`, `useSearchReps`, `useRep`, `useRepGroups`)
   returns the mocked resolved data on success.
2. Each query hook's query-key array includes the active `tenantId`.
3. Each mutation hook calls its corresponding `src/api/reps.ts` function with the
   correct arguments.
4. Each mutation hook invalidates the expected query keys on success, and does **not**
   invalidate on failure.
5. Each hook surfaces a rejected API call as the hook's error state rather than throwing
   uncaught.
6. `useRepDirectory` and `useSearchReps` handle the empty-result case without throwing.
7. Tests use fixtures/mocked API responses only; file is colocated with `useReps.ts`
   (named `useReps.test.tsx` per the filename note above).

### Expected invalidation targets (from `useReps.ts`)
- `useCreateRep` → invalidates `['reps', tenantId, 'directory']` and
  `['reps', tenantId, 'search']`.
- `useUpdatePersonalInfo` / `useUpdateBusinessInfo` / `useUpdateAccessControl` /
  `useSoftDeleteRep` / `useRestoreRep` (all via `useInvalidateRep(repId)`) → invalidate
  `['reps', tenantId, 'detail', repId]`, `['reps', tenantId, 'directory']`,
  `['reps', tenantId, 'search']`.
- `useLinkRepToGroup` → invalidates `['reps', tenantId, 'groups', repId]`.

## Out of scope / must not change
- `src/hooks/useReps.ts` implementation (test-only).
- `src/hooks/useAuth.ts`.
- `src/api/reps.ts`, `src/api/client.ts` (interceptor logic **off limits**).
- `vitest.config.ts`, `vitest.setup.ts` (T1 setup already present — do not modify).
- Page/component/integration tests for consuming pages.
- `lambda-authorizer/`, `infra/`.

## Applicable hard rules (`CLAUDE.md`)
- `no-live-data` (blocking, static): no connections to live/production endpoints —
  mocks/fixtures only.
- `no-pii-in-logs` (blocking, verifier): no PII or real account details in fixtures or
  console output.

## Definition of done
- `stack.test_cmd` passes with the new file included and all other tests still green.
- `stack.lint_cmd` and `stack.typecheck` (tsc `--noEmit`) pass.
- All 7 acceptance criteria demonstrably covered by test cases.
