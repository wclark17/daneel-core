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
