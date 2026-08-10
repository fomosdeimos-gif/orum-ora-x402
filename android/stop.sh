#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
for name in tor node; do
  pid_file="${ORUM_ROOT}/run/${name}.pid"
  if [[ -f "${pid_file}" ]]; then
    kill "$(cat "${pid_file}")" 2>/dev/null || true
    rm -f "${pid_file}"
  fi
done
