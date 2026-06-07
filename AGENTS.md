# AGENTS.md

This repository is Daneel Core: Bill Clark's personal assistant runtime fork.

## Identity

- Repo: `https://github.com/wclark17/daneel-core`
- Primary branch: `hardened-memory-core`
- Runtime service: `openclaw-daneel-core.service`
- Operator CLI: `daneel-core`
- Runtime profile/state: `/home/daneel/.openclaw-daneel-core`
- Workspace: `/usr/local/share/work/daneel-workspace`

## Upstream History

Daneel Core began as a fork of OpenClaw. Keep that origin visible and keep the
MIT license intact.

Read these before changing project identity, licensing, or attribution:

- `README.md`
- `UPSTREAM.md`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Routine upstream OpenClaw merges are intentionally disabled after the final
2026-06-07 reconciliation. Future improvements should be made directly in this
repository unless Bill explicitly asks for another upstream import.

## Compatibility Names

Many internal names still contain `openclaw`, `OpenClaw`, `OPENCLAW_*`, or
`@openclaw/*`. These are compatibility surfaces inherited from the upstream
runtime: package self-references, plugin APIs, config paths, environment
variables, generated protocols, tests, and historical filenames.

Do not broad-replace those names. Rename compatibility surfaces only with an
explicit migration plan, focused tests, and live Core health proof.

## Development Rules

- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Keep changes focused on Daneel Core's runtime needs.
- Preserve existing behavior unless the requested change clearly needs a
  behavior change.
- Do not print secrets from Core config, auth stores, token files, or logs.
- Do not revert unrelated local changes.

## Validation

For code changes, prefer focused validation first. For runtime-affecting changes,
use:

```bash
pnpm build:strict-smoke
daneel-core restart
daneel-core healthcheck --json
```

For documentation-only identity changes, JSON/package parsing plus `git diff`
review is usually enough.

## Git

Commit small, honest changes. Push to `origin hardened-memory-core` unless Bill
explicitly requests another branch or PR workflow.
