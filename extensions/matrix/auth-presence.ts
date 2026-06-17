// Matrix plugin module implements auth presence behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";

type MatrixAuthPresenceParams =
  | {
      cfg: OpenClawConfig;
      env?: NodeJS.ProcessEnv;
    }
  | OpenClawConfig;

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "undefined" && trimmed !== "null" ? trimmed : undefined;
}

function resolveEffectiveHomeDir(
  env: NodeJS.ProcessEnv,
  homedir: () => string = os.homedir,
): string {
  const explicitHome = normalizeEnvValue(env.OPENCLAW_HOME);
  const fallbackHome =
    normalizeEnvValue(env.HOME) ??
    normalizeEnvValue(env.USERPROFILE) ??
    normalizeEnvValue(homedir());
  if (explicitHome) {
    if (explicitHome === "~" || explicitHome.startsWith("~/") || explicitHome.startsWith("~\\")) {
      return path.resolve(explicitHome.replace(/^~(?=$|[\\/])/, fallbackHome ?? process.cwd()));
    }
    return path.resolve(explicitHome);
  }
  return path.resolve(fallbackHome ?? process.cwd());
}

function resolveUserPath(input: string, env: NodeJS.ProcessEnv): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(trimmed.replace(/^~(?=$|[\\/])/, resolveEffectiveHomeDir(env)));
  }
  return path.resolve(trimmed);
}

function resolveMatrixAuthStateDir(env: NodeJS.ProcessEnv): string {
  const stateDir = normalizeEnvValue(env.OPENCLAW_STATE_DIR);
  return stateDir
    ? resolveUserPath(stateDir, env)
    : path.join(resolveEffectiveHomeDir(env), ".openclaw");
}

const DEFAULT_ACCOUNT_ID = "default";
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const INVALID_ACCOUNT_ID_CHARS_RE = /[^a-z0-9_-]+/g;

function normalizeAccountId(value: string | undefined | null): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(INVALID_ACCOUNT_ID_CHARS_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized && !BLOCKED_OBJECT_KEYS.has(normalized) ? normalized : DEFAULT_ACCOUNT_ID;
}

function resolveMatrixCredentialsFilename(accountId?: string | null): string {
  const normalized = normalizeAccountId(accountId);
  return normalized === DEFAULT_ACCOUNT_ID ? "credentials.json" : `credentials-${normalized}.json`;
}

function resolveMatrixCredentialsDir(stateDir: string): string {
  return path.join(stateDir, "credentials", "matrix");
}

function listMatrixCredentialPaths(
  _cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const credentialsDir = resolveMatrixCredentialsDir(resolveMatrixAuthStateDir(env));
  const paths = new Set<string>([
    resolveMatrixCredentialsFilename(),
    resolveMatrixCredentialsFilename("default"),
  ]);

  try {
    const entries = fs.readdirSync(credentialsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /^credentials(?:-[a-z0-9._-]+)?\.json$/i.test(entry.name)) {
        paths.add(entry.name);
      }
    }
  } catch {
    // Missing credentials directories mean no persisted Matrix auth state.
  }

  return [...paths].map((filename) => path.join(credentialsDir, filename));
}

export function hasAnyMatrixAuth(
  params: MatrixAuthPresenceParams,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const cfg = params && typeof params === "object" && "cfg" in params ? params.cfg : params;
  const resolvedEnv =
    params && typeof params === "object" && "cfg" in params ? (params.env ?? env) : env;
  return listMatrixCredentialPaths(cfg, resolvedEnv).some((filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
}
