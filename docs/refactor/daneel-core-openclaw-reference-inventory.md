# Daneel Core OpenClaw Reference Inventory

This note tracks the remaining `openclaw`, `OpenClaw`, `OPENCLAW_*`, and
`@openclaw/*` references after the initial Daneel Core fork rebrand.

## Current State

The repository is already operator-branded as Daneel Core in the top-level
README, vision, upstream attribution, CLI banner, dashboard, and runtime helper
path. The remaining references are mostly compatibility surfaces inherited from
OpenClaw.

Approximate file buckets with remaining references, excluding common generated
and dependency folders:

- `src`: core runtime, config, gateway, protocol, and package self-references.
- `extensions`: plugin manifests, extension package names, and plugin API
  references.
- `apps`: macOS/iOS/Android bundle names, Swift module names, generated
  protocol paths, and app identifiers.
- `docs`: user-facing CLI docs plus historical/upstream references.
- `scripts`: build, release, migration, test, and CI helper names.
- `test`: compatibility, migration, package, and live-test fixtures.
- `packages`, `ui`, `skills`, `qa`: package imports, docs, and lab tooling.

## Classification Pass

The first classification pass used ripgrep over the working tree, excluding
`node_modules`, `vendor`, `dist`, `build`, and `pnpm-lock.yaml`.

| Bucket                         | Files | Recommendation                                                                   |
| ------------------------------ | ----: | -------------------------------------------------------------------------------- |
| `runtime-config-env-state`     | 3,079 | Add Daneel aliases first; do not rename in place.                                |
| `other`                        | 2,740 | Inspect before touching; mixed root files, extension source, and assets.         |
| `tests-fixtures-migrations`    | 2,604 | Keep many legacy names; update only alongside behavior changes.                  |
| `source-internal`              | 1,350 | Internal type/module names; migrate only with focused tests.                     |
| `mobile-desktop-app-ids`       |   715 | Treat as platform identity migration; high risk.                                 |
| `docs-current-user-facing`     |   643 | Best first rename target where text describes current Daneel Core behavior.      |
| `scripts-ci-build-release`     |   435 | Add Daneel aliases and labels; keep old release/migration scripts until retired. |
| `package-api`                  |   242 | Public/package compatibility; alias first, package rename last.                  |
| `plugin-extension-manifests`   |   237 | Plugin contract surface; do not rename broadly.                                  |
| `ui-source`                    |   144 | Good medium-risk branding target after docs.                                     |
| `attribution`                  |     9 | Keep visible as fork/license history.                                            |
| `generated-protocol-artifacts` |     5 | Rename only by changing generator/protocol names deliberately.                   |

The count is file-based, not occurrence-based. Some files contain many
references and some buckets overlap conceptually; this table is for migration
triage, not proof that a bucket is internally uniform.

## First Editable Targets

Start with current user-facing docs that still present `openclaw` as the active
operator command. Examples from the first pass:

- `docs/logging.md`
- `docs/install/index.md`
- `docs/install/uninstall.md`
- `docs/install/development-channels.md`
- `docs/cli/tui.md`
- `docs/cli/configure.md`
- `docs/prose.md`

These can usually be rewritten to say `daneel-core` for Daneel Core operation,
while retaining `openclaw` examples only when describing upstream installs,
legacy compatibility, or migration from old OpenClaw state.

## Alias-First Runtime Targets

Runtime code has many `OPENCLAW_*`, `.openclaw`, and `OpenClawConfig`
references. The first real runtime migration should introduce aliases rather
than replacements:

- `DANEEL_CORE_STATE_DIR` fallback to `OPENCLAW_STATE_DIR`.
- `DANEEL_CORE_CONFIG_PATH` fallback to `OPENCLAW_CONFIG_PATH`.
- `DANEEL_CORE_PROFILE` fallback to `OPENCLAW_PROFILE`.
- `DANEEL_CORE_GATEWAY_PORT` fallback to `OPENCLAW_GATEWAY_PORT`.
- Daneel-facing help text where the command is already invoked through
  `daneel-core`.

Keep old environment variables functional until all live services, scripts, and
healthchecks have moved.

## Keep As Attribution

These references should remain visible:

- `LICENSE` and copyright/license attribution.
- `UPSTREAM.md` origin notes.
- README references explaining the fork history.
- Third-party or external package names that still point at upstream-owned
  names.

## Keep Until Compatibility Migration

These are high-risk surfaces and should not be renamed by broad replacement:

- The npm package name `openclaw`.
- The legacy binary `openclaw`.
- `@openclaw/*` package names and imports.
- `OPENCLAW_*` environment variables.
- Runtime state/profile paths under `.openclaw*`.
- Generated protocol/module names such as `OpenClawProtocol`.
- macOS/iOS/Android bundle identifiers such as `ai.openclaw.*`.
- Plugin manifest keys such as `openclaw` and `openclaw.plugin.json`.
- Published upgrade-survivor and migration tests for old OpenClaw installs.

Rename these only by introducing Daneel Core aliases first, keeping backward
compatibility, and proving both fresh installs and existing live runtime state.

## Safe Early Cleanup

These are reasonable first-pass targets:

- Pure prose in current Daneel-owned docs where `openclaw` is used as the main
  product name instead of as fork history or compatibility.
- Script labels, headings, and reports that are not parsed by tests or external
  tooling.
- Render/Fly sample deployment names if those deployment templates are still
  used for Daneel Core rather than upstream OpenClaw examples.
- Package script aliases that can gain `daneel-core:*` equivalents while leaving
  existing `openclaw:*` aliases intact.

## Suggested Migration Order

1. Add inventory and guardrails so future passes are deliberate.
2. Add Daneel Core aliases for operator-facing commands and scripts while
   preserving OpenClaw names.
3. Rename pure branding/prose references in active docs.
4. Add `DANEEL_CORE_*` environment variable aliases for live runtime settings,
   with `OPENCLAW_*` fallback.
5. Move runtime default paths only after a tested migration path exists.
6. Consider package/import/app identifier renames last, if ever.

## Validation Expectations

Documentation-only changes should pass JSON/YAML parse checks and diff review.
Runtime-affecting changes should run:

```bash
pnpm build:strict-smoke
daneel-core restart
daneel-core healthcheck --json
```
