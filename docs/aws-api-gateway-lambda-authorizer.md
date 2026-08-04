# AWS API Gateway + Lambda Authorizer — Implementation Plan for the Admin BFF

**Type:** Standalone team brief (self-contained) · **Status:** plan written, reference
implementation built, not yet deployed · **Date:** 2026-07-17
**Audience:** DevOps/Infra, backend engineering, security
**Scope:** the concrete steps to stand up the API Gateway + Lambda Authorizer that
`spec/api-spec.md` §2 and `spec/MULTI_TENANT_INTEGRATION.md` describe as the *intended* production
design but that doesn't exist anywhere yet — today this BFF trusts an unauthenticated
`X-Tenant-Id` header from whoever sends one.

> **A working implementation of this plan now exists in this repo:**
> [`lambda-authorizer/`](../lambda-authorizer) (the authorizer function — verified with unit tests,
> real `tsc`/`vitest` runs, no live AWS needed) and [`infra/`](../infra) (the CDK v2 stack — verified
> with a real `cdk synth`, not just written and assumed correct). Neither has been deployed against
> a real AWS account. Every section below still describes the *design*; the two linked folders are
> that design *built*, and each README explains what was and wasn't possible to verify without a
> real account. If CloudFormation/CDK deploy access isn't available but plain Lambda + API Gateway
> console access is, [`docs/aws-console-deploy.md`](./aws-console-deploy.md) covers the same POC
> architecture built by hand instead — including a pre-bundled, ready-to-upload zip of the
> authorizer, since the console's inline editor can't handle its `jose` dependency.

> **Read this if** you're the one building the Gateway/Authorizer, or reviewing what it needs to
> do before this admin dashboard (or any other client of the BFF) can be trusted in production.
> No prior infra docs required, though it draws directly on `spec/api-spec.md`,
> `spec/KEYCLOAK_SSO.md`, `spec/MULTI_TENANT_INTEGRATION.md`, and
> `spec/tenant-domains-and-hipaa-isolation-team-brief.md` — cited throughout rather than repeated.

---

## 1. The problem this closes

Today, per `spec/api-spec.md` §2: *"This backend does not verify JWTs... it simply trusts
whatever `X-Tenant-Id` value it's handed."* Anyone who can reach the BFF can set any tenant ID and
read/write that tenant's data — including PHI. That's acceptable only because nothing reaches this
BFF except developers on localhost right now. It is not acceptable once anything real is behind it.

The fix, already named (not yet built) in `spec/MULTI_TENANT_INTEGRATION.md` §1:

```
Browser → Keycloak (login only) → JWT issued
Browser → API Gateway + Lambda Authorizer → BFF → domain services
```

The Authorizer's job: verify the JWT is genuinely signed by a Keycloak realm we control, and only
then inject `X-Tenant-Id` (and role/party identity) — so the BFF never has to trust the browser for
any of it.

---

## 2. TL;DR — the decisions

1. **API Gateway type: HTTP API (v2), not REST API** — cheaper, simpler, and its native routing +
   Lambda-authorizer support is all this needs. REST API only earns its complexity if usage plans,
   API keys, or request/response transformation beyond header injection show up later.
2. **Authorizer type: a custom Lambda authorizer (`REQUEST` type), not the built-in JWT authorizer**
   — the built-in one can verify a token and expose its claims, but it can't reject an unfamiliar
   `iss` before verifying, can't map issuer → tenant_id, and can't be taught the "never reveal which
   tenants exist" rule from the tenant-domains brief. All of that is custom logic, so it belongs in
   one Lambda that does verification *and* tenant mapping together.
