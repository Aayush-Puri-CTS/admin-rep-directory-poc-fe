# Keycloak SSO Setup

How this SPA authenticates against Keycloak. For step-by-step client registration, see the [README](./README.md#2-register-the-client-in-keycloak-one-time-admin-console); this doc covers the runtime architecture — what each piece does and why.

## Overview

| | |
|---|---|
| Keycloak server | `https://qa-sso.corenroll.com` |
| Realm | `Corenroll-Test` |
| Client ID | `nuera-enrollment-proto` |
| Client type | Public client (no client secret), Authorization Code + PKCE (`S256`) |
| Library | `keycloak-js` v26 + `@react-keycloak/web` v3 (React binding) |

The SPA never sees a client secret — it can't hold one securely, so it relies on PKCE to prevent authorization-code interception, and the backend verifies tokens via JWKS instead of introspection (which requires a confidential client).

## Files involved

```
src/keycloak.ts              Keycloak client instance + token auto-refresh
src/main.tsx                 ReactKeycloakProvider — bootstraps the SSO check on app load
src/hooks/useAuth.ts         App-facing auth API: user info, roles, custom claims, login/logout
src/components/AuthButtons.tsx   Login / Logout / Register buttons
src/components/PrivateRoute.tsx  Route guard for authenticated-only pages
src/pages/LogoutCallback.tsx     Front-channel logout (SLO) handler
src/api/axiosInstance.ts     Attaches Bearer token to every API call, refreshes on demand
public/silent-check-sso.html Required by onLoad: 'check-sso'
.env / .env.example           VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, VITE_KEYCLOAK_CLIENT_ID
```

## 1. Client instance (`src/keycloak.ts`)

A single `Keycloak` instance is created from env vars and exported as a singleton — everything else (the provider, the axios interceptor, `useAuth`) imports this same instance rather than creating its own.

```ts
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});
```

It also wires `onTokenExpired`: when the access token expires, it tries `updateToken(60)` (refresh if <60s of validity remains) using the refresh token, and force-logs-out if that fails — e.g. the refresh token was already rotated/used (Keycloak refresh tokens are single-use by default).

## 2. Bootstrapping (`src/main.tsx`)

The whole app is wrapped in `ReactKeycloakProvider`, configured with:

| Option | Value | Why |
|---|---|---|
| `onLoad` | `'check-sso'` | Silently checks for an existing Keycloak session on page load without forcing a redirect — public pages stay visible for unauthenticated visitors. |
| `checkLoginIframe` | `true` | Polls a hidden iframe against Keycloak to detect Single Sign-Out (SLO) triggered elsewhere. |
| `pkceMethod` | `'S256'` | Required for public clients doing Authorization Code flow. |
| `silentCheckSsoRedirectUri` | `/silent-check-sso.html` | A blank page Keycloak redirects to during the silent check; it `postMessage`s the URL back to the parent frame instead of doing a full-page redirect. |

## 3. Login / logout flow

- **Login**: `keycloak.login()` (exposed via `useAuth().login`) redirects to Keycloak's hosted login page. Any MFA/passkey policy configured on the realm runs there — the SPA has no knowledge of it.
- **Logout**: `keycloak.logout({ redirectUri: window.location.origin })` ends the Keycloak session and returns to `/`.
- **Front-channel SLO**: if the session is ended from elsewhere (another app sharing the realm, or an admin action), Keycloak calls the client's **Front-channel logout URL** (`/logout-callback`, configured in the Keycloak client settings). `src/pages/LogoutCallback.tsx` clears the local token and redirects home.
- **Route protection**: `PrivateRoute` checks `initialized` (has the SSO check finished?) and `isAuthenticated`, redirecting unauthenticated users to `/`.

## 4. Token contents and custom claims (`src/hooks/useAuth.ts`)

`useAuth()` wraps `useKeycloak()` and exposes:

- Standard claims — `preferred_username`, `email`.
- Realm roles via `realm_access.roles`, with `hasRole` / `hasAnyRole` helpers.
- Resource (client) roles via `hasResourceRole(role, clientId)`.
- **CoreNroll custom token claims**, added via a Keycloak protocol mapper on the client/realm (not part of the OIDC spec):
  - `persona` — `broker | agent | employer | admin`
  - `user_applicationId`
  - `allowed_apps`

These claims must exist on the Keycloak client's **Client scopes → Mappers** (or a dedicated realm client scope) — if a claim is missing here, `useAuth()` will just return `undefined` for it silently.

Role-based route guarding (a `RoleGuard` built on `hasRole`/`hasResourceRole`) is not implemented in this prototype — `PrivateRoute` only checks authentication, not roles.

## 5. Calling the backend (`src/api/axiosInstance.ts`)

An Axios request interceptor runs before every API call:

1. If authenticated, calls `keycloak.updateToken(30)` — refreshes the access token if it expires within 30s.
2. If refresh fails (refresh token expired/rotated), forces `keycloak.login()` and rejects the request.
3. Otherwise attaches `Authorization: Bearer <token>`.

A response interceptor also force-logs-in on any `401` from the backend, as a fallback in case a token slips through invalid.

## 6. Backend token verification

The backend (a separate service, not in this repo) is expected to verify the JWT itself using Keycloak's JWKS endpoint — **not** the introspection endpoint, since introspection requires a confidential client secret this SPA doesn't have:

```
GET https://qa-sso.corenroll.com/realms/Corenroll-Test/protocol/openid-connect/certs
```

Checks it must perform:
- Signature valid (RS256) against the JWKS keys
- `exp` not passed
- `iss` == `https://qa-sso.corenroll.com/realms/Corenroll-Test`
- `aud` includes `nuera-enrollment-proto`

## 7. Environment variables

```
VITE_KEYCLOAK_URL=https://qa-sso.corenroll.com
VITE_KEYCLOAK_REALM=Corenroll-Test
VITE_KEYCLOAK_CLIENT_ID=nuera-enrollment-proto
```

These are Vite `VITE_`-prefixed vars, so they're baked into the client bundle at build time (not secret — this is a public client, so nothing sensitive is at risk here).

## 8. Keycloak-side client configuration

Registered once via the admin console (`/admin/master/console/` → realm `Corenroll-Test` → Clients). Key settings:

| Setting | Value |
|---|---|
| Client authentication | OFF (public client) |
| Standard flow (Authorization Code) | ON |
| Direct access grants | OFF |
| PKCE method | S256 |
| Valid redirect URIs | `http://localhost:5173/*` |
| Valid post-logout redirect URIs | `http://localhost:5173/*` |
| Web origins | `http://localhost:5173` |
| Front-channel logout | ON, URL `http://localhost:5173/logout-callback` |

Redirect URIs, web origins, and the front-channel logout URL all need updating in the Keycloak client whenever the app is deployed to a new origin (they're currently scoped to localhost only).

## Known gaps / out of scope in this prototype

- No `RoleGuard` component — roles are exposed by `useAuth` but nothing consumes them yet.
- No production Keycloak client config (redirect URIs, origins) — localhost only.
- Token introspection is intentionally not used (see §6).
