#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ORUM_ROOT="${PREFIX}/var/lib/orum"
OUTPUT="${1:-${HOME}/storage/downloads/orum-identity-migration.tar.gpg}"
test -s "${ORUM_ROOT}/identity/onion/hostname" || { echo "A identidade onion ainda não existe." >&2; exit 1; }
mkdir -p "$(dirname "${OUTPUT}")"
tar -C "${ORUM_ROOT}" -cf - identity | gpg --symmetric --cipher-algo AES256 --output "${OUTPUT}"
sha256sum "${OUTPUT}" > "${OUTPUT}.sha256"
chmod 600 "${OUTPUT}" "${OUTPUT}.sha256"
echo "migration_capsule=${OUTPUT}"
echo "Guarda a frase-passe fora do aparelho."
