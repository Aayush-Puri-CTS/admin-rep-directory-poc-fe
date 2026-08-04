import Keycloak from 'keycloak-js';
import type { TenantKeycloakConfig } from './tenant/resolveTenant';

// Unlike a single static instance built from build-time env vars, this is now constructed
// *after* the hostname -> tenant lookup (src/tenant/resolveTenant.ts) resolves which realm to
// log into — see spec/tenant-domains-and-hipaa-isolation-team-brief.md §5 and
// spec/MULTI_TENANT_INTEGRATION.md §3.1 ("Realm resolution is static, needs to be
// dynamic-by-subdomain" — this is that). initKeycloak() must run once, before
// ReactKeycloakProvider mounts (see src/main.tsx); every other module imports the singleton via
// getKeycloak().
let instance: Keycloak | null = null;

export function initKeycloak(config: TenantKeycloakConfig): Keycloak {
  if (instance) return instance;

  instance = new Keycloak({
    url: config.url,
    realm: config.realm,
    clientId: config.clientId,
  });

  instance.onTokenExpired = () => {
    // Refresh if less than 60s of validity remains; Keycloak refresh tokens are single-use by
    // default, so a failure here (already-rotated/expired refresh token) forces a fresh login.
    instance!.updateToken(60).catch(() => instance!.login());
  };

  return instance;
}

export function getKeycloak(): Keycloak {
  if (!instance) {
    throw new Error('getKeycloak() called before initKeycloak() — tenant resolution must complete first');
  }
  return instance;
}
