# Upstream Attribution

Daneel Core began as a fork of OpenClaw and keeps the OpenClaw MIT license.

## Origin

- Upstream repository: `https://github.com/openclaw/openclaw`
- Upstream project name at fork time: OpenClaw
- Final upstream base imported before independent development:
  `66b91d78feb33d62e2f82ae1d8689c48519f5530`
- Final upstream reconciliation date: `2026-06-07`

After that reconciliation, this repository became the independent Daneel Core
runtime for Bill Clark's personal assistant and automation stack. Routine
OpenClaw upstream merges are intentionally disabled; future improvements should
be made directly here unless Bill explicitly requests another upstream import.

## License

The repository remains under the MIT License. See [LICENSE](LICENSE).

OpenClaw copyright and license text are preserved in `LICENSE`. Additional
notices for incorporated or adapted third-party code are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Compatibility Names

Some internal names still contain `openclaw`, `OpenClaw`, `OPENCLAW_*`, or
`@openclaw/*`. These are compatibility surfaces inherited from the upstream
runtime, including package self-references, plugin API names, config paths,
environment variables, tests, and generated artifacts. They should be renamed
only through explicit compatibility migrations, not by broad text replacement.
