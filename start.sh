#!/bin/bash

# E-ink Dashboard Startup Script
# Usage:
#   ./start.sh           - Start server, render once, open viewer
#   ./start.sh --loop    - Start server and continuous render loop (for Kindle)
#   ./start.sh --sync    - Render and sync to Kindle once
#   ./start.sh --kindle  - Continuous render + sync to Kindle

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RENDER_INTERVAL=30  # seconds between renders (30s for testing, 300s for production)

show_help() {
    echo "E-ink Dashboard"
    echo ""
    echo "Usage: ./start.sh [option]"
    echo ""
    echo "Options:"
    echo "  (none)     Start server, render once, open desktop viewer"
    echo "  --loop     Start server with continuous render loop"
    echo "  --sync     Render once and sync to Kindle"
    echo "  --kindle   Continuous render + sync to Kindle (production mode)"
    echo "  --help     Show this help"
    echo ""
}

generate_env() {
    if [ -f sync/config ]; then
        source sync/config

        # Start fresh
        echo "# Auto-generated from sync/config - do not edit directly" > dashboard-web/.env.local

        # Stop count
        local count="${STOP_COUNT:-1}"
        echo "STOP_COUNT=$count" >> dashboard-web/.env.local

        # Generate vars for each stop
        for i in $(seq 1 $count); do
            eval "ID=\$STOP_${i}_ID"
            eval "LINE=\$STOP_${i}_BUS_LINE"
            eval "ROUTE=\$STOP_${i}_ROUTE_NAME"
            eval "NAME=\$STOP_${i}_STOP_NAME"
            eval "WALK=\$STOP_${i}_WALK_TIME_MINUTES"

            # Only add if ID is set
            if [ -n "$ID" ]; then
                echo "STOP_${i}_ID=$ID" >> dashboard-web/.env.local
                echo "STOP_${i}_BUS_LINE=$LINE" >> dashboard-web/.env.local
                echo "STOP_${i}_ROUTE_NAME=$ROUTE" >> dashboard-web/.env.local
                echo "STOP_${i}_STOP_NAME=$NAME" >> dashboard-web/.env.local
                echo "STOP_${i}_WALK_TIME_MINUTES=${WALK:-10}" >> dashboard-web/.env.local
            fi
        done

        # Legacy single-stop fallback (if no STOP_COUNT)
        if [ "$count" -eq 1 ] && [ -z "$STOP_1_ID" ] && [ -n "$STOP_ID" ]; then
            echo "STOP_ID=${STOP_ID}" >> dashboard-web/.env.local
            echo "BUS_LINE=${BUS_LINE}" >> dashboard-web/.env.local
            echo "ROUTE_NAME=${ROUTE_NAME}" >> dashboard-web/.env.local
            echo "STOP_NAME=${STOP_NAME}" >> dashboard-web/.env.local
            echo "WALK_TIME_MINUTES=${WALK_TIME_MINUTES:-10}" >> dashboard-web/.env.local
        fi

        # Weather (shared)
        echo "WEATHER_LATITUDE=${WEATHER_LATITUDE:-51.5014}" >> dashboard-web/.env.local
        echo "WEATHER_LONGITUDE=${WEATHER_LONGITUDE:--0.1419}" >> dashboard-web/.env.local

        echo "Generated .env.local with ${count} stop(s)"
    else
        echo "Warning: sync/config not found, using defaults"
    fi
}

start_server() {
    echo "Starting web server..."

    # Generate .env.local from sync/config
    generate_env

    # Kill any existing process on port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true

    cd dashboard-web

    # Build for production (removes dev indicator orb)
    echo "Building for production..."
    npm run build

    # Start production server
    npm run start &
    SERVER_PID=$!
    cd ..

    echo "Waiting for server to start..."
    until curl -s -o /dev/null http://localhost:3000/render; do
        sleep 1
    done
    echo "Server ready!"
}

render_once() {
    source sync/config 2>/dev/null || true
    local stop_count="${STOP_COUNT:-1}"

    echo "Rendering dashboard ($stop_count stop(s))..."
    cd renderer
    source venv/bin/activate
    python render_dashboard.py --stops "$stop_count"
    cd ..
}

sync_to_kindle() {
    echo "Syncing to Kindle..."
    ./sync/sync_dashboard.sh
}

render_loop() {
    source sync/config 2>/dev/null || true
    local stop_count="${STOP_COUNT:-1}"

    cd renderer
    source venv/bin/activate

    while true; do
        echo "[$(date)] Rendering $stop_count stop(s)..."
        python render_dashboard.py --stops "$stop_count"

        if [ "$1" = "sync" ]; then
            cd ..
            ./sync/sync_dashboard.sh
            cd renderer
        fi

        echo "[$(date)] Sleeping for ${RENDER_INTERVAL}s..."
        sleep $RENDER_INTERVAL
    done
}

cleanup() {
    echo "Stopping..."
    [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null
    exit
}

trap cleanup INT TERM

case "${1:-}" in
    --help|-h)
        show_help
        ;;
    --loop)
        start_server
        echo ""
        echo "Starting continuous render loop (Ctrl+C to stop)"
        echo "Render interval: ${RENDER_INTERVAL}s"
        echo ""
        render_loop
        ;;
    --sync)
        start_server
        render_once
        sync_to_kindle
        echo "Done! Stopping server..."
        kill $SERVER_PID 2>/dev/null
        ;;
    --kindle)
        start_server
        echo ""
        echo "Starting Kindle mode: continuous render + sync (Ctrl+C to stop)"
        echo "Render interval: ${RENDER_INTERVAL}s"
        echo ""
        render_loop sync
        ;;
    *)
        start_server
        render_once
        echo "Opening viewer..."
        open viewer/index.html
        echo ""
        echo "Dashboard is running!"
        echo "- Web server: http://localhost:3000/render"
        echo "- Viewer: viewer/index.html"
        echo ""
        echo "Press Ctrl+C to stop"
        wait $SERVER_PID
        ;;
esac
