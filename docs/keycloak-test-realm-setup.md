# Creating a Test Realm, Client, and Users in Keycloak (via the Admin Console)

A from-scratch Keycloak setup you fully control, for testing the login flow
(`spec/KEYCLOAK_SSO.md`) and the Lambda Authorizer (`docs/aws-api-gateway-lambda-authorizer.md`)
end to end. Written for the **new Keycloak admin console** (the React-based one, Keycloak ~19+) —
if your instance shows the older AngularJS console, the same settings exist under slightly
different menu names.

**Why a new realm, not the shared `Corenroll-Test` one:** that realm is shared QA infrastructure
this project doesn't control, and it's already missing the client we need (the "Client not found"
issue from earlier). A realm you create yourself has none of those gaps and is safe to experiment
in without asking anyone.

---

## 0. If you don't have a Keycloak instance to experiment in yet

Run one locally with Docker — takes about a minute, fully disposable:

```bash
docker run -d --name keycloak-test -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26.0 start-dev
```

Admin console: `http://localhost:8080/admin` (login `admin`/`admin`). Everything below applies the
same whether you're on this local instance or a real one you have admin rights to — just substitute
your own base URL in place of `http://localhost:8080`.

## 1. Create the realm

1. Top-left corner → the realm dropdown (shows **master** by default) → **Create realm**.
2. Realm name: `corenroll-poc` (or any name — it becomes part of the issuer URL and the tenant
   manifest entry, so keep it short and reference it consistently below).
3. **Create**.

## 2. Create the client

**Clients** (left nav) → **Create client**.

