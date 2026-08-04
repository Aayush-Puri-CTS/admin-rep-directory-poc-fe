# API spec — Admin Application BFF (for the React dashboard build)

This document is a handoff spec for building a separate React dashboard against the Admin
Application backend-for-frontend (BFF) in this repo (`admin-poc`). It's written to be read on its
own, without access to this codebase — if you're a Claude Code session building the dashboard,
this file plus `docs/openapi.json` (the exact machine-generated schema) is everything you need to
start.

**Read the "Auth & tenant model" section before writing any API client code** — it's not what the
architecture docs describe as the end state; it's what's actually implemented today.

---

## 1. Overview

- **What it is**: the write model for a Party-Role/Party-Relationship directory (Reps — agents,
  brokers, GAs, MGAs — their business info, platform access, licenses, and Group/Employer
  relationships).
- **Base URL**: `http://localhost:3000` — there is **no global path prefix** (routes are `/reps`,
  not `/api/reps`).
- **Swagger UI**: `/api/docs` (when the server is running).
- **Machine-readable schema**: `docs/openapi.json` in this repo, generated directly from the
  running server's `/api/docs-json` endpoint — treat it as the source of truth for exact field
  types; this document explains what the schema doesn't (auth, gaps, suggested structure).

---

## 2. Auth & tenant model — how it actually works today

Every request must carry an `X-Tenant-Id` header. A global middleware (`TenantMiddleware`) reads
it before any route handler runs; if it's missing or empty, the response is:

```
400 Bad Request
{ "message": "X-Tenant-Id header is required", ... }
```

Every endpoint below requires this header — it's not repeated per-endpoint below.

### This backend does not validate JWTs

This is the important part: **there is no JWT verification, no Passport strategy, no auth guard,
and no auth-related dependency anywhere in this backend.** It was confirmed by grepping the entire
source tree and `package.json` — nothing.

