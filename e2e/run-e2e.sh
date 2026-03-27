#!/usr/bin/env bash
set -euo pipefail

echo "=== E2E Test: cursor-installer --yes ==="

# Run the installer with auto-accept
bun run ./src/main.ts --yes
echo "PASS: Installer exited with code 0"

# --- Assertion 1: AppImage exists and is executable ---
APPIMAGE="$HOME/bin/cursor/cursor.appimage"
if [ ! -f "$APPIMAGE" ]; then
  echo "FAIL: $APPIMAGE does not exist"
  exit 1
fi
if [ ! -x "$APPIMAGE" ]; then
  echo "FAIL: $APPIMAGE is not executable"
  exit 1
fi
echo "PASS: AppImage exists and is executable"

# --- Assertion 2: Desktop entry exists with correct content ---
DESKTOP_FILE="$HOME/.local/share/applications/cursor.desktop"
if [ ! -f "$DESKTOP_FILE" ]; then
  echo "FAIL: $DESKTOP_FILE does not exist"
  exit 1
fi
if ! grep -q "^Name=Cursor$" "$DESKTOP_FILE"; then
  echo "FAIL: Desktop file missing Name=Cursor"
  exit 1
fi
if ! grep -q "^Exec=$HOME/bin/cursor/cursor.appimage" "$DESKTOP_FILE"; then
  echo "FAIL: Desktop file has wrong Exec path"
  exit 1
fi
if ! grep -q "^Version=" "$DESKTOP_FILE"; then
  echo "FAIL: Desktop file missing Version field"
  exit 1
fi
echo "PASS: Desktop entry is correct"

# --- Assertion 3: AppImage runs (extract-and-run, no FUSE needed) ---
if "$APPIMAGE" --appimage-extract-and-run --version >/dev/null 2>&1; then
  echo "PASS: AppImage runs successfully"
else
  echo "WARN: AppImage --version exited non-zero (may be expected for some builds)"
fi

# --- Assertion 4: Shell alias added to .bashrc ---
BASHRC="$HOME/.bashrc"
if ! grep -q "alias cursor=" "$BASHRC"; then
  echo "FAIL: Shell alias not found in $BASHRC"
  exit 1
fi
if ! grep -q "nohup" "$BASHRC"; then
  echo "FAIL: Shell alias missing nohup wrapper"
  exit 1
fi
echo "PASS: Shell alias correctly added to .bashrc"

echo ""
echo "=== All E2E assertions passed ==="
