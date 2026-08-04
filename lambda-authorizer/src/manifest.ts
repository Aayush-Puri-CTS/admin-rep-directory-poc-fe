import type { TenantManifest, TenantManifestEntry } from './types.js';

// One of three independently configurable cache layers over the same manifest file — see
// docs/aws-api-gateway-lambda-authorizer.md §9 ("Actual TTL values"). This one, CloudFront's own
// cache of the S3 object, and the SPA's in-tab copy (admin-poc-fe/src/tenant/resolveTenant.ts)
// each have their own TTL; there is no single knob that controls all three.
const DEFAULT_TTL_SECONDS = 300;

function getTtlMs(): number {
  const configured = Number(process.env.TENANT_MANIFEST_CACHE_TTL_SECONDS);
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

function getManifestUrl(): string {
  const url = process.env.TENANT_MANIFEST_URL;
  if (!url) {
    throw new Error('TENANT_MANIFEST_URL is not configured');
  }
  return url;
}

// Fetched over HTTPS from the CloudFront URL (the same object the browser gets) rather than read
// directly from S3 via the SDK — see docs/aws-api-gateway-lambda-authorizer.md Step 1 for the
// tradeoff (lower latency via direct S3 GetObject vs. no extra IAM role / SDK dependency here).
// Switch to @aws-sdk/client-s3's GetObjectCommand if that latency matters in practice.
async function fetchManifest(): Promise<TenantManifest> {
  const response = await fetch(getManifestUrl());
  if (!response.ok) {
    throw new Error(`Failed to fetch tenant manifest: HTTP ${response.status}`);
  }
  return (await response.json()) as TenantManifest;
}

function buildIssuerIndex(manifest: TenantManifest): Map<string, TenantManifestEntry> {
  const index = new Map<string, TenantManifestEntry>();
  for (const entry of Object.values(manifest)) {
    // Skip non-entry keys (e.g. the "//" comment field admin-poc-fe/public/tenant-registry.json
    // uses) and any entry missing the fields this authorizer needs.
    if (
      entry &&
      typeof entry === 'object' &&
      typeof entry.issuer === 'string' &&
      entry.issuer &&
      typeof entry.tenantId === 'string' &&
      entry.keycloak?.clientId
    ) {
      index.set(entry.issuer, entry);
    }
  }
  return index;
}

let cachedIssuerIndex: Map<string, TenantManifestEntry> | null = null;
let cachedAt = 0;

/**
 * Returns an `issuer -> tenant entry` index, fetching and rebuilding it at most once per
 * `TENANT_MANIFEST_CACHE_TTL_SECONDS` (default 300s) per warm execution environment.
 */
export async function getIssuerIndex(): Promise<Map<string, TenantManifestEntry>> {
  const isFresh = cachedIssuerIndex !== null && Date.now() - cachedAt < getTtlMs();
  if (isFresh) {
    return cachedIssuerIndex as Map<string, TenantManifestEntry>;
  }

  const manifest = await fetchManifest();
  cachedIssuerIndex = buildIssuerIndex(manifest);
  cachedAt = Date.now();
  return cachedIssuerIndex;
}

/** Test-only: resets the module-level cache between test cases. */
export function __resetManifestCacheForTests(): void {
  cachedIssuerIndex = null;
  cachedAt = 0;
}
