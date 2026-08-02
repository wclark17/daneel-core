import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const launcher = path.join(repoRoot, "daneel-core.mjs");

describe("daneel-core harden-profile", () => {
  it("materializes the Core runtime allowlists and 1Password resolver", () => {
    const stateDir = mkdtempSync(path.join(tmpdir(), "daneel-core-hardening-"));
    try {
      const configPath = path.join(stateDir, "openclaw.json");
      writeFileSync(
        configPath,
        `${JSON.stringify(
          {
            plugins: {
              allow: ["telegram", "discord", "xai"],
              entries: {
                telegram: { enabled: true },
                "skill-workshop": { enabled: true },
                xai: { enabled: true },
              },
            },
            channels: {
              telegram: { enabled: true },
              discord: { enabled: true },
              slack: true,
            },
            enabledChannels: ["telegram", "discord", "slack"],
            skills: { allowBundled: ["github", "browser"] },
            secrets: {
              providers: {
                onepassword: { source: "env", allowlist: ["OLD_VALUE"] },
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      const output = execFileSync(process.execPath, [launcher, "harden-profile", "--json"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          OPENCLAW_DANEEL_CORE_STATE_DIR: stateDir,
          OPENCLAW_DANEEL_CORE_PORT: "18990",
        },
        encoding: "utf8",
      });

      expect(JSON.parse(output)).toMatchObject({ ok: true, changed: true });
      const hardened = JSON.parse(readFileSync(configPath, "utf8"));
      expect(hardened.plugins.allow).toEqual([
        "active-memory",
        "codex",
        "llm-task",
        "memory-core",
        "memory-wiki",
        "openai",
        "policy",
        "telegram",
      ]);
      expect(hardened.plugins.entries).toEqual({ telegram: { enabled: true } });
      expect(hardened.channels.telegram.enabled).toBe(true);
      expect(hardened.channels.discord.enabled).toBe(false);
      expect(hardened.channels.slack.enabled).toBe(false);
      expect(hardened.enabledChannels).toEqual(["telegram"]);
      expect(hardened.skills.allowBundled).toEqual([
        "1password",
        "github",
        "healthcheck",
        "session-logs",
        "skill-creator",
        "tmux",
      ]);
      expect(hardened.secrets.defaults.exec).toBe("onepassword");
      expect(hardened.secrets.providers.onepassword).toMatchObject({
        source: "exec",
        command: process.execPath,
        args: [path.join(repoRoot, "scripts", "secrets", "daneel-core-onepassword-resolver.mjs")],
        jsonOnly: true,
      });
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
