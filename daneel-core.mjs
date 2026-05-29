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

function usage() {
  console.log(`Usage: daneel-core <command>

Commands:
  install-service      Install and start the Daneel Core user systemd service
  uninstall-service    Stop, disable, and remove the user systemd service
  start                Start the systemd service
  stop                 Stop the systemd service
  restart              Restart the systemd service
  status               Show service status and port listener state
  healthcheck          Check service, port, Telegram, model auth, and fresh logs
  probe                Probe OpenClaw channels for the Daneel Core profile
  logs [lines]         Show recent service logs
  follow-logs          Follow service logs
  run-service          Run the gateway in the foreground for systemd
  install-command      Symlink this launcher to ~/.local/bin/daneel-core
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: options.env || process.env,
    cwd: options.cwd || repoRoot,
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
Description=Daneel Core OpenClaw Gateway
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
  run(process.execPath, ["openclaw.mjs", "channels", "status", "--probe"], {
    env: coreEnv(),
    cwd: repoRoot,
  });
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
  const matches = recent
    .split(/\r?\n/)
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
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
  add(
    "service",
    active.stdout.trim() === "active",
    active.stdout.trim() || active.stderr.trim() || `exit ${active.status}`,
  );

  const enabled = systemctlOptional(["is-enabled", serviceUnit]);
  add(
    "service-enabled",
    enabled.stdout.trim() === "enabled",
    enabled.stdout.trim() || enabled.stderr.trim() || `exit ${enabled.status}`,
  );

  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber <= 0) {
    add("port", false, `invalid port ${port}`);
  } else {
    const listener = await checkTcpPort("127.0.0.1", portNumber);
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
    const account = channel.value?.channelAccounts?.telegram?.[0];
    add(
      "telegram",
      Boolean(account?.configured && account?.running && account?.probe?.ok),
      account
        ? `configured=${account.configured} running=${account.running} connected=${account.connected} probe=${account.probe?.ok} bot=${account.probe?.bot?.username || account.probe?.botInfo?.username || "unknown"}`
        : "telegram account missing",
    );
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
      routeOk = codexScopes.includes("api.responses.write");
      routeDetail += routeOk
        ? " openai OAuth has responses scope"
        : " openai default requires api.responses.write, which the stored OAuth token lacks";
    } else if (String(defaultModel || "").startsWith("openai-codex/")) {
      routeOk = runtimeId === "openclaw";
      routeDetail += routeOk
        ? " codex transport pinned through openclaw harness"
        : " openai-codex default must be pinned to openclaw harness";
    }
    add("model-route", routeOk, routeDetail);
  } catch (error) {
    add("model-route", false, `unable to verify model route: ${error.message}`);
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

async function main() {
  const command = process.argv[2] || "status";
  switch (command) {
    case "--help":
    case "-h":
    case "help":
      usage();
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
      status();
      return;
    case "healthcheck":
      await healthcheck();
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
