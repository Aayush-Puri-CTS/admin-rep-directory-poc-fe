import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetManifestCacheForTests, getIssuerIndex } from '../src/manifest.js';

const MANIFEST = {
  '//': 'a comment key, must be skipped, not mistaken for a tenant entry',
  'corenroll.admin.example': {
    tenantId: 'corenroll',
    brand: 'CoreEnroll',
    issuer: 'https://qa-sso.corenroll.com/realms/corenroll',
    keycloak: { url: 'https://qa-sso.corenroll.com', realm: 'corenroll', clientId: 'admin-dashboard' },
  },
  'iha.admin.example': {
    tenantId: 'iha',
    brand: 'IHA',
    issuer: 'https://qa-sso.corenroll.com/realms/iha',
    keycloak: { url: 'https://qa-sso.corenroll.com', realm: 'iha', clientId: 'admin-dashboard' },
  },
  'incomplete.example': {
    tenantId: 'incomplete',
    // missing issuer/keycloak on purpose — must be skipped, not crash the index build
  },
};

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  process.env.TENANT_MANIFEST_URL = 'https://manifest.example/tenant-registry.json';
  __resetManifestCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getIssuerIndex', () => {
  it('builds an issuer -> entry index, skipping non-entry and incomplete keys', async () => {
    mockFetchOnce(MANIFEST);

    const index = await getIssuerIndex();

    expect(index.size).toBe(2);
    expect(index.get('https://qa-sso.corenroll.com/realms/corenroll')?.tenantId).toBe('corenroll');
    expect(index.get('https://qa-sso.corenroll.com/realms/iha')?.tenantId).toBe('iha');
  });

  it('caches the index and does not re-fetch within the TTL', async () => {
    process.env.TENANT_MANIFEST_CACHE_TTL_SECONDS = '300';
    mockFetchOnce(MANIFEST);

    await getIssuerIndex();
    await getIssuerIndex();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the configured TTL has elapsed', async () => {
    vi.useFakeTimers();
    process.env.TENANT_MANIFEST_CACHE_TTL_SECONDS = '1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    });
    vi.stubGlobal('fetch', fetchMock);

    await getIssuerIndex();
    vi.advanceTimersByTime(1_100);
    await getIssuerIndex();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws if the manifest fetch fails', async () => {
    mockFetchOnce({}, false);
    await expect(getIssuerIndex()).rejects.toThrow(/HTTP 500/);
  });

  it('throws if TENANT_MANIFEST_URL is not configured', async () => {
    delete process.env.TENANT_MANIFEST_URL;
    await expect(getIssuerIndex()).rejects.toThrow(/TENANT_MANIFEST_URL/);
  });
});
