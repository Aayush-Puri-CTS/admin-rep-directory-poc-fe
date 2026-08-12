# 0001. Adopt a global TanStack Query error/retry policy on the shared QueryClient

**Status:** Accepted
**Date:** 2026-08-11
**Tier D trigger matched:** `tiers.D_triggers` → *"cross-cutting architectural changes (new module boundaries, state-management or **data-fetching pattern changes**, new external service integrations)."* Secondary proximity to *"authentication, authorization, or tenant-isolation changes"* via the global 401 → login-redirect wiring (criterion 3).

## Context

Originating ticket: **Zoho Sprints Aut-I32 / FE-05 · "Add a global TanStack Query error/retry policy"** (Automation project, sprint "Second"). No `docs/specs/*` file exists yet — per the Tier D hard stop, none was written, because implementation may not begin before this ADR is approved.

Today's data-fetching error/retry behavior is inconsistent:

- The shared client (`src/main.tsx:13`) sets only `defaultOptions.queries = { retry: 1, staleTime: 10_000 }`. There is **no** mutation default, **no** `retryDelay`, and **no** global `QueryCache`/`MutationCache` `onError`.
- 4xx client errors are retried needlessly (the flat `retry: 1` retries everything once, including 400/401/404).
- 401 handling currently lives **only** in the axios response interceptor (`src/api/client.ts:40-48`), which calls `void getKeycloak().login()` on any 401 and re-rejects. There is no query-layer 401 policy.
- There is no single place where a request that has exhausted retries is surfaced to the user.

The ticket proposes moving to a deliberate, centralized policy applied to **every query and mutation** created from the shared client. Because it changes the app-wide data-fetching pattern and touches authorization-adjacent 401 behavior globally, it is Tier D and requires this ADR before any code.

### Constraints from the ticket (must be honored by the eventual implementation)

- **Client-config-only.** No changes to individual query/mutation hooks; no new UI (toast/banner); no new token-refresh logic.
- **Non-regression.** Existing per-query `retry`/`retryDelay`/`onError` overrides must continue to take precedence — no query's current behavior may silently change.
- **Off limits.** The auth/session-refresh implementation itself; the 401 handler must *wire into existing* session-expiry handling, not build a new one.

## Decision

> This section states the **proposed** decision for architecture-team review. It is not yet approved.

Configure the shared `QueryClient` in `src/main.tsx` (and only there) as follows:

1. **Query retry predicate** — `defaultOptions.queries.retry` becomes a function:
   - return `false` immediately for any HTTP **4xx** response (no retry on client errors, incl. 401/403/404);
   - return `true` (up to **3** attempts) for network/timeout errors and **5xx** responses.
2. **Query retry delay** — `defaultOptions.queries.retryDelay`: exponential backoff, base **1s**, capped at **30s** (`min(30_000, 1000 * 2 ** attemptIndex)`).
3. **Global 401 handling** — add a `QueryCache` `onError` and a `MutationCache` `onError` that detect a 401 and invoke the app's **existing** session-expiry/login-redirect path. (See Open Question A on whether this replaces or coexists with the current axios interceptor — a decision the architecture team must make, because naive addition would double-fire the login redirect.)
4. **Mutation retry default** — `defaultOptions.mutations.retry = 0` (no automatic retry of side-effecting requests). A per-mutation `retry` override must still win.
5. **Single global error sink** — non-401 errors that exhaust retries flow through **one** global error-handler function (referenced by both caches) so the surfacing mechanism can be changed in one place later. Initial behavior: log-only (no UI), pending Open Question C.

`staleTime: 10_000` is retained. No per-query override is touched.

## Alternatives Considered

- **A. Leave defaults as-is (`retry: 1`).** Rejected: retries 4xx pointlessly, no consistent 401 handling, no central error sink — the status quo the ticket exists to fix.
- **B. Put retry/error logic in the axios layer (`client.ts`) instead of the QueryClient.** Partially viable for 401 (already there), but axios cannot express TanStack's per-query retry/backoff semantics or integrate with query cache state; it would also not cover mutations uniformly. Rejected as the primary home; but it forces Open Question A (coexistence vs. consolidation of 401 handling).
- **C. Per-hook configuration.** Rejected: that is the inconsistent status quo and is explicitly out of scope.
- **D. Global handler replaces the axios 401 interceptor entirely.** Candidate resolution to Open Question A — cleaner single-source, but changes the 401 behavior for non-TanStack callers of `apiClient` (if any). Needs architecture sign-off.

