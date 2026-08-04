// Same shape as the frontend's TenantConfig (admin-poc-fe/src/tenant/resolveTenant.ts) plus one
// field: `issuer`. Both the SPA and this authorizer read the *same* S3/CloudFront manifest file,
// just indexed differently — see docs/aws-api-gateway-lambda-authorizer.md §5.3.
export interface TenantManifestEntry {
  tenantId: string;
  brand: string;
  issuer: string;
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
  };
}

// Keyed by hostname, exactly like admin-poc-fe/public/tenant-registry.json. Non-entry keys (e.g.
// a "//" comment field) are tolerated and simply skipped when building the issuer index.
export type TenantManifest = Record<string, TenantManifestEntry>;

// API Gateway HTTP API Lambda authorizer context values must be strings — see
// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html.
// Empty string (not undefined/null) stands in for "claim not present on this token".
export interface AuthorizerContext {
  tenantId: string;
  role: string;
  partyId: string;
}
