#!/usr/bin/env bash
# Deploy Spendosaurus static PWA files to /var/www/spendosaurus
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${DEST:-/var/www/spendosaurus}"

sudo mkdir -p "$DEST"
sudo chown "$(id -un):$(id -gn)" "$DEST"
rsync -a --delete "$ROOT/web/" "$DEST/"

sudo restorecon -R "$DEST" 2>/dev/null || true
echo "deployed Spendosaurus PWA -> ${DEST}"
