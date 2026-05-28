# Daneel Core Hardening Profile

This fork intentionally starts from a smaller trusted surface than upstream OpenClaw.
The working runtime name is `Daneel Core`; the repository and package names stay
`openclaw` for now to keep upstream patch review and cherry-picking practical.

## Goal

Build a memory-tree-focused personal agent with a small default attack surface:

- local agent/session runtime
- file-backed and indexed memory
- skills and policy controls
- Telegram as the primary channel
- minimal webhook support while actual usage is audited
- OpenAI/Codex model support

Anything else should be opt-in, reviewed, and added back as a separate connector.

## Kept Bundled Extensions

- `active-memory`
- `codex`
- `llm-task`
- `memory-core`
- `memory-wiki`
- `openai`
- `policy`
- `skill-workshop`
- `telegram`
- `webhooks`

## Removed Extension Classes

The first hardening pass removes bundled extensions for:

- extra messaging/social channels: Discord, Slack, WhatsApp, Signal, Matrix, Teams, IRC, iMessage, Zalo, and related adapters
- broad browser/computer-control surfaces
- voice/video/image/media generation surfaces
- observability/exporter surfaces
- additional model providers beyond OpenAI/Codex
- QA-lab and synthetic channel infrastructure
- migration helpers and compatibility plugins
- public/admin HTTP RPC plugin surface
- file-transfer, phone/device-control, and other high-capability tools

## External Plugin Catalog Policy

The official external install catalogs are also pruned in this profile. Removed extensions should not remain available as one-command installs from the default fork build.

Future connectors should be restored only after they have:

- a clear product need
- an explicit permission model
- credential handling through the shared secret/credential abstraction
- tests for inbound authorization and outbound side effects
- a short threat-model note in this directory

## Credential Policy

1Password is the preferred credential manager. Other secure password managers can be supported through a narrow credential-provider interface, but secrets should not be copied into plugin-specific plaintext config by default.

## Upstream Policy

Keep upstream as a patch source, not an automatic fast-forward target. After this profile removes large extension areas, upstream updates should be cherry-picked or selectively merged with review.

## Test Identity

Use branch `hardened-memory-core` and runtime profile `daneel-core` for testing.
See `docs/hardening/daneel-core-test-profile.md` for the profile commands and
Telegram isolation policy.
