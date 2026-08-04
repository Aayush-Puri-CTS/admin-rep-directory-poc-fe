# Multi-Tenant Integration — SSO & API Gateway

How this prototype's current single-tenant setup ([KEYCLOAK_SSO.md](./KEYCLOAK_SSO.md)) needs to change to fit the target architecture in [`dashboard-hld.md`](./dashboard-hld.md). That doc describes the real system: one React dashboard, one realm per tenant, an API Gateway + Authorizer in front of a BFF, with domain services behind the BFF.

This doc covers only the identity/edge integration — not the dashboard's UI, RBAC, or domain-service contracts (see `dashboard-hld.md` for those).

## 1. Target flow (recap)

```
Browser --login (direct)--> Keycloak (realm = tenant)
Browser --every other call--> API Gateway + Authorizer --> Dashboard Backend (BFF) --> domain services (Commission / Invoice / Enrollment / ...)
```

The browser only ever talks to Keycloak (for login) and the Gateway (for everything else). It never calls a domain service — including this repo's Enrollment API — directly.

## 2. Decisions made for this integration

| Area | Decision |
|---|---|
| Tenant → realm resolution | **Subdomain** (e.g. `nuera.dashboard.corenroll.com` → realm `nuera`), resolved from a **static tenant-config JSON manifest published to S3 behind CloudFront**. Fetched client-side at app boot. Zero server-side code, lookups, or database involved in this resolution step. |
| Backend shape | A **separate BFF** exists (per `dashboard-hld.md` §4.6). This repo's Enrollment API is a **domain service behind the BFF**, not the BFF itself. |
| Local dev | Local dev **does not bypass the gateway**. A real Gateway + Authorizer runs locally too; the backend **never decodes the JWT itself** as a fallback — it always trusts the injected `x-tenant-id` / `x-role` / `x-party-id` headers, in every environment. |
| `party_id` | A **Keycloak custom claim** (protocol mapper), the same pattern as this proto's existing `persona` / `user_applicationId` claims (`src/hooks/useAuth.ts`). |

## 3. Gaps between this proto and the target

### 3.1 Realm resolution is static, needs to be dynamic-by-subdomain

**Now:** `src/keycloak.ts` builds the `Keycloak` instance synchronously at module load, from build-time env vars (`VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`). One build = one tenant.

**Target:** before constructing the `Keycloak` instance, the app must:
1. Parse the tenant identifier from `window.location.hostname` (subdomain).
2. Fetch the tenant manifest from CloudFront (e.g. `https://config.<domain>/tenants/<subdomain>.json`, or one manifest file keyed by subdomain).
3. Read `{ realm, clientId, keycloakUrl?, apiBaseUrl, ... }` from the response.
4. Construct `Keycloak({...})` from those values.

**Consequence:** `main.tsx` currently renders `ReactKeycloakProvider` synchronously — it will need to `await` the manifest fetch (with a loading state) before mounting the provider, since `keycloak-js` needs the realm/client at construction time, not after.

**Open items (not yet decided, flag before building):**
- Exact manifest shape and URL pattern (single file keyed by subdomain vs. one file per tenant).
- Cache/invalidation story for onboarding a new tenant (CloudFront caches the manifest — does adding a tenant require a cache invalidation, or is TTL short enough to not matter?).
- Whether the Keycloak *server* URL is shared across all tenants (only `realm` varies) or can also vary per tenant.

### 3.2 SPA calls the Enrollment API directly — must go through Gateway → BFF

**Now:** `src/api/axiosInstance.ts` calls `VITE_API_BASE_URL` (the Enrollment API) directly, attaching the Bearer token itself.

**Target:** the SPA calls the BFF only, through the Gateway. The BFF (not the browser) calls the Enrollment API and any other domain service. This means:
- `VITE_API_BASE_URL` should point at the Gateway/BFF, not the Enrollment API.
- The BFF — not this SPA — becomes responsible for calling the Enrollment API's 5 endpoints.
- This repo's axios interceptor logic (attach Bearer token, refresh on 401) stays the same in shape — it's just pointed at the BFF instead of the domain service.

**Open item:** whether this repo continues to own the Enrollment API code once it's repositioned as a domain service, or whether that's a separate service/repo. Not decided — noted so it isn't silently assumed.

### 3.3 Local dev must exercise a real Gateway + Authorizer

**Now:** `npm run dev` talks straight to a bare backend on `localhost`, no gateway in the path.

**Target:** local dev needs a real Gateway + Authorizer running locally (e.g. the same Kong/Istio/NGINX ext-authz option chosen in `dashboard-hld.md` §6's open ADR), validating a real JWT against the dev Keycloak realm and injecting `x-tenant-id` / `x-role` / `x-party-id`. The backend must be written so it **only ever reads tenant/role/party from those headers** — it must not fall back to decoding the JWT locally, even in dev, so dev behavior matches prod and that code path is actually exercised before shipping.

**Open item:** which local gateway/authorizer to run, and how it's provisioned (docker-compose service, devcontainer, etc.) — depends on the Gateway ADR in `dashboard-hld.md` §6, which is still open.

### 3.4 `party_id` needs a protocol mapper

**Now:** `useAuth.ts` already exposes `persona` and `user_applicationId` as custom claims — the mechanism for this already exists in the proto.

**Target:** add `party_id` as a Keycloak custom claim via a protocol mapper on the client (or a shared realm client scope), following the same pattern as the existing claims. `user_applicationId` may turn out to be the same concept as `party_id` under a different name — worth reconciling rather than shipping both, but not yet decided which name wins.

## 4. Summary of what changes vs. stays the same

| Component | Stays the same | Changes |
|---|---|---|
| Login (direct to Keycloak, PKCE, `check-sso`) | Yes — `dashboard-hld.md` confirms direct browser→Keycloak login | Realm is now resolved dynamically per-subdomain instead of static |
| Token refresh (`onTokenExpired`, axios interceptor) | Yes, same shape | Points at the BFF/Gateway instead of the Enrollment API |
| Custom claims pattern (`useAuth.ts`) | Yes, same mechanism | Add `party_id`; reconcile with `user_applicationId` |
| Direct SPA → Enrollment API calls | No | Removed — goes through Gateway → BFF |
| Local dev bypassing auth infra | No | Local dev must run a real Gateway + Authorizer |

## 5. Still open (not covered by decisions so far)

- Exact tenant-manifest file layout/URL and its CloudFront cache-invalidation strategy for tenant onboarding.
- Whether the Keycloak server URL is single/shared or also varies per tenant.
- Whether this repo keeps owning the Enrollment API once it's a domain service behind a separate BFF, or that work moves elsewhere.
- Which Gateway/Authorizer technology backs local dev (tied to the open ADR in `dashboard-hld.md` §6).
- Final claim name: `party_id` vs. the existing `user_applicationId`.
