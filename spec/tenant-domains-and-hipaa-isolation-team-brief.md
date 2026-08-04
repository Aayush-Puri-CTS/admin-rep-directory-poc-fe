# Tenant Domains, Branding & HIPAA Data-Isolation — Team Brief

**Type:** Standalone team brief (self-contained) · **Status:** proposed · **Date:** 2026-07-17
**Audience:** engineering, DevOps/Infra, architecture, product/compliance
**Scope:** how each of our 100+ clients reaches their front-end (domain + branding), and where their PHI lives (data isolation + HIPAA), in the V2 multi-tenant platform.

> **Read this if** you're asking any of: *"Does every client get their own domain?" · "We share one database — is that HIPAA-OK?" · "Do we need a database per client?" · "Doesn't multi-tenant break the white-label brand?"* This brief answers all of them in one place. No prior docs required.

---

## What we're building

We're replacing V1's model — a **separate app, repo, and database for every client** (CoreEnroll, IHA, EnrollBible each ran their own copy) — with **one multi-tenant platform** that serves all 100+ clients from a single codebase and shared services. Adding a client becomes **configuration** (a registry entry + a login realm + which apps they're allowed), not a new build or deployment.

That shift raises exactly two questions for every client, and this brief answers both:

1. **Branding** — each client still needs *their* brand in the URL their reps and members visit, even though everyone shares one platform.
2. **Health data (HIPAA)** — each client's PHI must stay private and separate, even though it now lives in a shared database.

**The goal: keep the two things V1 gave us — client branding and data isolation — without going back to running 100 separate systems.**

---

## TL;DR — the decisions

1. **Two things people keep confusing are actually separate decisions:**
   - **(A) Domain / brand** — the URL a client's reps/members visit.
   - **(B) Data isolation** — where that client's PHI physically lives.
   A client's domain says **nothing** about where their data is stored. We decide A and B **independently, per client**.

2. **Domains (A):** **client-owned domain is the default** (`register.corenroll.com`) — this is a white-label platform, the client's brand owns the URL. A free **platform-subdomain fallback** (`corenroll.register.<platform>`) covers day-1 onboarding and clients who don't care about branding. **Not every client is forced onto their own domain.**

3. **Data (B):** **one shared database with Row-Level Security (RLS)** for everyone (the "Pool" model). This **is HIPAA-compliant** — HIPAA does **not** require a database per client. A dedicated database ("Silo") is a **premium exception**, given only to a client who puts physical isolation in a **contract** — never because they want their own domain.

4. **Certs:** issued and renewed **automatically** by an automation our DevOps team builds once — **not** hand-issued per client. Manual cert ops at 100+ tenants is the thing we're avoiding.

Everything below is the "why" and the "how."

---

## 1. The core idea: two independent axes

Because V1 bundled everything per client (own domain **and** own database), people assume the two still travel together. **They don't.** In V2 they're two separate decisions, made **per client:**

| Axis | The question it answers | Default | Premium/other option |
|---|---|---|---|
| **A — Domain / brand** | How the browser reaches the front-end; whose brand is in the URL | Client-owned domain | Platform-subdomain fallback |
| **B — Data isolation** | *Where the PHI physically lives* and how tenants stay separated | Shared DB + RLS (Pool) | Dedicated DB (Silo) — on contract only |

**The rule to remember:** `register.corenroll.com` (their brand) can — and by default does — sit on the **shared** database. Branding is cheap configuration. Physical data isolation is an expensive, contract-driven choice. Keep them decoupled.

Here is every realistic combination:

| Client profile | Axis A — Domain | Axis B — Data |
|---|---|---|
| Doesn't care about branding (some won't) | Platform subdomain (free, instant) | Shared DB + RLS |
| Wants their own brand (most will) | **Own domain** | Shared DB + RLS |
| Contractually requires physical isolation | Own domain | **Dedicated DB (Silo)** |

---

## 2. From V1 to V2 — what changes and why

