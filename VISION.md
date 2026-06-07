## Daneel Core Vision

Daneel Core is a personal, always-on assistant runtime for Bill Clark.

The job is not to be a general upstream product anymore. The job is to make
Daneel reliable, useful, memory-aware, and easy to operate across Telegram,
scheduled jobs, project automations, and local tools.

## Direction

- Prefer direct improvements to this runtime over routine upstream merges.
- Keep the `daneel-core` CLI and service as the operator-facing control path.
- Preserve stable compatibility surfaces inherited from OpenClaw until there is
  a clear migration plan and runtime proof.
- Keep memory, skills, and handoff files as first-class operating context.
- Favor practical healthchecks, explicit rollback paths, and quiet successful
  automation over ornamental product work.

## Attribution

Daneel Core began as a fork of OpenClaw. Keep that history visible, keep the MIT
license intact, and avoid pretending the code appeared out of nowhere. The fork
point and license notes live in [UPSTREAM.md](UPSTREAM.md).
