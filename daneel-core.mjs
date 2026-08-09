#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const homeDir = os.homedir();
const stateDir =
  process.env.OPENCLAW_DANEEL_CORE_STATE_DIR || path.join(homeDir, ".openclaw-daneel-core");
const profile = process.env.OPENCLAW_DANEEL_CORE_PROFILE || "daneel-core";
const port = process.env.OPENCLAW_DANEEL_CORE_PORT || "18790";
const pnpmVersion = process.env.OPENCLAW_DANEEL_CORE_PNPM_VERSION || "11.2.2";
const serviceName = process.env.OPENCLAW_DANEEL_CORE_SYSTEMD_UNIT || "openclaw-daneel-core";
const serviceUnit = `${serviceName}.service`;
const logDir = path.join(stateDir, "logs");
const serviceLog = path.join(logDir, "gateway-service.log");
const detachedLog = path.join(logDir, "gateway-detached.log");
const unitPath = path.join(homeDir, ".config", "systemd", "user", serviceUnit);
const commandLink = path.join(homeDir, ".local", "bin", "daneel-core");
const opServiceAccountTokenFile = path.join(stateDir, "secrets", "op_service_account_token");
const fastmailMcpEnvFile = path.join(stateDir, "secrets", "fastmail-mcp.env");
const workspaceRoot =
  process.env.OPENCLAW_DANEEL_CORE_WORKSPACE ||
  process.env.OPENCLAW_WORKSPACE ||
  "/usr/local/share/work/daneel-workspace";
const safeUpdateScript =
  process.env.OPENCLAW_DANEEL_CORE_SAFE_UPDATE_SCRIPT ||
  "/usr/local/share/work/daneel-workspace/skills/daneel-core-safe-update/scripts/daneel_core_safe_update.sh";
const hardeningPolicy = {
  pluginsAllow: [
    "active-memory",
    "codex",
    "llm-task",
    "memory-core",
    "memory-wiki",
    "openai",
    "policy",
    "telegram",
  ],
  channelsAllow: ["telegram"],
  bundledSkillsAllow: [
    "1password",
    "github",
    "healthcheck",
    "session-logs",
    "skill-creator",
    "tmux",
  ],
  secretExecProvider: "onepassword",
};
const onePasswordResolverScript = path.join(
  repoRoot,
  "scripts",
  "secrets",
  "daneel-core-onepassword-resolver.mjs",
);
const stateRetentionScript = path.join(repoRoot, "scripts", "daneel-core-state-retention.py");
const stateRetentionPolicy = {
  mode: "enforce",
  pruneAfter: "30d",
  maxEntries: 100,
  resetArchiveRetention: "30d",
  maxDiskBytes: "1gb",
  highWaterBytes: "800mb",
};

function loadProtectedEnvironmentFile(filePath, allowedKeys) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!allowedKeys.has(key) || process.env[key]) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      process.env[key] = value;
    }
  }
}

// systemd loads this file for the gateway. Interactive commands such as TUI,
// devices, and doctor need the same protected environment when they parse the
// Core config before connecting to that gateway.
loadProtectedEnvironmentFile(fastmailMcpEnvFile, new Set(["FASTMAIL_MCP_TOKEN"]));

