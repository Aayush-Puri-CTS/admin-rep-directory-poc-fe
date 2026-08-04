export interface TenantKeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
}

export interface TenantConfig {
  tenantId: string;
  brand: string;
  keycloak: TenantKeycloakConfig;
}

// Mirrors the hostname -> tenant_id registry from
// spec/tenant-domains-and-hipaa-isolation-team-brief.md §5: "the edge figures out the tenant
// before the app runs, from the incoming request's Host, using a registry." Per
// spec/MULTI_TENANT_INTEGRATION.md §2 this is a single static JSON manifest in S3 behind
// CloudFront, not a database or a lookup service — /tenant-registry.json is the local dev copy
// of that exact file, same shape. It lets this SPA resolve which Keycloak realm to log into
// *before* a token exists — the same "pre-login, tenant comes from the domain" case the brief
// describes for the registration flow, applied here to picking a login realm instead of a
// registration form. Once logged in, per-call tenant identity should come from the token (see
// src/context/TenantContext.tsx) — this registry only answers "which realm do we even point
// Keycloak at."
type TenantRegistry = Record<string, TenantConfig>;

// This SPA-side cache is one of three independent, separately-configurable cache layers over the
// same manifest — see docs/aws-api-gateway-lambda-authorizer.md §9 ("Actual TTL values"): this one,
// CloudFront's cache of the S3 object, and the Lambda Authorizer's in-memory copy. There's no
// single knob that controls all three. Default chosen to match the other layers' suggested
// default (300s) — tune via VITE_TENANT_MANIFEST_TTL_SECONDS per environment.
//
// Honest gap: main.tsx currently calls resolveTenantFromHost() exactly once, at boot. This TTL
// only has an effect if something re-invokes resolution later in the same session (there's no
// periodic re-check wired up yet) — a stale copy in an already-open, long-lived tab is still
// possible either way, and the real security boundary against that is the Gateway/Authorizer's own
// (separately configurable) cache, not this one.
const DEFAULT_TTL_SECONDS = 300;

function getTtlMs(): number {
  const configured = Number(import.meta.env.VITE_TENANT_MANIFEST_TTL_SECONDS);
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

let cachedRegistry: TenantRegistry | null = null;
let cachedAt = 0;

async function loadRegistry(): Promise<TenantRegistry> {
  const isFresh = cachedRegistry !== null && Date.now() - cachedAt < getTtlMs();
  if (isFresh) return cachedRegistry as TenantRegistry;

  const response = await fetch('/tenant-registry.json');
  if (!response.ok) {
    throw new Error(`Failed to load tenant registry (HTTP ${response.status})`);
  }

  cachedRegistry = (await response.json()) as TenantRegistry;
  cachedAt = Date.now();
  return cachedRegistry;
}

/**
 * Resolves `host` (window.location.host) to a tenant config, or `null` if unmapped.
 * Per the brief: "Unknown/unmapped host -> rejected. No default tenant, and we never reveal
 * which tenants exist" — callers must reject on `null`, not fall back to any default.
 */
export async function resolveTenantFromHost(host: string): Promise<TenantConfig | null> {
  const registry = await loadRegistry();
  return registry[host] ?? null;
}