| | V1 (legacy Nuera) | V2 (Halostream) |
|---|---|---|
| Per client | Own repo + own domain + own database + own ecosystem | One shared platform; a client is **configuration**, not a deployment |
| Adding a client | An engineering/deploy project | A registry row + a Keycloak realm + entitlements (+ optionally their domain) |
| Isolation | **Accidental** — separation because everything was physically separate | **Deliberate** — separation by RLS + controls, with optional physical Silo |
| Cost at 100+ clients | 100 stacks to run, patch, deploy | One fleet, one migration, one patch |

The rest of the brief is the *how*: keeping the branding (Axis A, §3) and the isolation (Axis B, §4) that V1 got from physical separation — now via per-client domains and RLS + controls instead of 100 separate stacks.

---

## 3. Axis A — Domains & branding

### 3.1 Default: the client owns the domain

Every real client registers/logs in on **their own domain** — `register.<theirbrand>.com`. This is a white-label platform for insurance carriers/partners: their reps and members must see **the client's** brand in the URL, not ours. Legacy already did this (`reps.corenroll.com`), and clients expect it. A vendor name in the URL leaks the vendor relationship and breaks the client's brand promise — for this business that's a product defect, not cosmetics.

> **Why not just give everyone one platform domain with the tenant attached — `corenroll.register.<platform>` — and skip custom domains?** Because that stamps **our** vendor name into every client's URL, which is the exact thing a white-label client pays us to avoid; it also weakens trust and email deliverability for their reps/members (a shared vendor domain instead of the client's own). We *do* keep that shape — but only as the **fallback** (§3.2), for day-1 onboarding and clients who don't care about branding. It's a good safety net, not a good default.

### 3.2 Fallback: a free platform subdomain for every tenant

Every tenant *also* automatically gets `<tenant>.register.<platform>` (e.g. `corenroll.register.<platform>`), covered by one wildcard certificate. It's used for:
- **Day 1**, before the client's own DNS + certificate are ready (these take time and need the client's cooperation).
- **Internal / test / staging** tenants and demos.
- Clients who genuinely **don't want** their own branded URL.

A tenant can start on the fallback and **move to its own domain later with just a configuration change** — no redeploy, no data migration.

### 3.3 The two tiers side by side

```
Default (client-facing, every real client):
    register.corenroll.com/rep         ← CoreEnroll on their own brand

Fallback (automatic, free, every tenant):
    corenroll.register.<platform>/rep  ← CoreEnroll on day 1, before their domain is set up
    iha.register.<platform>/rep        ← IHA — hasn't set up (or doesn't want) its own domain
      • day-1 bootstrap while a client's own domain is being set up
      • a client that never asks for its own brand in the URL
      • internal / test / staging
```

**Read the two IHA-vs-CoreEnroll cases as the two business situations:**

- **CoreEnroll** wants its brand in the URL → lives on `register.corenroll.com`, but was usable from **day 1** on `corenroll.register.<platform>` while its domain was being set up.
- **IHA** either hasn't gotten around to its own domain or doesn't care → **stays on** `iha.register.<platform>` indefinitely. It's a fully working tenant — same platform, IHA branding, IHA data — just without a custom URL. Nobody is forced onto their own domain.

Both point at the **same single front-end + service**. Nothing is duplicated per client — the difference is only which URL the client's people type.

### 3.4 Naming rule: use a flow-neutral host, not `reps.`

The rep-vs-group split lives on the **URL path** (`/rep`, `/group`), not the subdomain. So the client picks a **flow-neutral** label — `register.` / `enroll.` / `signup.` — **not** `reps.`. A legacy-style `reps.corenroll.com` means "rep only," so a group applying at `reps.…/group` reads wrong. (If a client contractually insists on the literal `reps.` label it still works — it's just a config row — but it isn't our standard.)

### 3.5 Certs are automated, not hand-issued — this is the important part

"DevOps handles the certs" must mean **DevOps builds automation that issues and renews certs**, *not* DevOps issuing each client's cert by hand. Certificates expire (~every 90 days); at 100+ client domains, manual issuance/renewal becomes a full-time job and every missed renewal is an outage. The automation (see §5) makes onboarding a client = *a config row + the client's DNS record*, with the cert issued automatically in minutes.

---

## 4. Axis B — Data isolation & HIPAA

### 4.1 The model: one shared database, separated by RLS