3. **The issuer → tenant_id mapping is the *same* registry as the hostname → tenant_id one** —
   confirmed per `spec/MULTI_TENANT_INTEGRATION.md` §2: a **single static JSON manifest in S3
   behind CloudFront**, fetched at boot, **no database, no lookup service**. One Keycloak realm per
   tenant (`spec/tenant-domains-and-hipaa-isolation-team-brief.md` §4.4 control #8) means a realm's
   issuer URL is just another field in the same per-tenant entry the SPA already reads by hostname
   — the Lambda Authorizer fetches and caches that exact file too, keyed by `issuer` instead.
4. **The Gateway injects `X-Tenant-Id` / `X-Role` / `X-Party-Id` by overwriting, not merging** —
   any client-supplied copies of these headers must be stripped before the authorizer's values are
   set. This is the one step that, if skipped, silently reopens the exact hole this whole doc exists
   to close.
5. **Local dev runs the same Gateway + Authorizer, not a bypass** — per
   `spec/MULTI_TENANT_INTEGRATION.md` §3.3: *"the backend must be written so it only ever reads
   tenant/role/party from those headers... even in dev, so dev behavior matches prod."*
6. **BFF hosting: EKS, inside a VPC.** The Gateway reaches it via a VPC Link to an internal Network
   Load Balancer in front of the EKS service — never a public endpoint. Closes §5.5/§9's prior open
   item.
7. **Party identity claim: `party_id`, not `user_applicationId`.** Settles
   `spec/MULTI_TENANT_INTEGRATION.md` §3.4/§5's open naming question — the Authorizer extracts
   `party_id` and injects `X-Party-Id` from it. (The Keycloak-side protocol mapper that produces
   this claim still needs to be added — see §3.)
8. **Every cache TTL in this design is a configurable parameter, not a hardcoded constant** — the
   CloudFront manifest cache, the Lambda's in-memory manifest cache, the SPA's manifest re-fetch
   interval, and the API Gateway authorizer response cache all get sensible defaults but are tunable
   per environment without a code change. See §5.3/Step 1/Step 3 and §9.

---

## 3. Current state (what exists today, precisely)

| Piece | Status |
|---|---|
| BFF (`admin-poc`) | Real. `RepController`'s 11 endpoints. Requires `X-Tenant-Id` header (case as shown), no path prefix, listens on `PORT` (default `3000`). Does **not** verify JWTs — see `spec/api-spec.md` §2. |
| Keycloak SSO | Real server (`qa-sso.corenroll.com`), PKCE public clients, JWKS at `/realms/<realm>/protocol/openid-connect/certs`. One realm per tenant is the stated model (`spec/tenant-domains-and-hipaa-isolation-team-brief.md` §4.4 control #8). |
| Custom token claims | `persona`, `user_applicationId`, `allowed_apps` exist today (`spec/KEYCLOAK_SSO.md` §4). `party_id` is the **decided** name going forward (naming question in `spec/MULTI_TENANT_INTEGRATION.md` §3.4/§5 is closed) — but its Keycloak protocol mapper hasn't been added yet, so no real token carries it today. `user_applicationId` is being retired in its favor, not kept alongside it. |
| BFF hosting | **Decided**: EKS, inside a VPC. See §5.5/Step 4. |
| Tenant registry | **Decided**, per `spec/MULTI_TENANT_INTEGRATION.md` §2: a single static JSON manifest, keyed by hostname, published to **S3 behind CloudFront**, fetched client-side — "zero server-side code, lookups, or database." No dedicated registry service, no DynamoDB. The admin dashboard's local dev copy of this file (`public/tenant-registry.json`) is the same shape this manifest will be in production. |
| API Gateway + Authorizer | **Does not exist.** This document is the plan to build it. |

---

## 4. Target architecture

```
                              ┌─────────────────────────┐
Browser ── login (PKCE) ───▶ │  Keycloak realm (tenant)  │
   │                          └─────────────────────────┘
   │
   │  every other call, Authorization: Bearer <JWT>
   ▼
┌───────────────────────────────────────────────────────────────────────┐
│ API Gateway (HTTP API)                                                 │
│   Lambda Authorizer (REQUEST type)                                     │
│     1. Extract Bearer token                                            │
│     2. Read `iss` from the token (unverified peek)                     │
│     3. iss not in the tenant registry?  → Deny (generic 401/403)       │
│     4. Fetch/cache that issuer's JWKS  → verify signature (RS256)       │
│     5. Check `exp`, `aud` (== this realm's client_id)                   │
│     6. Look up tenant_id for this iss in the tenant registry            │
│     7. Extract role/party claims                                       │
│     8. Return Allow + context { tenantId, role, partyId }               │
│   Integration: overwrite X-Tenant-Id / X-Role / X-Party-Id from context │
└───────────────────────────────────────────────────────────────────────┘
   │
   ▼  X-Tenant-Id, X-Role, X-Party-Id (gateway-set; any client copies stripped)
┌───────────────────┐
│   Admin BFF        │  — unchanged: still just reads these headers, still
│  (RepController)   │    doesn't touch the JWT. Only what it reads is now trustworthy.
└───────────────────┘
```

---

## 5. Design decisions and rationale

### 5.1 HTTP API vs REST API

| | HTTP API (recommended) | REST API |
|---|---|---|
| Lambda authorizer support | Yes (`REQUEST` type) | Yes |
| Cost | ~70% cheaper per request | Higher |
| Needed here | Everything we need | Only if usage plans/API keys/WAF-at-resource-level are required later |

**Decision: HTTP API.** Revisit only if a concrete requirement (e.g. per-client rate-limiting
plans) needs REST-API-only features.

### 5.2 Custom Lambda authorizer vs the built-in JWT authorizer

HTTP API's native JWT authorizer can verify a token against one configured issuer and expose its
claims to the integration — but it cannot: reject an issuer it wasn't told about ahead of time in a
way that supports **adding tenants without a deploy**, look up a tenant_id from that issuer, or
apply the "never reveal which tenants exist" rule with a custom response. Every one of those is a
requirement here, so **one custom Lambda authorizer does verification and tenant mapping together**
— don't split it across a native authorizer plus a second Lambda; that's two places to keep in sync
for one decision.

### 5.3 One file, not two, not a database

`spec/MULTI_TENANT_INTEGRATION.md` §2 decided the SPA's own realm resolution as **a single static
JSON manifest, keyed by hostname, in S3 behind CloudFront** — no server-side lookups, no database.
That decision now extends to this authorizer too: **the same manifest file** is what it fetches and
caches, adding one field (`issuer`) to each tenant's entry so the same object answers both
questions — "which realm does this hostname belong to" (SPA, pre-login) and "which tenant does this
issuer belong to" (Authorizer, post-login) — per the tenant-domains brief's own framing:
*"Registration is pre-login, so the tenant comes from the domain... everywhere else it comes from
the login token/realm."*

**Explicitly not doing:** a second file, a lookup service, or DynamoDB. One manifest, two keys read
out of it. If a hostname and an issuer entry for the same tenant ever drifted apart, that's exactly
the inconsistency this design exists to prevent — keeping them in the same file makes that
structurally hard to do by accident (there's only one place to edit).

```json
{
  "corenroll.admin.<platform>": {
    "tenantId": "corenroll",
    "brand": "CoreEnroll",
    "issuer": "https://qa-sso.corenroll.com/realms/corenroll",
    "keycloak": { "url": "https://qa-sso.corenroll.com", "realm": "corenroll", "clientId": "admin-dashboard" }
  }
}
```

The SPA looks this up by top-level key (hostname); the Authorizer builds its own
`issuer → entry` index once per cold start from the same fetched object (a single `Object.values()`
pass, re-keyed by `.issuer` — see Step 1).

### 5.4 Header injection must overwrite, never merge

API Gateway's integration request parameter mapping supports setting a header from
`$context.authorizer.<key>`. This **must use `overwrite:header.x-tenant-id`** (replacing anything
already on the request), not `append:header.x-tenant-id`. If a client-supplied `X-Tenant-Id` is
merely appended alongside the authorizer's value, a naive backend reading "the first" or "the last"
`X-Tenant-Id` header can be tricked depending on which one wins — don't rely on that; strip and
replace explicitly.

### 5.5 Where the BFF sits

**Decided for production: EKS, inside a VPC.** The BFF is not reachable from the public internet —
the *only* path in is through the Gateway + Authorizer, via a **VPC Link**:

- The BFF runs as an EKS Service, fronted by an **internal Network Load Balancer** (NLB) — the AWS
  Load Balancer Controller provisions this from a `Service` of `type: LoadBalancer` annotated
  `service.beta.kubernetes.io/aws-load-balancer-scheme: internal` (and
  `...-type: nlb`), so it only gets a private VPC IP, never a public one.
- The HTTP API's **VPC Link** resource targets that internal NLB.
- Security group on the NLB's target group should allow inbound only from the VPC Link's ENIs
  (AWS manages these; scope the SG to the VPC Link's security group, not `0.0.0.0/0` or the whole
  VPC CIDR).

**POC exception, added after the fact:** whoever is standing up a POC may have API Gateway and
Lambda access without EKS access. `infra/lib/api-gateway-authorizer-stack.ts` supports a second,
explicitly POC-only mode — a plain `HttpUrlIntegration` to any public URL, skipping VPC Link/NLB
entirely (see `infra/README.md`'s "POC mode" section). Everything else in this design (the
authorizer, the header-overwrite mapping, CORS) is identical in both modes — only *how the Gateway
reaches the BFF* changes. **This mode is not a substitute for the VPC Link path for anything
handling real PHI** — it reintroduces the exact publicly-reachable-BFF exposure this section exists
to close. Use it only to prove the Gateway/Authorizer wiring itself against a throwaway or non-PHI
BFF instance, and switch to the VPC Link mode the moment EKS access exists.

---

## 6. Step-by-step build plan

### Step 1 — Extend the tenant manifest with issuer → tenant_id, and have the Lambda read it

**Implemented:** [`lambda-authorizer/src/manifest.ts`](../lambda-authorizer/src/manifest.ts) — fetch
over HTTPS was the choice made (not direct S3 `GetObject`; see that file's comment for the
tradeoff), with the TTL read from `TENANT_MANIFEST_CACHE_TTL_SECONDS`.

Add an `issuer` field (and the `clientId` expected in `aud`) to each tenant's entry in the same S3
manifest the SPA already reads (§5.3) — no new store to stand up.

The Lambda Authorizer needs read access to that manifest. Two ways to get it, pick one:

- **Fetch over HTTPS from the CloudFront URL** — simplest, same object the browser gets, but adds
  an external network call to a cold Lambda.
- **Fetch directly from S3 via the SDK** (`GetObject`), bypassing CloudFront — lower latency, needs
  an IAM role with read access to that bucket.

Either way: **fetch once per cold start, cache in memory for the life of the execution environment,
and build an `issuer → entry` index from it** (the manifest is keyed by hostname; the Authorizer
just re-indexes the same data by `.issuer` once, rather than scanning it per request). Refresh the
cached copy on a timer rather than never, so a newly onboarded or deboarded tenant is picked up
without waiting for every warm Lambda instance to cycle.

**This refresh interval is a configurable parameter, not a hardcoded constant** — read it from a
Lambda environment variable (e.g. `TENANT_MANIFEST_CACHE_TTL_SECONDS`, defaulted to something
reasonable like `300` in the function's config/IaC) so it can be tuned per environment without a
code change or redeploy. See §9 for the tradeoff this creates against revocation speed, and note it
is one of **three independent cache layers** for the same manifest — this Lambda's copy, CloudFront's
own cache of the S3 object, and the SPA's copy (`src/tenant/resolveTenant.ts`) — each with its own
configurable TTL; there's no single knob that controls all three.

### Step 2 — Build the Lambda Authorizer

**Implemented:** [`lambda-authorizer/src/verifyToken.ts`](../lambda-authorizer/src/verifyToken.ts)
(steps 2–6 below) and [`index.ts`](../lambda-authorizer/src/index.ts)/[`policy.ts`](../lambda-authorizer/src/policy.ts)
(steps 1, 7–8) — `jose` was the library chosen, with `algorithms: ['RS256']` pinned explicitly
(prevents algorithm-confusion attacks; not mentioned in the original plan below, added during
implementation). Covered by [unit tests](../lambda-authorizer/test) that mock `jose`/`fetch` — no
live network calls, no real AWS or Keycloak needed to run them.

Runtime: Node.js/TypeScript. Suggested libraries: `jose` (JWT verify + JWKS) or `aws-jwt-verify`.

Logic, in order — **fail closed at every step**:

1. Extract the Bearer token from the `Authorization` header. Missing/malformed → Deny.
2. Decode (don't yet verify) the JWT to read `iss`.
3. **Look up `iss` in the tenant registry first, before verifying anything.** Unknown issuer → Deny
   immediately. This is the control that stops a validly-signed token from an unrelated Keycloak
   realm (one we don't manage) from ever being considered — signature validity alone is not
   sufficient trust; the issuer must be one of *ours*.
4. Fetch (or use cached) JWKS for that issuer's `/protocol/openid-connect/certs`. Verify RS256
   signature, `exp`, and `aud` (must include that tenant's registered `clientId`).
5. Any failure in step 4 → Deny.
6. Extract `sub`, `persona` (or whichever role claim is finalized), and **`party_id`** — the decided
   claim name (`spec/MULTI_TENANT_INTEGRATION.md` §3.4/§5's naming question is closed). Confirm the
   Keycloak protocol mapper producing `party_id` has actually been added to each tenant's realm/client
   before wiring this — there's nothing to extract from a token that doesn't carry it yet.
7. Return an `Allow` policy with `context: { tenantId, role, partyId }`. Context values must be
   strings (API Gateway Lambda authorizer context values are stringified).
8. On any Deny, return a generic 401/403 — **do not** include which check failed, which issuers are
   known, or any tenant-identifying detail in the response body. Log the detail server-side only.

### Step 3 — Configure API Gateway

**Implemented:** [`infra/lib/api-gateway-authorizer-stack.ts`](../infra/lib/api-gateway-authorizer-stack.ts)
— confirmed via a real `cdk synth` to render `AuthorizerType: REQUEST`, `EnableSimpleResponses:
true`, `AuthorizerPayloadFormatVersion: "2.0"`, and the exact `overwrite:header.x-tenant-id` /
`x-role` / `x-party-id` parameter mappings shown below.

- Create an HTTP API. Add a Lambda authorizer, `REQUEST` type, identity source
  `$request.header.Authorization` (so responses are cached per distinct token — see enable caching
  below).
- **Enable authorizer response caching** (`authorizerResultTtlInSeconds`). **Expose this as a
  deploy-time/IaC parameter, not a hardcoded value** — a suggested default (e.g. `300`) belongs in
  the stack's config, not inlined in the API Gateway resource definition, so it can be tuned per
  environment without touching the Gateway definition itself. This is the standard mitigation for
  the added latency of a full JWKS-verifying Lambda running on every request; balance the chosen
  value against how quickly a revoked/suspended user should actually lose access (§9). This cache is
  distinct from the manifest-refresh TTLs in Step 1 — it caches the *authorizer's decision* for a
  given token, not the tenant manifest.
- Routes: proxy all `/reps/*` (and any future domain-service routes) to the BFF integration.
- Integration request parameter mapping (critical, see §5.4):
  - `overwrite:header.x-tenant-id` ← `context.authorizer.tenantId`
  - `overwrite:header.x-role` ← `context.authorizer.role`
  - `overwrite:header.x-party-id` ← `context.authorizer.partyId`

### Step 4 — BFF integration / networking

**Implemented, both modes:** the same stack file supports either path, chosen by which props are
supplied (see §5.5's POC exception and `infra/README.md`):

- **Production:** imports the NLB listener by ARN and wires the VPC Link/`HttpNlbIntegration` —
  confirmed rendering `ConnectionType: VPC_LINK`, `IntegrationType: HTTP_PROXY` in a real
  `cdk synth`. Provisioning the NLB itself (the EKS/AWS Load Balancer Controller side) is not part
  of this stack and hasn't been built anywhere.
- **POC (no EKS access):** a plain `HttpUrlIntegration` to a supplied public URL — confirmed
  rendering the *same* `IntegrationType: HTTP_PROXY` but with no `ConnectionType`/VPC Link at all,
  and zero `AWS::EC2::*`/`AWS::ElasticLoadBalancingV2::*`/VpcLink resources anywhere in the
  synthesized template. The header-overwrite mapping (§5.4) is identical in this mode — confirmed
  in the same synth run.
- Supplying props for both modes at once, or neither, fails at synth time with a specific error
  rather than silently picking one.

Per §5.5: for production, provision the internal NLB in front of the EKS Service (AWS Load Balancer
Controller, `internal` scheme), create the VPC Link pointing at it, lock its security group to the
VPC Link's own SG, then set the HTTP API's `/reps/*` route integration to that VPC Link.

### Step 5 — CORS

Move CORS from the BFF (`app.enableCors()` reflecting any Origin, per `spec/api-spec.md` §3) to the
Gateway, and **stop reflecting arbitrary origins**. Allow only the known dashboard origin(s) —
sourced from the same tenant/domain registry (the tenant-domains brief §3's hostnames are exactly
the set of legitimate origins). The BFF's current permissive reflection is fine for a lone local
dev frontend; it is not once this Gateway is the front door for 100+ tenant domains.

### Step 6 — Local development parity

Per `spec/MULTI_TENANT_INTEGRATION.md` §3.3: local dev must exercise a **real** Gateway + Authorizer
— the BFF must never fall back to decoding the JWT itself, in any environment. Recommended: run the
same Lambda Authorizer code locally via AWS SAM CLI (`sam local start-api`) or LocalStack, pointed
at the real (or a QA) Keycloak realm's JWKS endpoint, so the exact code path that runs in prod is
what a developer's `npm run dev` talks to.

### Step 7 — Observability & security hardening

- Log every authorizer decision (tenant_id, allow/deny, latency) to CloudWatch — **never log the
  raw token**.
- Alarm on a spike in Deny rate — could mean a misconfigured client, a JWKS outage, or an active
  attack; distinguish these in the log detail even though the caller only ever sees a generic error.
- Cache the last-known-good JWKS per issuer with a longer stale-if-error fallback TTL, so a
  transient Keycloak outage doesn't take down every tenant's API access at once.
- Rate limiting / WAF at the Gateway — per-tenant if the usage-plan/throttling story requires it.

### Step 8 — Rollout & testing checklist

- [x] Unit tests for the authorizer: valid token, expired/bad-signature/wrong-`aud` (mocked
      `jose`), unknown issuer, missing `sub`. See
      [`lambda-authorizer/test`](../lambda-authorizer/test) — 18 tests, all against mocks, no live
      AWS/Keycloak. **Not yet covered**: a real token from a real Keycloak realm (needs the actual
      QA server and a registered client — see the dashboard's own README for that still-open
      blocker), and more than one tenant's worth of real, distinct realms.
- [ ] **Isolation test against real infrastructure** (extends
      `spec/tenant-domains-and-hipaa-isolation-team-brief.md` §4.4 control #6 to the edge): assert a
      tenant-A token can never produce a tenant-B `X-Tenant-Id`. The unit tests confirm the *logic*
      (unknown-issuer path denies before verification), but this needs two real tenant realms and a
      deployed authorizer to be a genuine end-to-end check, not just a unit test.
- [ ] Confirm a forged client-supplied `X-Tenant-Id` header is always overwritten, never merged
      (§5.4) — the CDK synth confirms the *mapping* renders as `overwrite:header.x-tenant-id`
      (not `append:`), but this still needs an actual deployed request to prove API Gateway applies
      it as expected at runtime.
- [ ] Staged rollout: shadow mode first (authorizer runs and logs its decision but the Gateway
      doesn't yet enforce/inject) → then enforce.
- [ ] Confirm the BFF's own CORS reflection (§Step 5) is disabled once the Gateway owns CORS.
- [ ] Deploy `infra/` against a real (non-production) AWS account — everything above this line was
      verified via `tsc`/`vitest`/`cdk synth` only; nothing has run in AWS yet.

---

## 7. Worked example — one authenticated request end to end

```
1. Admin logs into realm `corenroll` (their tenant's realm) via Keycloak PKCE flow.
2. SPA calls GET https://api.<platform>/reps  with  Authorization: Bearer <JWT, iss=.../realms/corenroll>
   (and, today only, a client-supplied X-Tenant-Id — about to be discarded)
3. Gateway invokes the Lambda Authorizer:
     iss = https://qa-sso.corenroll.com/realms/corenroll
     iss found in registry → tenant_id = corenroll, expected clientId = admin-dashboard
     JWKS fetched (cached) → signature valid, exp valid, aud includes admin-dashboard
     role/party extracted from claims
     → Allow, context = { tenantId: "corenroll", role: "admin", partyId: "..." }
4. Gateway forwards to the BFF with:
     X-Tenant-Id: corenroll     (overwritten — any client-sent value discarded)
     X-Role: admin
     X-Party-Id: ...
5. BFF's TenantMiddleware reads X-Tenant-Id exactly as it does today — unchanged code,
   now-trustworthy input.
```

---

## 8. Tradeoffs

| | |
|---|---|
| **We gain** | The BFF's biggest open gap (spec/api-spec.md §2 — no JWT verification, fully-trusted client header) is closed without touching the BFF's own code; one Lambda is the single place tenant/role/party trust is established. |
| **We give up** | Added latency per request (mitigated by authorizer response caching, §Step 3); a new piece of infrastructure to build, test, and keep available (JWKS outages, registry lookups); revocation is only as fresh as the authorizer cache TTL. |
| **How we mitigate** | Caching (both authorizer response and JWKS) tuned against the revocation-freshness tradeoff (§9); stale-if-error JWKS fallback so a Keycloak blip doesn't cascade; isolation tests in CI so a registry or mapping bug is caught before prod, mirroring the discipline already required of the database layer (`spec/tenant-domains-and-hipaa-isolation-team-brief.md` §4.4). |

---

## 9. Open items — need an owner/decision before or during build

**Resolved since the previous version of this doc:**

- ~~BFF hosting/networking~~ → **EKS in a VPC**, VPC Link to an internal NLB (§5.5).
- ~~`party_id` vs `user_applicationId`~~ → **`party_id`** (§2, Step 2). The claim name is decided;
  the Keycloak protocol mapper that produces it still needs to be built per tenant realm — that's
  implementation work, not an open decision.
- ~~Manifest refresh cadence / authorizer cache TTL~~ → **all made configurable parameters**
  (Step 1, Step 3) rather than left undecided. This doesn't remove the underlying tradeoff, it just
  means the tradeoff is tuned via config instead of blocking the build — see the still-open item
  right below for what actually needs a number chosen.

**Still open:**

- **Actual TTL values.** "Configurable" answers *how* each cache's lifetime is controlled, not *what
  it should be set to*. Four independent knobs, each trading freshness against cost/latency, still
  need real numbers before launch:
  1. CloudFront's cache of the S3 manifest object.
  2. Each warm Lambda's in-memory copy of that manifest (`TENANT_MANIFEST_CACHE_TTL_SECONDS`).
  3. The SPA's in-tab copy (`VITE_TENANT_MANIFEST_TTL_SECONDS`, see the dashboard's own README).
  4. API Gateway's cache of the authorizer's *decision* per token (`authorizerResultTtlInSeconds`)
     — a related but separate question from 1–3, since it caches a verdict, not the manifest data
     the verdict was based on.

  The concrete risk to size all four against: how long a just-suspended or just-deboarded tenant
  could keep authenticating/authorizing successfully after that change is made, in the worst case
  (all four caches simultaneously at their max age). Whoever owns tenant offboarding SLAs should set
  these, not infra alone.
- **CORS origin list source**: should be generated from the same tenant manifest (§Step 5), not
  maintained by hand a second time.
- **Rate limiting / WAF policy**: per-tenant throttling isn't specified; add if/when a noisy-tenant
  incident (or a contractual SLA) requires it.

---

*This plan intentionally does not repeat the tenant/domain model (see
`spec/tenant-domains-and-hipaa-isolation-team-brief.md`), the Keycloak client setup (see
`spec/KEYCLOAK_SSO.md`), or the BFF's own contract (see `spec/api-spec.md`) — it only adds the
Gateway + Authorizer layer that sits between them.*
