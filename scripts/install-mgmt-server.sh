#!/usr/bin/env bash
# Install / update Hermes Management API server on macOS.
#
# Deploys:
#   ~/.hermes/hermes-mgmt-server.js           (the HTTP server)
#   ~/Library/LaunchAgents/ai.hermes.mgmt.plist  (launchd job)
#
# Then (re)loads the launchd service so it runs on login + at boot.
#
# Usage:
#   bash scripts/install-mgmt-server.sh            # install / update
#   bash scripts/install-mgmt-server.sh uninstall  # stop and remove
#
# Re-running is safe — the script is idempotent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_JS="$REPO_ROOT/resources/mgmt-server/hermes-mgmt-server.js"
SRC_PLIST="$REPO_ROOT/resources/mgmt-server/ai.hermes.mgmt.plist.template"

DEST_JS="$HOME/.hermes/hermes-mgmt-server.js"
DEST_PLIST="$HOME/Library/LaunchAgents/ai.hermes.mgmt.plist"
LOG_DIR="$HOME/.hermes/logs"
LABEL="ai.hermes.mgmt"

case "${1:-install}" in
  uninstall)
    echo "[mgmt-server] Stopping launchd job..."
    launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true
    echo "[mgmt-server] Removing files..."
    rm -f "$DEST_JS" "$DEST_PLIST"
    echo "[mgmt-server] Done."
    exit 0
    ;;
  install|"")
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Usage: $0 [install|uninstall]" >&2
    exit 2
    ;;
esac

# Sanity: required source files present
if [[ ! -f "$SRC_JS" ]]; then
  echo "ERROR: source JS not found at $SRC_JS" >&2
  exit 1
fi
if [[ ! -f "$SRC_PLIST" ]]; then
  echo "ERROR: plist template not found at $SRC_PLIST" >&2
  exit 1
fi

# Find node binary
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [[ -x "$candidate" ]]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node binary not found. Install Node.js first (e.g. 'brew install node')." >&2
  exit 1
fi

echo "[mgmt-server] Using node: $NODE_BIN"
echo "[mgmt-server] Source JS:  $SRC_JS"
echo "[mgmt-server] Destination: $DEST_JS"

# Create .hermes and logs dirs if missing
mkdir -p "$HOME/.hermes" "$LOG_DIR" "$(dirname "$DEST_PLIST")"

# Copy server JS (back up any existing one first)
if [[ -f "$DEST_JS" ]]; then
  BACKUP="$DEST_JS.bak.$(date +%s)"
  cp "$DEST_JS" "$BACKUP"
  echo "[mgmt-server] Existing JS backed up to $BACKUP"
fi
install -m 0644 "$SRC_JS" "$DEST_JS"

# Render plist template (substitute __HOME__ and __NODE_BIN__)
# sed with | delimiter so forward slashes in paths don't need escaping
sed \
  -e "s|__HOME__|$HOME|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  "$SRC_PLIST" > "$DEST_PLIST"

echo "[mgmt-server] Wrote $DEST_PLIST"

# Reload launchd job: bootout (ignore failure on first install), then bootstrap
launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST_PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

echo "[mgmt-server] Launchd job (re)loaded."

# Verify: ping /health once (give launchd ~2s to come up)
sleep 1
PORT="${MGMT_PORT:-8643}"
if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "[mgmt-server] ✓ Health check passed on port $PORT"
else
  echo "[mgmt-server] ⚠ Health check on port $PORT did not respond. Check $LOG_DIR/mgmt-server.err"
fi

echo "[mgmt-server] Done."
