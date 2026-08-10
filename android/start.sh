#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
APP_ROOT="${ORUM_ROOT}/app"
RUN_ROOT="${ORUM_ROOT}/run"
LOG_ROOT="${ORUM_ROOT}/log"
mkdir -p "${RUN_ROOT}" "${LOG_ROOT}"
alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }
if ! alive "${RUN_ROOT}/node.pid"; then
  (cd "${APP_ROOT}"; PORT=8787 HOST=127.0.0.1 ORUM_RUNTIME=android-termux nohup node server.js >> "${LOG_ROOT}/node.log" 2>&1 & echo $! > "${RUN_ROOT}/node.pid")
fi
if ! alive "${RUN_ROOT}/tor.pid"; then
  nohup tor -f "${ORUM_ROOT}/torrc" >> "${LOG_ROOT}/tor.log" 2>&1 &
  echo $! > "${RUN_ROOT}/tor.pid"
fi
