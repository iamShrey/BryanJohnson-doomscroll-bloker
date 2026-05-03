# Chrome Web Store Listing Draft

## Name

Doomscroll Blocker

## Short Description

Interrupt excessive scrolling with speed-adjusted breaks and local habit analytics.

## Category

Productivity

## Language

English

## Detailed Description

Doomscroll Blocker helps you interrupt feed spirals before they take over your day.

When you scroll too much on configured sites, the extension covers the tab with a calm animated pause and countdown. The pause length adapts to your scrolling pattern: slower long-form scrolling can trigger a longer reset, while rapid scrolling gets a shorter pattern break.

Features:

- Watch common doomscrolling sites by default, including Reddit, YouTube, TikTok, Instagram, Facebook, and X/Twitter.
- Configure your own watched domains.
- Tune scroll distance, watch window, rapid-scroll speed, and timer range.
- Keep active timers across refreshes.
- Close the tab to end that tab's timer.
- View local analytics for blocks, interrupted time, average trigger speed, top domains, and broad content categories.
- Reset analytics whenever you want.

Privacy:

Doomscroll Blocker runs locally in your browser. It does not send browsing data to a server, does not store raw page text, does not take screenshots, and does not use remote analytics. Optional content insights derive broad categories locally and discard the page text immediately.

## Single Purpose

Doomscroll Blocker detects excessive scrolling on user-configured websites and interrupts that tab with a timed animated pause, while providing local analytics to help users understand and reduce scrolling habits.

## Permission Justification

### storage

Used to save user settings, tab-local active block timers, and aggregate local analytics.

### host access / content scripts

Used to measure scrolling on configured websites and display the blocker overlay inside the active tab. The extension ships with common feed domains and lets users configure the domain list.

## Privacy Practice Notes

Suggested dashboard disclosure:

- Data usage: user activity / website content is processed locally for the user-facing blocker and local analytics.
- Data sharing: no data is sold, transferred, or shared.
- Remote code: none.
- Analytics: local-only; no Google Analytics or third-party analytics SDK.

## Test Instructions

1. Load the extension package.
2. Visit a watched domain or add a test domain in the popup.
3. Scroll past the configured threshold.
4. Confirm that the animated blocker appears with a countdown.
5. Refresh the tab and confirm that the countdown remains active.
6. Close the tab and confirm that the timer disappears.
7. Open the popup and confirm local analytics update.
