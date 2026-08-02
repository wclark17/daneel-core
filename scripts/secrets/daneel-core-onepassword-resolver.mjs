#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OP_CANDIDATES = [
  process.env.OP_CLI_PATH,
  "/usr/bin/op",
  "/usr/local/bin/op",
  "/opt/homebrew/bin/op",
  path.join(os.homedir(), ".local", "bin", "op"),
].filter(Boolean);

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function findOp() {
  for (const candidate of OP_CANDIDATES) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

function readOptionalTokenFile() {
  const explicitPath = process.env.OP_SERVICE_ACCOUNT_TOKEN_FILE;
  const stateDir =
    process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw-daneel-core");
  const tokenPath =
    explicitPath && explicitPath.trim()
      ? explicitPath
      : path.join(stateDir, "secrets", "op_service_account_token");
  try {
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

function parseRequest() {
  const raw = readStdin();
  const parsed = JSON.parse(raw);
  if (parsed?.protocolVersion !== 1 || !Array.isArray(parsed.ids)) {
    throw new Error("invalid SecretRef exec request");
  }
  return parsed.ids.filter((id) => typeof id === "string" && id.trim());
}

function isAllowedOnePasswordRef(id) {
  return id.startsWith("op://") && id.length <= 256;
}

const values = {};
const errors = {};

try {
  const ids = parseRequest();
  const op = findOp();
  if (!op) {
    throw new Error("1Password CLI not found; set OP_CLI_PATH or install op");
  }
  for (const id of ids) {
    if (!isAllowedOnePasswordRef(id)) {
      errors[id] = { message: "Daneel Core 1Password refs must use op:// vault/item/field syntax" };
      continue;
    }
    const result = spawnSync(op, ["read", id], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        HOME: process.env.HOME,
        OP_ACCOUNT: process.env.OP_ACCOUNT,
        OP_SERVICE_ACCOUNT_TOKEN:
          process.env.OP_SERVICE_ACCOUNT_TOKEN || readOptionalTokenFile() || undefined,
      },
      timeout: 12000,
      maxBuffer: 128 * 1024,
    });
    if (result.status !== 0) {
      errors[id] = { message: (result.stderr || result.stdout || "op read failed").trim() };
      continue;
    }
    values[id] = result.stdout.trimEnd();
  }
  process.stdout.write(JSON.stringify({ protocolVersion: 1, values, errors }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      protocolVersion: 1,
      values,
      errors: { request: { message: error instanceof Error ? error.message : String(error) } },
    }),
  );
}