Every service uses one shared database. Each row carries a `tenant_id`, and **Row-Level Security (RLS)** in the database ensures a query for tenant A can only ever see tenant A's rows. This is the "Pool" model — one deployment, tenant-aware, scoped by `tenant_id`.

**What this looks like in practice.** Two clients' reps live in the *same* `party` table:

| id | tenant_id | name | ssn (encrypted) |
|---|---|---|---|
| 1 | `corenroll` | Jane Rep | ••••• |
| 2 | `corenroll` | Bob Rep | ••••• |
| 3 | `iha` | Amy Rep | ••••• |

A request that arrived on `register.corenroll.com` runs with `tenant_id = corenroll`. RLS automatically appends `AND tenant_id = 'corenroll'` to **every** query — so even a careless `SELECT * FROM party` returns only rows 1–2, **never** row 3. The *database* enforces this, so a developer who forgets the filter still can't leak IHA's data.

**The bug we're defending against:** if that table were ever created *without* its RLS policy, the same `SELECT * FROM party` would return **all three rows** — CoreEnroll would see IHA's rep. That is the cross-tenant leak §4.3 describes, and it's exactly why control #1 (RLS at the database) and control #6 (isolation tests in CI) are mandatory, not optional.

### 4.2 Yes, this is HIPAA-compliant — HIPAA does not require a DB per client

HIPAA's Security Rule requires **safeguards**, not physical separation per customer:
- Access control, authentication, and minimum-necessary access
- Audit controls (who saw / changed what)
- Integrity controls
- Transmission security (TLS in transit) + encryption at rest
- Business Associate Agreements (BAAs) with infrastructure providers

A shared multi-tenant database that enforces these **is compliant**, and it's how most healthcare SaaS at this scale runs. *(This is architectural guidance — the formal compliance sign-off and the BAAs are owned by Security/Compliance.)*

### 4.3 The real risk is blast radius — and it's why we add controls

The danger of a shared database is not that it's disallowed; it's the **failure mode**:
- **V1 silo:** a tenant-scoping bug leaks a client's data back to *itself*. Contained.
- **Shared Pool:** a **missing RLS policy or an unscoped query can leak client A's PHI to client B** — a multi-tenant breach from one mistake.

The answer is **defense-in-depth**, so no single mistake becomes a cross-tenant leak — **not** reverting to a database per client.

### 4.4 The required controls (defense-in-depth)

| # | Control | Why |
|---|---|---|
| 1 | **RLS at the database**, on `tenant_id`, on every PHI table | A forgotten `WHERE` in app code still can't leak |
| 2 | **`tenant_id` mandatory** on every PHI table and every event message | No un-scoped data can exist |
| 3 | **Group-ID scoping within a tenant** | A tenant isn't the finest grain — stop cross-employer leakage too |
| 4 | **Column-level encryption** for PII/PHI + encryption at rest + TLS everywhere | HIPAA transmission/storage security |
| 5 | **Per-tenant audit** of every PHI read / reveal / export / change | Minimum-necessary + breach forensics |
| 6 | **Automated tenant-isolation tests** in CI | Assert tenant A can never read tenant B; catch RLS regressions before prod |
| 7 | **Least-privilege database role** (never a superuser / RLS-bypassing role) | RLS actually applies to the app's connection |
| 8 | **One Keycloak realm per tenant** | Credentials/sessions isolated by realm |

These are enforced by the **service template + CI tests**, not left to each developer — because a single missed RLS policy is the single biggest risk in the whole model.

### 4.5 When a client *does* get a dedicated database (Silo)

| Tier | Data | For | What triggers it |
|---|---|---|---|
| **Pool (default)** | Shared DB + RLS + controls §4.4 | Every tenant | Default |
| **Silo (premium)** | Dedicated database (+ namespace + dedicated message-bus account) | The specific client requiring physical isolation | A signed **contractual / regulatory** clause — **never** a branding preference |

Silo is deliberate, per-client, and priced as a premium. Most clients — including those on their own domain — stay on Pool.

---

## 5. How a client reaches the right tenant

**One mechanism sits behind both domain tiers.** The platform edge (gateway) figures out the tenant **before** the app runs, from the incoming request's Host, using a **registry** that maps `hostname → tenant_id`:

