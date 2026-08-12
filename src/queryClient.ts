import axios from 'axios';
import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { redirectToLogin } from './keycloak';

// ADR-0001 (docs/specs/fe-05-global-query-error-retry-policy.md) — global TanStack Query
// error/retry policy for the shared client. Named constants so retry/backoff can be tuned in
// one place once real SLAs are known (ADR Open Question D).
export const QUERY_MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 1000;
export const RETRY_CAP_MS = 30_000;

// Query retry predicate (ADR Decision 1): never retry a 4xx (client error, incl. 401/403/404);
// retry network/timeout errors and 5xx up to QUERY_MAX_ATTEMPTS total attempts.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status !== undefined && status >= 400 && status < 500) {
      return false;
    }
  }
  return failureCount < QUERY_MAX_ATTEMPTS;
}

// Query retry delay (ADR Decision 2): exponential backoff, 1s base, capped at 30s.
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attemptIndex);
}

// Single global error sink (ADR Decision 5) — logs a PII-free summary only. Never log response
// bodies, tokens, headers, request payloads, or account/PII fields (CLAUDE.md no-pii-in-logs).
export function logQueryError(error: unknown): void {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error('[query] request failed', { status, message });
}

// Global QueryCache/MutationCache onError (ADR Decision 3 + 5): 401 delegates to the guarded
// login-redirect helper; everything else goes through the PII-free log sink.
export function handleQueryError(error: unknown): void {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) {
    redirectToLogin();
    return;
  }
  logQueryError(error);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  mutationCache: new MutationCache({ onError: handleQueryError }),
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      staleTime: 10_000, // preserved from prior config
    },
    mutations: {
      retry: 0, // ADR Decision 4 — no auto-retry of side-effecting requests
    },
  },
});
