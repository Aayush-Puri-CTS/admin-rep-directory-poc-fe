import { createContext, useContext, type ReactNode } from 'react';
import type { TenantConfig } from '../tenant/resolveTenant';

// Resolved once at boot from the hostname -> tenant registry (src/tenant/resolveTenant.ts) —
// per spec/tenant-domains-and-hipaa-isolation-team-brief.md §5: "The browser never sets the
// tenant (it can't be trusted to). The edge does, from the domain." There is deliberately no
// setter here anymore — a prior version of this file let the user type any tenant ID into a
// header input, which this brief makes clear is not how tenant resolution should work even in
// dev. The only reason the SPA still sends X-Tenant-Id itself (src/api/client.ts) rather than
// trusting a gateway-injected header end-to-end is that this BFF has no Lambda Authorizer yet
// (spec/api-spec.md §2) — see docs/aws-api-gateway-lambda-authorizer.md for closing that gap.
let resolvedTenant: TenantConfig | null = null;

export function setResolvedTenant(config: TenantConfig): void {
  resolvedTenant = config;
}

/** Read synchronously from outside React (used by the axios request interceptor). */
export function getTenantId(): string | undefined {
  return resolvedTenant?.tenantId;
}

const TenantContext = createContext<TenantConfig | undefined>(undefined);

export function TenantProvider({ config, children }: { config: TenantConfig; children: ReactNode }) {
  return <TenantContext.Provider value={config}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider');
  return ctx;
}
