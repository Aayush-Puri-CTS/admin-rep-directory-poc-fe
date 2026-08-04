import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';

function eventWithAuthHeader(authorization?: string): APIGatewayRequestAuthorizerEventV2 {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as APIGatewayRequestAuthorizerEventV2;
}

const TENANT = {
  tenantId: 'corenroll',
  brand: 'CoreEnroll',
  issuer: 'https://qa-sso.corenroll.com/realms/corenroll',
  keycloak: { url: 'https://qa-sso.corenroll.com', realm: 'corenroll', clientId: 'admin-dashboard' },
};

afterEach(() => {
  vi.doUnmock('../src/manifest.js');
  vi.doUnmock('../src/verifyToken.js');
  vi.resetModules();
});

describe('authorizer handler', () => {
  it('denies when there is no Authorization header', async () => {
    const { handler } = await import('../src/index.js');
    const result = await handler(eventWithAuthHeader());
    expect(result.isAuthorized).toBe(false);
  });

  it('denies a non-Bearer Authorization header', async () => {
    const { handler } = await import('../src/index.js');
    const result = await handler(eventWithAuthHeader('Basic dXNlcjpwYXNz'));
    expect(result.isAuthorized).toBe(false);
  });

  it('denies an unknown issuer before ever verifying the signature', async () => {
    vi.doMock('../src/manifest.js', () => ({
      getIssuerIndex: vi.fn().mockResolvedValue(new Map()), // no tenants known
    }));
    const verifySpy = vi.fn();
    vi.doMock('../src/verifyToken.js', async () => {
      const actual = await vi.importActual<typeof import('../src/verifyToken.js')>('../src/verifyToken.js');
      return { ...actual, verifyAgainstTenant: verifySpy };
    });

    const { handler } = await import('../src/index.js');
    const token = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') +
      '.' + Buffer.from(JSON.stringify({ iss: 'https://unknown.example/realms/x' })).toString('base64url') +
      '.sig';
    const result = await handler(eventWithAuthHeader(`Bearer ${token}`));

    expect(result.isAuthorized).toBe(false);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('allows and returns tenant/role/party context when verification succeeds', async () => {
    vi.doMock('../src/manifest.js', () => ({
      getIssuerIndex: vi.fn().mockResolvedValue(new Map([[TENANT.issuer, TENANT]])),
    }));
    vi.doMock('../src/verifyToken.js', async () => {
      const actual = await vi.importActual<typeof import('../src/verifyToken.js')>('../src/verifyToken.js');
      return {
        ...actual,
        verifyAgainstTenant: vi.fn().mockResolvedValue({ sub: 'user-1', persona: 'admin', partyId: 'party-1' }),
      };
    });

    const { handler } = await import('../src/index.js');
    const token = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') +
      '.' + Buffer.from(JSON.stringify({ iss: TENANT.issuer })).toString('base64url') +
      '.sig';
    const result = await handler(eventWithAuthHeader(`Bearer ${token}`));

    expect(result).toEqual({
      isAuthorized: true,
      context: { tenantId: 'corenroll', role: 'admin', partyId: 'party-1' },
    });
  });

  it('denies (without throwing) when the manifest fetch itself fails', async () => {
    vi.doMock('../src/manifest.js', () => ({
      getIssuerIndex: vi.fn().mockRejectedValue(new Error('network error')),
    }));

    const { handler } = await import('../src/index.js');
    const token = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') +
      '.' + Buffer.from(JSON.stringify({ iss: TENANT.issuer })).toString('base64url') +
      '.sig';
    const result = await handler(eventWithAuthHeader(`Bearer ${token}`));

    expect(result.isAuthorized).toBe(false);
  });
});
