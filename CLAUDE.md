# CLAUDE.md — <!-- FROM_CONFIG:team.name:BEGIN -->new-dev<!-- FROM_CONFIG:team.name:END -->

Guidance for Claude Code (and humans) working in this repo. Keep it short and
current. For deep context see **`DOMAIN-GLOSSARY.md`** (vocabulary,
architecture, patterns), `README.md`, `spec/*`, and `docs/*`.

This file is this repository's team-authored governance content — the
actual rule statements, conventions, and escalation contacts the
Coordinator, Implementor, and Verifier read before acting. The mechanics
that enforce it (hook contracts, tier ladder, rule taxonomy, schema) come
from the vendored framework core in `agents/*.md`, `hooks/*.sh`, and
`project.config.yml` — this file should never restate those mechanics,
only this team's specific content.

## What this is

`admin-poc-fe` — a **multi-tenant admin SPA** (React + Vite + TypeScript) for
managing **Reps** (insurance agents/brokers/agencies) and their Group
relationships. Front-end for the CoreNroll V2 platform; one codebase serves
100+ tenants, with the tenant/Keycloak realm resolved **from the hostname at
boot** (no per-tenant build). Talks to an Admin BFF (not in this repo) over
HTTP.

Sibling packages: `lambda-authorizer/` (API Gateway JWT authorizer) and
`infra/` (AWS CDK).

## Stack

- Package manager: <!-- FROM_CONFIG:stack.package_manager:BEGIN -->pnpm<!-- FROM_CONFIG:stack.package_manager:END -->
- Build/lint/test commands: defined in `project.config.yml` under `stack.*`
  — do not copy them here; if you need to reference a command in prose,
  name the config key (e.g. "run `stack.test_cmd`"), not the literal
  string.

Human cheat-sheet (not the agent contract — agents use the `stack.*` keys above):

```bash
pnpm dev                     # Vite dev server
pnpm build                   # tsc -b && vite build
pnpm lint                    # eslint .
pnpm test                    # vitest run (whole suite)
pnpm exec vitest run <file>  # run a single test file
pnpm exec vitest             # watch mode
pnpm exec tsc --noEmit       # typecheck only

# lambda-authorizer/ (separate package)
cd lambda-authorizer && pnpm install && pnpm test
```

## Branching

Branch names are `<prefix><ticket-id>`, per ticket type. See
`agents/coordinator.md` for exactly how the Coordinator applies this —
this table is sourced from `project.config.yml`'s `team.branch_prefixes`,
not hand-maintained.

<!-- FROM_CONFIG:branch_prefixes_list:BEGIN -->
- **feature** → `feat/<ticket-id>`
- **bug** → `bug/<ticket-id>`
- **chore** → `chore/<ticket-id>`
- **hotfix** → `hotfix/<ticket-id>`
<!-- FROM_CONFIG:branch_prefixes_list:END -->

## Pull Request Labels

Every PR the Coordinator opens carries these labels (sourced from
`project.config.yml`'s `pull_request.required_labels`, not
hand-maintained). `ai-assisted` is mandatory org-wide and cannot be
dropped.

<!-- FROM_CONFIG:pull_request_labels_list:BEGIN -->
- `ai-assisted`
<!-- FROM_CONFIG:pull_request_labels_list:END -->

## Architecture Overview

The SPA is **multi-tenant with no per-tenant build**: at boot, the hostname
resolves to a tenant and its Keycloak realm/client via
`public/tenant-registry.json` (realm/client are **not** env vars — edit the
registry to add/change tenants). The manifest resolves **once at boot**; the
TTL in `resolveTenant.ts` is effectively inert in long-lived tabs.

Request identity flow, **end-state**: SPA → API Gateway → Lambda authorizer
(verifies RS256 JWT, maps issuer→tenant, injects
`x-tenant-id`/`x-role`/`x-party-id` by **overwrite**) → BFF consumes those
headers. **⚠️ What is true TODAY — do not assume otherwise:**

- **The BFF verifies no JWTs.** The SPA itself sends `X-Tenant-Id` (from the
  hostname-resolved tenant), and the bearer token is attached but ignored
  server-side. The Lambda authorizer exists but is **not deployed**.
- **Silent SSO is disabled** (`check-sso`/`checkLoginIframe` off in
  `main.tsx`) — it hangs against the real realm. Login is always an
  **explicit user click** (real PKCE redirect).
- Custom claims **`party_id` / `persona` are `undefined`** — the Keycloak
  mappers aren't configured yet. Handle the undefined case.

**BFF contract:** base URL `VITE_API_BASE_URL` (default
`http://localhost:3000`), **no path prefix** (`/reps`, not `/api/reps`). It
rejects unknown body fields with `400` (whitelist) — keep DTOs in exact sync
with `spec/openapi.json`.

**Structure — organized BY TYPE; do not add feature folders:**

```
src/api/         HTTP client (single axios instance) + one module per resource + DTOs (types.ts)
src/components/   shared UI
src/context/      React context (TenantContext)
src/hooks/        one file per resource; TanStack Query hooks
src/pages/        routed views
src/tenant/       hostname → tenant resolution
main.tsx App.tsx keycloak.ts   bootstrap / routes / Keycloak singleton
```

