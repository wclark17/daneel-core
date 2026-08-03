#!/usr/bin/env python3
"""Safely maintain Daneel Core session artifacts and Codex SQLite state."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time


STATE_DIR = Path(os.environ.get("OPENCLAW_STATE_DIR", "/home/daneel/.openclaw-daneel-core")).resolve()
REPO_ROOT = Path(__file__).resolve().parents[1]
CODEX_HOME = STATE_DIR / "agents" / "main" / "agent" / "codex-home"
LOG_DB = CODEX_HOME / "logs_2.sqlite"
STATE_DB = CODEX_HOME / "state_5.sqlite"
ROLLOUT_ROOT = CODEX_HOME / "sessions"
SHELL_SNAPSHOT_ROOT = CODEX_HOME / "shell_snapshots"
ROLLBACK_ROOT = STATE_DIR / "rollback" / "state-retention"
SERVICE = "openclaw-daneel-core.service"
CORE_CLI = Path("/home/daneel/.local/bin/daneel-core")
THREAD_RETENTION_DAYS = 30
BACKUP_RETENTION_DAYS = 14
COMPACT_MIN_FREE_BYTES = 256 * 1024 * 1024
COMPACT_MIN_FREE_RATIO = 0.20


def run(args, *, check=True, capture=True, timeout=None):
    return subprocess.run(
        [str(item) for item in args],
        check=check,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        timeout=timeout,
        env=os.environ.copy(),
    )


def service_active():
    result = run(["systemctl", "--user", "is-active", SERVICE], check=False)
    return result.returncode == 0 and result.stdout.strip() == "active"


def sqlite_stats(path):
    if not path.exists():
        return {"exists": False, "path": str(path)}
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as con:
        page_size = con.execute("PRAGMA page_size").fetchone()[0]
        page_count = con.execute("PRAGMA page_count").fetchone()[0]
        free_pages = con.execute("PRAGMA freelist_count").fetchone()[0]
        integrity = con.execute("PRAGMA quick_check").fetchone()[0]
    return {
        "exists": True,
        "path": str(path),
        "bytes": path.stat().st_size,
        "pageSize": page_size,
        "pageCount": page_count,
        "freePages": free_pages,
        "freeBytes": free_pages * page_size,
        "freeRatio": free_pages / page_count if page_count else 0,
        "quickCheck": integrity,
    }


def codex_thread_plan(now):
    cutoff = int(now - THREAD_RETENTION_DAYS * 86400)
    if not STATE_DB.exists():
        return {"cutoff": cutoff, "threads": 0, "rolloutFiles": 0, "rolloutBytes": 0}
    with sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True) as con:
        rows = con.execute(
            "SELECT id, rollout_path FROM threads WHERE updated_at < ? ORDER BY updated_at",
            (cutoff,),
        ).fetchall()
    files = []
    for thread_id, raw_path in rows:
        path = Path(raw_path)
        try:
            resolved = path.resolve(strict=True)
            resolved.relative_to(ROLLOUT_ROOT.resolve())
        except (FileNotFoundError, ValueError):
            continue
        files.append((thread_id, resolved))
    return {
        "cutoff": cutoff,
        "threads": len(rows),
        "rolloutFiles": len(files),
        "rolloutBytes": sum(path.stat().st_size for _, path in files),
        "rows": rows,
        "files": files,
    }


def native_session_cleanup(apply):
    args = [
        process_exec(),
        REPO_ROOT / "openclaw.mjs",
        "sessions",
        "cleanup",
        "--agent",
        "main",
        "--json",
        "--enforce" if apply else "--dry-run",
    ]
    result = run(args, timeout=900)
    return json.loads(result.stdout)


def process_exec():
    return shutil.which("node") or "/usr/bin/node"


def checkpoint(path):
    if not path.exists():
        return
    with sqlite3.connect(path, timeout=60) as con:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError(f"SQLite quick_check failed: {path}")


def vacuum_into(source, destination):
    if destination.exists():
        destination.unlink()
    with sqlite3.connect(source, timeout=60) as con:
        con.execute("VACUUM INTO ?", (str(destination),))
    with sqlite3.connect(f"file:{destination}?mode=ro", uri=True) as con:
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {destination}")
    os.chmod(destination, source.stat().st_mode & 0o777)


def archive_rollouts(files, destination):
    if not files:
        return None
    with tarfile.open(destination, "w:gz", compresslevel=6) as archive:
        for _, path in files:
            archive.add(path, arcname=str(path.relative_to(ROLLOUT_ROOT)))
    return destination


def prepare_codex_thread_rollback(plan, run_dir):
    state_backup = run_dir / "state_5.pre-retention.sqlite"
    vacuum_into(STATE_DB, state_backup)
    rollout_archive = archive_rollouts(plan["files"], run_dir / "rollouts.pre-retention.tar.gz")
    return {
        "stateBackup": str(state_backup),
        "rolloutArchive": str(rollout_archive) if rollout_archive else None,
    }


def prune_codex_threads(plan, rollback_info):
    old_ids = [row[0] for row in plan["rows"]]
    with sqlite3.connect(STATE_DB, timeout=60) as con:
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("CREATE TEMP TABLE retention_old_threads(id TEXT PRIMARY KEY)")
        con.executemany("INSERT INTO retention_old_threads(id) VALUES (?)", ((item,) for item in old_ids))
        con.execute(
            "DELETE FROM thread_spawn_edges WHERE parent_thread_id IN (SELECT id FROM retention_old_threads) OR child_thread_id IN (SELECT id FROM retention_old_threads)"
        )
        con.execute("DELETE FROM threads WHERE id IN (SELECT id FROM retention_old_threads)")
        con.commit()
        con.execute("PRAGMA incremental_vacuum(0)")
        if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("state_5.sqlite quick_check failed after thread pruning")
    removed_bytes = 0
    removed_files = 0
    for _, path in plan["files"]:
        if path.exists():
            removed_bytes += path.stat().st_size
            path.unlink()
            removed_files += 1
    for thread_id in old_ids:
        for snapshot in SHELL_SNAPSHOT_ROOT.glob(f"{thread_id}.*.sh"):
            snapshot.unlink()
    for directory in sorted(ROLLOUT_ROOT.rglob("*"), reverse=True):
        if directory.is_dir():
            try:
                directory.rmdir()
            except OSError:
                pass
    return {
        **rollback_info,
        "threadsRemoved": len(old_ids),
        "rolloutFilesRemoved": removed_files,
        "rolloutBytesRemoved": removed_bytes,
    }


def compact_logs(run_dir):
    before = sqlite_stats(LOG_DB)
    if not before["exists"]:
        return {"compacted": False, "reason": "missing", "before": before}
    if before["freeBytes"] < COMPACT_MIN_FREE_BYTES or before["freeRatio"] < COMPACT_MIN_FREE_RATIO:
        return {"compacted": False, "reason": "below-threshold", "before": before}
    compact = run_dir / "logs_2.compact.sqlite"
    original = run_dir / "logs_2.original.sqlite"
    vacuum_into(LOG_DB, compact)
    os.replace(LOG_DB, original)
    os.replace(compact, LOG_DB)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(str(LOG_DB) + suffix)
        if sidecar.exists():
            sidecar.unlink()
    after = sqlite_stats(LOG_DB)
    return {
        "compacted": True,
        "before": before,
        "after": after,
        "original": str(original),
        "bytesReclaimed": before["bytes"] - after["bytes"],
    }


def rollback(run_dir, log_result, thread_result):
    run(["systemctl", "--user", "stop", SERVICE], check=False)
    original_log = Path(log_result.get("original", "")) if log_result else None
    if original_log and str(original_log) != "." and original_log.exists():
        failed = run_dir / "logs_2.failed.sqlite"
        if LOG_DB.exists():
            os.replace(LOG_DB, failed)
        os.replace(original_log, LOG_DB)
    if thread_result:
        state_backup = Path(thread_result["stateBackup"])
        if state_backup.exists():
            if STATE_DB.exists():
                os.replace(STATE_DB, run_dir / "state_5.failed.sqlite")
            shutil.copy2(state_backup, STATE_DB)
        archive = thread_result.get("rolloutArchive")
        if archive and Path(archive).exists():
            with tarfile.open(archive, "r:gz") as source:
                source.extractall(ROLLOUT_ROOT, filter="data")
    run(["systemctl", "--user", "start", SERVICE], check=False)


def prune_old_backups(now):
    cutoff = now - BACKUP_RETENTION_DAYS * 86400
    removed = []
    if not ROLLBACK_ROOT.exists():
        return removed
    for directory in ROLLBACK_ROOT.iterdir():
        if directory.is_dir() and directory.stat().st_mtime < cutoff:
            shutil.rmtree(directory)
            removed.append(str(directory))
    return removed


def sanitized_plan(now):
    logs = sqlite_stats(LOG_DB)
    threads = codex_thread_plan(now)
    sessions = native_session_cleanup(False)
    return {
        "ok": True,
        "dryRun": True,
        "policy": {
            "openclawSessions": "30d, 1gb cap, 800mb high-water",
            "cronSessions": "24h",
            "codexThreads": f"{THREAD_RETENTION_DAYS}d",
            "rollbackBundles": f"{BACKUP_RETENTION_DAYS}d",
        },
        "logs": logs,
        "codexThreads": {key: value for key, value in threads.items() if key not in {"rows", "files"}},
        "openclawSessions": sessions,
    }


def apply_retention(now):
    stamp = dt.datetime.fromtimestamp(now, dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = ROLLBACK_ROOT / stamp
    run_dir.mkdir(parents=True, mode=0o700)
    result = {"ok": False, "dryRun": False, "runDir": str(run_dir)}
    was_active = service_active()
    log_result = None
    thread_result = None
    try:
        result["openclawSessions"] = native_session_cleanup(True)
        plan = codex_thread_plan(now)
        if was_active:
            run(["systemctl", "--user", "stop", SERVICE], timeout=120)
        checkpoint(LOG_DB)
        checkpoint(STATE_DB)
        log_result = compact_logs(run_dir)
        result["logs"] = log_result
        thread_result = prepare_codex_thread_rollback(plan, run_dir)
        thread_result = prune_codex_threads(plan, thread_result)
        result["codexThreads"] = thread_result
        if was_active:
            run(["systemctl", "--user", "start", SERVICE], timeout=120)
            health = run([CORE_CLI, "healthcheck", "--json"], timeout=300)
            result["healthcheck"] = json.loads(health.stdout)
            if not result["healthcheck"].get("ok"):
                raise RuntimeError("Daneel Core healthcheck failed after retention")
        original_log = Path(log_result.get("original", "")) if log_result else None
        if original_log and str(original_log) != "." and original_log.exists():
            original_log.unlink()
            result["logs"]["originalRemovedAfterHealthcheck"] = True
        result["oldBackupsRemoved"] = prune_old_backups(now)
        result["afterBytes"] = sum(
            path.stat().st_size for path in STATE_DIR.rglob("*") if path.is_file()
        )
        result["ok"] = True
        return result
    except Exception:
        rollback(run_dir, log_result, thread_result)
        raise
    finally:
        if was_active and not service_active():
            run(["systemctl", "--user", "start", SERVICE], check=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="apply retention; default is dry-run")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args()
    now = time.time()
    try:
        result = apply_retention(now) if args.apply else sanitized_plan(now)
    except Exception as exc:
        result = {"ok": False, "dryRun": not args.apply, "error": str(exc)}
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
