#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
INPUT="${1:?Indica a cápsula .tar.gpg}"
TMP_DIR="$(mktemp -d)"
trap "rm -rf ${TMP_DIR}" EXIT
[[ ! -s "${ORUM_ROOT}/identity/onion/hostname" ]] || { echo "Recusado: este aparelho já possui uma identidade ORUM." >&2; exit 1; }
"${ORUM_ROOT}/app/android/stop.sh"
gpg --decrypt "${INPUT}" | tar -C "${TMP_DIR}" -xf -
test -s "${TMP_DIR}/identity/onion/hostname"
test -s "${TMP_DIR}/identity/onion/hs_ed25519_secret_key"
rm -rf "${ORUM_ROOT}/identity/onion"
mv "${TMP_DIR}/identity/onion" "${ORUM_ROOT}/identity/onion"
chmod -R go-rwx "${ORUM_ROOT}/identity"
"${ORUM_ROOT}/app/android/start.sh"
echo "Identidade migrada; o endereço anterior será preservado."
