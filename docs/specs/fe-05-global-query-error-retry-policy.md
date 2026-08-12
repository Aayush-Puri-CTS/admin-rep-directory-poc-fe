# Task Spec: FE-05 · Global TanStack Query error/retry policy

- **Source:** Zoho Sprints Aut-I32 (workspace 776405438, project Automation, sprint "Second")
- **Branch:** `feat/Aut-I32`
- **Autonomy tier:** **D** — cross-cutting data-fetching pattern change. **Gated by ADR-0001** (`ADR/0001-global-tanstack-query-error-retry-policy.md`, Status: **Accepted** 2026-08-11). Implementation is authorized **only** because that ADR is approved; do not exceed its Decision.
- **Governing decision:** implement exactly ADR-0001's Decision + resolved Open Questions A–D. If you find yourself needing to deviate, STOP and report back — do not improvise beyond the ADR.

## Current state (do not misread)

- `src/main.tsx:13` constructs the shared `QueryClient` inline with only `{ queries: { retry: 1, staleTime: 10_000 } }`. No mutation defaults, no `retryDelay`, no cache-level `onError`.
- 401 handling today lives in `src/api/client.ts`: the response interceptor (line ~44) calls `void getKeycloak().login()` on any 401; the request interceptor (line ~25) calls `login()` when `updateToken` fails. `src/keycloak.ts` `onTokenExpired` also falls back to `instance!.login()`.
- `getKeycloak()` / `initKeycloak()` singleton lives in `src/keycloak.ts`.

## Changes to make

### 1. New module `src/queryClient.ts` (app-level infra, sibling to `keycloak.ts`)
Export named constants and **pure, unit-testable** helpers, plus the configured client:

- Constants: `QUERY_MAX_ATTEMPTS = 3`, `RETRY_BASE_MS = 1000`, `RETRY_CAP_MS = 30_000`.
- `export function shouldRetryQuery(failureCount: number, error: unknown): boolean`
  - Narrow with `axios.isAxiosError(error)`; read `error.response?.status`.
  - **Any 4xx (400–499, incl. 401/403/404) → return `false`** (no retry).
  - Network/timeout errors (no `response`) and **5xx** → return `failureCount < QUERY_MAX_ATTEMPTS` (so **at most 3 total attempts**).
- `export function queryRetryDelay(attemptIndex: number): number`
  - `Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attemptIndex)` — exponential backoff, 1s base, 30s cap. (`attemptIndex` is 0-based, so 1s, 2s, 4s, … ≤ 30s.)
- `export function handleQueryError(error: unknown): void` — the **single global sink** (ADR Decision 5 / criterion 5):
  - If status is **401** → call `redirectToLogin()` (from `keycloak.ts`) and return. (criterion 3)
  - Otherwise → `logQueryError(error)` (PII-free — see hard rules). Do NOT build any UI.
- `logQueryError(error)` — log **only** `{ status, message }` where `message` is `error instanceof Error ? error.message : 'unknown error'`. **Never** log response bodies, tokens, headers, request URLs with query params, or any account/PII field. Use `console.error` with a static prefix like `'[query] request failed'`.
- Construct and export the client:
  ```ts
  export const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleQueryError }),
    mutationCache: new MutationCache({ onError: handleQueryError }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        staleTime: 10_000, // preserved from current config
      },
      mutations: {
        retry: 0, // ADR Decision 4 / criterion 4 — no auto-retry of side-effecting requests
      },
    },
  });
  ```
  `QueryCache`/`MutationCache` `onError` are **additive** — they fire in addition to any per-query/per-mutation `onError`, so existing overrides keep working (criterion 6). Do not remove `staleTime`.

### 2. `src/keycloak.ts` — single-flight login guard (ADR Decision A)
- Add `export function redirectToLogin(): void` with a module-level single-flight latch:
  ```ts
  let loginRedirectInFlight = false;
  export function redirectToLogin(): void {
    if (loginRedirectInFlight) return;
    loginRedirectInFlight = true;
    void getKeycloak().login();
  }
  ```
- Route the existing `onTokenExpired` fallback through it: `instance!.updateToken(60).catch(() => redirectToLogin());` (keep the `updateToken(60)` behavior identical; only the fallback call changes).

