import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import {
  QUERY_MAX_ATTEMPTS,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  handleQueryError,
  queryClient,
  queryRetryDelay,
  shouldRetryQuery,
} from './queryClient';
import { redirectToLogin } from './keycloak';

// Mock the Keycloak-backed login-redirect helper rather than exercising real Keycloak — see
// docs/specs/fe-05-global-query-error-retry-policy.md (no-live-data).
vi.mock('./keycloak', () => ({
  redirectToLogin: vi.fn(),
}));

// Fixture-only axios-style errors — no live endpoints, no real PII. Response bodies here are
// deliberately populated with fields (message, token, account details) that must NEVER show up
// in the logged payload, to prove logQueryError strips them.
function makeAxiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('Request failed');
  if (status !== undefined) {
    error.response = {
      status,
      statusText: 'Error',
      headers: { authorization: 'Bearer fixture-token-should-never-be-logged' },
      config: {} as InternalAxiosRequestConfig,
      data: {
        message: 'fixture response body should never be logged',
        token: 'fixture-secret-token',
        accountEmail: 'fixture-user@example.test',
      },
    };
  }
  return error;
}

function makeNetworkError(): AxiosError {
  // No `response` at all — simulates a network/timeout failure.
  return new AxiosError('Network Error');
}

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404])('returns false at failureCount 0 for a %d response', (status) => {
    expect(shouldRetryQuery(0, makeAxiosError(status))).toBe(false);
  });

  it.each([500, 502, 503])(
    'returns true for a %d response while failureCount < QUERY_MAX_ATTEMPTS',
    (status) => {
      expect(shouldRetryQuery(0, makeAxiosError(status))).toBe(true);
      expect(shouldRetryQuery(1, makeAxiosError(status))).toBe(true);
      expect(shouldRetryQuery(2, makeAxiosError(status))).toBe(true);
    },
  );

  it.each([500, 502, 503])('returns false at failureCount === QUERY_MAX_ATTEMPTS for a %d response', (status) => {
    expect(shouldRetryQuery(QUERY_MAX_ATTEMPTS, makeAxiosError(status))).toBe(false);
  });

  it('returns true for a network/timeout error (no response) while failureCount < QUERY_MAX_ATTEMPTS', () => {
    expect(shouldRetryQuery(0, makeNetworkError())).toBe(true);
    expect(shouldRetryQuery(1, makeNetworkError())).toBe(true);
    expect(shouldRetryQuery(2, makeNetworkError())).toBe(true);
  });

  it('returns false at failureCount === QUERY_MAX_ATTEMPTS for a network/timeout error', () => {
    expect(shouldRetryQuery(QUERY_MAX_ATTEMPTS, makeNetworkError())).toBe(false);
  });

  it('caps retries at exactly 3 total attempts', () => {
    expect(QUERY_MAX_ATTEMPTS).toBe(3);
  });
});

describe('queryRetryDelay', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [3, 8000],
    [4, 16000],
    [5, 30000],
    [10, 30000],
  ])('returns %d ms delay -> %d for attemptIndex', (attemptIndex, expected) => {
    expect(queryRetryDelay(attemptIndex)).toBe(expected);
  });

  it('never exceeds RETRY_CAP_MS regardless of base', () => {
    expect(RETRY_BASE_MS).toBe(1000);
    expect(RETRY_CAP_MS).toBe(30_000);
    expect(queryRetryDelay(20)).toBe(RETRY_CAP_MS);
  });
});

describe('handleQueryError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(redirectToLogin).mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('routes a 401 to redirectToLogin and does not log', () => {
    handleQueryError(makeAxiosError(401));

    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('logs a 500 and does not redirect', () => {
    handleQueryError(makeAxiosError(500));

    expect(redirectToLogin).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs only status + message — never response bodies, tokens, headers, or PII', () => {
    handleQueryError(makeAxiosError(500));

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0];
    expect(typeof prefix).toBe('string');
    expect(payload).toEqual({ status: 500, message: 'Request failed' });

    const serialized = JSON.stringify(consoleErrorSpy.mock.calls[0]);
    expect(serialized).not.toContain('fixture-secret-token');
    expect(serialized).not.toContain('fixture-user@example.test');
    expect(serialized).not.toContain('fixture response body should never be logged');
    expect(serialized).not.toContain('authorization');
  });

  it('logs a network/timeout error (no response) without redirecting', () => {
    handleQueryError(makeNetworkError());

    expect(redirectToLogin).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = consoleErrorSpy.mock.calls[0];
    expect(payload).toEqual({ status: undefined, message: 'Network Error' });
  });
});

describe('queryClient defaults', () => {
  it('sets mutation default retry to 0 (no auto-retry of side-effecting requests)', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });

  it('preserves the query staleTime and wires the retry predicate/delay', () => {
    const queries = queryClient.getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(10_000);
    expect(queries?.retry).toBe(shouldRetryQuery);
    expect(queries?.retryDelay).toBe(queryRetryDelay);
  });
});
