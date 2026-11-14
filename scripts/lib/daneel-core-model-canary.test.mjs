import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sharedModelCanary } from "./daneel-core-model-canary.mjs";

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "core-canary-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, key: "route-a", probe: async () => ({ ok: true, detail: "verified" }) };
}
test("success shares one probe across independent healthcheck callers", async (t) => {
  const options = await fixture(t);
  let calls = 0;
  options.probe = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 120));
    return { ok: true, detail: "ok" };
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => sharedModelCanary(options)));
  assert.equal(calls, 1);
  assert.equal(results.filter((r) => !r.cached).length, 1);
  assert.ok(results.every((r) => r.ok));
});
test("config/route change, stale cache and forced live checks invalidate success", async (t) => {
  const options = await fixture(t);
  let calls = 0;
  options.probe = async () => ({ ok: ++calls > 0, detail: "ok" });
  await sharedModelCanary(options);
  await sharedModelCanary(options);
  assert.equal(calls, 1);
  await sharedModelCanary({ ...options, key: "route-b" });
  await sharedModelCanary({ ...options, key: "route-b", force: true });
  await sharedModelCanary({ ...options, key: "route-b", successTtlMs: 0 });
  assert.equal(calls, 4);
});
test("failures are never cached as healthy and expire quickly", async (t) => {
  const options = await fixture(t);
  let calls = 0;
  options.probe = async () => ({ ok: ++calls > 1, detail: "probe result" });
  assert.equal((await sharedModelCanary(options)).ok, false);
  assert.equal((await sharedModelCanary(options)).ok, false);
  assert.equal(calls, 1);
  assert.equal((await sharedModelCanary({ ...options, failureTtlMs: 0 })).ok, true);
});
test("probe exceptions fail closed and release lock", async (t) => {
  const options = await fixture(t);
  const result = await sharedModelCanary({
    ...options,
    probe: async () => {
      throw Error("private error");
    },
  });
  assert.equal(result.ok, false);
  assert.ok(!result.detail.includes("private"));
  await assert.rejects(fs.stat(path.join(options.directory, "lock")));
});
test("dead owner is recovered, live owner is never stolen on timeout", async (t) => {
  const options = await fixture(t);
  const lock = path.join(options.directory, "lock");
  await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2147483647 }));
  assert.equal((await sharedModelCanary(options)).ok, true);
  await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(sharedModelCanary({ ...options, key: "new", waitMs: 0 }), /no duplicate/);
});
