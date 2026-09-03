#!/usr/bin/env bash
# Deploy Spendosaurus static PWA files to /var/www/spendosaurus
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${DEST:-/var/www/spendosaurus}"

sudo mkdir -p "$DEST"
sudo chown "$(id -un):$(id -gn)" "$DEST"
# A hash of what is being shipped, substituted into __BUILD_VERSION__ below.
# The service worker's cache name is derived from it, so a deploy that changes
# any file changes the worker -- and one that changes nothing does not, which
# is what stops clients re-downloading a build they already have.
VERSION="$(find "$ROOT/web" -type f -exec sha256sum {} + | sort -k2 | sha256sum | cut -c1-12)"

rsync -a --delete "$ROOT/web/" "$DEST/"
grep -rl __BUILD_VERSION__ "$DEST" | xargs -r sed -i "s/__BUILD_VERSION__/${VERSION}/g"

sudo restorecon -R "$DEST" 2>/dev/null || true
echo "deployed Spendosaurus PWA -> ${DEST}"
