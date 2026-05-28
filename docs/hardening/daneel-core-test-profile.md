# Daneel Core Test Profile

`Daneel Core` is the runtime name for this hardened OpenClaw fork while it is
being tested. The upstream repository and npm package names intentionally remain
`openclaw` for now so upstream patches can still be reviewed and cherry-picked
with less churn.

## Branch

Use the `hardened-memory-core` branch for the slimmed, memory-tree-oriented
fork.

## Runtime Profile

Use the built-in profile system to keep test state separate from the production
OpenClaw/Daneel runtime:

```sh
pnpm gateway:daneel-core
```

Equivalent explicit command:

```sh
node scripts/run-node.mjs --profile daneel-core gateway
```

This sets `OPENCLAW_PROFILE=daneel-core` and, unless explicitly overridden,
stores mutable runtime data under:

```text
~/.openclaw-daneel-core
```

That keeps config, sessions, channel state, logs, and credentials separate from
the normal `~/.openclaw` install.

## Telegram Testing

Use a separate Telegram bot for live gateway tests. Do not point `Daneel Core`
at the production Daneel Telegram bot token during early hardening work.

The separate bot gives us:

- clear message attribution while both versions are running
- freedom to restart/break the test gateway without interrupting production
- isolated channel credentials and allowlists
- safer rollback: stop the `daneel-core` profile and production stays untouched

## Naming Policy

Current naming:

- GitHub repo: `wclark17/openclaw`
- branch: `hardened-memory-core`
- runtime/profile: `Daneel Core` / `daneel-core`
- state dir: `~/.openclaw-daneel-core`

Defer package-level renames until the hardened fork has a stable product shape.
