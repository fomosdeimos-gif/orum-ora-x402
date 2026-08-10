#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
HOSTNAME_FILE="${ORUM_ROOT}/identity/onion/hostname"
if curl --fail --silent --max-time 5 http://127.0.0.1:8787/_orum/health >/dev/null; then echo "runtime_local=healthy"; else echo "runtime_local=unreachable"; fi
if [[ -s "${HOSTNAME_FILE}" ]]; then
  onion="$(tr -d '\n' < "${HOSTNAME_FILE}")"
  echo "onion_address=http://${onion}"
  if curl --fail --silent --max-time 30 --socks5-hostname 127.0.0.1:9050 "http://${onion}/_orum/health" >/dev/null; then echo "onion_surface=healthy"; else echo "onion_surface=unreachable"; fi
else
  echo "onion_address=pending"
fi
