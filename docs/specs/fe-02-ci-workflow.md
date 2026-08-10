# Task Spec: FE-02 · Add CI workflow (lint + typecheck + test on PR) + fix stale stack config

- **Source:** Zoho Sprints Aut-I29 (workspace 776405438, project Automation, sprint "Second")
- **Branch:** `chore/Aut-I29`
- **Autonomy tier:** **A** — dev-tooling/CI addition plus a config value correction. Explicitly **no deploy steps** (deploy would be Tier E). No production secrets, no cloud credentials, no IaC, no runtime source change. Does not match any Tier D or E trigger.

## Change being made

1. **Add `.github/workflows/ci.yml`** — a GitHub Actions workflow that runs on pull requests targeting `main` and enforces the quality gates the governance model assumes but nothing currently runs (`.github/` is absent today).
2. **Fix stale `stack.*` values in `project.config.yml`** so the agent contract and CI agree on the real toolchain.

## Scope & requirements

### `.github/workflows/ci.yml`
- Trigger: `pull_request` with `branches: [main]`.
- Runner: `ubuntu-latest`, Node 20.
- Use pnpm (repo package manager). Set up pnpm (e.g. `pnpm/action-setup`) and `actions/setup-node` with pnpm cache, then install with a frozen lockfile (`pnpm install --frozen-lockfile`).
- Run these three steps as **separate steps** so a failure is attributable:
  1. Lint: `pnpm lint` (→ `eslint .`)
  2. Typecheck: `pnpm exec tsc --noEmit`
  3. Test: `pnpm test` (→ `vitest run`)
- **No build, no deploy, no publish, no secrets usage.** Do not add any job that deploys, releases, or touches cloud/registry credentials.
- If the repo lacks a committed `pnpm-lock.yaml`, use `pnpm install` (no `--frozen-lockfile`) instead and note it — do not fabricate a lockfile.

### `project.config.yml`
- Set `stack.test_cmd` to `"pnpm exec vitest run {base}"` (currently the stale `"pnpm exec jest --testPathPattern {base}"`; jest is not a dependency and fails to run). This restores the value intended by commit `0007ca3`.
- Leave `stack.lint_cmd` as `"pnpm exec eslint {file}"` — per-file lint is the intended value for the per-file verify hook (it matches `0007ca3`); only `test_cmd` regressed.
- Do not change any other key (`hard_rules`, `tiers`, `permissions`, etc.).

## Acceptance criteria

1. `.github/workflows/ci.yml` is valid YAML and defines lint, typecheck, and test steps triggered on PRs to `main`, with no deploy/publish/secrets steps.
2. Each of the three commands runs green locally: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`.
3. `project.config.yml` `stack.test_cmd` is `pnpm exec vitest run {base}`; the config still passes `scripts/validate-config.mjs` (run it if present) and remains valid YAML.
4. The workflow is structured so a deliberately broken lint/test would fail the corresponding step (attributable failure). The live PR run will be observed after push — validate command correctness locally.

## Applicable hard rules (from CLAUDE.md)

- `no-live-data` (blocking): CI must not connect to any live/production endpoint or database — it only runs local lint/typecheck/tests against mocks/fixtures.
- `no-pii-in-logs` (blocking): no PII in workflow output/logs.

## Notes / constraints

- Writes to `.github/workflows/**` and `package.json` are gated by `permissions.ask_write_paths` — expect approval prompts; do not modify `package.json` unless strictly required (it already has `lint`/`test` scripts, so it should not need changes).
- Do NOT commit, push, or mutate git state — that is the Coordinator's job.
