# REVIEW.md — <!-- FROM_CONFIG:team.name:BEGIN -->new-dev<!-- FROM_CONFIG:team.name:END -->

Generated review checklist. A PR may only merge once every **blocking**
item below is checked; **advisory** items are surfaced for the human
reviewer's judgment and do not by themselves block a merge.

## Blocking Gates

Every hard rule below has `review_gate: blocking` in `project.config.yml`.
A single unchecked box here means the Verifier must return FAIL.

<!-- FROM_CONFIG:blocking_rules_checklist:BEGIN -->
- [ ] **no-live-data** (audit: `static`) — No connections to live/production endpoints or databases.
- [ ] **no-pii-in-logs** (audit: `verifier`) — No PII or sensitive account details written to analytics or console logs.
<!-- FROM_CONFIG:blocking_rules_checklist:END -->

<!--
  Rendered by scaffold.mjs as one checklist item per hard_rules[] entry
  where review_gate == "blocking":
  - [ ] **<id>** (audit: <static|verifier>) — <statement>
-->

## Advisory Notes

Every hard rule below has `review_gate: advisory`. A violation is noted
for the human reviewer but does not block the merge on its own.

<!-- FROM_CONFIG:advisory_rules_checklist:BEGIN -->
_(no advisory hard rules defined in project.config.yml)_
<!-- FROM_CONFIG:advisory_rules_checklist:END -->

<!--
  Rendered by scaffold.mjs the same way, for review_gate == "advisory".
-->

## Tier D / E Trigger Checklist

Before approving, confirm this change does **not** match any of the
following — if it does, it should never have reached PR review as a
normal task (AI-SDLC-FRAMEWORK-SPEC.md section 6):

**Tier D (requires a pre-approved ADR under `/ADR/*.md`):**

<!-- FROM_CONFIG:tier_d_triggers_checklist:BEGIN -->
- [ ] public API contract change
- [ ] database schema or migration modification
- [ ] authentication, authorization, or tenant-isolation changes (e.g. JWT verification, Keycloak realm/mapper config, RLS)
- [ ] new or changed DTO shapes or shared domain type values (e.g. new RepType/RepStatus/RepPlatform values, tenant-manifest schema)
- [ ] cross-cutting architectural changes (new module boundaries, state-management or data-fetching pattern changes, new external service integrations)
- [ ] build, bundling, or dependency-graph changes that affect runtime architecture
<!-- FROM_CONFIG:tier_d_triggers_checklist:END -->

**Tier E (must not have been actioned by an agent at all):**

<!-- FROM_CONFIG:tier_e_triggers_checklist:BEGIN -->
- [ ] production environment secrets or deployment key modification
- [ ] production deployment or release promotion (deploying the Lambda authorizer, publishing packages, cutting a prod release)
- [ ] infrastructure-as-code changes targeting production (AWS CDK, API Gateway, IAM roles/policies)
- [ ] modification of CI/CD credentials, cloud access keys, or signing/certificate material
<!-- FROM_CONFIG:tier_e_triggers_checklist:END -->

## Verification Record

- [ ] `stack.lint_cmd` passed (see `project.config.yml`)
- [ ] `stack.test_cmd` passed
- [ ] `stack.extra_validate_cmd` passed (required for Tier C; advisory otherwise)
- [ ] Verifier returned PASS for every task spec in this PR
- [ ] For Tier C tasks: `tiers.C_needs_reviewer` has reviewed and approved
- [ ] PR carries every label in `pull_request.required_labels` (including the mandatory `ai-assisted`)

## Reviewer Notes

<<TEAM_AUTHORED: Anything this team wants a human reviewer to specifically
look for that isn't already captured as a hard rule above — e.g. a
standing concern, a migration in progress, a pattern currently being
phased out.>>
