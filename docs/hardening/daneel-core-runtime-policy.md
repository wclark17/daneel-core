# Daneel Core Runtime Policy

Daneel Core starts from the credited OpenClaw codebase, but the personal Core runtime is intentionally smaller than the inherited repository surface.

The `daneel-core` launcher applies this policy to the active runtime profile before gateway startup.

In this context, a profile is a named runtime environment: one config/state/auth namespace that belongs together. The local Daneel Core service uses profile `daneel-core`, with state under `/home/daneel/.openclaw-daneel-core/` and runtime config at `/home/daneel/.openclaw-daneel-core/openclaw.json`. This is separate from the Git branch, which is currently `hardened-memory-core`.

The hardening command writes these runtime constraints into that profile config:

- Runtime plugins are restricted with `plugins.allow`.
- Chat channels are restricted to Telegram.
- Model provider plugins keep OpenAI/Codex, Anthropic, and Google/Gemini.
- Bundled skills are restricted to a small operator set.
- SecretRef `exec` defaults point to a `onepassword` provider.

The current plugin allowlist is:

```text
active-memory
anthropic
codex
google
llm-task
memory-core
memory-wiki
openai
policy
telegram
```

The current bundled skill allowlist is:

```text
1password
github
healthcheck
session-logs
skill-creator
tmux
```

The 1Password resolver accepts SecretRef ids in `op://vault/item/field` form. For example:

```json
{
  "source": "exec",
  "provider": "onepassword",
  "id": "op://Daneel Shared/OpenAI API Key/password"
}
```

This policy is a runtime boundary, not a final source deletion plan. Inherited workflows are preserved under `.github/workflows.disabled/` until the replacement public CI/release process is mature enough to delete them.
