import axios from 'axios';
import { getKeycloak } from '../keycloak';
import { getTenantId } from '../context/TenantContext';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
});

// Attaches a Bearer token (refreshing it first if it's within 30s of expiry) — see
// spec/KEYCLOAK_SSO.md §5. This is real: the token comes from an actual login against the
// tenant's resolved Keycloak realm (src/tenant/resolveTenant.ts). What's NOT real yet is
// anything on the receiving end — this BFF has no JWT verification at all (spec/api-spec.md
// §2), so it never reads the Authorization header. It also can't derive a tenant from the
// token itself, since there's no Lambda Authorizer here to inject X-Tenant-Id from the JWT's
// issuer/realm — so X-Tenant-Id is still sent by the SPA itself, sourced from the same
// hostname-resolved tenant config (src/context/TenantContext.tsx), until that infrastructure
// exists (see docs/aws-api-gateway-lambda-authorizer.md for the plan to close that gap).
apiClient.interceptors.request.use(async (config) => {
  const keycloak = getKeycloak();

  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(30);
    } catch {
      void keycloak.login();
      return Promise.reject(new Error('Session expired — redirecting to login'));
    }
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }

  const tenantId = getTenantId();
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }

  return config;
});

// Fallback in case a token slips through invalid — force a fresh login on any 401.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      void getKeycloak().login();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  message?: string | string[];
  statusCode?: number;
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join(', ') : body.message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}
