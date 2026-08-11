# Task Spec: FE-03 · Type `import.meta.env`

- **Source:** Zoho Sprints Aut-I30 (workspace 776405438, project Automation, sprint "Second")
- **Branch:** `chore/Aut-I30`
- **Autonomy tier:** **A** — a local ambient type declaration. Not a DTO/shared-domain-type change (Tier D concerns `RepType`/`RepStatus`/tenant-manifest schema etc.), not runtime behavior. No Tier D/E trigger.

## Change being made

`src/vite-env.d.ts` currently contains only `/// <reference types="vite/client" />`. The `vite/client` `ImportMetaEnv` interface has a catch-all `[key: string]: any` index signature, so the two project env vars resolve to `any`:
- `VITE_API_BASE_URL` — `src/api/client.ts:6`
- `VITE_TENANT_MANIFEST_TTL_SECONDS` — `src/tenant/resolveTenant.ts:40`

This violates the `any` ban (CLAUDE.md) and hides typos/misuse. Augment `ImportMetaEnv` so these two known vars are typed.

## Scope

- Edit **`src/vite-env.d.ts` only**. No runtime source changes.
- Keep the `/// <reference types="vite/client" />` line (asset-module and `BASE_URL`/`MODE`/`DEV`/`PROD`/`SSR` typings depend on it).
- Add a declaration-merged `ImportMetaEnv` augmentation declaring exactly the two VITE_ vars this codebase uses (verified: only these two exist). Type each as `readonly ...?: string` — Vite env values are always strings at runtime, and both call sites guard the undefined case (`?? default`, `Number(...)`), so `string | undefined` is the accurate type.

Expected shape:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TENANT_MANIFEST_TTL_SECONDS?: string;
}
```
(No separate `ImportMeta` block is needed — `vite/client` already declares `ImportMeta.env: ImportMetaEnv`, and the augmentation merges into it.)

## Acceptance criteria

1. `import.meta.env.VITE_API_BASE_URL` and `import.meta.env.VITE_TENANT_MANIFEST_TTL_SECONDS` resolve to `string | undefined` (NOT `any`) at their call sites.
2. `pnpm exec tsc --noEmit` passes; the full test suite (`pnpm test`) stays green.
3. `pnpm lint` stays clean (no new errors).

### Known constraint (report honestly, do not overclaim)
The ticket's wording "a typo'd var name is a compile error" is **only partially achievable via an ambient `.d.ts`**: `vite/client`'s inherited `[key: string]: any` index signature means an *unrecognized* key (e.g. a typo) still resolves to `any` rather than erroring. Removing that would require dropping the `vite/client` reference, which would break asset/`import.meta` typings elsewhere — out of scope and not worth it. What IS delivered: the two real vars are now explicitly typed (no longer `any`), giving autocomplete and type-checking on correct usage. State this limitation plainly in your report; do not claim full typo-error coverage.

## Applicable hard rules (from CLAUDE.md)

- `any` ban: this change *reduces* `any` usage; introduce no new `any`.
- `no-live-data`, `no-pii-in-logs`: n/a (type-only declaration).

## Constraints

- Do NOT commit, push, or mutate git state.
- Only `src/vite-env.d.ts` may change.