```
Browser → Host: register.corenroll.com
   Edge looks up  register.corenroll.com → tenant = corenroll  (registry)
   Edge injects   x-tenant-id: corenroll   → forwards to the shared service
   Service writes/reads only tenant=corenroll data (RLS)
```

- The **browser never sets the tenant** (it can't be trusted to). The edge does, from the domain.
- **Unknown/unmapped host → rejected.** No default tenant, and we never reveal which tenants exist.
- Registration is *pre-login*, so the tenant comes from the **domain** (there's no token yet); everywhere else it comes from the login token/realm.

Onboarding a client is therefore **a registry row + their DNS record**, not a code change or redeploy.

**Worked example — the registry and four real requests.** The registry lives in the Control Plane, one row per hostname:

| hostname | tenant_id | brand | tier |
|---|---|---|---|
| `register.corenroll.com` | `corenroll` | NuEra Benefits | client-owned |
| `register.enrollbible.com` | `enrollbible` | EnrollBible | client-owned |
| `iha.register.<platform>` | `iha` | IHA | subdomain fallback |

- **`register.corenroll.com/rep`** → edge matches row 1 → `x-tenant-id: corenroll` → the app themes as "NuEra Benefits" and stores the application under `tenant=corenroll`. The applicant never sees "halostream".
- **`iha.register.<platform>/group`** (IHA hasn't set up their own domain yet) → edge matches the fallback row → `x-tenant-id: iha`. Same platform, IHA branding, IHA data.
- **`register.corenroll.com/rep?inv=<token>`** (recruiter link) → the signed token also carries the upline rep, so the edge sets `x-tenant-id: corenroll` **and** pre-fills who recruited the applicant. (If the token's tenant disagreed with the domain → reject.)
- **`register.random-typo.com`** → no registry row → **rejected**. We don't guess a tenant, and we don't reveal which tenants exist.

**Worked example — onboarding CoreEnroll onto their own domain (no downtime, no redeploy):**

```
Day 0  Tenant created → immediately live on  corenroll.register.<platform>   (usable right now)
Day 0  We send one DNS instruction:  register.corenroll.com  CNAME  ingress.<platform>
Day 1  CoreEnroll's IT adds the record → we verify it resolves to us + their CAA allows our cert authority
Day 1  Cert auto-issues (minutes) → we add registry row  register.corenroll.com → corenroll
Day 1  register.corenroll.com now serves CoreEnroll with a valid cert → made primary; subdomain kept as fallback
```

Applications submitted on the subdomain on Day 0 were already stamped `tenant=corenroll`, so the cutover to the branded domain changes **nothing** about their data.

### 5.2 What DevOps builds (short — full detail is in the spec)

Client-owned domains are made to work by a **one-time automation** the DevOps/Infra team builds; after that every client onboards hands-off. It's three pieces:

- **A wildcard cert** for the free subdomain fallback, so every tenant works instantly.
- **Automated cert issuance + renewal** for client-owned domains — never hand-issued (that doesn't scale to 100+).
- **The `hostname → tenant_id` registry** the edge reads to resolve tenant + branding and to reject unknown hosts.

> The build cards (INFRA-01…07), the cert-engine choice (cert-manager vs Cloudflare-for-SaaS), and the failure modes to handle live in the **Tenant Custom-Domain & TLS Onboarding spec** — this brief deliberately doesn't repeat that infra detail.

---

## 6. Tradeoffs — what each choice costs us

No choice here is free. Here's what we gain and what we give up on each decision, and how we blunt the downside. (This is the honest "why not the other way" section.)

### 6.1 Client-owned domain as the default (vs. platform subdomain for everyone)

| | |
|---|---|
| **We gain** | Client's brand owns the URL (the white-label promise); highest trust + email deliverability (first-party domain); each client is its own domain, so no shared-cookie surface between clients. |
| **We give up** | Onboarding is no longer instant — it waits on the client creating a DNS record + a cert being issued; the cert lifecycle (renewal, monitoring) becomes **our** standing responsibility; new client-side failure modes (their CAA record blocks us, they remove the DNS record later). |
| **How we mitigate** | The **free subdomain fallback** makes clients usable on day 0 while their domain is set up; **cert automation** (not manual issuance) removes the renewal burden; onboarding checks (CAA precheck, DNS verification) + renewal alerting catch the failure modes. |
| **Who it costs** | DevOps/Infra (build + run the automation). |

### 6.2 Shared database + RLS "Pool" (vs. a dedicated database per client)

| | |
|---|---|
| **We gain** | One fleet / one migration / one patch for 100+ clients; adding a client is config, not a deploy; cost scales with aggregate load, not peak-per-client × N. |
| **We give up** | **Blast radius** — one missing RLS policy or unscoped query can leak client A's PHI to client B (in V1 silos a bug was contained to one client); correctness now depends on **discipline** (RLS + `tenant_id` everywhere + tests), not on physical separation; noisy-neighbor load is shared. |
| **How we mitigate** | The defense-in-depth controls in §4.4 (DB-enforced RLS, mandatory `tenant_id`, isolation tests in CI, least-privilege DB role, audit) — enforced by the service template, not left to individuals; the **Silo tier** as an escape hatch for a client who contractually needs physical isolation; rate-limits/queue-partitioning for noisy neighbors. |
| **Who it costs** | Every engineer (must follow the template); QA/DevOps (own the isolation tests + audit). |

### 6.3 One shared platform (vs. V1's per-client stacks)

| | |
|---|---|
| **We gain** | No 100× sprawl to run, patch, and keep on-standard; a service can't drift into 100 divergent copies. |
| **We give up** | A bad deploy or migration can affect **all** tenants at once (V1's silos limited a bad change to one client); no "just fork it for this client" — per-client differences must be expressed as **configuration/entitlements**, not code branches. |
| **How we mitigate** | Standard CI gates + staged rollouts; per-client variation handled by the App Catalog (entitlements) and per-tenant theming/config; Silo for the genuine exception. |
| **Who it costs** | Product (must model client differences as config); DevOps (release safety). |

**The through-line:** every tradeoff we accepted trades *physical separation* (V1's expensive default) for *deliberate controls + a premium escape hatch*. We keep V1's two good properties — branding and isolation — and pay for them with **discipline and automation** instead of **100 duplicated stacks**.

---

## 7. Decisions & open items

**Decided (proposed):**
- Client-owned domain is the **default**; platform subdomain is the **fallback**. Not every client is forced onto their own domain.
- **Shared DB + RLS (Pool)** for everyone; **do not** rebuild V1's per-client databases for HIPAA.
- **Silo (dedicated DB)** only on a contractual/regulatory clause.
- Certs are **automated**, built once by DevOps.
- Flow-neutral host label (`register.`), not `reps.`.

**Still open (needs an owner/decision):**
- **Cert engine:** cert-manager vs Cloudflare-for-SaaS — decide against our current edge/WAF setup (tracked in the DevOps spec).
- **Who runs onboarding:** DevOps-assisted per client, or a self-service custom-domain screen in the admin UI (matters at 100+ clients).
- **`<platform>` apex name:** needed for the wildcard cert and internal tenants, even though it never faces clients (project = Halostream V2).
- **Compliance ownership:** who owns the tenant-isolation CI test suite, the PHI audit coverage, and the HIPAA sign-off + BAAs.
- **Renewal-failure policy:** notification + grace behavior before a lapsed client cert takes their host offline.

---

## 8. One-line answers to the questions that started this

- **"Does every client get their own domain?"** — By default yes, but it's optional; the free subdomain covers anyone who doesn't want one.
- **"We share one database — is that HIPAA-OK?"** — Yes, with RLS + the §4.4 controls. HIPAA doesn't require a DB per client.
- **"Do we need a database per client?"** — No. Only for a client who contractually requires physical isolation (Silo), as a premium.
- **"Who handles the certs?"** — DevOps, via automation built once — not hand-issued per client.
- **"Doesn't multi-tenant break the white-label brand?"** — No; the client's own domain gives them their brand while their data sits on the shared, RLS-isolated platform.

---

*Source/detail docs (for those who want the deep dive): the Multi-Tenancy & App-Entitlement Model (§7 HIPAA), the Per-Tenant Domain & TLS Strategy decision, the Tenant Custom-Domain & TLS Onboarding spec, and the Rep/Group Registration HLD (§4). This brief stands on its own; those add implementation depth.*
