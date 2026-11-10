import { describe, expect, it } from "vitest";
import {
  generateSummary,
  prepareCompaction,
} from "../../../../packages/agent-core/src/harness/compaction/compaction.js";
import type { Model } from "../../../../packages/llm-core/src/index.js";
import { makeAgentAssistantMessage } from "../../test-helpers/agent-message-fixtures.js";
import { SessionManager } from "../session-manager.js";

describe("recompaction after a smaller-model switch", () => {
  function branch(window?: number, large = true) {
    const session = SessionManager.inMemory();
    const id = session.appendMessage({
      role: "user",
      content: "Keep the task requirements",
      timestamp: 1,
    });
    session.appendCompaction(
      large ? "Long history. ".repeat(15_000) : "Short summary",
      id,
      100_000,
      window === undefined ? undefined : { compactionContextWindow: window },
    );
    return session.getBranch();
  }
  const settings = { enabled: true, reserveTokens: 8_192, keepRecentTokens: 4_096 };
  it("summarizes oversized fallback input in bounded requests without dropping its ends", async () => {
    const prompts: string[] = [];
    const model = { contextWindow: 40_960, maxTokens: 4_096, reasoning: false } as Model;
    const result = await generateSummary(
      [{ role: "user", content: "START " + "history ".repeat(40_000) + " END", timestamp: 1 }],
      model,
      8_192,
      undefined,
      undefined,
      undefined,
      undefined,
      "Previous requirements",
      undefined,
      undefined,
      {
        completeSimple: async (_model, context) => {
          const text = JSON.stringify(context.messages);
          expect(text.length).toBeLessThan(40_960 * 3);
          prompts.push(text);
          return makeAgentAssistantMessage({
            content: [{ type: "text", text: "Retained summary" }],
          });
        },
      },
    );
    expect(result).toEqual({ ok: true, value: "Retained summary" });
    expect(prompts.length).toBeGreaterThan(1);
    expect(prompts[0]).toContain("Previous requirements");
    expect(prompts.join(" ")).toContain("START");
    expect(prompts.at(-1)).toContain("END");
    expect(prompts.at(-1)).toContain("Retained summary");
  });
  it("reconsiders an oversized boundary made for a larger model", () => {
    const result = prepareCompaction(branch(200_000), settings, 40_960);
    expect(result.ok && result.value).toBeTruthy();
    if (result.ok) {
      expect(result.value?.previousSummary).toContain("Long history");
    }
  });
  it("allows one oversized legacy boundary but not another same-budget compaction", () => {
    const legacy = prepareCompaction(branch(), settings, 40_960);
    expect(legacy.ok && legacy.value).toBeTruthy();
    expect(prepareCompaction(branch(40_960), settings, 40_960)).toEqual({
      ok: true,
      value: undefined,
    });
  });
  it("keeps the duplicate guard for fitting, larger, and unspecified budgets", () => {
    for (const [entries, window] of [
      [branch(200_000, false), 40_960],
      [branch(40_960), 200_000],
      [branch(), undefined],
    ] as const) {
      expect(prepareCompaction(entries, settings, window)).toEqual({ ok: true, value: undefined });
    }
  });
  it("includes fixed system/tool overhead when checking a smaller window", () => {
    const result = prepareCompaction(branch(200_000, false), settings, 40_960, 40_000);
    expect(result.ok && result.value).toBeTruthy();
  });
});
