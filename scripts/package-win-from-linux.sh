#!/usr/bin/env bash
# Cross-builds the Windows NSIS installer from a Linux machine (needs wine).
#
# The native SQLite module in node_modules is platform-specific, and
# electron-builder packages it as-is (npmRebuild is off — see
# electron-builder.yml). So: swap in the win32 prebuild, package, restore.
# On an actual Windows machine just run `npm run package:win`.
#
# v0.2.0: the Electron version, module version, and ABI are all derived from
# what's actually installed — prebuild-install resolves the ABI itself via
# node-abi. The previous script hardcoded all three, so the first
# `npm update` that moved Electron would have desynced them and shipped an
# installer whose native module fails to load.
set -euo pipefail
cd "$(dirname "$0")/.."

MODULE_DIR=node_modules/better-sqlite3-multiple-ciphers
ELECTRON_VERSION="$(node -p "require('electron/package.json').version")"

cp "$MODULE_DIR/build/Release/better_sqlite3.node" /tmp/bsqlite-host-backup.node
trap 'cp /tmp/bsqlite-host-backup.node "$MODULE_DIR/build/Release/better_sqlite3.node"' EXIT

(cd "$MODULE_DIR" && npx prebuild-install \
  --runtime=electron \
  --target="$ELECTRON_VERSION" \
  --platform=win32 \
  --arch=x64 \
  --force)
npx electron-vite build
npx electron-builder --win
echo "Done: dist/Kaseki Setup *.exe (host native module restored)"