The *documented, intended production design* (this repo's ADR-002 and CLAUDE.md) is:

```
Browser → Keycloak SSO login → JWT issued
        → request to a platform API Gateway
        → Lambda Authorizer validates the JWT, reads the issuer claim
        → injects X-Tenant-Id header
        → forwards to this BFF
```

That Lambda Authorizer is **platform infrastructure that lives entirely outside this repo**. This
backend simply trusts whatever `X-Tenant-Id` value it's handed — it has no way to tell the
difference between a value injected by a real authorizer and one typed in by hand. (There's also a
`keycloak/` folder in this repo; it's currently empty — not a working local Keycloak setup, just a
placeholder for one.)

### What this means for the dashboard, right now

There is no token-issuing flow to integrate against locally yet. Don't build a Keycloak/OIDC login
flow expecting it to work end-to-end — there's nothing on the other end of it in this environment.

**Recommended interim approach:**

1. Build a minimal "tenant switcher" — a text input or dropdown where the user enters/picks a
   tenant ID (e.g. `dev-tenant`), stored in memory or `localStorage`.
2. Send that value as the `X-Tenant-Id` header on every API request, via a single API-client
   interceptor (an axios interceptor or a `fetch` wrapper) so it isn't repeated at every call site.
3. Label this clearly in the dashboard's own README as a **development-only stand-in for SSO** —
   not production auth. When the real Lambda Authorizer exists, this whole mechanism goes away and
   the header is injected upstream instead.

(`OUTBOX_RELAY_TENANT_IDS` is an unrelated backend-only env var for this service's background
outbox relay — the frontend never touches it.)

---

## 3. Running this BFF locally

CORS is enabled and a `start:dev` script exists (both were fixed as of 2026-07-17). To run it
locally (this repo's own `docker-compose.yml` is currently an empty stub, so Postgres/NATS need
to be running some other way — see that repo's README "Getting started" section for the exact
images/ports in use):

```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy
# requires DATABASE_URL, NATS_URL in .env, and Postgres + NATS already running
pnpm run start:dev      # ts-node, no build step
# or: pnpm build && pnpm start
```

Server listens on `PORT` env var, defaulting to `3000`.

**CORS**: `app.enableCors()` in `main.ts` reflects the request's own `Origin` header back when
`CORS_ORIGIN` is unset — fine for a single local dev frontend on any port. If the BFF team locks
this down for a shared/deployed environment, set `CORS_ORIGIN` to a comma-separated list of exact
dashboard origins (e.g. `CORS_ORIGIN=https://dashboard.example.com`) — confirm with them before
assuming the permissive local-dev default still applies outside your own machine.

---

## 4. API contract

Only **`RepController`** is implemented. `EnrollmentController` and `HealthController` exist as
files but are empty stubs with zero routes — **there is no Enrollment API and no health-check
endpoint today**, despite what the file tree might suggest. Don't build against endpoints that
don't exist yet; check back with the BFF team before assuming Enrollment support.

All bodies/queries are validated with `whitelist: true, forbidNonWhitelisted: true` — sending an
unrecognized field returns `400`, not a silently-ignored field.

| Method | Path | Purpose | Request | Success | Errors |
|---|---|---|---|---|---|
| POST | `/reps` | Create a Rep | `CreateRepBodyDto` (body) | `201` `{ repId: string }` | `400` |
| GET | `/reps/search` | Search/filter Reps | `SearchRepsQueryDto` (query) | `200` `RepSummaryView[]` | `400` |
| GET | `/reps` | Paginated Rep directory | `DirectoryQueryDto` (query) | `200` `RepDirectoryPage` | `400` |
| GET | `/reps/:repId` | Get one Rep | `repId` (path) | `200` `RepDetailView` | `404` |
| PATCH | `/reps/:repId/personal-info` | Replace personal info | `repId` + `UpdatePersonalInfoBodyDto` | `204` | `400`, `404` |
| PATCH | `/reps/:repId/business-info` | Replace business info (send `businessInfo: null` to remove) | `repId` + `UpdateBusinessInfoBodyDto` | `204` | `400`, `404` |
| PATCH | `/reps/:repId/access-control` | Replace all platform access entries (full replacement, not merge) | `repId` + `UpdateAccessControlBodyDto` | `204` | `400`, `404` |
| DELETE | `/reps/:repId` | Soft-delete a Rep (data retained, recoverable) | `repId` (path) | `204` | `404` |
| POST | `/reps/:repId/restore` | Restore a soft-deleted Rep | `repId` (path) | `204` | `404` |
| POST | `/reps/:repId/groups` | Link a Rep to a Group (Employer) | `repId` + `LinkRepToGroupBodyDto` | `201` `{ relationshipId: string }` | `400`, `404` |
| GET | `/reps/:repId/groups` | Groups serviced by a Rep | `repId` (path) | `200` `ServicedGroupView[]` | `404` |

`GET /reps/search` is intentionally routed before `GET /reps/:repId` to avoid the literal string
`search` being captured as a `repId` path param — a detail to preserve if you ever proxy/rewrite
these paths.

Note: `/reps` (`GET`) has no default `page`/`pageSize` applied by the DTO itself — confirm current
defaults against `docs/openapi.json` / the running server rather than assuming `page=1, pageSize=20`
client-side.

---

## 5. Request DTOs (exact fields, types, validation)

```
CreateRepBodyDto
  firstName: string            required, min length 1
  lastName: string             required, min length 1
  middleName?: string
  email: string                required, must be a valid email
  cellPhone?: string
  telephone?: string
  fax?: string
  num800?: string
  dateOfBirth?: string          ISO 8601 date string
  ssn?: string
  businessName?: string
  businessTaxId?: string
  businessEmail?: string        must be a valid email if present
  uplineRepId?: string           UUID
  repType?: RepType              see enums below

DirectoryQueryDto (query params — all optional)
  page?: number       integer, >= 1
  pageSize?: number   integer, 1–100

SearchRepsQueryDto (query params — all optional, AND-combined)
  name?: string
  email?: string
  status?: RepStatus
  repType?: RepType
  businessName?: string

LinkRepToGroupBodyDto
  groupId: string        required, UUID (no Group-search API exists yet — this is a raw ID input)
  startDate?: string     ISO 8601 date string, defaults server-side to now

UpdateAccessControlBodyDto
  entries: PlatformAccessEntryDto[]   full replacement of all platform access, not a merge

PlatformAccessEntryDto
  platform: RepPlatform
  accessType: PlatformAccessType

UpdateBusinessInfoBodyDto
  businessInfo: BusinessInfoDto | null   send null to remove business info entirely

BusinessInfoDto
  businessName: string     required, min length 1
  businessTaxId?: string
  businessEmail?: string   must be a valid email if present

UpdatePersonalInfoBodyDto
  firstName: string        required, min length 1
  lastName: string         required, min length 1
  middleName?: string
  email: string            required, must be a valid email
  cellPhone?: string
  telephone?: string
  fax?: string
  num800?: string
  dateOfBirth?: string     ISO 8601 date string
  ssn?: string
```

## 6. Response shapes

```
RepSummaryView
  repId: string
  firstName: string
  lastName: string
  email: string
  repType: RepType | null
  status: RepStatus
  businessName: string | null
  isEliteBlue: boolean
  createdAt: Date

RepDetailView extends RepSummaryView, plus:
  middleName: string | null
  cellPhone: string | null
  telephone: string | null
  fax: string | null
  num800: string | null
  dateOfBirth: Date | null
  businessTaxId: string | null
  businessEmail: string | null
  bio: string | null
  uplineRepId: string | null
  platformAccess: Array<{ platform: RepPlatform; accessType: PlatformAccessType }>
  updatedAt: Date

RepDirectoryPage
  items: RepSummaryView[]
  total: number
  page: number
  pageSize: number

ServicedGroupView
  groupId: string
  relationshipType: PartyRelationshipType
  startDate: Date
  endDate: Date | null
```

---

## 7. Enums (exact string values)

```
RepStatus:            PENDING_APPROVAL | ACTIVE | SUSPENDED | SOFT_DELETED
RepType:               AGENT | BROKER | GA | MGA | SUPER_GA
RepPlatform:           ENROLLPRIME | EXTRA_HEALTH | ASSURE_HEALTH
PlatformAccessType:    ENABLED | DISABLED           (all platforms default to DISABLED on create)
PartyRelationshipType: SERVICES_GROUP               (currently the only value used)
```

`RepAddressType` (`MAILING | BUSINESS | HOME | BILLING`) exists in the backend's domain model but
isn't wired to any endpoint yet — **don't build a dropdown or form field for it**; it's reserved
for a future Rep-address API that doesn't exist today.

---

## 8. Suggested dashboard pages

A starting structure, not a spec to follow exactly — adjust freely once you're building:

- **Tenant switcher** — the dev-only stand-in for SSO described in §2; probably a small header
  control rather than a full page.
- **Rep Directory** — paginated table (`GET /reps`) with a search bar (`GET /reps/search`) for
  name/email/status/repType/businessName filters.
- **Rep Detail** — full `RepDetailView`, platform access badges, linked Groups
  (`GET /reps/:repId/groups`), and soft-delete/restore actions.
- **Create Rep** form — mirrors `CreateRepBodyDto`.
- **Edit Personal Info** / **Edit Business Info** modals — mirror the two respective `PATCH`
  bodies; business info modal needs a way to clear it entirely (send `businessInfo: null`).
- **Access Control editor** — per-platform enable/disable toggles, submitted as a full
  `entries[]` replacement.
- **Link to Group** action — a raw `groupId` UUID input for now (no Group-search/autocomplete API
  exists in this backend yet).

---

## 9. Reference

- `docs/openapi.json` — generated from this repo's `/api/docs-json` on 2026-07-17. Regenerate if
  the backend's routes/DTOs change: start the server and
  `curl http://localhost:3000/api/docs-json -o docs/openapi.json`.
- `ADR-002-rls-tenant-isolation.md` and `ADR-003-outbox-relay-rls-role.md` in this repo's `ADR/`
  folder, if you need the full reasoning behind the tenant model (background only — not required
  reading to build the dashboard).
