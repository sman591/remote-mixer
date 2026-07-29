#!/usr/bin/env bash
#
# Sync this working tree into the permanent Raspberry Pi install and restart the
# service. Run from the dev checkout:
#
#   yarn deploy              build, sync, restart
#   yarn deploy --skip-build sync the existing build only (config-only changes)
#
# Run ./pi-install.sh once first to create the install dir and the service.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${REMOTE_MIXER_INSTALL_DIR:-$HOME/remote-mixer-prod}"
SERVICE=remote-mixer

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- preflight ---------------------------------------------------------------

if [ ! -d "$INSTALL_DIR" ]; then
  echo "install dir $INSTALL_DIR does not exist -- run ./pi-install.sh first" >&2
  exit 1
fi

if [ "$SRC" = "$INSTALL_DIR" ]; then
  echo "refusing to deploy $SRC onto itself" >&2
  exit 1
fi

# --- build in the dev checkout -----------------------------------------------
#
# Building here rather than in the install dir means the install dir needs no
# yarn install of its own, and a broken build aborts before the running service
# is touched.

if [ "$SKIP_BUILD" = 0 ]; then
  echo "==> building in $SRC"
  (cd "$SRC" && yarn build)
else
  echo "==> skipping build"
fi

if [ ! -f "$SRC/frontend/dist/index.html" ] || [ ! -f "$SRC/backend/dist/index.js" ]; then
  echo "build output missing -- refusing to deploy an incomplete tree" >&2
  exit 1
fi

# --- sync --------------------------------------------------------------------
#
# The service is stopped for the copy so nothing reads half-written files.
# If anything below fails, bring it back up on the old contents.

restore_service() {
  echo "==> deploy failed, restarting service on the previous build" >&2
  sudo systemctl start "$SERVICE" || true
}

echo "==> stopping $SERVICE"
sudo systemctl stop "$SERVICE"
trap restore_service ERR

echo "==> syncing to $INSTALL_DIR"
rsync -a --delete --info=stats1 \
  --exclude='.git/' \
  --exclude='.yarn/cache/' \
  --exclude='.claude/' \
  --exclude='.vscode/' \
  --exclude='config/remote-mixer-config.local.js' \
  --exclude='.env.systemd' \
  --exclude='.deploy-info' \
  --exclude='.linaria-cache/' \
  --exclude='.eslintcache' \
  --exclude='node_modules/.cache/' \
  --exclude='*.tsbuildinfo' \
  "$SRC/" "$INSTALL_DIR/"

# node lives under nvm, whose bin dir is not on a systemd unit's PATH.
# Regenerating this every deploy means a later `nvm install` is picked up.
#
# process.execPath, not `command -v node`: yarn runs scripts with a throwaway
# /tmp/xfs-*/node shim at the front of PATH, and that directory is gone by the
# time the service restarts.
NODE_BIN_DIR="$(dirname "$(node -e 'process.stdout.write(process.execPath)')")"
if [ ! -x "$NODE_BIN_DIR/node" ]; then
  echo "could not resolve a usable node binary (got $NODE_BIN_DIR/node)" >&2
  exit 1
fi
cat > "$INSTALL_DIR/.env.systemd" <<EOF
PATH=$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin
NODE_ENV=production
EOF

GIT_REV="$(cd "$SRC" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_DIRTY=""
if [ -n "$(cd "$SRC" && git status --porcelain 2>/dev/null)" ]; then
  GIT_DIRTY=" (dirty)"
fi
DEPLOY_INFO="$(date -Is) ${GIT_REV}${GIT_DIRTY} node $(node -v)"
echo "$DEPLOY_INFO" > "$INSTALL_DIR/.deploy-info"

# --- restart and verify ------------------------------------------------------

echo "==> starting $SERVICE"
sudo systemctl start "$SERVICE"
trap - ERR

# Mirror the app's own config merge so the health check follows the configured port.
PORT="$(node -e '
  const dir = process.argv[1]
  const load = name => { try { return require(dir + "/config/" + name) } catch { return {} } }
  const config = { ...load("remote-mixer-config"), ...load("remote-mixer-config.local") }
  console.log(config.httpPort || 8000)
' "$INSTALL_DIR" 2>/dev/null || echo 8000)"

echo "==> waiting for http://127.0.0.1:$PORT"
for _ in $(seq 1 15); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "==> deployed: $DEPLOY_INFO"
    echo "    http://$(hostname).local  (port 80 -> $PORT)"
    exit 0
  fi
  sleep 1
done

echo "service did not come up on port $PORT:" >&2
systemctl is-active "$SERVICE" >&2 || true
journalctl -u "$SERVICE" -n 40 --no-pager >&2
exit 1
