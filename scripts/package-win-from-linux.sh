#!/usr/bin/env bash
# Cross-builds the Windows NSIS installer from a Linux machine (needs wine).
#
# The native SQLite module in node_modules is platform-specific, and
# electron-builder packages it as-is (npmRebuild is off — see
# electron-builder.yml). So: swap in the win32 prebuild, package, restore.
# On an actual Windows machine just run `npm run package:win`.
set -euo pipefail
cd "$(dirname "$0")/.."

MODULE_DIR=node_modules/better-sqlite3-multiple-ciphers
PREBUILD_VERSION=12.10.0
ELECTRON_ABI=145 # Electron 41.x — keep in sync with package.json
URL="https://github.com/m4heshd/better-sqlite3-multiple-ciphers/releases/download/v${PREBUILD_VERSION}/better-sqlite3-multiple-ciphers-v${PREBUILD_VERSION}-electron-v${ELECTRON_ABI}-win32-x64.tar.gz"

cp "$MODULE_DIR/build/Release/better_sqlite3.node" /tmp/bsqlite-host-backup.node
trap 'cp /tmp/bsqlite-host-backup.node "$MODULE_DIR/build/Release/better_sqlite3.node"' EXIT

curl -sL --fail --retry 3 "$URL" | tar xzf - -C "$MODULE_DIR"
npx electron-vite build
npx electron-builder --win
echo "Done: dist/Kaseki Setup *.exe (host native module restored)"
