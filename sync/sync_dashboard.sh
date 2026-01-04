#!/bin/bash

# Sync dashboard images to Kindle via SSH (using sshpass for KOReader)
# KOReader's dropbear SSH doesn't support key auth, so we use sshpass with empty password
# Supports multiple stops: syncs dashboard_1.png, dashboard_2.png, etc.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config"
OUTPUT_DIR="$SCRIPT_DIR/../out"

# Load config
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Config file not found!"
    echo "Copy sync/config.example to sync/config and fill in your Kindle's IP"
    exit 1
fi

source "$CONFIG_FILE"

# Validate config
if [ -z "$KINDLE_IP" ] || [ "$KINDLE_IP" = "192.168.1.XXX" ]; then
    echo "Error: KINDLE_IP not configured in $CONFIG_FILE"
    exit 1
fi

# Get stop count (default 1 for backward compatibility)
STOP_COUNT="${STOP_COUNT:-1}"

# Check at least one dashboard exists
if [ ! -f "$OUTPUT_DIR/dashboard_1.png" ]; then
    echo "Error: No dashboard images found in $OUTPUT_DIR"
    echo "Run the renderer first: cd renderer && source venv/bin/activate && python render_dashboard.py"
    exit 1
fi

# Check sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo "Error: sshpass not installed"
    echo "Install with: brew install hudochenkov/sshpass/sshpass"
    exit 1
fi

echo "Syncing dashboard to Kindle at $KINDLE_IP..."

# SSH/SCP options
PORT="${KINDLE_PORT:-2222}"
USER="${KINDLE_USER:-root}"
PASS="${KINDLE_PASSWORD:-}"

# Create dashboard directory on Kindle if it doesn't exist
sshpass -p "$PASS" ssh -p "$PORT" -o StrictHostKeyChecking=no "$USER@$KINDLE_IP" \
    "mkdir -p $KINDLE_DASHBOARD_PATH" 2>/dev/null || true

# Sync all dashboard images
sync_image() {
    local src="$1"
    local filename="$2"
    local temp_file="$KINDLE_DASHBOARD_PATH/.${filename}.tmp"
    local final_file="$KINDLE_DASHBOARD_PATH/$filename"

    if [ -f "$src" ]; then
        sshpass -p "$PASS" scp -P "$PORT" -o StrictHostKeyChecking=no -q "$src" "$USER@$KINDLE_IP:$temp_file"
        sshpass -p "$PASS" ssh -p "$PORT" -o StrictHostKeyChecking=no "$USER@$KINDLE_IP" \
            "mv '$temp_file' '$final_file'"
        echo "  Synced: $filename"
    fi
}

# Sync numbered dashboard images
for i in $(seq 1 $STOP_COUNT); do
    sync_image "$OUTPUT_DIR/dashboard_${i}.png" "dashboard_${i}.png"
done

# Create/update config file on Kindle for KOReader plugin
CONFIG_CONTENT="STOP_COUNT=$STOP_COUNT"
sshpass -p "$PASS" ssh -p "$PORT" -o StrictHostKeyChecking=no "$USER@$KINDLE_IP" \
    "echo '$CONFIG_CONTENT' > '$KINDLE_DASHBOARD_PATH/config.txt'"
echo "  Updated: config.txt (STOP_COUNT=$STOP_COUNT)"

echo "Done! Dashboard synced to $KINDLE_IP:$KINDLE_DASHBOARD_PATH"
