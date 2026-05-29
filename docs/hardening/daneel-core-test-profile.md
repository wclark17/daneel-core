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

For the local detached test runtime, use the wrapper instead:

```sh
pnpm gateway:daneel-core:detached
pnpm gateway:daneel-core:status
pnpm gateway:daneel-core:probe
pnpm gateway:daneel-core:restart
```

The wrapper pins port `18790`, writes logs to
`~/.openclaw-daneel-core/logs/gateway-detached.log`, records a pid file at
`~/.openclaw-daneel-core/gateway.pid`, and prepends a small `pnpm` shim so
startup rebuilds and local probes still work on hosts where only `corepack` is
on `PATH`.

## Service Runtime

For day-to-day use, install Daneel Core as a user-level systemd service and use
the `daneel-core` command line manager:

```sh
node daneel-core.mjs install-service
daneel-core status
daneel-core probe
daneel-core restart
daneel-core logs
```

`install-service` writes `~/.config/systemd/user/openclaw-daneel-core.service`,
enables it, starts it, and installs a `~/.local/bin/daneel-core` symlink back to
this checkout. The service pins the same profile, state dir, and port as the
detached wrapper:

- profile: `daneel-core`
- state dir: `~/.openclaw-daneel-core`
- port: `18790`
- service log: `~/.openclaw-daneel-core/logs/gateway-service.log`

The detached wrapper remains useful as a fallback for local testing, but the
service is the preferred long-running runtime.

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