## Coding Conventions

- **Components:** named function components only (`export function Foo()`). No
  `React.FC`, no arrow-function components, no default export except `App.tsx`.
  Props: inline type for 1–2, named `interface FooProps` beyond that.
- **Hooks/data:** one file per resource; one TanStack Query hook per op named
  `use<Verb><Noun>`. Query keys are `['<resource>', tenantId, ...]` — **always
  include `tenantId`**. Mutations invalidate related keys in `onSuccess`; reuse
  the shared invalidate helper (`useInvalidateRep`).
- **API:** raw HTTP only in `src/api/<resource>.ts`, thin, returns `data`.
  Everything goes through the single `apiClient`; never construct a second
  axios instance or bypass its interceptors. Render errors via
  `extractErrorMessage(error: unknown)`.
- **Types:** `interface` for object shapes/DTOs; `type` only for unions. **No
  enums** — string-literal union + paired `const` array. Central DTOs in
  `src/api/types.ts`; component prop types stay co-located.
- **`any` is banned** — use `unknown` and narrow. No `eslint-disable` to dodge
  it.
- **Imports:** relative only (no path aliases); external first, then internal
  by increasing depth; `import type` for type-only imports.
- **Style (no Prettier):** 2-space indent, single quotes, semicolons, trailing
  commas — match by eye.
- **Tests:** Vitest + @testing-library. Mirror the filename (`Foo.test.tsx`
  beside `Foo.tsx`), following the `lambda-authorizer/` precedent. **Mocks and
  fixtures only — never live endpoints or real PII.**

## Hard Rules

Every row below is sourced from `project.config.yml`'s `hard_rules[]` and
regenerated verbatim by the scaffolder — edit the config, not this table.
`audit` says how a rule is checked; `review_gate` says whether a violation
blocks the pipeline or is merely advisory (AI-SDLC-FRAMEWORK-SPEC.md
section 7).

<!-- FROM_CONFIG:hard_rules_table:BEGIN -->
| id | statement | audit | review_gate |
| --- | --- | --- | --- |
| `no-live-data` | No connections to live/production endpoints or databases. | `static` | `blocking` |
| `no-pii-in-logs` | No PII or sensitive account details written to analytics or console logs. | `verifier` | `blocking` |
<!-- FROM_CONFIG:hard_rules_table:END -->

<!--
  Rendered by scaffold.mjs as a markdown table with columns:
  id | statement | audit | review_gate
  — one row per project.config.yml hard_rules[] entry, in file order.
-->

## Autonomy Tier Triggers

The A–E tier ladder itself is invariant framework structure (see
`agents/coordinator.md`); the triggers below are this team's own, sourced
from `project.config.yml`'s `tiers` block. When a change's tier is
ambiguous, classify **upward**.

**Tier D triggers (hard stop — requires a pre-approved ADR under `/ADR/*.md`):**

<!-- FROM_CONFIG:tier_d_triggers_list:BEGIN -->
- public API contract change
- database schema or migration modification
- authentication, authorization, or tenant-isolation changes (e.g. JWT verification, Keycloak realm/mapper config, RLS)
- new or changed DTO shapes or shared domain type values (e.g. new RepType/RepStatus/RepPlatform values, tenant-manifest schema)
- cross-cutting architectural changes (new module boundaries, state-management or data-fetching pattern changes, new external service integrations)
- build, bundling, or dependency-graph changes that affect runtime architecture
<!-- FROM_CONFIG:tier_d_triggers_list:END -->

**Tier E triggers (absolute refusal — referred to a human team lead):**

<!-- FROM_CONFIG:tier_e_triggers_list:BEGIN -->
- production environment secrets or deployment key modification
- production deployment or release promotion (deploying the Lambda authorizer, publishing packages, cutting a prod release)
- infrastructure-as-code changes targeting production (AWS CDK, API Gateway, IAM roles/policies)
- modification of CI/CD credentials, cloud access keys, or signing/certificate material
<!-- FROM_CONFIG:tier_e_triggers_list:END -->

**Tier C required reviewer:** <!-- FROM_CONFIG:tiers.C_needs_reviewer:BEGIN -->new-dev-team-lead<!-- FROM_CONFIG:tiers.C_needs_reviewer:END -->

## Escalation Contacts

- **Tier E (absolute refusal):** stop and escalate to **Sanjay Khadka**
  (team lead) — production secrets, deploy keys, prod deployment/release,
  prod IaC, and CI/CD credential changes never proceed autonomously.
- **Tier D (hard stop, ADR required):** notify **Sanjay Khadka** and the
  architecture team to get an ADR reviewed and approved before any code is
  written.
- **Tier C required reviewer:** `new-dev-team-lead` — named as a required
  PR reviewer for Tier C changes.

## Architecture Decision Records

Tier D changes require a pre-approved ADR under `/ADR/*.md` before any
implementation begins. See `/ADR/0000-template.md` for the required shape.
The ADR must be reviewed and approved by the architecture team (see
Escalation Contacts) **before** work starts — implementation on a Tier D
change without an approved ADR is not permitted.
