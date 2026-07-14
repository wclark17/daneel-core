#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0] ?? "--help";
const coreWrapperCommands = new Set([
  "--help",
  "-h",
  "--version",
  "backup",
  "chat",
  "cron-status",
  "dashboard",
  "devices",
  "doctor",
  "gateway",
  "gateway-token",
  "harden-profile",
  "healthcheck",
  "jobs",
  "logs",
  "models",
  "probe",
  "restart",
  "restore",
  "rollback",
  "run",
  "start",
  "status",
  "stop",
  "terminal",
  "tui",
  "uninstall-service",
  "update",
  "usage",
  "version",
]);

const target =
  command.startsWith("-") || coreWrapperCommands.has(command)
    ? ["daneel-core.mjs", ...args]
    : ["scripts/run-node.mjs", ...args];

const result = spawnSync(process.execPath, target, {
  cwd: repoRoot,
  env: {
    ...process.env,
    OPENCLAW_CLI_NAME: "daneel-core",
    OPENCLAW_PROFILE: process.env.OPENCLAW_PROFILE || "daneel-core",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
