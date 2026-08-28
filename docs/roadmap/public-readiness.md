# Daneel Core Public-Readiness Roadmap

Status: active planning document

Owner: Daneel Core maintainers

Target branch: `hardened-memory-core`

Last updated: 2026-08-28

## Goal

Prepare Daneel Core for a credible public announcement as an opinionated,
single-operator, hardened OpenClaw-derived runtime. The announcement must be
backed by a clean repository, a documented threat model, reproducible security
controls, a supported installation path, and release-quality validation.

This document is the canonical project checklist. A checked item means its
acceptance criteria have been met and the evidence is committed or linked.

## Positioning and guardrails

- Describe Daneel Core as a focused, hardened derivative, not as universally
  "more secure than OpenClaw."
- Preserve the upstream MIT license, attribution, and relevant history.
- Keep inherited `openclaw` names where they remain compatibility contracts;
  migrate them only through an explicit, tested compatibility plan.
- Separate the reusable public product from Bill's private runtime policy,
  credentials, workspace, scheduled jobs, and infrastructure.
- Do not announce broadly until the release gate at the end of this document
  passes.

## Current strengths to preserve and prove

- Telegram-focused production policy with single-owner authorization.
- Explicit plugin and bundled-skill allowlists.
- Separate runtime profile/state and loopback-only gateway.
- 1Password-backed SecretRef resolution for runtime secrets.
- Bundled-plugin provenance and override controls.
- Dedicated hardening checks and regression coverage.
- Purpose-built `daneel-core` service, healthcheck, update, and rollback flows.
- Health-aware scheduled-job ownership and retention protections.
- CodeQL and strict-smoke CI on pushes and pull requests.
- Frozen routine-upstream update path with intentional security intake.

## Priority definitions

- **P0:** blocks a responsible public release.
- **P1:** required for a polished first public release.
- **P2:** valuable follow-up that may ship after the first release if the
  limitation is documented.

## Phase 0: Baseline, scope, and evidence

- [ ] **P0 — Freeze a public-readiness baseline.** Record the starting commit,
      supported host/runtime assumptions, enabled production surfaces, and current
      security audit results.
  - Acceptance: a committed baseline report identifies what is supported,
    unsupported, enabled, and tested.
- [ ] **P0 — Define the public product boundary.** Decide whether the first
      release is Telegram-only and which operating systems, install modes, models,
      secret providers, and plugins are supported.
  - Acceptance: the support matrix is explicit and every advertised surface has
    an owner and test path.
- [ ] **P0 — Build an evidence index.** Map each public security/reliability
      claim to a test, configuration check, design document, or reproducible demo.
  - Acceptance: no announcement claim depends only on operator experience or an
    undocumented local setup.

## Phase 1: Security architecture

- [ ] **P0 — Isolate untrusted content.** Add a sandboxed worker path for web,
      browser, PDF, email, and other attacker-controlled content.
  - The worker must not receive secrets, host filesystem access, deployment
    tools, messaging authority, purchase authority, or infrastructure mutation
    tools.
  - Acceptance: hostile-content fixtures cannot cross the sandbox or invoke a
    consequential tool.
- [ ] **P0 — Enforce a trusted consequence boundary.** Untrusted workers may
      research and propose; only a trusted coordinator may message, deploy, modify
      infrastructure, retrieve credentials, or purchase.
  - Acceptance: policy tests prove direct and indirect escalation attempts are
    denied or require an explicit trusted approval.
- [ ] **P0 — Enable least-privilege defaults.** Default to sandboxed execution,
      workspace-scoped filesystem access, and a narrow tool set; grant broader
      access only to named trusted workflows.
  - Acceptance: a clean install starts with these defaults and the hardening
    audit fails closed on drift.
- [ ] **P0 — Remove plaintext gateway secrets.** Move the gateway token and any
      remaining runtime secrets to SecretRef or an equivalent provider.
  - Acceptance: repository, example configuration, and live supported setup do
    not require plaintext secrets in primary configuration.
- [ ] **P1 — Add outbound network policy.** Define sandbox egress restrictions,
      destination controls, and useful audit logging.
  - Acceptance: tests cover allowed destinations, private/metadata targets,
    DNS-rebinding behavior, and fail-closed operation.
- [ ] **P0 — Publish the Daneel Core threat model.** Document assets, trust
      boundaries, attacker capabilities, operator assumptions, consequences,
      exclusions, and residual risk.
  - Acceptance: security policy, architecture, and tests all use the same
    boundary definitions.
- [ ] **P0 — Add adversarial security regression tests.** Cover prompt
      injection, poisoned documents, tool escalation, SSRF/DNS rebinding,
      malicious skills/plugins, filesystem escape, secret exposure, and approval
      bypass.
  - Acceptance: the suite runs in CI and failures block release.
