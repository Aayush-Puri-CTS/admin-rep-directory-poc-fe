import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJwt } from './helpers.js';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('jose');
  vi.resetModules();
});

describe('peekIssuer', () => {
  it('reads iss without verifying the signature', async () => {
    const { peekIssuer } = await import('../src/verifyToken.js');
    const token = fakeJwt({ iss: 'https://qa-sso.corenroll.com/realms/corenroll' });
    expect(peekIssuer(token)).toBe('https://qa-sso.corenroll.com/realms/corenroll');
  });

  it('denies a malformed token', async () => {
    const { peekIssuer, AuthDenied } = await import('../src/verifyToken.js');
    expect(() => peekIssuer('not-a-jwt')).toThrow(AuthDenied);
  });

  it('denies a token with no iss claim', async () => {
    const { peekIssuer, AuthDenied } = await import('../src/verifyToken.js');
    const token = fakeJwt({ sub: 'user-1' });
    expect(() => peekIssuer(token)).toThrow(AuthDenied);
  });
});

describe('verifyAgainstTenant', () => {
  const tenant = {
    tenantId: 'corenroll',
    brand: 'CoreEnroll',
    issuer: 'https://qa-sso.corenroll.com/realms/corenroll',
    keycloak: { url: 'https://qa-sso.corenroll.com', realm: 'corenroll', clientId: 'admin-dashboard' },
  };

  it('returns sub/persona/partyId from a payload jose reports as valid', async () => {
    vi.doMock('jose', () => ({
      createRemoteJWKSet: vi.fn(),
      jwtVerify: vi.fn().mockResolvedValue({
        payload: { sub: 'user-1', persona: 'admin', party_id: 'party-1' },
      }),
    }));

    const { verifyAgainstTenant } = await import('../src/verifyToken.js');
    const identity = await verifyAgainstTenant('irrelevant-token', tenant);

    expect(identity).toEqual({ sub: 'user-1', persona: 'admin', partyId: 'party-1' });
  });

  it('denies when jose rejects verification (bad signature, expired, wrong aud, ...)', async () => {
    vi.doMock('jose', () => ({
      createRemoteJWKSet: vi.fn(),
      jwtVerify: vi.fn().mockRejectedValue(new Error('signature verification failed')),
    }));

    const { verifyAgainstTenant, AuthDenied } = await import('../src/verifyToken.js');
    await expect(verifyAgainstTenant('irrelevant-token', tenant)).rejects.toThrow(AuthDenied);
  });

  it('denies when the verified payload has no sub claim', async () => {
    vi.doMock('jose', () => ({
      createRemoteJWKSet: vi.fn(),
      jwtVerify: vi.fn().mockResolvedValue({ payload: {} }),
    }));

    const { verifyAgainstTenant, AuthDenied } = await import('../src/verifyToken.js');
    await expect(verifyAgainstTenant('irrelevant-token', tenant)).rejects.toThrow(AuthDenied);
  });
});
