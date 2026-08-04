import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { getIssuerIndex } from './manifest.js';
import { allow, deny } from './policy.js';
import type { AuthorizerContext } from './types.js';
import { AuthDenied, peekIssuer, verifyAgainstTenant } from './verifyToken.js';

function extractBearerToken(event: APIGatewayRequestAuthorizerEventV2): string | null {
  const headers = event.headers ?? {};
  const header = headers.authorization ?? headers.Authorization;
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * HTTP API REQUEST authorizer (payload format 2.0, simple responses). Fail-closed at every
 * step — see docs/aws-api-gateway-lambda-authorizer.md Step 2. Logs the *reason* for a deny
 * (never the raw token, never anything that would tell a caller which issuers are known) so an
 * operator can distinguish "misconfigured client" from "JWKS outage" from "attack" without the
 * denied caller learning anything from the response itself.
 */
export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>> {
  try {
    const token = extractBearerToken(event);
    if (!token) {
      console.warn(JSON.stringify({ authorizer: 'deny', reason: 'missing_bearer_token' }));
      return deny();
    }

    // Unverified peek at `iss` ONLY to pick which tenant's registry entry (and therefore JWKS)
    // to check against next — nothing here is trusted yet.
    const issuer = peekIssuer(token);

    const issuerIndex = await getIssuerIndex();
    const tenant = issuerIndex.get(issuer);
    if (!tenant) {
      // Unknown issuer -> deny before ever attempting signature verification. A validly-signed
      // token from a Keycloak realm we don't manage must never reach jwtVerify.
      console.warn(JSON.stringify({ authorizer: 'deny', reason: 'unknown_issuer' }));
      return deny();
    }

    const identity = await verifyAgainstTenant(token, tenant);

    console.info(
      JSON.stringify({ authorizer: 'allow', tenantId: tenant.tenantId, sub: identity.sub }),
    );

    return allow({
      tenantId: tenant.tenantId,
      role: identity.persona ?? '',
      partyId: identity.partyId ?? '',
    });
  } catch (error) {
    const reason = error instanceof AuthDenied ? error.message : 'internal_error';
    if (error instanceof AuthDenied) {
      console.warn(JSON.stringify({ authorizer: 'deny', reason }));
    } else {
      console.error(JSON.stringify({ authorizer: 'error', reason }), error);
    }
    return deny();
  }
}