- [ ] **P1 — Add continuous drift checks.** Monitor gateway and model binds,
      enabled plugins/tools, sandbox policy, permissions, secret placement, and
      unexpected listeners.
  - Acceptance: drift produces a clear failure with remediation guidance.
- [ ] **P0 — Define upstream security intake.** Monitor OpenClaw advisories and
      security-relevant commits without resuming routine upstream merges.
  - Acceptance: a documented process assigns review cadence, triage rules,
    patch provenance, validation, and disclosure handling.

## Phase 2: Remove personal coupling and modularize Core

- [ ] **P0 — Inventory personal and environment-specific hard-coding.** Include
      Telegram IDs, usernames, paths, ports, service names, workspace layout,
      vault/item names, bot names, cron targets, and infrastructure hostnames.
  - Acceptance: inventory distinguishes product defaults, compatibility
    contracts, private deployment configuration, and values to remove.
- [ ] **P0 — Externalize operator configuration.** Replace Bill-specific values
      with validated configuration/environment inputs and safe example values.
  - Acceptance: a clean test profile runs without Bill's identity, filesystem,
    vault, Telegram account, or private workspace.
- [ ] **P0 — Split `daneel-core.mjs`.** Extract service lifecycle, healthcheck,
      hardening, secrets, retention, cron ownership, updates/rollback, and
      deployment-specific jobs into focused modules.
  - Acceptance: the launcher is a small command router; each module has focused
    unit tests and explicit dependencies.
- [ ] **P1 — Separate public and private extensions.** Define the supported base
      product and a clean mechanism for private runtime plugins and scheduled jobs.
  - Acceptance: no private plugin, secret name, job definition, or personal
    workflow is required by the public build or test suite.
- [ ] **P1 — Add configuration validation and migration.** Validate unknown,
      missing, insecure, or conflicting settings and version configuration changes.
  - Acceptance: invalid configurations fail with actionable messages and an
    upgrade test preserves supported prior state.

## Phase 3: Repository and governance cleanup

- [ ] **P0 — Replace `SECURITY.md`.** Provide the Daneel Core disclosure route,
      supported versions, response expectations, threat-model link, and scope.
  - Acceptance: reports no longer route to OpenClaw maintainers or
    `security@openclaw.ai` unless the issue is demonstrably upstream-owned.
- [ ] **P0 — Replace inherited contribution ownership.** Update
      `CONTRIBUTING.md`, `CODEOWNERS`, issue templates, pull-request templates, and
      maintainer links.
  - Acceptance: all ownership and contact paths resolve to the actual Daneel
    Core project.
- [ ] **P0 — Define the product identity contract.** Document public name,
      repository, CLI, service, package, version, state directory, environment
      variables, and retained compatibility names.
  - Acceptance: docs and metadata agree; compatibility aliases have tests and a
    stated deprecation policy if applicable.
- [ ] **P1 — Remove archival workflow clutter.** Delete inherited disabled
      workflows once any useful intent has been recorded in the roadmap or active
      CI. Git history remains the archive.
  - Acceptance: `.github` contains only owned, reviewed, active, or explicitly
    documented templates/workflows.
- [ ] **P0 — Narrow or classify the inherited surface.** Remove unsupported
      channels, apps, plugins, release machinery, and docs, or label them clearly as
      unsupported compatibility code with an intentional retention reason.
  - Acceptance: repository contents match the support matrix; public docs do
    not imply support for untested surfaces.
- [ ] **P0 — Audit privacy and secrets in the tree and history.** Scan current
      files, reachable Git history, artifacts, fixtures, and workflows.
  - Acceptance: findings are remediated or formally assessed; CI blocks new
    secrets and personal identifiers.
- [ ] **P1 — Normalize repository hygiene.** Remove generated artifacts,
      obsolete fixtures, dead scripts, stale links, and inconsistent naming.
  - Acceptance: repository audit is clean and documented exceptions are few and
    intentional.

## Phase 4: CI, supply chain, and release engineering

- [ ] **P0 — Establish required CI.** Run formatting, linting, type checks,
      focused unit/integration tests, strict build, and security regression tests.
  - Acceptance: protected-branch checks are required and reproducible locally.
- [ ] **P0 — Add dependency and secret gates.** Add dependency vulnerability,
      secret, and unsafe-workflow scanning with a documented exception process.
  - Acceptance: high-severity actionable findings and detected secrets block
    release.
- [ ] **P1 — Generate SBOM and license reports.** Cover shipped packages,
      plugins, containers, and native dependencies.
  - Acceptance: release artifacts include an SBOM and license policy passes.
- [ ] **P0 — Test installation, upgrade, and rollback.** Exercise a clean
      supported host, prior supported state, failed upgrade, and rollback recovery.
  - Acceptance: tests prove service health and state continuity after every
    path.
