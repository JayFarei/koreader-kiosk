# KOReader Dashboard Plugin

A kiosk-mode plugin that displays a dashboard image with auto-refresh.

## Installation

1. Copy the `dashboard.koplugin` folder to your Kindle:
   ```bash
   scp -r dashboard.koplugin root@YOUR_KINDLE_IP:/mnt/us/koreader/plugins/
   ```

2. Restart KOReader

3. The plugin will appear in **Tools > Dashboard Kiosk**

## Usage

1. Sync your dashboard image to `/mnt/us/dashboard/dashboard.png`
2. In KOReader, go to **Tools > Dashboard Kiosk > Start Dashboard**
3. Tap anywhere on screen to access the menu
4. Select **Stop Dashboard** to exit kiosk mode

## Configuration

Edit `main.lua` to change:
- `DASHBOARD_PATH` - location of the dashboard image
- `REFRESH_INTERVAL` - seconds between image refreshes (default: 300)
- `FULL_REFRESH_EVERY` - full e-ink refresh every N updates (default: 6)

## Features

- Fullscreen image display
- Auto-refresh at configurable interval
- Periodic full e-ink refresh to reduce ghosting
- Prevents device sleep while active
- Tap anywhere to access menu