### 3. `src/api/client.ts` — delegate 401/session-expiry to the guarded helper (ADR Decision A)
- Import `redirectToLogin` from `../keycloak`.
- Response interceptor: replace `void getKeycloak().login();` with `redirectToLogin();`.
- Request interceptor `catch`: replace `void keycloak.login();` with `redirectToLogin();`.
- No other behavior change; still `return Promise.reject(...)` exactly as before. This eliminates the double-redirect risk the ADR flagged (all login triggers now go through one idempotent path).

### 4. `src/main.tsx` — use the extracted client
- Remove the inline `new QueryClient({...})` (lines ~13–19) and `import { queryClient } from './queryClient';` instead. Keep `QueryClientProvider client={queryClient}` and everything else (Keycloak provider, tenant, devtools) unchanged.

### 5. Tests — `src/queryClient.test.tsx`
> **Naming note:** use the `.test.tsx` extension (NOT `.test.ts`). FE-01's Vitest-discovery widening is on an unmerged branch; `main`'s `vitest.config.ts` still only collects `src/**/*.test.tsx`, so a `.test.ts` file would silently not run here.

Cover, with mocked axios-style errors (no live endpoints, no real PII):
- `shouldRetryQuery`: 400/401/403/404 → `false` at `failureCount` 0; 500/502/503 and network errors (no `response`) → `true` while `failureCount < 3`, `false` at `failureCount === 3` (assert the ≤3-attempts cap).
- `queryRetryDelay`: `0→1000`, `1→2000`, `2→4000`, `3→8000`, `4→16000`, `5→30000` (cap), `10→30000` (cap holds).
- `handleQueryError`: a 401 error calls `redirectToLogin` (mock the `keycloak` module) and does NOT log; a 500 error calls the logger and does NOT redirect; assert the logged payload contains **no** response body / token / PII, only status + message.
- (Optional) mutation default retry = 0 via reading `queryClient.getDefaultOptions().mutations?.retry`.

## Acceptance criteria (map 1:1 to the ticket)

1. Query retry returns `true` for network/timeout + 5xx up to 3 attempts, `false` immediately for any 4xx. ✔ via `shouldRetryQuery` + tests.
2. Exponential backoff, 1s base, 30s cap. ✔ via `queryRetryDelay` + tests.
3. 401 never retried; routes to existing login redirect via the global cache `onError`. ✔ (`shouldRetryQuery` returns false for 401; `handleQueryError` calls `redirectToLogin`).
4. Mutation default retry = 0; per-mutation override still wins. ✔ (`defaultOptions.mutations.retry = 0`; TanStack per-mutation options override defaults).
5. Non-401 exhausted-retry errors pass through a single global handler. ✔ (`handleQueryError` via both caches).
6. Existing per-query `retry`/`retryDelay`/`onError` overrides unchanged. ✔ (defaults are overridden per-query; cache `onError` is additive).

## Hard rules (CLAUDE.md — BLOCKING)

- **`no-pii-in-logs`** (verifier-audited, blocking): the new `logQueryError` sink is the sensitive point. It MUST log only HTTP status + a generic error message. NO response bodies, tokens, auth headers, request payloads, emails, names, or account identifiers. This is the single most important review item.
- **`any` ban**: use `unknown` + `axios.isAxiosError` narrowing throughout. No `any`, no `eslint-disable`.
- **`no-live-data`**: tests use mocked errors/fixtures only.

## Verification the Implementor must run

- `pnpm test` — full suite green incl. the new tests (report counts).
- `pnpm lint` — 0 errors.
- `pnpm exec tsc --noEmit -p tsconfig.app.json` — clean (bare `tsc --noEmit` no-ops on the solution-style root tsconfig).
- Confirm the new test file is actually discovered/executed (it must appear in the Vitest run output).

## Constraints

- Do NOT commit, push, or mutate git state — Coordinator's job.
- Stay within ADR-0001's Decision. Files expected to change: NEW `src/queryClient.ts`, NEW `src/queryClient.test.tsx`, MODIFIED `src/main.tsx`, `src/keycloak.ts`, `src/api/client.ts`. If anything else needs to change, report before doing it.
