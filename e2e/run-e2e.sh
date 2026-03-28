#!/usr/bin/env bash
set -euo pipefail

echo "=== E2E Test: cursor-installer --yes ==="

# Fetch the latest version from the Cursor API before installing
EXPECTED_VERSION=$(curl -sfL "https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable" | jq -r '.version')
if [ -z "$EXPECTED_VERSION" ] || [ "$EXPECTED_VERSION" = "null" ]; then
  echo "FAIL: Could not fetch expected version from Cursor API"
  exit 1
fi
echo "Expected version from API: $EXPECTED_VERSION"

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

# --- Assertion 1b: Temp file was cleaned up (proves chmod targeted the right path) ---
TEMP_APPIMAGE="$HOME/.cache/cursor-installer/cursor.appimage"
if [ -f "$TEMP_APPIMAGE" ]; then
  echo "FAIL: Temp file $TEMP_APPIMAGE was not cleaned up"
  exit 1
fi
echo "PASS: Temp file cleaned up"

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
DESKTOP_VERSION=$(grep "^Version=" "$DESKTOP_FILE" | cut -d= -f2)
if [ "$DESKTOP_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "FAIL: Desktop file version '$DESKTOP_VERSION' != expected '$EXPECTED_VERSION'"
  exit 1
fi
echo "PASS: Desktop entry is correct"
echo "PASS: Desktop file version matches API version ($DESKTOP_VERSION)"

# --- Assertion 3: AppImage version matches API version ---
if ! "$APPIMAGE" --appimage-extract >/dev/null; then
  echo "FAIL: AppImage extraction failed"
  exit 1
fi
APPIMAGE_VERSION=$(jq -r '.version' squashfs-root/usr/share/cursor/resources/app/package.json)
rm -rf squashfs-root
if [ "$APPIMAGE_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "FAIL: AppImage version '$APPIMAGE_VERSION' != expected '$EXPECTED_VERSION'"
  exit 1
fi
echo "PASS: AppImage version matches API version ($APPIMAGE_VERSION)"

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
