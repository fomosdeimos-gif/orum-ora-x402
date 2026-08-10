#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
SOURCE_URL="${ORUM_SOURCE_URL:-https://github.com/fomosdeimos-gif/orum-ora-x402.git}"
pkg update -y
pkg install -y git gnupg nodejs-lts tor
if [[ ! -d "${ORUM_ROOT}/app/.git" ]]; then
  mkdir -p "${ORUM_ROOT}"
  git clone --depth 1 "${SOURCE_URL}" "${ORUM_ROOT}/app"
else
  git -C "${ORUM_ROOT}/app" fetch --depth 1 origin main
  git -C "${ORUM_ROOT}/app" reset --hard origin/main
fi
mkdir -p "${ORUM_ROOT}/identity/onion" "${ORUM_ROOT}/log" "${ORUM_ROOT}/run"
chmod 700 "${ORUM_ROOT}/identity" "${ORUM_ROOT}/identity/onion"
sed -e "s|@ORUM_ROOT@|${ORUM_ROOT}|g" "${ORUM_ROOT}/app/android/torrc.template" > "${ORUM_ROOT}/torrc"
termux-wake-lock 2>/dev/null || true
"${ORUM_ROOT}/app/android/start.sh"
printf '\nORUM instalada. Verifica com:\n  %s\n' "${ORUM_ROOT}/app/android/status.sh"