function usage() {
  console.log(`Usage: daneel-core <command>

Commands:
  --version, version    Print the Daneel Core version
  install-service      Install and start the Daneel Core user systemd service
  uninstall-service    Stop, disable, and remove the user systemd service
  start                Start the systemd service
  stop                 Stop the systemd service
  restart              Restart the systemd service
  status [--usage]     Show service status; with --usage, show provider usage
  usage                Show OpenAI/Codex provider usage
  healthcheck          Check service, port, Telegram, model auth, and fresh logs
  dashboard [options]  Open or print the Daneel Core gateway dashboard URL
  gateway-token        Print the configured gateway token for local dashboard auth
  doctor [options]     Run Daneel Core diagnostics for the active profile
  devices [args...]    Manage dashboard/browser device pairing
  gateway [args...]    Run or inspect the underlying gateway
  models [args...]     Manage model configuration/auth
  tui [args...]        Open the terminal UI against the Daneel Core profile
  chat [args...]       Open local embedded terminal chat UI
  terminal [args...]   Alias for local embedded terminal chat UI
  harden-profile       Apply Daneel Core runtime allowlists to the active profile
  jobs                 Show Core-owned recurring direct cron jobs
  state-retention      Preview or apply Core state retention and SQLite compaction
  run <jobname>        Run a Core-owned scheduled job
  backup [options]     Snapshot current Core config and built runtime assets
  update [options]     Rebuild/restart the frozen Core checkout; does not merge upstream
  rollback [target]    Restore a rollback bundle created by update, then restart/healthcheck
  restore [target]     Restore last-known-good built assets from an update bundle
  probe                Probe Daneel Core channels for the active profile
  logs [lines]         Show recent service logs
  follow-logs          Follow service logs
  run-service          Run the gateway in the foreground for systemd
  install-command      Symlink this launcher to ~/.local/bin/daneel-core

  Core job names:
  daily-eodhd-value-scan
  daily-todo-republish
  mets-ticket-price-refresh
  sonarr-status-refresh
  daily-sonarr-wanted-report
  gomining-price-update
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: options.env || process.env,
    cwd: options.cwd || repoRoot,
    timeout: options.timeout,
  });
  if (options.capture) {
    return result;
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runOptional(command, args, options = {}) {
  const result = run(command, args, { ...options, capture: true });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

function runSafeUpdate(mode, args) {
  if (!fs.existsSync(safeUpdateScript)) {
    console.error(`Safe update script not found: ${safeUpdateScript}`);
    process.exit(1);
  }
  run("bash", [safeUpdateScript, mode, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DANEEL_CORE_REPO: repoRoot,
      DANEEL_CORE_STATE_DIR: stateDir,
      DANEEL_CORE_CLI: commandLink,
    },
  });
}

function runFrozenCoreUpdate(args) {
  const forbidden = new Set(["--fetch-upstream-main", "--merge"]);
  for (const arg of args) {
    if (forbidden.has(arg)) {
      console.error(
        `${arg} is disabled for Daneel Core. This runtime is frozen on the final upstream base; make Core changes directly in the fork instead of merging upstream.`,
      );
      process.exit(1);
    }
  }
  const normalizedArgs = args.length > 0 ? [...args] : ["--build-current"];
  if (
    !normalizedArgs.includes("--build-current") &&
    !normalizedArgs.includes("--no-merge") &&
    !normalizedArgs.includes("--dry-run")
  ) {
    normalizedArgs.unshift("--build-current");
  }
  runSafeUpdate("update", normalizedArgs);
}

function printOptional(command, args, options = {}) {
  const result = runOptional(command, args, options);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result;
}

function parseJsonRun(command, args, options = {}) {
  const result = runOptional(command, args, options);
  if (result.status !== 0) {
    return { ok: false, result, value: null, error: result.stderr || result.stdout };
  }
  try {
    return { ok: true, result, value: JSON.parse(result.stdout), error: null };
  } catch (error) {
    return { ok: false, result, value: null, error: `invalid JSON: ${error.message}` };
  }
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonFileOptional(file) {
  try {
    return readJsonFile(file);
  } catch {
    return null;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function probeTelegramTokenFromConfig(timeoutMs = 10000) {
  const config = readJsonFileOptional(path.join(stateDir, "openclaw.json"));
  const telegram = config?.channels?.telegram;
  if (!telegram?.enabled) {
    return { configured: false, probeOk: false, detail: "telegram disabled in config" };
  }

  let token = typeof telegram.token === "string" ? telegram.token.trim() : "";
  if (!token && typeof telegram.tokenFile === "string") {
    try {
      token = fs.readFileSync(telegram.tokenFile, "utf8").trim();
    } catch {
      token = "";
    }
  }
  if (!token) {
    return { configured: false, probeOk: false, detail: "telegram token unavailable in config" };
  }
  if (typeof fetch !== "function") {
    return { configured: true, probeOk: false, detail: "fetch unavailable for token probe" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        configured: true,
        probeOk: false,
        detail: `telegram token probe HTTP ${response.status}`,
      };
    }
    const body = await response.json();
    return {
      configured: true,
      probeOk: body?.ok === true,
      botUsername: body?.result?.username || "unknown",
      detail: body?.ok === true ? "telegram token probe ok" : "telegram token probe failed",
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : error?.message || String(error);
    return { configured: true, probeOk: false, detail: `telegram token probe ${reason}` };
  } finally {
    clearTimeout(timeout);
  }
}

function sortUnique(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === "string" && value.trim(),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function ensureObject(parent, key) {
  if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function arrayChanged(before, after) {
  return JSON.stringify(before ?? []) !== JSON.stringify(after ?? []);
}

function applyDaneelCoreHardening(config) {
  const changes = [];
  const plugins = ensureObject(config, "plugins");
  const nextPluginsAllow = sortUnique(hardeningPolicy.pluginsAllow);
  if (arrayChanged(plugins.allow, nextPluginsAllow)) {
    plugins.allow = nextPluginsAllow;
    changes.push(`plugins.allow=${nextPluginsAllow.join(",")}`);
  }
  if (plugins.bundledDiscovery !== "allowlist") {
    plugins.bundledDiscovery = "allowlist";
    changes.push("plugins.bundledDiscovery=allowlist");
  }
  if (plugins.entries && typeof plugins.entries === "object" && !Array.isArray(plugins.entries)) {
    const allowedPlugins = new Set(nextPluginsAllow);
    for (const pluginId of Object.keys(plugins.entries)) {
      if (!allowedPlugins.has(pluginId)) {
        delete plugins.entries[pluginId];
        changes.push(`plugins.entries.${pluginId}=removed`);
      }
    }
  }

  const channels = config.channels;
  if (channels && typeof channels === "object" && !Array.isArray(channels)) {
    const allowedChannels = new Set(hardeningPolicy.channelsAllow);
    for (const [channelId, channelConfig] of Object.entries(channels)) {
      if (!allowedChannels.has(channelId)) {
        if (channelConfig && typeof channelConfig === "object" && !Array.isArray(channelConfig)) {
          if (channelConfig.enabled !== false) {
            channelConfig.enabled = false;
            changes.push(`channels.${channelId}.enabled=false`);
          }
        } else {
          channels[channelId] = { enabled: false };
          changes.push(`channels.${channelId}.enabled=false`);
        }
      }
    }
  }
  if (Array.isArray(config.enabledChannels)) {
    const nextEnabledChannels = config.enabledChannels.filter((channelId) =>
      hardeningPolicy.channelsAllow.includes(channelId),
    );
    if (arrayChanged(config.enabledChannels, nextEnabledChannels)) {
      config.enabledChannels = nextEnabledChannels;
      changes.push(`enabledChannels=${nextEnabledChannels.join(",")}`);
    }
  }

  const skills = ensureObject(config, "skills");
  const nextBundledSkillsAllow = sortUnique(hardeningPolicy.bundledSkillsAllow);
  if (arrayChanged(skills.allowBundled, nextBundledSkillsAllow)) {
    skills.allowBundled = nextBundledSkillsAllow;
    changes.push(`skills.allowBundled=${nextBundledSkillsAllow.join(",")}`);
  }

  const secrets = ensureObject(config, "secrets");
  const secretProviders = ensureObject(secrets, "providers");
  const secretDefaults = ensureObject(secrets, "defaults");
  const providerName = hardeningPolicy.secretExecProvider;
  const nextProvider = {
    source: "exec",
    command: process.execPath,
    args: [onePasswordResolverScript],
    timeoutMs: 15000,
    noOutputTimeoutMs: 15000,
    maxOutputBytes: 131072,
    jsonOnly: true,
    passEnv: ["HOME", "OP_ACCOUNT", "OP_CLI_PATH", "OP_SERVICE_ACCOUNT_TOKEN"],
  };
  if (JSON.stringify(secretProviders[providerName]) !== JSON.stringify(nextProvider)) {
    secretProviders[providerName] = nextProvider;
    changes.push(`secrets.providers.${providerName}=op-read-resolver`);
  }
  if (secretDefaults.exec !== providerName) {
    secretDefaults.exec = providerName;
    changes.push(`secrets.defaults.exec=${providerName}`);
  }

  const commands = ensureObject(config, "commands");
  const ownerAllowFrom = sortUnique(commands.ownerAllowFrom);
  if (!ownerAllowFrom.includes("telegram:6210106819")) {
    ownerAllowFrom.push("telegram:6210106819");
    commands.ownerAllowFrom = sortUnique(ownerAllowFrom);
    changes.push("commands.ownerAllowFrom includes telegram:6210106819");
  }

  const session = ensureObject(config, "session");
  if (JSON.stringify(session.maintenance) !== JSON.stringify(stateRetentionPolicy)) {
    session.maintenance = cloneJson(stateRetentionPolicy);
    changes.push("session.maintenance=30d/1gb");
  }
  const cron = ensureObject(config, "cron");
  if (cron.sessionRetention !== "24h") {
    cron.sessionRetention = "24h";
    changes.push("cron.sessionRetention=24h");
  }

  return changes;
}

async function hardenProfile(options = {}) {
  const cfgPath = coreEnv().OPENCLAW_CONFIG_PATH;
  const quiet = options.quiet === true;
  const dryRun = options.dryRun === true;
  const json = options.json === true;
  let config = readJsonFileOptional(cfgPath);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    config = {};
  }
  const changes = applyDaneelCoreHardening(config);
  if (changes.length > 0 && !dryRun) {
    await fsp.mkdir(path.dirname(cfgPath), { recursive: true });
    await fsp.writeFile(cfgPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await fsp.chmod(cfgPath, 0o600);
  }
  if (json) {
    console.log(JSON.stringify({ ok: true, changed: changes.length > 0, changes }, null, 2));
  } else if (!quiet) {
    const action = dryRun ? "would update" : changes.length > 0 ? "updated" : "already hardened";
    console.log(`Daneel Core profile ${action}: ${cfgPath}`);
    for (const change of changes) {
      console.log(`- ${change}`);
    }
  }
  return changes;
}

function formatCoreCommit(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/[0-9a-fA-F]{7,40}/);
  return match ? match[0].slice(0, 7).toLowerCase() : null;
}

function resolveCoreVersion() {
  const packageVersion = readJsonFileOptional(path.join(repoRoot, "package.json"))?.version;
  if (typeof packageVersion === "string" && packageVersion.trim()) {
    return packageVersion.trim();
  }
  const buildVersion = readJsonFileOptional(
    path.join(repoRoot, "dist", "build-info.json"),
  )?.version;
  if (typeof buildVersion === "string" && buildVersion.trim()) {
    return buildVersion.trim();
  }
  return "0.0.0";
}

function resolveCoreCommit() {
  const envCommit = formatCoreCommit(process.env.GIT_COMMIT ?? process.env.GIT_SHA);
  if (envCommit) {
    return envCommit;
  }
  const gitCommit = runOptional("git", ["rev-parse", "--short=7", "HEAD"], {
    cwd: repoRoot,
  });
  if (gitCommit.ok) {
    const formatted = formatCoreCommit(gitCommit.stdout);
    if (formatted) {
      return formatted;
    }
  }
  return (
    formatCoreCommit(
      readJsonFileOptional(path.join(repoRoot, "dist", "build-info.json"))?.commit,
    ) ??
    formatCoreCommit(readJsonFileOptional(path.join(repoRoot, "package.json"))?.gitHead) ??
    formatCoreCommit(readJsonFileOptional(path.join(repoRoot, "package.json"))?.githead)
  );
}

function version() {
  const coreVersion = resolveCoreVersion();
  const commit = resolveCoreCommit();
  console.log(commit ? `Daneel Core ${coreVersion} (${commit})` : `Daneel Core ${coreVersion}`);
}

function installedCodexHarnessSupportsOpenAi() {
  const harnessFile = path.join(
    stateDir,
    "npm",
    "node_modules",
    "@openclaw",
    "codex",
    "dist",
    "harness.js",
  );
  if (!fs.existsSync(harnessFile)) {
    return { installed: false, supports: true };
  }
  const source = fs.readFileSync(harnessFile, "utf8");
  return {
    installed: true,
    supports: /["']openai["']/.test(source),
  };
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function checkTcpPort(host, portNumber, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: portNumber });
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, `tcp connect ok ${host}:${portNumber}`));
    socket.once("timeout", () => finish(false, `tcp connect timeout ${host}:${portNumber}`));
    socket.once("error", (error) =>
      finish(false, `${host}:${portNumber} ${error.code || error.message}`),
    );
  });
}

async function ensureRuntimePath() {
  await fsp.mkdir(path.join(stateDir, "bin"), { recursive: true, mode: 0o700 });
  await fsp.mkdir(logDir, { recursive: true, mode: 0o700 });
  if (!findOnPath("pnpm")) {
    const shim = path.join(stateDir, "bin", "pnpm");
    await fsp.writeFile(shim, '#!/usr/bin/env sh\nexec corepack pnpm "$@"\n', { mode: 0o700 });
    await fsp.chmod(shim, 0o700);
  }
  process.env.PATH = buildRuntimePath();
  runOptional("corepack", ["prepare", `pnpm@${pnpmVersion}`, "--activate"]);
}

function findOnPath(binary) {
  const parts = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return parts.some((entry) => {
    try {
      fs.accessSync(path.join(entry, binary), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function buildRuntimePath() {
  return [
    path.join(stateDir, "bin"),
    path.join(homeDir, ".npm-global", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH || "",
  ]
    .filter(Boolean)
    .join(path.delimiter);
}

function coreEnv() {
  return {
    ...process.env,
    OPENCLAW_PROFILE: profile,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"),
    OPENCLAW_GATEWAY_PORT: port,
    OPENCLAW_PORT: port,
    OPENCLAW_CLI_NAME: "daneel-core",
    PATH: buildRuntimePath(),
  };
}

function systemctl(args, options = {}) {
  const direct = runOptional("systemctl", ["--user", ...args], options);
  if (direct.status === 0) {
    if (!options.capture) {
      process.stdout.write(direct.stdout);
      process.stderr.write(direct.stderr);
    }
    return direct;
  }
  const machineArgs = resolveMachineSystemctlArgs(args);
  if (machineArgs) {
    const machine = runOptional("systemctl", machineArgs, options);
    if (machine.status === 0) {
      if (!options.capture) {
        process.stdout.write(machine.stdout);
        process.stderr.write(machine.stderr);
      }
      return machine;
    }
    if (!options.capture) {
      process.stderr.write(machine.stderr || machine.stdout || direct.stderr || direct.stdout);
    }
    process.exit(machine.status ?? 1);
  }
  if (!options.capture) {
    process.stderr.write(direct.stderr || direct.stdout);
    process.exit(direct.status ?? 1);
  }
  return direct;
}

function systemctlOptional(args) {
  const direct = runOptional("systemctl", ["--user", ...args]);
  if (direct.status === 0) {
    return direct;
  }
  const machineArgs = resolveMachineSystemctlArgs(args);
  return machineArgs ? runOptional("systemctl", machineArgs) : direct;
}

function printSystemctlOptional(args) {
  const direct = runOptional("systemctl", ["--user", ...args]);
  if (direct.status === 0) {
    if (direct.stdout) {
      process.stdout.write(direct.stdout);
    }
    if (direct.stderr) {
      process.stderr.write(direct.stderr);
    }
    return direct;
  }
  const machineArgs = resolveMachineSystemctlArgs(args);
  if (machineArgs) {
    return printOptional("systemctl", machineArgs);
  }
  if (direct.stdout) {
    process.stdout.write(direct.stdout);
  }
  if (direct.stderr) {
    process.stderr.write(direct.stderr);
  }
  return direct;
}

function resolveMachineSystemctlArgs(args) {
  let username = process.env.USER || process.env.LOGNAME || "";
  try {
    username ||= os.userInfo().username;
  } catch {
    // Fall through.
  }
  username = username.trim();
  return username ? ["--machine", `${username}@`, "--user", ...args] : null;
}

function unitExists() {
  return fs.existsSync(unitPath);
}

function shellQuoteSystemdValue(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function systemdPath(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll(" ", "\\x20");
}

function buildUnitContent() {
  const node = process.execPath;
  const launcher = fileURLToPath(import.meta.url);
  const env = coreEnv();
  const envLines = [
    ["OPENCLAW_PROFILE", env.OPENCLAW_PROFILE],
    ["OPENCLAW_STATE_DIR", env.OPENCLAW_STATE_DIR],
    ["OPENCLAW_CONFIG_PATH", env.OPENCLAW_CONFIG_PATH],
    ["OPENCLAW_GATEWAY_PORT", env.OPENCLAW_GATEWAY_PORT],
    ["OPENCLAW_PORT", env.OPENCLAW_PORT],
    ["OPENCLAW_DANEEL_CORE_STATE_DIR", stateDir],
    ["OPENCLAW_DANEEL_CORE_PROFILE", profile],
    ["OPENCLAW_DANEEL_CORE_PORT", port],
    ["PATH", env.PATH],
  ]
    .map(([key, value]) => `Environment=${key}=${shellQuoteSystemdValue(value)}`)
    .join("\n");

  return `[Unit]
Description=Daneel Core Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${systemdPath(repoRoot)}
${envLines}
ExecStart=${systemdPath(node)} ${systemdPath(launcher)} run-service
Restart=on-failure
RestartSec=5
KillMode=control-group
StandardOutput=append:${serviceLog}
StandardError=append:${serviceLog}

[Install]
WantedBy=default.target
`;
}

async function installCommand() {
  await fsp.mkdir(path.dirname(commandLink), { recursive: true });
  const target = fileURLToPath(import.meta.url);
  try {
    await fsp.rm(commandLink, { force: true });
    await fsp.symlink(target, commandLink);
  } catch (error) {
    throw new Error(`failed to install ${commandLink}: ${error.message}`);
  }
  console.log(`Installed command: ${commandLink} -> ${target}`);
}

async function stopDetachedIfPresent() {
  const wrapper = path.join(repoRoot, "scripts", "daneel-core-gateway.sh");
  if (!fs.existsSync(wrapper)) {
    return;
  }
  runOptional("bash", [wrapper, "stop"], { env: coreEnv(), cwd: repoRoot });
}

async function installService() {
  await ensureRuntimePath();
  await hardenProfile({ quiet: true });
  await installCommand();
  await stopDetachedIfPresent();
  await fsp.mkdir(path.dirname(unitPath), { recursive: true });
  await fsp.writeFile(unitPath, buildUnitContent(), { mode: 0o600 });
  console.log(`Wrote service unit: ${unitPath}`);
  systemctl(["daemon-reload"]);
  systemctl(["enable", "--now", serviceUnit]);
  status();
}

async function uninstallService() {
  if (unitExists()) {
    systemctlOptional(["disable", "--now", serviceUnit]);
    await fsp.rm(unitPath, { force: true });
    systemctlOptional(["daemon-reload"]);
    console.log(`Removed service unit: ${unitPath}`);
  } else {
    console.log(`Service unit not installed: ${unitPath}`);
  }
}

function status() {
  if (unitExists()) {
    printSystemctlOptional(["status", "--no-pager", serviceUnit]);
  } else {
    console.log(`Service unit not installed: ${unitPath}`);
  }
  printOptional("ss", ["-ltnp", `sport = :${port}`]);
  console.log(`State dir: ${stateDir}`);
  console.log(`Service log: ${serviceLog}`);
  console.log(`Detached log: ${detachedLog}`);
}

function logs(lines = "120", follow = false) {
  run("tail", follow ? ["-f", serviceLog] : ["-n", String(lines), serviceLog]);
}

async function runService() {
  await ensureRuntimePath();
  await hardenProfile({ quiet: true });
  const child = spawn(process.execPath, ["openclaw.mjs", "gateway"], {
    cwd: repoRoot,
    env: coreEnv(),
    stdio: "inherit",
  });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

async function probe() {
  await ensureRuntimePath();
  await hardenProfile({ quiet: true });
  run(process.execPath, ["openclaw.mjs", "channels", "status", "--probe"], {
    env: coreEnv(),
    cwd: repoRoot,
  });
}

async function delegateOpenClawCommand(command, args = process.argv.slice(3)) {
  await ensureRuntimePath();
  if (
    ["dashboard", "doctor", "devices", "gateway", "models", "tui", "chat", "terminal"].includes(
      command,
    )
  ) {
    await hardenProfile({ quiet: true });
  }
  run(process.execPath, ["openclaw.mjs", command, ...args], {
    env: coreEnv(),
    cwd: repoRoot,
  });
}

async function stateRetention(args = process.argv.slice(3)) {
  await hardenProfile({ quiet: true });
  if (!fs.existsSync(stateRetentionScript)) {
    console.error(`State retention script not found: ${stateRetentionScript}`);
    process.exit(1);
  }
  run("python3", [stateRetentionScript, ...args], { env: coreEnv(), cwd: repoRoot });
}

function normalizeSecretInputEnvId(value) {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
    return match?.[1];
  }
  if (value && typeof value === "object" && value.source === "env") {
    return typeof value.id === "string" && value.id.trim() ? value.id.trim() : undefined;
  }
  return undefined;
}

function gatewayToken() {
  const env = coreEnv();
  const cfgPath = env.OPENCLAW_CONFIG_PATH;
  let token;
  let tokenInput;
  try {
    const cfg = readJsonFile(cfgPath);
    tokenInput = cfg.gateway?.auth?.token;
    if (typeof tokenInput === "string" && !normalizeSecretInputEnvId(tokenInput)) {
      token = tokenInput.trim();
    } else {
      const envId = normalizeSecretInputEnvId(tokenInput);
      if (envId) {
        token = env[envId]?.trim();
      }
    }
  } catch (error) {
    console.error(`Unable to read Core config at ${cfgPath}: ${error.message}`);
    process.exit(1);
  }
  token ||= env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) {
    console.error(
      "No gateway token found in gateway.auth.token or OPENCLAW_GATEWAY_TOKEN for this Core profile.",
    );
    process.exit(1);
  }
  console.log(token);
}

function recentLogIssues() {
  if (!fs.existsSync(serviceLog)) {
    return { ok: false, detail: `service log missing: ${serviceLog}`, matches: [] };
  }
  const text = fs.readFileSync(serviceLog, "utf8");
  const readyMarker = "[gateway] ready";
  const readyAt = text.lastIndexOf(readyMarker);
  if (readyAt < 0) {
    return { ok: false, detail: "service log has no recent gateway ready marker", matches: [] };
  }
  const recent = text.slice(readyAt);
  const patterns = [
    /\bfatal\b/i,
    /\bpanic\b/i,
    /\buncaught\b/i,
    /ERR_MODULE_NOT_FOUND/i,
    /failed to load/i,
    /sidecars failed/i,
    /startup model warmup failed/i,
    /Plugin approval unavailable/i,
  ];
  const falsePositivePatterns = [/\bno\s+fatal\b/i, /\b0\s+fatal\b/i, /\bzero\s+fatal\b/i];
  const matches = recent
    .split(/\r?\n/)
    .filter((line) => {
      if (!patterns.some((pattern) => pattern.test(line))) {
        return false;
      }
      return !falsePositivePatterns.some((pattern) => pattern.test(line));
    })
    .slice(-10);
  return {
    ok: matches.length === 0,
    detail:
      matches.length === 0
        ? "no severe log lines since latest ready marker"
        : `${matches.length} severe log line(s) since latest ready marker`,
    matches,
  };
}

async function healthcheck() {
  await ensureRuntimePath();
  const json = process.argv.includes("--json");
  const checks = [];
  const add = (name, ok, detail, extra = {}) => {
    checks.push({ name, ok: Boolean(ok), detail, ...extra });
  };

  const active = systemctlOptional(["is-active", serviceUnit]);
  const serviceOk = active.stdout.trim() === "active";
  add(
    "service",
    serviceOk,
    active.stdout.trim() || active.stderr.trim() || `exit ${active.status}`,
  );

  const enabled = systemctlOptional(["is-enabled", serviceUnit]);
  add(
    "service-enabled",
    enabled.stdout.trim() === "enabled",
    enabled.stdout.trim() || enabled.stderr.trim() || `exit ${enabled.status}`,
  );

  let portOk = false;
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber <= 0) {
    add("port", false, `invalid port ${port}`);
  } else {
    const listener = await checkTcpPort("127.0.0.1", portNumber);
    portOk = listener.ok;
    add("port", listener.ok, listener.detail);
  }

  const channel = parseJsonRun(
    process.execPath,
    ["openclaw.mjs", "channels", "status", "--probe", "--json"],
    {
      env: coreEnv(),
      cwd: repoRoot,
    },
  );
  if (!channel.ok) {
    add("telegram", false, channel.error || "channels status failed");
  } else {
    const account =
      channel.value?.channelAccounts?.telegram?.[0] ?? channel.value?.channels?.telegram;
    const connected = account?.connected ?? "unknown";
    const botUsername =
      account?.probe?.bot?.username || account?.probe?.botInfo?.username || "unknown";
    const statusSource = channel.value?.channelAccounts?.telegram?.[0]
      ? "channelAccounts"
      : account
        ? "channels"
        : "missing";
    if (account) {
      add(
        "telegram",
        Boolean(account.configured && account.running && account.probe?.ok),
        `configured=${account.configured} running=${account.running} connected=${connected} probe=${account.probe?.ok} bot=${botUsername} source=${statusSource}`,
      );
    } else {
      const fallback = await probeTelegramTokenFromConfig();
      add(
        "telegram",
        Boolean(serviceOk && portOk && fallback.configured && fallback.probeOk),
        `runtime account missing; ${fallback.detail} bot=${fallback.botUsername || "unknown"} source=config-token-fallback`,
      );
    }
  }

  const models = parseJsonRun(process.execPath, ["openclaw.mjs", "models", "status", "--json"], {
    env: coreEnv(),
    cwd: repoRoot,
  });
  if (!models.ok) {
    add("model-auth", false, models.error || "models status failed");
  } else {
    const auth = models.value?.auth || {};
    const routes = Array.isArray(auth.runtimeAuthRoutes) ? auth.runtimeAuthRoutes : [];
    const unusable = Array.isArray(auth.unusableProfiles) ? auth.unusableProfiles : [];
    const missing = Array.isArray(auth.missingProvidersInUse) ? auth.missingProvidersInUse : [];
    const oauthProfiles = Array.isArray(auth.oauth?.profiles) ? auth.oauth.profiles : [];
    const usableRoutes = routes.filter((route) => route.status === "usable").length;
    const soonestRemainingMs = oauthProfiles
      .map((profileInfo) => profileInfo.remainingMs)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)[0];
    const remainingDetail = Number.isFinite(soonestRemainingMs)
      ? ` oauthRemainingHours=${Math.round(soonestRemainingMs / 36_000) / 100}`
      : "";
    add(
      "model-auth",
      usableRoutes > 0 && unusable.length === 0 && missing.length === 0,
      `default=${models.value?.resolvedDefault || models.value?.defaultModel || "unknown"} usableRoutes=${usableRoutes} missing=${missing.length} unusable=${unusable.length}${remainingDetail}`,
    );
  }

  let modelRouteOk = false;
  try {
    const cfg = readJsonFile(path.join(stateDir, "openclaw.json"));
    const defaultModel =
      models.value?.resolvedDefault ||
      models.value?.defaultModel ||
      cfg.agents?.defaults?.model?.primary;
    const runtimeId = cfg.agents?.defaults?.models?.[defaultModel]?.agentRuntime?.id;
    const authStore = readJsonFile(
      path.join(stateDir, "agents", "main", "agent", "auth-profiles.json"),
    );
    const codexProfile = Object.values(authStore.profiles || {}).find(
      (profileInfo) => profileInfo?.provider === "openai-codex" && profileInfo?.type === "oauth",
    );
    const codexScopes = decodeJwtPayload(codexProfile?.access)?.scp || [];
    let routeOk = true;
    let routeDetail = `default=${defaultModel || "unknown"} runtime=${runtimeId || "default"}`;
    if (String(defaultModel || "").startsWith("openai/")) {
      if (runtimeId === "codex") {
        const codexHarness = installedCodexHarnessSupportsOpenAi();
        routeOk = codexHarness.supports;
        routeDetail += codexHarness.installed
          ? routeOk
            ? " openai model pinned through installed codex harness"
            : " installed codex plugin is stale and rejects openai/* models; run daneel-core update --build-current"
          : " openai model pinned through bundled codex harness";
      } else {
        routeOk = codexScopes.includes("api.responses.write");
        routeDetail += routeOk
          ? " openai OAuth has responses scope"
          : " openai default requires api.responses.write, which the stored OAuth token lacks";
      }
    } else if (String(defaultModel || "").startsWith("openai-codex/")) {
      routeOk = runtimeId === "codex";
      routeDetail += routeOk
        ? " legacy openai-codex model pinned through codex harness"
        : " legacy openai-codex default must be migrated to openai/* or pinned through codex";
    }
    modelRouteOk = routeOk;
    add("model-route", routeOk, routeDetail);
  } catch (error) {
    add("model-route", false, `unable to verify model route: ${error.message}`);
  }

  if (serviceOk && portOk && models.ok && modelRouteOk) {
    let modelTurn;
    let modelText = "";
    let turnOk = false;
    for (let attempt = 0; attempt < 2 && !turnOk; attempt += 1) {
      const modelTurnSessionKey = `agent:main:daneel-core-healthcheck-model-turn-${attempt}`;
      // Clear the prior one-shot probe before reuse. This also recovers a probe
      // left behind when a parent runner was killed before post-run cleanup.
      runOptional(
        process.execPath,
        [
          "openclaw.mjs",
          "gateway",
          "call",
          "sessions.delete",
          "--params",
          JSON.stringify({ key: modelTurnSessionKey }),
          "--json",
          "--timeout",
          "10000",
        ],
        { env: coreEnv(), cwd: repoRoot, timeout: 15_000 },
      );
      modelTurn = parseJsonRun(
        process.execPath,
        [
          "openclaw.mjs",
          "agent",
          "--local",
          "--session-key",
          modelTurnSessionKey,
          "--timeout",
          "60",
          "--thinking",
          "off",
          "--json",
          "--message",
          "No delivery. Do not use tools. Reply with exactly CORE_MODEL_OK and nothing else.",
        ],
        {
          env: coreEnv(),
          cwd: repoRoot,
          timeout: 90_000,
        },
      );
      // Health probes must never accumulate conversational context. A reused
      // probe session eventually becomes large enough to compact, echo its own
      // repeated prompt, and time out. Delete each one-shot session after the
      // child exits; a future cleanup pass can collect files if the gateway is
      // temporarily unavailable.
      runOptional(
        process.execPath,
        [
          "openclaw.mjs",
          "gateway",
          "call",
          "sessions.delete",
          "--params",
          JSON.stringify({ key: modelTurnSessionKey }),
          "--json",
          "--timeout",
          "10000",
        ],
        { env: coreEnv(), cwd: repoRoot, timeout: 15_000 },
      );
      modelText =
        modelTurn.value?.finalAssistantVisibleText ||
        modelTurn.value?.finalAssistantRawText ||
        modelTurn.value?.payloads?.[0]?.text ||
        "";
      turnOk = Boolean(modelTurn.ok && /^CORE_MODEL_OK(?:\s|$)/.test(String(modelText).trim()));
    }
    add(
      "model-turn",
      turnOk,
      turnOk
        ? `completed configured route provider=${modelTurn.value?.meta?.agentMeta?.provider || "unknown"} model=${modelTurn.value?.meta?.agentMeta?.model || "unknown"}`
        : modelTurn.error ||
            `unexpected model response: ${String(modelText).trim().slice(0, 120) || "empty"}`,
    );
  } else {
    add("model-turn", false, "skipped because service, port, auth, or route is not ready");
  }

  const logCheck = recentLogIssues();
  add(
    "fresh-logs",
    logCheck.ok,
    logCheck.detail,
    logCheck.matches.length ? { matches: logCheck.matches } : {},
  );

  const ok = checks.every((check) => check.ok);
  const payload = {
    ok,
    checkedAt: new Date().toISOString(),
    profile,
    stateDir,
    port,
    serviceUnit,
    checks,
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(ok ? "Daneel Core healthcheck: OK" : "Daneel Core healthcheck: FAIL");
    for (const check of checks) {
      console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
      if (check.matches) {
        for (const match of check.matches) {
          console.log(`  ${match}`);
        }
      }
    }
  }
  if (!ok) {
    process.exit(1);
  }
}

function fileModeOctal(file) {
  try {
    return fs.statSync(file).mode & 0o777;
  } catch {
    return null;
  }
}

function formatMode(mode) {
  return mode == null ? "missing" : mode.toString(8).padStart(3, "0");
}

function checkCoreRuntimePolicy(config) {
  const plugins = config.plugins || {};
  const entries = plugins.entries || {};
  const pluginAllow = Array.isArray(plugins.allow) ? sortUnique(plugins.allow) : [];
  const allowedPlugins = sortUnique(hardeningPolicy.pluginsAllow);
  const enabledPluginIds = Object.entries(entries)
    .filter(([, entry]) => entry?.enabled !== false)
    .map(([pluginId]) => pluginId)
    .sort();
  const unexpectedEnabled = enabledPluginIds.filter(
    (pluginId) => !allowedPlugins.includes(pluginId),
  );
  const telegram = config.channels?.telegram;
  const nonTelegramChannels = Object.entries(config.channels || {})
    .filter(([channelId]) => channelId !== "telegram")
    .filter(([, channelConfig]) => channelConfig && channelConfig.enabled !== false)
    .map(([channelId]) => channelId);

  return {
    pluginAllowOk: !arrayChanged(pluginAllow, allowedPlugins),
    pluginAllow,
    allowedPlugins,
    bundledDiscovery: plugins.bundledDiscovery || "unset",
    bundledDiscoveryOk: plugins.bundledDiscovery === "allowlist",
    enabledPluginIds,
    unexpectedEnabled,
    telegramOk: Boolean(telegram?.enabled),
    nonTelegramChannels,
    skillsAllow: Array.isArray(config.skills?.allowBundled)
      ? sortUnique(config.skills.allowBundled)
      : [],
  };
}

function checkCoreOwner(config) {
  const ownerAllowFrom = Array.isArray(config.commands?.ownerAllowFrom)
    ? sortUnique(config.commands.ownerAllowFrom)
    : [];
  return {
    ownerAllowFrom,
    ok: ownerAllowFrom.includes("telegram:6210106819"),
  };
}

function checkCoreSecrets(config) {
  const gatewayToken = config.gateway?.auth?.token;
  const plaintextGatewayToken =
    typeof gatewayToken === "string" &&
    gatewayToken.trim() &&
    !normalizeSecretInputEnvId(gatewayToken);
  return {
    plaintextGatewayToken: Boolean(plaintextGatewayToken),
    gatewayTokenRef: !plaintextGatewayToken && Boolean(gatewayToken),
  };
}

function printCoreDoctorLine(status, label, detail) {
  console.log(`${status.padEnd(4)} ${label}: ${detail}`);
}

async function coreDoctor(args = process.argv.slice(3)) {
  if (args.includes("--raw")) {
    await delegateOpenClawCommand(
      "doctor",
      args.filter((arg) => arg !== "--raw"),
    );
    return;
  }

  await ensureRuntimePath();
  const fix = args.includes("--fix");
  const json = args.includes("--json");
  const cfgPath = coreEnv().OPENCLAW_CONFIG_PATH;
  let config = readJsonFileOptional(cfgPath);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    config = {};
  }

  let desiredConfig = cloneJson(config);
  const changes = applyDaneelCoreHardening(desiredConfig);
  const fixed = [];
  if (fix) {
    if (changes.length > 0) {
      await fsp.writeFile(cfgPath, `${JSON.stringify(desiredConfig, null, 2)}\n`, { mode: 0o600 });
      await fsp.chmod(cfgPath, 0o600);
      fixed.push(...changes);
    }
    const stateMode = fileModeOctal(stateDir);
    if (stateMode !== 0o700) {
      await fsp.chmod(stateDir, 0o700);
      fixed.push(`chmod 700 ${stateDir}`);
    }
    config = readJsonFileOptional(cfgPath) || config;
    desiredConfig = cloneJson(config);
  }

  const active = systemctlOptional(["is-active", serviceUnit]);
  const enabled = systemctlOptional(["is-enabled", serviceUnit]);
  const portNumber = Number(port);
  const listener =
    Number.isInteger(portNumber) && portNumber > 0
      ? await checkTcpPort("127.0.0.1", portNumber)
      : { ok: false, detail: `invalid port ${port}` };
  const runtimePolicy = checkCoreRuntimePolicy(config);
  const owner = checkCoreOwner(config);
  const secrets = checkCoreSecrets(config);
  const stateMode = fileModeOctal(stateDir);
  const configMode = fileModeOctal(cfgPath);
  const rawDoctorHint =
    "use `daneel-core doctor --raw` only when debugging inherited runtime internals";

  const checks = [
    {
      name: "service",
      ok: active.stdout.trim() === "active",
      detail: active.stdout.trim() || active.stderr.trim() || `exit ${active.status}`,
    },
    {
      name: "service-enabled",
      ok: enabled.stdout.trim() === "enabled",
      detail: enabled.stdout.trim() || enabled.stderr.trim() || `exit ${enabled.status}`,
    },
    { name: "port", ok: listener.ok, detail: listener.detail },
    {
      name: "runtime-policy",
      ok:
        runtimePolicy.pluginAllowOk &&
        runtimePolicy.bundledDiscoveryOk &&
        runtimePolicy.telegramOk &&
        runtimePolicy.unexpectedEnabled.length === 0 &&
        runtimePolicy.nonTelegramChannels.length === 0,
      detail: `telegram-only=${runtimePolicy.telegramOk && runtimePolicy.nonTelegramChannels.length === 0} plugins=${runtimePolicy.enabledPluginIds.join(",") || "none"} bundledDiscovery=${runtimePolicy.bundledDiscovery}`,
    },
    {
      name: "command-owner",
      ok: owner.ok,
      detail: owner.ownerAllowFrom.length
        ? owner.ownerAllowFrom.join(",")
        : "missing; run `daneel-core doctor --fix`",
    },
    {
      name: "state-permissions",
      ok: stateMode === 0o700 && configMode === 0o600,
      detail: `${stateDir}=${formatMode(stateMode)} openclaw.json=${formatMode(configMode)}`,
    },
  ];
  const warnings = [];
  if (secrets.plaintextGatewayToken) {
    warnings.push(
      "gateway.auth.token is still plaintext; move it to 1Password SecretRef during the next secret cleanup pass",
    );
  }
  if (runtimePolicy.skillsAllow.length > 0) {
    warnings.push(`bundled skill allowlist: ${runtimePolicy.skillsAllow.join(",")}`);
  }
  if (!fix && changes.length > 0) {
    warnings.push(`pending Core profile fixes: ${changes.join("; ")}`);
  }

  const ok = checks.every((check) => check.ok);
  const payload = {
    ok,
    checkedAt: new Date().toISOString(),
    profile,
    stateDir,
    configPath: cfgPath,
    serviceUnit,
    port,
    fixed,
    checks,
    warnings,
    rawDoctorHint,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log("Daneel Core doctor");
    console.log(`Profile: ${profile}`);
    console.log(`State: ${stateDir}`);
    console.log(`Config: ${cfgPath}`);
    console.log("");
    for (const check of checks) {
      printCoreDoctorLine(check.ok ? "OK" : "WARN", check.name, check.detail);
    }
    for (const warning of warnings) {
      printCoreDoctorLine("INFO", "note", warning);
    }
    if (fixed.length > 0) {
      console.log("");
      console.log("Applied fixes:");
      for (const change of fixed) {
        console.log(`- ${change}`);
      }
    }
    console.log("");
    console.log(rawDoctorHint);
  }

  if (!ok) {
    process.exit(1);
  }
}

function splitShellWords(input) {
  const words = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error(`unterminated ${quote} quote`);
  }
  if (current) {
    words.push(current);
  }
  return words;
}

function readFlagValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

function legacyCronJobNames() {
  return new Set([
    "sonarr-status-refresh",
    "mets-ticket-price-refresh",
    "mission-control-state-builder",
    "mission-control-health-check",
    "daily-eodhd-value-scan",
    "daily-sonarr-wanted-report",
    "daneel-core-openclaw-state-backup-local",
    "openclaw-state-backup-local",
    "gomining-price-update",
    "daily-todo-republish",
  ]);
}

function approvedDirectJobNames() {
  return new Set(["fastmail-cron-failure-folder-monitor", "kalshi-mlb-pitcher-change-alerts"]);
}

function classifyDirectJob(command) {
  const genericWrapper = path.join(workspaceRoot, "scripts", "cron_daneel_core_job_wrapper.py");
  const executable = command[1] || command[0] || "";
  if (command.includes(genericWrapper) || executable.endsWith("/cron_daneel_core_job_wrapper.py")) {
    return "core-wrapped-legacy";
  }
  if (command.some((part) => /cron_daneel_core_.*\.py$/.test(part))) {
    return "core-wrapper";
  }
  if (command[0] === commandLink || command[0]?.endsWith("/daneel-core")) {
    return "core-cli";
  }
  return "direct";
}

function parseDirectCronJobs(crontabText) {
  const runnerBasename = "cron_direct_runner.py";
  const jobs = [];
  const parseErrors = [];
  for (const [index, rawLine] of crontabText.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || /^[A-Z_][A-Z0-9_]*=/.test(line)) {
      continue;
    }
    let words;
    try {
      words = splitShellWords(line);
    } catch (error) {
      parseErrors.push({ line: index + 1, error: error.message, raw: rawLine });
      continue;
    }
    if (words.length < 7 || !words.some((word) => word.endsWith(`/${runnerBasename}`))) {
      continue;
    }
    const schedule = words.slice(0, 5).join(" ");
    const args = words.slice(5);
    const name = readFlagValue(args, "--name") || "";
    let command = [];
    let legacyJobName = null;
    let commandParseError = null;
    try {
      command = parseJsonArray(readFlagValue(args, "--cmd-json"));
      legacyJobName = readFlagValue(command, "--job-name");
    } catch (error) {
      commandParseError = error.message;
    }
    jobs.push({
      name,
      schedule,
      sendMode: readFlagValue(args, "--send-mode"),
      channel: readFlagValue(args, "--channel"),
      target: readFlagValue(args, "--target"),
      timeoutSeconds: Number(readFlagValue(args, "--timeout")) || null,
      jsonOk: args.includes("--json-ok"),
      classification: classifyDirectJob(command),
      legacyJobName,
      command,
      commandParseError,
      line: index + 1,
    });
  }
  return { jobs, parseErrors };
}

function summarizeJobs(jobs, parseErrors) {
  const oldNames = legacyCronJobNames();
  const approvedDirectNames = approvedDirectJobNames();
  const approvedExternalNames = jobs
    .filter((job) => approvedDirectNames.has(job.name))
    .map((job) => job.name);
  const nonCoreNames = jobs
    .filter((job) => !job.name.startsWith("daneel-core-") && !approvedDirectNames.has(job.name))
    .map((job) => job.name);
  const oldNamesPresent = jobs.filter((job) => oldNames.has(job.name)).map((job) => job.name);
  const legacyWrappedNames = jobs
    .filter((job) => job.legacyJobName)
    .map((job) => job.legacyJobName);
  const commandParseErrors = jobs
    .filter((job) => job.commandParseError)
    .map((job) => ({ name: job.name, error: job.commandParseError }));
  const classifications = jobs.reduce((counts, job) => {
    counts[job.classification] = (counts[job.classification] || 0) + 1;
    return counts;
  }, {});
  const ok =
    jobs.length > 0 &&
    nonCoreNames.length === 0 &&
    oldNamesPresent.length === 0 &&
    parseErrors.length === 0 &&
    commandParseErrors.length === 0;
  return {
    ok,
    jobCount: jobs.length,
    coreOwnedCount: jobs.length - approvedExternalNames.length - nonCoreNames.length,
    approvedExternalNames,
    classifications,
    nonCoreNames,
    oldNamesPresent,
    legacyWrappedNames,
    parseErrors,
    commandParseErrors,
  };
}

function commandArgs() {
  return process.argv.slice(3);
}

function hasCommandFlag(flag) {
  return commandArgs().includes(flag);
}

function requireWorkspaceFile(relativePath) {
  const file = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(file)) {
    throw new Error(`missing workspace file: ${file}`);
  }
  return file;
}

function requireFile(file, label = "file") {
  if (!fs.existsSync(file)) {
    throw new Error(`missing ${label}: ${file}`);
  }
  return file;
}

function scheduledJobEnv() {
  const env = { ...process.env };
  if (!env.OP_SERVICE_ACCOUNT_TOKEN && fs.existsSync(opServiceAccountTokenFile)) {
    const token = fs.readFileSync(opServiceAccountTokenFile, "utf8").trim();
    if (token) {
      env.OP_SERVICE_ACCOUNT_TOKEN = token;
    }
  }
  return env;
}

function checkCoreHealthForScheduledJob(timeoutSeconds = 90) {
  if (!fs.existsSync(commandLink)) {
    throw new Error(`missing daneel-core CLI: ${commandLink}`);
  }
  const result = runOptional(commandLink, ["healthcheck", "--json"], {
    cwd: repoRoot,
    env: process.env,
    timeout: timeoutSeconds * 1000,
  });
  if (result.status !== 0) {
    throw new Error(
      `daneel-core healthcheck failed: ${(result.stderr || result.stdout || "").trim().slice(0, 1200)}`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout || "{}");
  } catch (error) {
    throw new Error(`daneel-core healthcheck returned invalid JSON: ${error.message}`);
  }
  if (payload.ok !== true) {
    throw new Error(
      `daneel-core healthcheck not ok: ${(result.stdout || "").trim().slice(0, 1200)}`,
    );
  }
  return payload;
}

async function jobsStatus() {
  const json = process.argv.includes("--json");
  const crontab = runOptional("crontab", ["-l"]);
  const checkedAt = new Date().toISOString();
  if (crontab.status !== 0) {
    const payload = {
      ok: false,
      checkedAt,
      workspaceRoot,
      error: crontab.stderr || crontab.stdout || `crontab exited ${crontab.status}`,
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("Daneel Core jobs: FAIL");
      console.log(payload.error);
    }
    process.exit(1);
  }
  const { jobs, parseErrors } = parseDirectCronJobs(crontab.stdout);
  const summary = summarizeJobs(jobs, parseErrors);
  const payload = { ...summary, checkedAt, workspaceRoot, jobs };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(summary.ok ? "Daneel Core jobs: OK" : "Daneel Core jobs: FAIL");
    console.log(`Managed direct cron jobs: ${summary.jobCount}`);
    console.log(`Core-owned names: ${summary.coreOwnedCount}/${summary.jobCount}`);
    console.log(`Core CLI jobs: ${summary.classifications["core-cli"] || 0}`);
    console.log(`Core wrapper jobs: ${summary.classifications["core-wrapper"] || 0}`);
    console.log(`Core-wrapped legacy jobs: ${summary.classifications["core-wrapped-legacy"] || 0}`);
    if (summary.approvedExternalNames.length) {
      console.log(`Approved external jobs: ${summary.approvedExternalNames.join(", ")}`);
    }
    if (summary.nonCoreNames.length) {
      console.log(`Non-Core names: ${summary.nonCoreNames.join(", ")}`);
    }
    if (summary.oldNamesPresent.length) {
      console.log(`Old names present: ${summary.oldNamesPresent.join(", ")}`);
    }
    for (const job of jobs) {
      const target = job.target ? ` -> ${job.target}` : "";
      const legacy = job.legacyJobName ? ` legacy=${job.legacyJobName}` : "";
      console.log(
        `${job.schedule} ${job.name} [${job.classification}] send=${job.sendMode || "unset"}${target}${legacy}`,
      );
    }
    for (const error of summary.parseErrors) {
      console.log(`Parse error line ${error.line}: ${error.error}`);
    }
    for (const error of summary.commandParseErrors) {
      console.log(`Command parse error ${error.name}: ${error.error}`);
    }
  }
  if (!summary.ok) {
    process.exit(1);
  }
}

async function eodhdValueScan() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const skipRun = hasCommandFlag("--skip-run");
  const script = requireWorkspaceFile("scripts/cron_value_opportunity_scan.py");
  requireWorkspaceFile("mission-control/value_scanner.py");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `daily-eodhd-value-scan Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "eodhd-value-scan",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "eodhd-value-scan",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const env = {
    ...process.env,
    VALUE_SCAN_REQUEST_DELAY_SECONDS: process.env.VALUE_SCAN_REQUEST_DELAY_SECONDS || "0.02",
    SCAN_SENTIMENT_DELAY_SECONDS: process.env.SCAN_SENTIMENT_DELAY_SECONDS || "0.02",
  };
  if (skipRun) {
    env.VALUE_SCAN_SKIP_RUN = "1";
  }
  const result = runOptional("python3", [script], {
    cwd: workspaceRoot,
    env,
    timeout: 1260 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function dailyTodoRepublish() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const script = requireWorkspaceFile("scripts/cron_todo_republish.py");
  requireWorkspaceFile("todo-list.md");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `daily-todo-republish Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "daily-todo-republish",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "daily-todo-republish",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const result = runOptional("python3", [script], {
    cwd: workspaceRoot,
    env: process.env,
    timeout: 120 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function metsTicketPriceRefresh() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const script = requireWorkspaceFile("mission-control/fetch_mets_prices.py");
  requireWorkspaceFile("mission-control/build_state.py");
  requireWorkspaceFile("mission-control/service_account.json");
  requireFile(path.join(stateDir, "openclaw.json"), "Daneel Core config");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `mets-ticket-price-refresh Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "mets-ticket-price-refresh",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "mets-ticket-price-refresh",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const result = runOptional("python3", [script, "--rebuild-state"], {
    cwd: workspaceRoot,
    env: process.env,
    timeout: 360 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function sonarrStatusRefresh() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const script = requireWorkspaceFile("scripts/cron_sonarr_status_refresh.py");
  requireWorkspaceFile("mission-control/sonarr_status_refresh.js");
  requireWorkspaceFile("mission-control/build_state.py");
  requireFile(opServiceAccountTokenFile, "1Password service account token");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `sonarr-status-refresh Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "sonarr-status-refresh",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "sonarr-status-refresh",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const result = runOptional("python3", [script], {
    cwd: workspaceRoot,
    env: scheduledJobEnv(),
    timeout: 360 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function dailySonarrWantedReport() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const script = requireWorkspaceFile("scripts/cron_daily_sonarr_wanted_report.py");
  requireWorkspaceFile("scripts/sonarr_wanted_web.js");
  requireFile(opServiceAccountTokenFile, "1Password service account token");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `daily-sonarr-wanted-report Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "daily-sonarr-wanted-report",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    const result = runOptional("python3", [script, "--preflight-only"], {
      cwd: workspaceRoot,
      env: scheduledJobEnv(),
      timeout: 120 * 1000,
    });
    if (result.status !== 0) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
      process.exit(result.status ?? 1);
    }
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "daily-sonarr-wanted-report",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const result = runOptional("python3", [script], {
    cwd: workspaceRoot,
    env: scheduledJobEnv(),
    timeout: 420 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function gominingPriceUpdate() {
  const json = hasCommandFlag("--json");
  const preflightOnly = hasCommandFlag("--preflight-only");
  const script = requireWorkspaceFile("mission-control/update_gomining_prices.py");
  requireFile(opServiceAccountTokenFile, "1Password service account token");

  let health;
  try {
    health = checkCoreHealthForScheduledJob();
  } catch (error) {
    const message = `gomining-price-update Core preflight failed: ${error.message}`;
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            command: "gomining-price-update",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            error: message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  if (preflightOnly) {
    const env = scheduledJobEnv();
    const opCheck = runOptional(
      "op",
      ["item", "get", "Daneel service account key", "--vault", "Daneel Shared", "--format=json"],
      {
        cwd: workspaceRoot,
        env,
        timeout: 45 * 1000,
      },
    );
    if (opCheck.status !== 0) {
      const detail =
        (opCheck.stderr || opCheck.stdout || "").trim().split("\n").pop() || "unknown error";
      if (json) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              command: "gomining-price-update",
              checkedAt: new Date().toISOString(),
              workspaceRoot,
              error: `1Password service account preflight failed: ${detail}`,
            },
            null,
            2,
          ),
        );
      } else {
        console.error(`gomining-price-update 1Password preflight failed: ${detail}`);
      }
      process.exit(1);
    }
    if (json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            command: "gomining-price-update",
            checkedAt: new Date().toISOString(),
            workspaceRoot,
            coreHealthCheckedAt: health.checkedAt,
            mode: "preflight-only",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("NO_REPLY");
    }
    return;
  }

  const result = runOptional("python3", [script], {
    cwd: workspaceRoot,
    env: scheduledJobEnv(),
    timeout: 300 * 1000,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const coreJobRunners = new Map([
  ["daily-eodhd-value-scan", eodhdValueScan],
  ["eodhd-value-scan", eodhdValueScan],
  ["value-scan", eodhdValueScan],
  ["daily-todo-republish", dailyTodoRepublish],
  ["todo-republish", dailyTodoRepublish],
  ["mets-ticket-price-refresh", metsTicketPriceRefresh],
  ["mets-prices", metsTicketPriceRefresh],
  ["sonarr-status-refresh", sonarrStatusRefresh],
  ["sonarr-status", sonarrStatusRefresh],
  ["daily-sonarr-wanted-report", dailySonarrWantedReport],
  ["sonarr-wanted-report", dailySonarrWantedReport],
  ["gomining-price-update", gominingPriceUpdate],
  ["gomining-prices", gominingPriceUpdate],
]);

async function runCoreJob() {
  const jobName = process.argv[3];
  if (!jobName || jobName === "--help" || jobName === "-h") {
    console.error("Usage: daneel-core run <jobname> [options]");
    console.error(`Known jobs: ${Array.from(coreJobRunners.keys()).join(", ")}`);
    process.exit(2);
  }
  const runner = coreJobRunners.get(jobName);
  if (!runner) {
    console.error(`Unknown Core job: ${jobName}`);
    console.error(`Known jobs: ${Array.from(coreJobRunners.keys()).join(", ")}`);
    process.exit(2);
  }
  await runner();
}

async function main() {
  const command = process.argv[2] || "status";
  switch (command) {
    case "--help":
    case "-h":
    case "help":
      usage();
      return;
    case "--version":
    case "-V":
    case "-v":
    case "version":
      version();
      return;
    case "install-command":
      await installCommand();
      return;
    case "install-service":
      await installService();
      return;
    case "uninstall-service":
      await uninstallService();
      return;
    case "start":
      systemctl(["start", serviceUnit]);
      return;
    case "stop":
      systemctl(["stop", serviceUnit]);
      return;
    case "restart":
      systemctl(["restart", serviceUnit]);
      return;
    case "status":
      if (process.argv.slice(3).includes("--usage")) {
        await delegateOpenClawCommand("status");
        return;
      }
      status();
      return;
    case "usage":
      await delegateOpenClawCommand("status", ["--usage", ...process.argv.slice(3)]);
      return;
    case "healthcheck":
      await healthcheck();
      return;
    case "harden-profile":
      await hardenProfile({
        dryRun: process.argv.includes("--dry-run"),
        json: process.argv.includes("--json"),
        quiet: process.argv.includes("--quiet"),
      });
      return;
    case "dashboard":
    case "devices":
    case "gateway":
    case "models":
    case "tui":
    case "chat":
    case "terminal":
      await delegateOpenClawCommand(command);
      return;
    case "doctor":
      await coreDoctor();
      return;
    case "gateway-token":
      gatewayToken();
      return;
    case "jobs":
    case "cron-status":
      await jobsStatus();
      return;
    case "state-retention":
      await stateRetention();
      return;
    case "run":
      await runCoreJob();
      return;
    case "eodhd-value-scan":
    case "value-scan":
      await eodhdValueScan();
      return;
    case "update":
      runFrozenCoreUpdate(process.argv.slice(3));
      return;
    case "backup":
      runSafeUpdate("backup", process.argv.slice(3));
      return;
    case "rollback":
      runSafeUpdate("rollback", process.argv.slice(3));
      return;
    case "restore":
      runSafeUpdate("restore", process.argv.slice(3));
      return;
    case "probe":
      await probe();
      return;
    case "logs":
      logs(process.argv[3] || "120");
      return;
    case "follow-logs":
      logs("120", true);
      return;
    case "run-service":
      await runService();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(2);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
