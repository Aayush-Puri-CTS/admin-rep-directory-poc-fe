import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { TenantManifestEntry } from './types.js';

/** Thrown for any reason a request should be denied. Never carries detail worth leaking to the caller. */
export class AuthDenied extends Error {}

/**
 * Reads `iss` from the token WITHOUT verifying its signature — used only to decide which
 * tenant's JWKS to verify against next. Never trust anything else read this way; every other
 * claim must come from the verified payload in `verifyAgainstTenant`.
 */
export function peekIssuer(token: string): string {
  let claims;
  try {
    claims = decodeJwt(token);
  } catch {
    throw new AuthDenied('malformed_token');
  }

  if (typeof claims.iss !== 'string' || claims.iss.length === 0) {
    throw new AuthDenied('missing_issuer_claim');
  }

  return claims.iss;
}

// One remote JWKS per issuer, cached by `jose` itself (cacheMaxAge) across warm invocations —
// this map just avoids re-constructing the JWKSet object (and its own cache) every call.
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    // Keycloak's certs endpoint — see spec/KEYCLOAK_SSO.md §6.
    const jwksUrl = new URL(`${issuer}/protocol/openid-connect/certs`);
    jwks = createRemoteJWKSet(jwksUrl, {
      cooldownDuration: 30_000, // don't hammer JWKS on a burst of unknown-kid failures
      cacheMaxAge: 10 * 60 * 1000, // refresh keys at most every 10 minutes
    });
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

export interface VerifiedIdentity {
  sub: string;
  persona?: string;
  partyId?: string;
}

/**
 * Verifies signature (RS256 only — algorithm pinned to prevent alg-confusion attacks), `exp`,
 * and `aud` (must include `tenant.keycloak.clientId`) against the JWKS for `tenant.issuer`.
 * Only call this after `tenant` has already been resolved by an exact match on the *unverified*
 * issuer against the tenant manifest (see index.ts) — signature validity alone is not sufficient
 * trust; the issuer must be one of ours before verification is even attempted.
 */
export async function verifyAgainstTenant(
  token: string,
  tenant: TenantManifestEntry,
): Promise<VerifiedIdentity> {
  const jwks = getJwks(tenant.issuer);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: tenant.issuer,
      audience: tenant.keycloak.clientId,
      algorithms: ['RS256'],
    }));
  } catch {
    throw new AuthDenied('token_verification_failed');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthDenied('missing_sub_claim');
  }

  return {
    sub: payload.sub,
    persona: typeof payload.persona === 'string' ? payload.persona : undefined,
    // party_id is the decided claim name (spec/MULTI_TENANT_INTEGRATION.md §3.4/§5) — the
    // protocol mapper producing it may not exist on every realm yet, so this reads undefined
    // until it does; see admin-poc-fe/src/hooks/useAuth.ts for the same convention.
    partyId: typeof payload.party_id === 'string' ? payload.party_id : undefined,
  };
}

/** Test-only: clears the per-issuer JWKS cache between test cases. */
export function __resetJwksCacheForTests(): void {
  jwksByIssuer.clear();
}
