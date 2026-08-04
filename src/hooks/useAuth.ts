import { useKeycloak } from '@react-keycloak/web';

interface TokenClaims {
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  // CoreNroll custom claims, added via a Keycloak protocol mapper — see spec/KEYCLOAK_SSO.md §4.
  // Undefined if the mapper isn't configured on the realm/client; callers must handle that.
  persona?: 'broker' | 'agent' | 'employer' | 'admin';
  // `party_id` is the decided claim name (spec/MULTI_TENANT_INTEGRATION.md §3.4/§5 closed this in
  // favor of party_id over the prototype's original `user_applicationId`) — but the protocol
  // mapper producing it hasn't been added to any realm yet, so this reads as undefined until then.
  party_id?: string;
  allowed_apps?: string[];
}

/** App-facing auth API: identity, roles, custom claims, login/logout. Wraps useKeycloak(). */
export function useAuth() {
  const { keycloak, initialized } = useKeycloak();
  const claims = (keycloak.tokenParsed ?? {}) as TokenClaims;
  const roles = claims.realm_access?.roles ?? [];

  function hasRole(role: string): boolean {
    return roles.includes(role);
  }

  function hasAnyRole(candidates: string[]): boolean {
    return candidates.some(hasRole);
  }

  function hasResourceRole(role: string, clientId: string): boolean {
    return claims.resource_access?.[clientId]?.roles?.includes(role) ?? false;
  }

  return {
    initialized,
    isAuthenticated: initialized && !!keycloak.authenticated,
    username: claims.preferred_username,
    email: claims.email,
    persona: claims.persona,
    partyId: claims.party_id,
    allowedApps: claims.allowed_apps,
    roles,
    hasRole,
    hasAnyRole,
    hasResourceRole,
    login: () => keycloak.login(),
    register: () => keycloak.register(),
    logout: () => keycloak.logout({ redirectUri: window.location.origin }),
  };
}
