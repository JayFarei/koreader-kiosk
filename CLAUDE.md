# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-ink bus arrival dashboard for Kindle Oasis 3, displaying TFL bus times with weather. Renders a Next.js page to PNG, converts to grayscale, and syncs to Kindle via SSH where a KOReader plugin displays it.

## Commands

```bash
# Main entry point - all modes
./start.sh              # Desktop viewer (render once, open in browser)
./start.sh --kindle     # Production: continuous render + sync to Kindle
./start.sh --sync       # Render once and sync to Kindle
./start.sh --loop       # Continuous render only (no sync)

# Web app (dashboard-web/)
cd dashboard-web && npm run dev     # Development server on :3000
cd dashboard-web && npm run lint    # ESLint

# Python renderer (renderer/)
cd renderer && source venv/bin/activate && python render_dashboard.py
```

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Next.js App    │───▶│   Renderer   │───▶│  Kindle/KOReader│
│  /render page   │    │  (Playwright │    │  (SSH sync +    │
│  fetches TFL +  │    │   + Pillow)  │    │   Lua plugin)   │
│  weather APIs   │    │  screenshot  │    │                 │
└─────────────────┘    │  → grayscale │    └─────────────────┘
                       └──────────────┘
```

**Data flow:**
1. `start.sh` generates `.env.local` from `sync/config`
2. Next.js server renders dashboard at `localhost:3000/render`
3. Python renderer screenshots the page, converts to grayscale PNG
4. Sync script SCPs image to Kindle
5. KOReader plugin displays and auto-refreshes

## Key Files

- `sync/config` - All user settings (bus stop, coordinates, Kindle IP). Single source of truth.
- `dashboard-web/src/app/render/page.tsx` - Main dashboard UI
- `dashboard-web/src/lib/tfl.ts` - TFL bus API client
- `dashboard-web/src/lib/weather.ts` - Open-Meteo weather API client
- `renderer/render_dashboard.py` - Playwright screenshot + grayscale conversion
- `koreader-plugin/dashboard.koplugin/main.lua` - KOReader fullscreen display plugin

## Configuration

All settings in `sync/config` (gitignored). Copy from `sync/config.example`:
- `STOP_ID`, `BUS_LINE`, `ROUTE_NAME`, `STOP_NAME` - TFL bus stop config
- `WALK_TIME_MINUTES` - Time to walk to stop
- `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` - Weather location
- `KINDLE_IP`, `KINDLE_PORT` - SSH connection to Kindle

## E-ink Constraints

- Resolution: 1264x1680 pixels
- Grayscale only (no color)
- High contrast, large fonts for readability
- Inline styles in React (no external CSS for screenshot reliability)
