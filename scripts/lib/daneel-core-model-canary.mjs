import fs from "node:fs/promises";
import path from "node:path";

// Cache only the end-to-end model canary, never service/auth/route checks.
// Failed canaries have a short negative TTL to avoid a retry storm in an outage.
export async function sharedModelCanary({
  directory,
  key,
  probe,
  force = false,
  successTtlMs = 3600000,
  failureTtlMs = 120000,
  waitMs = 200000,
}) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "result.json");
  const lock = path.join(directory, "lock");
  const read = async () => {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      const age = Date.now() - value.checkedAt;
      if (value.key === key && age >= 0 && age < (value.ok ? successTtlMs : failureTtlMs)) {
        return { ...value, cached: true, ageSeconds: Math.floor(age / 1000) };
      }
    } catch {}
    return undefined;
  };
  if (!force) {
    const hit = await read();
    if (hit) return hit;
  }
  const started = Date.now();
  let acquired = false;
  while (!acquired) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      acquired = true;
      await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }), {
        mode: 0o600,
      });
    } catch (error) {
      if (acquired || error.code !== "EEXIST") throw error;
      // Another healthcheck may be doing the same probe. Share its result.
      const hit = await read();
      if (hit) return hit;
      try {
        const owner = JSON.parse(await fs.readFile(path.join(lock, "owner.json"), "utf8"));
        try {
          process.kill(owner.pid, 0);
        } catch (e) {
          if (e.code === "ESRCH") {
            await fs.rm(lock, { recursive: true, force: true });
            continue;
          }
        }
      } catch {
        // Cover death between mkdir and owner write, without stealing a new lock.
        const stat = await fs.stat(lock).catch(() => undefined);
        if (stat && Date.now() - stat.mtimeMs > 10000) {
          await fs.rm(lock, { recursive: true, force: true });
          continue;
        }
      }
      if (Date.now() - started >= waitMs)
        throw new Error("Timed out waiting for shared model canary; no duplicate probe launched");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    if (!force) {
      const hit = await read();
      if (hit) return hit;
    }
    let result;
    try {
      result = await probe();
    } catch {
      result = { ok: false, detail: "model canary execution failed" };
    }
    const value = {
      key,
      checkedAt: Date.now(),
      ok: Boolean(result.ok),
      detail: String(result.detail),
    };
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value) + "\n", { mode: 0o600 });
    await fs.rename(tmp, file);
    return { ...value, cached: false, ageSeconds: 0 };
  } finally {
    await fs.rm(lock, { recursive: true, force: true });
  }
}
