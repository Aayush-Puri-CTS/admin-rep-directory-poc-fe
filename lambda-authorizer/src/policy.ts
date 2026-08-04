import type { APIGatewaySimpleAuthorizerWithContextResult } from 'aws-lambda';
import type { AuthorizerContext } from './types.js';

type Response = APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext>;

export function allow(context: AuthorizerContext): Response {
  return { isAuthorized: true, context };
}

// Deliberately generic — see docs/aws-api-gateway-lambda-authorizer.md Step 2, item 8: never
// include which check failed, which issuers are known, or any tenant-identifying detail in the
// response itself. The `reason` is for CloudWatch logs only (see index.ts); it never reaches here.
export function deny(): Response {
  return { isAuthorized: false, context: { tenantId: '', role: '', partyId: '' } };
}
