# Admin Dashboard

A minimal React admin dashboard for the Admin Application BFF — a NestJS Party-Role directory
service managing Reps (agents, brokers, GAs, MGAs), their business info, platform access, and
Group relationships.

Built against the contract in [`spec/api-spec.md`](./spec/api-spec.md) and
[`spec/openapi.json`](./spec/openapi.json). Only `RepController`'s 11 endpoints exist on the
backend today — there is no Enrollment API, no health endpoint, and no Rep-address API, so this
dashboard doesn't build against any of those.

## Tech stack

- Vite + React + TypeScript
- React Router (`react-router-dom`) for navigation
- TanStack Query (`@tanstack/react-query`) for all API calls — no other data-fetching layer
- Axios as the HTTP client, wrapped in a single interceptor (`src/api/client.ts`)
- Plain CSS (`src/index.css`) — no UI framework

## Auth & tenant resolution: three layers, at different levels of "real"

There are three separate mechanisms here — don't conflate them:

1. **Tenant resolution (which realm to even log into) — modeled on
   [`spec/tenant-domains-and-hipaa-isolation-team-brief.md`](./spec/tenant-domains-and-hipaa-isolation-team-brief.md)
   §5, implemented as a static local stand-in.** See below.
2. **Identity / login — real, per [`spec/KEYCLOAK_SSO.md`](./spec/KEYCLOAK_SSO.md).** Implemented
   with `keycloak-js` + `@react-keycloak/web`, PKCE (`S256`), public client, now pointed at
   whichever realm step 1 resolves. See "Keycloak login" below for exact status.
