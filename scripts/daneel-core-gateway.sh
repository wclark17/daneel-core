#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${OPENCLAW_DANEEL_CORE_STATE_DIR:-$HOME/.openclaw-daneel-core}"
LOG_DIR="$STATE_DIR/logs"
LOG_FILE="$LOG_DIR/gateway-detached.log"
PID_FILE="$STATE_DIR/gateway.pid"
PORT="${OPENCLAW_DANEEL_CORE_PORT:-18790}"
PROFILE="${OPENCLAW_DANEEL_CORE_PROFILE:-daneel-core}"
PNPM_VERSION="${OPENCLAW_DANEEL_CORE_PNPM_VERSION:-11.2.2}"

ensure_runtime_path() {
  mkdir -p "$STATE_DIR/bin" "$LOG_DIR"

  if ! command -v pnpm >/dev/null 2>&1; then
    cat >"$STATE_DIR/bin/pnpm" <<SH
#!/usr/bin/env sh
exec corepack pnpm "\$@"
SH
    chmod 700 "$STATE_DIR/bin/pnpm"
  fi

  export PATH="$STATE_DIR/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
  corepack prepare "pnpm@$PNPM_VERSION" --activate >/dev/null 2>&1 || true
}

pid_is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

current_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  jq -r 'if type == "number" then . elif type == "object" then .pid else empty end' "$PID_FILE" 2>/dev/null
}

wait_for_port() {
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if ss -ltn "sport = :$PORT" | grep -q ":$PORT"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_gateway() {
  ensure_runtime_path

  local pid=""
  pid="$(current_pid || true)"
  if pid_is_running "$pid"; then
    echo "Daneel Core already running pid=$pid port=$PORT"
    return 0
  fi

  rm -f "$PID_FILE"
  (
    cd "$REPO_ROOT"
    setsid env \
      OPENCLAW_PROFILE="$PROFILE" \
      OPENCLAW_STATE_DIR="$STATE_DIR" \
      OPENCLAW_CONFIG_PATH="$STATE_DIR/openclaw.json" \
      OPENCLAW_GATEWAY_PORT="$PORT" \
      OPENCLAW_PORT="$PORT" \
      PATH="$PATH" \
      node scripts/run-node.mjs --profile "$PROFILE" gateway \
      >>"$LOG_FILE" 2>&1 < /dev/null &
    echo "{\"pid\":$!,\"port\":$PORT,\"profile\":\"$PROFILE\",\"startedAt\":\"$(date -Is)\"}" >"$PID_FILE"
  )

  if wait_for_port; then
    pid="$(current_pid || true)"
    echo "Daneel Core started pid=$pid port=$PORT log=$LOG_FILE"
    return 0
  fi

  echo "Daneel Core did not bind port $PORT within 60s; tailing log:" >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  return 1
}

stop_gateway() {
  local pid=""
  pid="$(current_pid || true)"
  if ! pid_is_running "$pid"; then
    rm -f "$PID_FILE"
    echo "Daneel Core not running"
    return 0
  fi

  kill "$pid"
  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if ! pid_is_running "$pid"; then
      rm -f "$PID_FILE"
      echo "Daneel Core stopped pid=$pid"
      return 0
    fi
    sleep 1
  done

  echo "Daneel Core did not stop after SIGTERM; sending SIGKILL pid=$pid" >&2
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

status_gateway() {
  local pid=""
  pid="$(current_pid || true)"
  if pid_is_running "$pid"; then
    echo "Daneel Core running pid=$pid port=$PORT"
  else
    echo "Daneel Core not running"
  fi
  ss -ltnp | grep ":$PORT" || true
}

probe_gateway() {
  ensure_runtime_path
  cd "$REPO_ROOT"
  env \
    OPENCLAW_PROFILE="$PROFILE" \
    OPENCLAW_STATE_DIR="$STATE_DIR" \
    OPENCLAW_CONFIG_PATH="$STATE_DIR/openclaw.json" \
    OPENCLAW_GATEWAY_PORT="$PORT" \
    OPENCLAW_PORT="$PORT" \
    PATH="$PATH" \
    node scripts/run-node.mjs --profile "$PROFILE" channels status --probe
}

case "${1:-status}" in
  start)
    start_gateway
    ;;
  stop)
    stop_gateway
    ;;
  restart)
    stop_gateway
    start_gateway
    ;;
  status)
    status_gateway
    ;;
  probe)
    probe_gateway
    ;;
  tail)
    tail -n "${2:-120}" "$LOG_FILE"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|probe|tail [lines]}" >&2
    exit 2
    ;;
esac
