# Doomscroll Blocker

A tiny Chrome-compatible extension that watches configured sites for heavy scrolling. When a tab crosses the scroll threshold, it covers the page with a random animation and a speed-adjusted timer.

The timer is intentionally tab-local. If you close the doomscrolling tab, the timer disappears with it.
Refreshing the tab does not reset the block.

## Load It

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this folder: `/Users/shreykhokhra/Documents/Playground/doomscroll-blocker`.

## How It Works

- Default watched domains: Facebook, Instagram, Reddit, TikTok, X/Twitter, and YouTube.
- Default trigger: 7200px of scrolling inside 90 seconds.
- Default block: 1 to 5 minutes, based on scroll speed.
- Slow threshold crossings trend toward 5 minutes. Rapid scrolling around 650px/second or faster trends toward 1 minute.
- The extension popup lets you change the domains, timer range, trigger distance, watch window, and rapid-scroll speed.

## Files

- `manifest.json`: Extension definition.
- `src/content.js`: Per-tab doomscroll detector and blocker overlay.
- `src/background.js`: Remembers active tab blocks across refresh and clears them when tabs close.
- `src/styles.css`: Full-screen blocker UI and random animations.
- `src/popup.html`, `src/popup.css`, `src/popup.js`: Extension settings popup.
