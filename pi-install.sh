#!/usr/bin/env bash
#
# One-time setup of the permanent Raspberry Pi install. Idempotent -- safe to
# re-run after an OS reinstall or a config change.
#
#   ./pi-install.sh        set everything up
#   ./pi-install.sh --uninstall  remove the service, sudoers rule and nft rule
#
# Creates the install dir and its production config, installs the systemd
# service, lets this user restart it without a password, and redirects port 80
# to the app so phones can use a bare hostname. Afterwards run `yarn deploy` to
# build and populate the install dir.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${REMOTE_MIXER_INSTALL_DIR:-$HOME/remote-mixer-prod}"
SERVICE=remote-mixer
HTTP_PORT="${REMOTE_MIXER_PORT:-8080}"
RUN_USER="$(id -un)"
SYSTEMCTL="$(command -v systemctl)"

UNIT_PATH="/etc/systemd/system/$SERVICE.service"
SUDOERS_PATH="/etc/sudoers.d/$SERVICE"
NFT_CONF=/etc/nftables.conf
NFT_MARKER="# remote-mixer: port 80 -> app"

# Delete our marked block (marker line through the table's closing brace) so
# both --uninstall and a re-run of the install start from a clean file.
drop_nft_block() {
  grep -qF "$NFT_MARKER" "$NFT_CONF" 2>/dev/null || return 0
  local escaped
  escaped="$(printf '%s' "$NFT_MARKER" | sed 's/[][\.*^$/]/\\&/g')"
  sudo sed -i "/$escaped/,/^}/d" "$NFT_CONF"
}

# --- uninstall ---------------------------------------------------------------

if [ "${1:-}" = "--uninstall" ]; then
  sudo systemctl disable --now "$SERVICE" 2>/dev/null || true
  sudo rm -f "$UNIT_PATH" "$SUDOERS_PATH"
  sudo systemctl daemon-reload
  drop_nft_block
  sudo systemctl reload nftables 2>/dev/null || true
  echo "removed the service, sudoers rule and nft redirect."
  echo "$INSTALL_DIR was left in place -- delete it by hand if you want it gone."
  exit 0
fi

if [ "$#" -gt 0 ]; then
  echo "unknown option: $1" >&2
  exit 2
fi

# --- install dir and production config ---------------------------------------

echo "==> install dir: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/config"

CONFIG_PATH="$INSTALL_DIR/config/remote-mixer-config.local.js"
if [ -f "$CONFIG_PATH" ]; then
  echo "==> keeping existing $CONFIG_PATH"
else
  # This file is deliberately excluded from the pi-deploy.sh rsync, so the
  # install keeps its own port/device settings independently of the dev checkout.
  cat > "$CONFIG_PATH" <<EOF
// Machine-specific configuration for the permanent Raspberry Pi install.
// Not overwritten by pi-deploy.sh -- edit it here and restart the service.

// @ts-check
/** @type {Partial<import('../backend/src/services/config').RemoteMixerConfiguration>} */
const userConfig = {
  httpPort: $HTTP_PORT,
  logLevel: 'info',
  device: 'yamaha-01v96',
  // mode: 'iem',
}

module.exports = userConfig
EOF
  echo "==> wrote $CONFIG_PATH (port $HTTP_PORT)"
fi

# --- systemd service ---------------------------------------------------------

echo "==> installing $UNIT_PATH"
sed -e "s|@USER@|$RUN_USER|g" -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
  "$SRC/pi-remote-mixer.service" | sudo tee "$UNIT_PATH" > /dev/null
sudo systemctl daemon-reload

# Enabled but not started: there is nothing to run until `yarn deploy` has
# populated the install dir.
sudo systemctl enable "$SERVICE" > /dev/null

# --- passwordless restart for the deploy script ------------------------------

echo "==> installing $SUDOERS_PATH"
SUDOERS_TMP="$(mktemp)"
cat > "$SUDOERS_TMP" <<EOF
$RUN_USER ALL=(root) NOPASSWD: $SYSTEMCTL start $SERVICE, $SYSTEMCTL stop $SERVICE, $SYSTEMCTL restart $SERVICE
EOF
sudo visudo -cqf "$SUDOERS_TMP"
sudo install -m 0440 -o root -g root "$SUDOERS_TMP" "$SUDOERS_PATH"
rm -f "$SUDOERS_TMP"

# --- port 80 -> app ----------------------------------------------------------
#
# The app stays on an unprivileged port; nftables redirects 80 onto it so a
# phone can open http://<hostname>.local with no port suffix.
#
# prerouting covers traffic arriving from the network; output covers traffic
# the Pi originates itself, which never passes through prerouting. The output
# rule is guarded by `fib daddr type local` so it only ever matches this Pi's
# own addresses -- without that it would also redirect outbound port 80 traffic
# and break plain-HTTP apt.

echo "==> writing port 80 -> $HTTP_PORT redirect into $NFT_CONF"
sudo cp "$NFT_CONF" "$NFT_CONF.bak-$(date +%Y%m%d%H%M%S)"
drop_nft_block
sudo tee -a "$NFT_CONF" > /dev/null <<EOF

$NFT_MARKER
table inet nat {
	chain prerouting {
		type nat hook prerouting priority dstnat;
		tcp dport 80 redirect to :$HTTP_PORT
	}
	chain output {
		type nat hook output priority dstnat;
		fib daddr type local tcp dport 80 redirect to :$HTTP_PORT
	}
}
EOF
sudo nft -c -f "$NFT_CONF"
sudo systemctl enable nftables > /dev/null
sudo systemctl restart nftables

# -----------------------------------------------------------------------------

echo
echo "setup complete. Next:"
echo
echo "    cd $SRC && yarn deploy"
echo
echo "then the mixer is at http://$(hostname).local (or :$HTTP_PORT)."
