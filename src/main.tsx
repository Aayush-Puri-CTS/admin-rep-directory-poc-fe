import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { ReactKeycloakProvider } from '@react-keycloak/web';
import { initKeycloak } from './keycloak';
import { resolveTenantFromHost } from './tenant/resolveTenant';
import { TenantProvider, setResolvedTenant } from './context/TenantContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

// NOTE: onLoad is deliberately NOT 'check-sso' and checkLoginIframe is deliberately off.
// @react-keycloak/web defaults onLoad to 'check-sso' internally, so it must be overridden
// here explicitly (omitting the key is not enough). Both silent mechanisms were verified
// against the real qa-sso.corenroll.com realm and currently hang the whole app on "Checking
// session…" forever — see README's Keycloak SSO section for the two concrete causes found
// (a Web Origins gap breaking the SSO-iframe endpoint, and a realm CSP frame-ancestors policy
// blocking the silent-check-sso iframe entirely). Neither is fixable from this repo; both need
// a realm-admin change in Keycloak. Until then, login is always an explicit user click — a
// real, working PKCE redirect to Keycloak's hosted login page, just not a silent one.
const keycloakInitOptions = {
  onLoad: undefined,
  checkLoginIframe: false,
  pkceMethod: 'S256' as const,
};

const rootEl = document.getElementById('root')!;

function renderBootMessage(message: string) {
  createRoot(rootEl).render(
    <StrictMode>
      <div className="app-loading">
        <p>{message}</p>
      </div>
    </StrictMode>,
  );
}

// Resolves which tenant (and therefore which Keycloak realm) this hostname belongs to *before*
// constructing anything Keycloak-related — see spec/tenant-domains-and-hipaa-isolation-team-brief
// .md §5 and src/tenant/resolveTenant.ts. This is the dynamic-realm-resolution piece that
// spec/MULTI_TENANT_INTEGRATION.md §3.1 flagged as an open item; the brief supplies the missing
// registry model.
async function bootstrap() {
  let tenant;
  try {
    tenant = await resolveTenantFromHost(window.location.host);
  } catch {
    renderBootMessage('Could not load tenant configuration. Please try again shortly.');
    return;
  }

  if (!tenant) {
    // Per the brief: unmapped host -> reject, never reveal which tenants exist. Deliberately
    // generic — no hint at what a valid host would look like.
    renderBootMessage("This domain isn't registered to a tenant.");
    return;
  }

  setResolvedTenant(tenant);
  document.title = `${tenant.brand} — Rep Directory`;
  const keycloak = initKeycloak(tenant.keycloak);

  createRoot(rootEl).render(
    <StrictMode>
      <ReactKeycloakProvider
        authClient={keycloak}
        initOptions={keycloakInitOptions}
        LoadingComponent={<div className="app-loading">Checking session&hellip;</div>}
      >
        <QueryClientProvider client={queryClient}>
          <TenantProvider config={tenant}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </TenantProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ReactKeycloakProvider>
    </StrictMode>,
  );
}

bootstrap();