**General settings:**
- Client type: `OpenID Connect`
- Client ID: `admin-dashboard` (matches the `clientId` already used in
  `public/tenant-registry.json`'s example entries — reuse it so you don't also have to edit that
  file's structure, just its values)

**Capability config:**
- Client authentication: **Off** (public client — the SPA can't hold a secret)
- Authorization: Off
- Authentication flow: check **Standard flow** only. Uncheck **Direct access grants** (see the
  note in §6 if you want it temporarily for CLI testing).

**Login settings:**
- Root URL: `http://localhost:5173`
- Valid redirect URIs: `http://localhost:5173/*`
- Valid post-logout redirect URIs: `http://localhost:5173/*`
- Web origins: `http://localhost:5173`

**Save.**

### 2a. Require PKCE (Advanced tab)

Client → **Advanced** tab → **Proof Key for Code Exchange Code Challenge Method** → `S256` → Save.
This matches `pkceMethod: 'S256'` already set in `src/main.tsx`.

### 2b. Front-channel logout (Settings tab, further down)

Same **Settings** tab → **Logout settings** → **Front channel logout**: On → **Front-channel
logout URL**: `http://localhost:5173/logout-callback` (matches the route `src/pages/LogoutCallback.tsx`
handles). Save.

## 3. The one critical, easy-to-miss step: fix the `aud` claim

**Without this, every token Keycloak issues will fail verification** — not because anything here
is misconfigured, but because Keycloak's default access token doesn't include your client's ID in
`aud` unless you tell it to. `lambda-authorizer/src/verifyToken.ts` checks
`audience: tenant.keycloak.clientId` — if `aud` doesn't contain it, `jose` rejects the token and the
authorizer denies every request, with no indication in the response of why.

**Client scopes** (left nav) → click **`admin-dashboard-dedicated`** (the dedicated scope Keycloak
auto-created for this client) → **Mappers** tab → **Add mapper** → **By configuration** →
**Audience**.
- Name: `aud-admin-dashboard`
- Included Client Audience: select `admin-dashboard` (this client itself)
- Add to ID token: off · Add to access token: **on**

**Save.**

## 4. Add the custom claims this app reads (`persona`, `party_id`)

Per `spec/KEYCLOAK_SSO.md` §4 and the decision in `spec/MULTI_TENANT_INTEGRATION.md` §3.4/§5,
`src/hooks/useAuth.ts` and `lambda-authorizer/src/verifyToken.ts` both read `persona` and
`party_id` from the token. Neither exists on any token until you add a mapper for each, the same
place as the audience mapper above:

**Client scopes → `admin-dashboard-dedicated` → Mappers → Add mapper → By configuration → User
Attribute**, twice:

| | Mapper 1 | Mapper 2 |
|---|---|---|
| Name | `persona` | `party-id` |
| User Attribute | `persona` | `party_id` |
| Token Claim Name | `persona` | `party_id` |
| Claim JSON Type | String | String |
| Add to access token | On | On |

If the **Attributes** tab on a user (next step) doesn't show a free-text field to add a new
attribute name, the realm has User Profile validation on — go to **Realm settings → User profile →
Create attribute**, add `persona` and `party_id` (Permissions: at least "Admin" can view/edit), and
the free-text option on users disappears in favor of these two showing up as proper fields instead.

## 5. Create test users

**Users** (left nav) → **Add user**, twice:

| | User 1 | User 2 |
|---|---|---|
| Username | `test-admin` | `test-agent` |
| Email | `test-admin@corenroll-poc.test` | `test-agent@corenroll-poc.test` |
| Email verified | On | On |

**Create** → **Credentials** tab → **Set password** → any value → **Temporary: Off** (so you're
not forced through a change-password flow on first login) → Save.

**Attributes** tab (or **Details**, depending on version) → add:

| | User 1 (`test-admin`) | User 2 (`test-agent`) |
|---|---|---|
| `persona` | `admin` | `agent` |
| `party_id` | `party-001` | `party-002` |

Two users with different `party_id` values is deliberate — it's what lets you actually exercise the
"tenant A's token must never produce tenant B's identity" isolation logic later, even within one
realm.

## 6. Get a token and check it

**Fastest way — through the actual app:** run the dashboard (`npm run dev`), click Login, sign in
as `test-admin`. You'll hit the "Client not found"-style errors from earlier if this new realm/client
isn't yet wired into `public/tenant-registry.json` — see §7 below first.

**Faster way to just eyeball the token, bypassing the SPA entirely:** temporarily flip **Direct
access grants** back to **On** for this client (Clients → admin-dashboard → Capability config),
then:

```bash
curl -s -X POST "http://localhost:8080/realms/corenroll-poc/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=admin-dashboard" \
  -d "username=test-admin" \
  -d "password=<the password you set>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

Paste the resulting token into [jwt.io](https://jwt.io) (or `pbpaste | cut -d. -f2 | base64 -d`) and
confirm the payload has `aud` including `admin-dashboard`, plus `persona` and `party_id`. **Turn
Direct access grants back Off afterward** — it's a real weakening of the client's security posture
(password-based token issuance bypasses the browser login page entirely), fine to flip on briefly
for this one check, not something to leave on.

## 7. Wire this realm into the repo

Two places expect the *old*, currently-broken `qa-sso.corenroll.com` / `Corenroll-Test` /
`nuera-enrollment-proto` combination — point them at what you just built instead:

**`admin-poc-fe/public/tenant-registry.json`** (the SPA's realm resolution — see
`src/tenant/resolveTenant.ts`):
```json
"localhost:5173": {
  "tenantId": "corenroll",
  "brand": "CoreEnroll (local dev)",
  "keycloak": {
    "url": "http://localhost:8080",
    "realm": "corenroll-poc",
    "clientId": "admin-dashboard"
  }
}
```

**The Lambda authorizer's tenant manifest** (whatever `TENANT_MANIFEST_URL` points to — see
`docs/aws-console-deploy.md` §1 or `infra/README.md`) needs the realm's exact issuer URL, which you
can confirm at `http://localhost:8080/realms/corenroll-poc/.well-known/openid-configuration`
(field `"issuer"`):
```json
{
  "corenroll.admin.poc": {
    "tenantId": "corenroll",
    "brand": "CoreEnroll (POC)",
    "issuer": "http://localhost:8080/realms/corenroll-poc",
    "keycloak": { "url": "http://localhost:8080", "realm": "corenroll-poc", "clientId": "admin-dashboard" }
  }
}
```

**If Keycloak is running locally and the Lambda authorizer runs in AWS**, `http://localhost:8080`
is not reachable from AWS — tunnel it (same approach as tunneling the BFF in the earlier
conversation) and use the tunnel's public URL as both the realm's base URL *and* everywhere above
that currently says `http://localhost:8080`. The issuer string baked into every token is whatever
base URL Keycloak thinks it's running at when it issues the token, so this has to be consistent —
if you change it, existing tokens issued under the old URL stop matching.

## 8. Troubleshooting checklist

| Symptom | Likely cause |
|---|---|
| Login redirects but comes back with an error immediately | Redirect URI mismatch — check it's exactly `http://localhost:5173/*`, including the trailing `/*`. |
| Authorizer denies every request, logs say `token_verification_failed` | Almost always the missing Audience mapper (§3) — decode the token and check `aud`. |
| `persona`/`party_id` come back `undefined` in `useAuth()` or the Lambda | Mapper not added, or "Add to access token" left off, or the user has no value set for that attribute. |
| CLI password-grant curl returns `unauthorized_client` | Direct access grants is still Off — expected; only needed for §6's shortcut. |
| Everything works locally but not through the Lambda authorizer in AWS | Issuer URL mismatch — the realm's `http://localhost:8080` isn't reachable from AWS; see the tunnel note in §7. |