- [ ] **P1 — Define versioning and changelog policy.** Separate Daneel Core
      versions from the frozen OpenClaw base while retaining provenance.
  - Acceptance: version source, changelog format, compatibility promise, and
    release branches/tags are documented.
- [ ] **P1 — Produce signed release artifacts.** Decide supported packages or
      images, provenance attestations, signatures, and verification instructions.
  - Acceptance: a release candidate can be built reproducibly and verified from
    published metadata.
- [ ] **P1 — Add release-candidate qualification.** Run security, reliability,
      installation, upgrade, rollback, and soak checks against the exact artifact.
  - Acceptance: a committed release checklist records results and approver.

## Phase 5: Installation, operations, and public documentation

- [ ] **P0 — Generalize installation.** Provide a clean installer or documented
      procedure with configuration templates and no dependency on Bill's host.
  - Acceptance: a new supported system reaches a healthy Telegram runtime using
    only documented prerequisites and operator-supplied values.
- [ ] **P0 — Rewrite the README for the public product.** Explain purpose,
      positioning, supported scope, quick start, limitations, and upstream origin.
  - Acceptance: the README no longer describes only Bill's personal deployment
    and makes no unproved superiority claim.
- [ ] **P0 — Publish architecture and threat-model documentation.** Include the
      trusted coordinator, untrusted workers, secrets, tools, network boundaries,
      state, and approval flows.
  - Acceptance: a new operator can understand where trust changes and what Daneel
    Core does not protect against.
- [ ] **P1 — Publish operator documentation.** Cover configuration, secrets,
      health checks, logs, backups, updates, rollback, incident response, recovery,
      and security intake.
  - Acceptance: routine operation and recovery do not depend on undocumented
    maintainer knowledge.
- [ ] **P1 — Publish migration and compatibility guidance.** Explain migration
      from supported OpenClaw state and retained compatibility names.
  - Acceptance: migration tests match the documented procedure and limitations.
- [ ] **P1 — Document performance and resource expectations.** Provide a tested
      baseline for supported deployment sizes.
  - Acceptance: operators can estimate minimum and recommended resources.

## Phase 6: Comparative proof and announcement

- [ ] **P0 — Build a feature comparison against the frozen OpenClaw base.** Use
      the recorded upstream commit and distinguish inherited behavior, Daneel Core
      changes, deployment policy, and planned work.
  - Acceptance: every claimed difference links to code and test evidence.
- [ ] **P0 — Build a threat-model comparison.** Compare boundaries and defaults,
      not vague claims of absolute security.
  - Acceptance: reviewers can reproduce the relevant tests on both baselines.
- [ ] **P1 — Conduct an independent security review.** Resolve or risk-accept
      findings before release.
  - Acceptance: report, remediation status, and residual risks are published or
    summarized appropriately.
- [ ] **P1 — Prepare announcement material.** Include exact scope, improvements,
      limitations, migration status, provenance, and support expectations.
  - Acceptance: announcement language matches the evidence index and release
    artifact.

## Related infrastructure task

This task is tracked operationally outside the public codebase but remains part
of the broader security program:

- [ ] Rotate the remaining PostgreSQL MD5 verifiers (`cryptopos`, `hkjc_user`,
      and the administrative `postgres` role) to SCRAM, verify all consumers,
      change exact HBA rules to `scram-sha-256`, and remove the temporary loopback
      `trust` fallback. Do not store credentials or deployment-specific details in
      this repository.

## First implementation queue

Work should start in this order because later cleanup depends on the security
and product boundaries being settled first:

1. Freeze the baseline and decide the supported public surface.
2. Write the Daneel Core threat model and trusted-consequence architecture.
3. Implement untrusted-content isolation and least-privilege defaults.
4. Inventory and externalize personal/environment-specific configuration.
5. Split `daneel-core.mjs` behind tests without changing runtime behavior.
6. Replace security, contribution, and ownership documents.
7. Remove or classify unsupported inherited surfaces and archival clutter.
8. Complete CI, supply-chain, installation, upgrade, and rollback gates.
9. Rewrite public/operator documentation and generalize installation.
10. Produce comparative evidence, qualify a release candidate, and only then
    announce it.

## Public release gate

A public release candidate is ready only when all P0 items are checked and:

- [ ] The exact release artifact passes required CI and adversarial tests.
- [ ] Clean install, upgrade, failed-upgrade, and rollback tests pass.
- [ ] No unresolved critical/high security finding lacks an explicit,
      documented risk decision.
- [ ] Repository and reachable history pass privacy/secret review.
- [ ] Product identity, support matrix, threat model, security policy, and
      disclosure channel are consistent.
- [ ] Comparative claims are evidence-backed and limitations are prominent.
- [ ] Upstream attribution and MIT licensing remain intact.
- [ ] The release has a named maintainer approval and rollback plan.

## Progress log

- 2026-08-28: Roadmap created from the initial Daneel Core security and public
  repository assessment.
