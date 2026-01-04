#!/usr/bin/env python3
"""
E-ink dashboard renderer.

Takes a screenshot of the dashboard and converts it to an e-ink friendly grayscale image.
Supports multiple stops, rendering separate images for each.
"""

import hashlib
import io
import os
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

DASHBOARD_URL = "http://localhost:3000/render"
OUTPUT_DIR = Path(__file__).parent.parent / "out"
VIEWPORT_WIDTH = 1680
VIEWPORT_HEIGHT = 1264


def build_grayscale_lut(levels: int) -> list[int]:
    """Build a lookup table for grayscale quantization."""
    if levels <= 0 or levels >= 256:
        return list(range(256))
    factor = 256 // levels
    return [(x // factor) * factor for x in range(256)]


def render_single_dashboard(
    url: str,
    output_path: Path,
    grayscale_levels: int = 16,
    rotate_for_kindle: bool = True,
    browser=None,
) -> dict:
    """
    Render a single dashboard to a grayscale PNG.

    Args:
        url: URL of the render page (with ?stop=N if needed)
        output_path: Full path for output image
        grayscale_levels: Number of gray levels (4, 8, or 16)
        rotate_for_kindle: Rotate 90 degrees CW for Kindle portrait mode
        browser: Optional existing browser instance to reuse

    Returns:
        dict with success status, output path, hash, and render time
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    start_time_sec = time.time()
    close_browser = browser is None

    try:
        if browser is None:
            p = sync_playwright().start()
            browser = p.chromium.launch()

        page = browser.new_page(
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT}
        )
        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_selector('[data-render-ready="true"]', timeout=10000)
        screenshot_bytes = page.screenshot(full_page=False)
        page.close()

        if close_browser:
            browser.close()

    except PlaywrightTimeout as e:
        return {
            "success": False,
            "error": f"Timeout waiting for dashboard: {e}",
            "output_path": None,
            "hash": None,
            "render_time_ms": int((time.time() - start_time_sec) * 1000),
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Render failed: {e}",
            "output_path": None,
            "hash": None,
            "render_time_ms": int((time.time() - start_time_sec) * 1000),
        }

    img = Image.open(io.BytesIO(screenshot_bytes))
    img = img.convert("L")

    if grayscale_levels < 256:
        lut = build_grayscale_lut(grayscale_levels)
        img = img.point(lut)

    # Rotate 90 degrees counter-clockwise for Kindle portrait mode display
    if rotate_for_kindle:
        img = img.rotate(90, expand=True)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    image_bytes = buffer.getvalue()

    image_hash = hashlib.sha256(image_bytes).hexdigest()[:16]

    with open(output_path, "wb") as f:
        f.write(image_bytes)

    render_time_sec = time.time() - start_time_sec

    return {
        "success": True,
        "output_path": str(output_path),
        "hash": image_hash,
        "render_time_ms": int(render_time_sec * 1000),
    }


def render_all_dashboards(
    base_url: str = DASHBOARD_URL,
    output_dir: Path = OUTPUT_DIR,
    stop_count: int = 1,
    grayscale_levels: int = 16,
    rotate_for_kindle: bool = True,
) -> list[dict]:
    """
    Render dashboards for all configured stops.

    Args:
        base_url: Base URL of the render page
        output_dir: Directory to save output images
        stop_count: Number of stops to render
        grayscale_levels: Number of gray levels
        rotate_for_kindle: Rotate for Kindle display

    Returns:
        List of result dicts for each stop
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch()

        try:
            for i in range(1, stop_count + 1):
                url = f"{base_url}?stop={i}"
                output_path = output_dir / f"dashboard_{i}.png"

                print(f"Rendering stop {i}/{stop_count}...")
                result = render_single_dashboard(
                    url=url,
                    output_path=output_path,
                    grayscale_levels=grayscale_levels,
                    rotate_for_kindle=rotate_for_kindle,
                    browser=browser,
                )
                results.append(result)

                if result["success"]:
                    print(f"  -> {result['output_path']} ({result['render_time_ms']}ms)")
                else:
                    print(f"  -> Error: {result['error']}")


        finally:
            browser.close()

    return results




def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Render e-ink dashboard")
    parser.add_argument(
        "--url",
        default=DASHBOARD_URL,
        help="Dashboard URL (default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR,
        help="Output directory (default: %(default)s)",
    )
    parser.add_argument(
        "--grayscale",
        type=int,
        default=16,
        choices=[4, 8, 16, 256],
        help="Grayscale levels (default: %(default)s)",
    )
    parser.add_argument(
        "--no-rotate",
        action="store_true",
        help="Disable rotation for Kindle (keep landscape)",
    )
    parser.add_argument(
        "--stops",
        type=int,
        default=None,
        help="Number of stops to render (default: read from STOP_COUNT env var or 1)",
    )
    args = parser.parse_args()

    # Determine stop count
    stop_count = args.stops
    if stop_count is None:
        stop_count = int(os.environ.get("STOP_COUNT", "1"))

    results = render_all_dashboards(
        base_url=args.url,
        output_dir=args.output,
        stop_count=stop_count,
        grayscale_levels=args.grayscale,
        rotate_for_kindle=not args.no_rotate,
    )

    success_count = sum(1 for r in results if r["success"])
    total_time = sum(r["render_time_ms"] for r in results)
    print(f"\nRendered {success_count}/{stop_count} stops in {total_time}ms total")

    if success_count < stop_count:
        sys.exit(1)


if __name__ == "__main__":
    main()