## Consequences

- **Easier:** consistent retry/backoff everywhere; 4xx no longer retried; one place to evolve error surfacing; mutations safe-by-default (no auto-retry of POSTs).
- **Harder / risk:** a global `onError` that redirects on 401 can **double-fire** with the existing axios interceptor (both would call `login()`), and could cause redirect loops if not guarded. The consolidation decision (Open Question A) must be settled in this ADR before coding.
- **Testing:** requires unit coverage proving 4xx→no-retry, 5xx→≤3 retries, backoff shape, mutation retry=0, per-query override precedence, and 401→single redirect. FE-01 (`chore/Aut-I28`, widened Vitest discovery) is a prerequisite for `.test.ts` coverage of this pure-logic policy.
- **Hard rules (`CLAUDE.md`):** `no-pii-in-logs` — the global error sink must **not** log PII/tokens/response bodies containing account details (audit: verifier, blocking). `any` ban — the retry predicate/error handler must narrow `unknown` (use `axios.isAxiosError`), no `any`.
- **Follow-up:** Open Question B (audit/normalize existing per-query overrides) is deliberately deferred and should become its own ticket if the team wants it.

## Open Questions — proposed resolutions (recommended by Coordinator; still require human sign-off)

These are the architectural decisions that make FE-05 Tier D. The Coordinator's recommended answers are recorded below to make the ADR implementation-ready, but they remain **proposals pending the designated approver** — filling them in does not constitute approval.

- **A. 401 handling home → RESOLVE BY: single guarded authority.**
  Introduce a module-level `redirectToLogin()` helper with a **single-flight guard** (a boolean latch so concurrent 401s trigger exactly one `getKeycloak().login()`). The global `QueryCache`/`MutationCache` `onError` calls it on 401 (satisfying criterion 3). The existing axios 401 interceptor (`src/api/client.ts:40`) is updated to delegate to the **same** guarded helper instead of calling `login()` directly — so both paths are idempotent and cannot double-redirect, and non-TanStack `apiClient` callers stay covered. *(Note: this touches `client.ts`, which is slightly beyond "client-config-only"; it is the minimal change needed to satisfy criterion 3 without a redirect-loop regression. Called out for approver awareness.)*
- **B. Existing per-query overrides → RESOLVE BY: leave alone now.**
  Honor non-regression (criterion 6). Do not audit/normalize in this ticket. Spin off a separate follow-up ticket if the team wants normalization later.
- **C. Error surfacing → RESOLVE BY: single silent log sink now.**
  Non-401 exhausted-retry errors flow through one global handler that logs a **PII-free** summary (message + status only; never tokens/response bodies/account details — see `no-pii-in-logs`). No toast/banner is built (out of scope). Because it is a single sink, UX surfacing can be swapped in one place later.
- **D. Retry/backoff values → RESOLVE BY: adopt the proposed defaults as named constants.**
  3 attempts / 1s base / 30s cap, defined as named constants (e.g. `QUERY_MAX_RETRIES`, `RETRY_BASE_MS`, `RETRY_CAP_MS`) so they can be tuned in one place once real SLAs are known. Not blocking.

## Approval

Implementation is **blocked** until a human approver records acceptance here.

- **Required approver(s):** Sanjay Khadka (team lead) and the architecture team — per `CLAUDE.md` → Escalation Contacts (Tier D).
- **Approval record:** **Approved 2026-08-11 by Aayush Puri (aayushpuri@cloudtechservice.com)**, who confirmed they hold the team-lead / architecture-team authority for this decision. Open Questions A–D accepted **as proposed** (single guarded 401 authority; leave existing overrides; single silent PII-free log sink; named-constant retry/backoff defaults). Implementation authorized against this decision.

_Drafted by the Coordinator agent as permitted by `ADR/0000-template.md`. An agent may draft this ADR but may not implement against it until it is approved above._
