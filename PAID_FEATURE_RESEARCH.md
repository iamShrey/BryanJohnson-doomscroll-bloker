# Paid Feature Research

## Market Signals

Paid and freemium blockers tend to charge for four things:

- Stronger enforcement: strict modes, lockdowns, harder bypasses, and intentional unlock friction.
- Scheduling and sessions: recurring focus windows, Pomodoro-style sessions, and mode templates.
- Better targeting: keyword/page-content blocking, whitelists, and supported-site control.
- Analytics and accountability: dashboards, heatmaps, weekly reports, exports, and sometimes cross-device sync.

## Build Choices

This extension is browser-local, so the paid-style feature set should improve control without adding a backend:

- Focus hours: during configured hours, scroll breaks become stricter.
- Daily active scrolling budget: after the budget is used, the next active session triggers a longer reset.
- Strict unlock: after the timer ends, users must type a short phrase before the tab unlocks.
- Local analytics export: users can export their own aggregate analytics JSON.

## Not Built Yet

- Cross-device sync requires a backend or account system.
- Device/app blocking requires native apps or OS-level APIs.
- Team/accountability reports require explicit user consent and sharing flows.
