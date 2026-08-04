# tenant-jwt-authorizer

The API Gateway HTTP API Lambda REQUEST authorizer described in
[`docs/aws-api-gateway-lambda-authorizer.md`](../docs/aws-api-gateway-lambda-authorizer.md). Verifies
a tenant's Keycloak-issued JWT, maps its issuer to a `tenant_id`, and returns
`X-Tenant-Id`/`X-Role`/`X-Party-Id` as authorizer context for the API Gateway integration to inject
as headers (overwriting, never merging — see that doc §5.4) before the request reaches the BFF.

## Design, in one pass (see the doc for the full reasoning)

1. Extract the Bearer token. Missing/malformed → deny.
2. Read `iss` from the token **without verifying it yet** (`peekIssuer`).
3. Look up `iss` in the tenant manifest (`manifest.ts`) — **before any signature verification**.
   Unknown issuer → deny immediately. A validly-signed token from a Keycloak realm we don't manage
   must never reach the verification step.
4. Verify RS256 signature, `exp`, and `aud` (must equal that tenant's `clientId`) against the
   issuer's JWKS (`verifyToken.ts`, via `jose`).
5. Extract `sub`, `persona`, `party_id` from the verified payload.
6. Return `{ isAuthorized: true, context: { tenantId, role, partyId } }`, or a generic deny with no
   detail on any failure (`policy.ts`).

Every deny is logged with a `reason` to CloudWatch — never the raw token, never anything that would
tell a caller which issuers are known.

## Configuration (environment variables)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `TENANT_MANIFEST_URL` | Yes | — | HTTPS URL of the tenant manifest (the CloudFront URL in front of the S3 object — the same file the SPA fetches, see `admin-poc-fe/public/tenant-registry.json` for the local dev shape). |
| `TENANT_MANIFEST_CACHE_TTL_SECONDS` | No | `300` | How long this Lambda's in-memory copy of the manifest is considered fresh. One of three independently configurable cache layers — see the design doc §9. |

## Build & test

```bash
npm install
npm run build   # tsc — same compiler settings the Lambda bundle uses
npm test        # vitest — mocks fetch/jose, no network calls, no real AWS needed
```

This package is consumed directly from TypeScript source by the CDK stack in `../infra` (via
`NodejsFunction`, which bundles it with esbuild at synth/deploy time) — there's no separate publish
step for normal use. `npm run build` here is for standalone typechecking/CI, not a deploy artifact.

## Local development parity (design doc Step 6)

Per `spec/MULTI_TENANT_INTEGRATION.md` §3.3, local dev must exercise a **real** Gateway +
Authorizer, not a bypass. Recommended: run this same code locally via AWS SAM CLI
(`sam local start-api`, pointed at a local/emulated HTTP API definition and this Lambda) or
LocalStack, against the real (or a QA) Keycloak realm's JWKS endpoint — not implemented in this
repo yet, since there's no SAM template checked in here. If you build one, keep the entry point and
environment variables identical to what `../infra` configures, so the code path under test locally
is the same one that runs in every other environment.

## What this deliberately does not do

- No DynamoDB, no registry API — reads the same static S3/CloudFront manifest the SPA does
  (`spec/MULTI_TENANT_INTEGRATION.md` §2). See `manifest.ts`.
- No role/permission decisions (RBAC/ABAC) — this only establishes *who* and *which tenant*, not
  *what they're allowed to do*. Authorization logic belongs downstream of this, once it has a
  trustworthy `X-Role`/`X-Party-Id` to key off of.
- No VPC attachment — it only calls public endpoints (the manifest URL, each tenant's public JWKS
  endpoint). Only the API Gateway integration to the BFF itself needs the VPC Link.