3. **Tenant header on API calls — still a dev-only stand-in, per
   [`spec/api-spec.md` §2](./spec/api-spec.md#2-auth--tenant-model--how-it-actually-works-today).**
   This BFF has no JWT verification anywhere and no Lambda Authorizer in front of it to derive
   `X-Tenant-Id` from the token — it just trusts whatever header value it's handed. So `X-Tenant-Id`
   is still sent by the SPA itself (`src/api/client.ts`), sourced from step 1's resolved tenant
   config rather than typed by a user. **This still provides zero tenant-isolation guarantee** —
   see [`docs/aws-api-gateway-lambda-authorizer.md`](./docs/aws-api-gateway-lambda-authorizer.md)
   for the plan to close it for real.

### Tenant resolution — hostname → tenant registry

Per the brief: *"The platform edge (gateway) figures out the tenant before the app runs, from the
incoming request's Host, using a registry that maps hostname → tenant_id... The browser never sets
the tenant (it can't be trusted to)."* That's implemented here as far as a pure SPA can:

- `public/tenant-registry.json` is the local dev copy of that registry — a static
  `hostname -> { tenantId, brand, keycloak: { url, realm, clientId } }` map, **one file, keyed by
  hostname**. This isn't a placeholder for some future service — per
  [`spec/MULTI_TENANT_INTEGRATION.md`](./spec/MULTI_TENANT_INTEGRATION.md) §2, the confirmed
  production design *is* exactly this: a single static JSON manifest published to **S3 behind
  CloudFront**, fetched client-side at boot, "zero server-side code, lookups, or database." In
  production this file lives in S3 instead of `public/`; the shape and the resolution logic don't
  change. (No DynamoDB, no registry API — that was considered and explicitly ruled out.)
- `src/tenant/resolveTenant.ts` fetches it and looks up `window.location.host` **before anything
  Keycloak-related is constructed** — this is what answers §3.1's previously-open question ("Realm
  resolution is static, needs to be dynamic-by-subdomain"): `src/main.tsx` now does exactly what
  that section's "Target" describes — resolve tenant from hostname, *then* construct the Keycloak
  client (`src/keycloak.ts`'s `initKeycloak()`) from the resolved `{ realm, clientId, url }`.
- The fetched copy is cached for `VITE_TENANT_MANIFEST_TTL_SECONDS` (default 300s) before a
  re-fetch — one of **three independently configurable cache layers** over the same manifest
  (this one, CloudFront's cache of the S3 object, and the Lambda Authorizer's in-memory copy); see
  [`docs/aws-api-gateway-lambda-authorizer.md`](./docs/aws-api-gateway-lambda-authorizer.md) §9 for
  why there's no single TTL that controls all three, and note today's honest gap: `main.tsx` only
  calls this once at boot, so the TTL has no effect yet within a single already-open tab.
- **Unmapped host → generic rejection, no registry leakage** — `main.tsx` renders "This domain
  isn't registered to a tenant." and nothing else, matching the brief's "we never reveal which
  tenants exist." Verified with a headless browser (an intercepted empty registry produces exactly
  this screen, no crash, no console errors).
- There is **no user-facing tenant switcher anymore** — a prior version of this file let anyone
  type a tenant ID into a text box, which is precisely what the brief says not to do. Once
  authenticated, the header shows a **read-only** brand badge (`src/components/TenantBadge.tsx`)
  resolved the same way.
- **Scoping assumption, stated plainly:** the brief's worked examples are about the client-facing
  *registration* flow (`register.corenroll.com`), not an internal admin tool. This app assumes an
  analogous **subdomain-per-tenant** shape for the admin app itself (`<tenant>.admin.<platform>`,
  flow-neutral label per brief §3.4) — i.e., each tenant's admin staff reach the dashboard on their
  own subdomain, which resolves to their own Keycloak realm (brief §4.4 control #8: "one Keycloak
  realm per tenant"). The registry's two illustrative production-shape entries
  (`corenroll.admin.halostream.example`, `iha.admin.halostream.example`) use the reserved `.example`
  TLD since the brief's `<platform>` apex name is itself still an open item (§7). If admin staff
  instead need a single cross-tenant login with in-app tenant switching (e.g. a `persona: admin`
  who manages multiple tenants), that's a materially different model — flag it before building
  further on this assumption.
- The `localhost:5173` entry keeps local dev working exactly as before (same verified
  `Corenroll-Test` / `nuera-enrollment-proto` realm+client from prior testing) — just resolved
  automatically now instead of typed in.

### Keycloak login — what's implemented and what's actually blocking it

Files: `src/keycloak.ts` (singleton client + token-refresh), `src/main.tsx`
(`ReactKeycloakProvider`), `src/hooks/useAuth.ts` (identity/roles/custom-claims API),
`src/components/{AuthButtons,PrivateRoute}.tsx`, `src/pages/{LandingPage,LogoutCallback}.tsx`,
`src/api/client.ts` (Bearer-token attachment + refresh-before-call + force-login on 401).

This was tested directly against the real `https://qa-sso.corenroll.com` server (it's live and
reachable) using a headless browser. Three concrete things were found:

- **Clicking Login does a real, correct PKCE redirect** — verified request has the right
  `client_id`, `redirect_uri`, `code_challenge`/`code_challenge_method=S256`, `state`, `nonce`. The
  frontend-side OAuth mechanics are correct and match the spec exactly.
- **But the realm rejects it: `400 { "summary": "Client not found." }`** for client_id
  `nuera-enrollment-proto` in realm `Corenroll-Test`. That client is not currently registered on
  this server — someone with Keycloak admin access needs to (re)create it per
  `spec/KEYCLOAK_SSO.md` §8, or hand over whatever the current correct client_id/realm actually is.
  **This is the blocker for testing a real end-to-end login** — nothing in this repo can fix it.
  If you don't have admin access to that shared server, `docs/keycloak-test-realm-setup.md` covers
  setting up your own realm/client/users from scratch (including a Docker one-liner if you don't
  have any Keycloak instance handy) — fully unblocks local testing without touching shared infra.
- **`onLoad: 'check-sso'` (silent existing-session detection) and `checkLoginIframe` (SLO polling)
  are both turned off, and must stay off until two other realm-side gaps are fixed:**
  - The realm's Content-Security-Policy (`frame-ancestors 'self'`) blocks the silent-check-sso
    iframe from loading at all (`ERR_BLOCKED_BY_RESPONSE`). Needs `frame-src`/`frame-ancestors` in
    Keycloak's realm Security Defenses to allow this app's origin.
  - The SLO check-login-iframe endpoint 403s for this origin (`.../login-status-iframe.html/init`),
    a Web Origins config gap on the client (despite `spec/KEYCLOAK_SSO.md` §8 saying
    `http://localhost:5173` should already be a valid Web Origin).
  - Both promises have **no internal timeout** in this version of `keycloak-js` — if either is
    silently broken, the whole app hangs forever on "Checking session…" and never renders anything,
    including the Login button. That's why `main.tsx` explicitly overrides
    `onLoad`/`checkLoginIframe` (note: `@react-keycloak/web` defaults `onLoad` to `'check-sso'`
    internally, so simply omitting the option is not enough — it must be overridden explicitly).
    Once both gaps above are fixed realm-side, re-enable in `src/main.tsx`:
    `onLoad: 'check-sso'`, `checkLoginIframe: true`,
    `silentCheckSsoRedirectUri: `${origin}/silent-check-sso.html`` — the static handler page
    (`public/silent-check-sso.html`) is already in place and unused until then.

Until the client is registered, login is always an **explicit user click** (no silent auto-login),
which does a real top-level redirect unaffected by the CSP/iframe issues above. Logout
(`keycloak.logout()`), token refresh (`onTokenExpired` + axios `updateToken(30)` before each call),
and the front-channel logout callback route (`/logout-callback`) are all implemented per spec and
structurally correct, but likewise can't be exercised end-to-end until a session can actually be
established.

`RoleGuard`-style route protection is intentionally not built — `spec/KEYCLOAK_SSO.md` calls this
out as a known gap in the prototype too (`PrivateRoute` only checks `isAuthenticated`, not roles),
and `useAuth()` exposes `hasRole`/`hasAnyRole`/`hasResourceRole` for whenever that's needed.

## Getting started

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL if the BFF isn't on localhost:3000
npm run dev
```

To add or change a tenant, edit `public/tenant-registry.json` — there's nothing to set in `.env`
for Keycloak anymore; realm/client/URL are resolved per-hostname from that file.

The BFF itself lives in a separate repo — see `spec/api-spec.md` §3 for how to run it locally.
Without it running, every page will show a "Network Error" instead of data — that's expected, not
a bug in this dashboard. Until the Keycloak client described above is registered, you'll land on
the login page and clicking Login will show Keycloak's own "Client not found" error — also
expected, not a bug here.

## Project structure

```
src/
  keycloak.ts     lazy Keycloak singleton: initKeycloak(config)/getKeycloak(), built from the
                  resolved tenant config, not static env vars (spec/KEYCLOAK_SSO.md §1)
  tenant/
    resolveTenant.ts   fetches public/tenant-registry.json, resolves hostname -> tenant config
  api/
    client.ts     axios instance: Bearer-token + X-Tenant-Id interceptors + error-message helper
    types.ts      DTOs/enums mirrored 1:1 from spec/api-spec.md §§5-7
    reps.ts       one function per RepController endpoint
  context/
    TenantContext.tsx   read-only resolved tenant config + getTenantId() for the interceptor
                        (no setter — see Auth section)
  hooks/
    useAuth.ts     identity/roles/custom-claims API wrapping useKeycloak() (spec/KEYCLOAK_SSO.md §4)
    useReps.ts     TanStack Query hooks wrapping every endpoint in api/reps.ts
  components/
    Layout.tsx, TenantBadge.tsx, AuthButtons.tsx, PrivateRoute.tsx,
    StatusBadge.tsx, Pagination.tsx
  pages/
    LandingPage.tsx        shown when not authenticated; Login button
    LogoutCallback.tsx     front-channel SLO target at /logout-callback
    RepDirectoryPage.tsx   paginated directory (GET /reps) + search filters (GET /reps/search)
    CreateRepPage.tsx      mirrors CreateRepBodyDto
    RepDetailPage.tsx      personal/business info edit, platform access editor, soft-delete/
                           restore, linked-groups list + link-to-group form
public/
  tenant-registry.json    local dev copy of the S3/CloudFront hostname -> tenant manifest
  silent-check-sso.html   required by onLoad: 'check-sso' — currently unused, see Auth section
docs/
  aws-api-gateway-lambda-authorizer.md   plan for the still-missing Gateway + Authorizer
```

## Notes / deliberate omissions

- No dropdown/field for `RepAddressType` — the spec says it exists in the domain model but isn't
  wired to any endpoint yet.
- "Link to Group" takes a raw `groupId` UUID — there's no Group-search API to build an autocomplete
  against.
- The personal-info edit form's SSN field is always blank on open: `RepDetailView` never returns
  `ssn` (write-only), so there's nothing to prefill. Leaving it blank omits it from the PATCH body.
- `GET /reps` and `GET /reps/search` are mutually exclusive in the Directory page: as soon as any
  search filter is filled in and submitted, the view switches from the paginated directory query to
  the (unpaginated) search endpoint, matching what each endpoint actually returns.
- The HIPAA defense-in-depth controls in
  `spec/tenant-domains-and-hipaa-isolation-team-brief.md` §4.4 (RLS, mandatory `tenant_id`,
  per-tenant audit, isolation tests, least-privilege DB role) are database/BFF/CI concerns, not
  frontend ones — nothing in this SPA implements or verifies them. This app's job is limited to
  the parts it can actually affect: resolving the right tenant/realm and sending the right header.
