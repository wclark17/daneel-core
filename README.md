# Daneel Core

Daneel Core is Bill Clark's personal AI assistant runtime.

It is a hardened, single-operator fork used for the `@DaneelCore_bot` Telegram
runtime, workspace memory, scheduled jobs, and project-specific automation. The
project now evolves independently for Daneel's needs instead of tracking routine
upstream OpenClaw releases.

## Current Operating Model

- Main runtime service: `openclaw-daneel-core.service`
- Main CLI: `daneel-core`
- Core profile/state: `/home/daneel/.openclaw-daneel-core`
- Workspace: `/usr/local/share/work/daneel-workspace`
- Gateway port: `18790`
- Primary branch: `hardened-memory-core`

The legacy `openclaw` CLI/package name is still present internally where it is
part of upstream-compatible module, plugin, config, and environment-variable
surfaces. Do not remove those compatibility names casually; rename them only as a
separate migration with runtime proof.

## Development

Use `pnpm` for source work.

```bash
pnpm install
pnpm build:strict-smoke
```

For the live Daneel Core service, prefer the dedicated CLI:

```bash
daneel-core status
daneel-core healthcheck
daneel-core restart
daneel-core logs
```

After code changes that affect runtime behavior, run a build or focused test,
restart Core, and verify:

```bash
daneel-core healthcheck --json
```

## Upstream History And License

Daneel Core began as a fork of OpenClaw:

- Upstream project: `https://github.com/openclaw/openclaw`
- Final upstream base used for the independent Core branch:
  `66b91d78feb33d62e2f82ae1d8689c48519f5530`
- Final reconciliation date: `2026-06-07`

The original MIT license is preserved in [LICENSE](LICENSE). Additional upstream
and third-party attribution is recorded in [UPSTREAM.md](UPSTREAM.md) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Release Posture

Daneel Core is not intended to publish over the upstream OpenClaw package or
release channels. Keep future changes focused on this runtime unless Bill
explicitly asks for a one-off upstream import or a broader public release plan.

Public-release preparation is tracked in the
[Daneel Core Public-Readiness Roadmap](docs/roadmap/public-readiness.md).
