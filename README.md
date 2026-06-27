# Tennis Weather Agent

**Live demo:** [tennis-weather-agent.vercel.app](https://tennis-weather-agent.vercel.app)

---

## The Problem

Tennis players schedule sessions days in advance, but weather is unpredictable. The typical workflow involves manually cross-referencing Google Calendar with a weather app the morning of each session — a habit that's easy to skip and impossible to automate without building something yourself.

Missing a weather check means showing up to a court in high winds or unexpected rain. Checking too early means the forecast is inaccurate. The window of useful information is narrow, and nobody wants to set a daily reminder to do a two-app lookup.

---

## What This Does

Tennis Weather Agent is a personal automation that connects Google Calendar, real-time weather forecasting, and Telegram into a single daily briefing. Every afternoon at a configurable time, it checks for upcoming tennis sessions, fetches weather conditions for each venue, and sends a structured Telegram message with a clear play/cancel recommendation — no manual steps required.

There is also a full web dashboard for manual control: send messages on demand, preview forecasts for all upcoming sessions, configure thresholds, and view a history of every notification ever sent.

---

## Features

### Automated Daily Briefing
A scheduled job runs at a user-defined time (default: 16:00 Israel time) and sends a Telegram message covering the next day's tennis sessions. The message includes temperature, rain probability, wind speed, and a go/no-go recommendation per session — formatted in clean, readable HTML.

> **Value:** Removes the daily cognitive overhead of cross-referencing calendar and weather. The right information arrives in the right channel at the right time.

### Configurable Bad Weather Thresholds
Wind and rain thresholds are configurable directly from the dashboard and persist across sessions. Changing the wind threshold from 20 km/h to 30 km/h immediately re-evaluates all visible events and updates the dashboard in real time.

> **Value:** What counts as "bad weather" for a casual hit is different from a serious training session. The system adapts to the user, not the other way around.

### Multi-Event & Multi-Date Messages
When multiple sessions are selected, the agent groups them intelligently — adding date headers only when events span different days, and generating a smart footer that names specific sessions with poor conditions rather than applying a blanket flag to everything.

> **Value:** Context-aware messaging. "Session 1 looks fine, Session 2 may need rescheduling" is more useful than a blunt all-or-nothing warning.

### Interactive Dashboard with Google Maps
All upcoming tennis events appear in a sidebar with live weather chips per card. Selecting an event pans a Google Maps view to the venue with a pinned marker. A compact weather strip below the map shows the relevant forecast — current location by default, switching to the event venue when a session is selected. Users can return to their current location view at any time via a single click.

> **Value:** The map confirms venue geocoding worked correctly and surfaces location context without leaving the app.

### Manual Send with Event Selection
Users can select any combination of upcoming events via checkboxes and trigger a Telegram message manually, independent of the scheduled automation. The send button stays disabled while weather data is loading, preventing messages with incomplete information.

> **Value:** Accommodates ad-hoc sessions added late to the calendar, or cases where the briefing needs to go out immediately rather than waiting for the scheduled job.

### Customisable Message Template
The Telegram message format is fully editable with a live preview panel. Supported variables: `{date}`, `{title}`, `{venue}`, `{temp}`, `{rain}`, `{wind}`, `{condition}`. Changes auto-save after 800ms of inactivity.

> **Value:** The message is sent to a real person. Having control over tone and format matters, and the live preview makes editing safe.

### Activity Log
Every automated and manual run is logged with timestamp, event count, selected events, the exact message sent, and success/failure status. Viewable in the dashboard.

> **Value:** Observability for a system that runs unattended. Makes it easy to verify the automation fired or debug why a message wasn't sent.

---

## Technical Decisions

### Stack
- **Framework:** Next.js 16 App Router on Vercel
- **Language:** TypeScript end-to-end
- **UI:** Tailwind CSS + Radix UI primitives
- **Maps:** `@react-google-maps/api` (Google Maps JavaScript API)

### External APIs

| Service | Purpose | Auth |
|---|---|---|
| Google Calendar API | Read tennis events via service account | Base64-encoded service account JSON |
| Open-Meteo | Hourly weather forecast | None — free, no key required |
| Google Geocoding API | Resolve venue strings to lat/lng | API key |
| Google Maps JS API | Interactive map in dashboard | Public API key |
| Telegram Bot API | Send formatted HTML notifications | Bot token + chat ID |
| GitHub Contents API | Persistent config and log storage | Personal access token |

### Self-Modifying Cron Schedule
When the user changes the scheduled send time in the dashboard, the app dynamically rewrites `vercel.ts` and commits it to GitHub via the Contents API. This triggers a Vercel redeploy that applies the new cron schedule — no manual config file editing or redeployment required from the user.

### Persistence Without a Database
Rather than provisioning a database for two small JSON files, configuration and logs are stored directly in the GitHub repository via the Contents API. Each read fetches the latest committed file; each write creates a new commit. This keeps infrastructure minimal while providing full persistence and a built-in audit trail through git history.

The main tradeoff is latency on reads (one GitHub API call per request) and the risk of SHA conflicts on concurrent writes. Mitigations: threshold changes save on blur rather than on every keystroke, template changes are debounced at 800ms, and config/log files are kept separate so their writes never race each other.

### Stale Closure Prevention
The dashboard uses a `thresholdsRef` pattern to prevent React stale closures in fetch callbacks. When the user changes a weather threshold, the ref updates synchronously while the React state update is batched — ensuring the event-loading callback always reads the current threshold value even before the component re-renders.

### Venue Translation
Calendar event locations are raw strings, often in Hebrew. The app geocodes each location via the Google Geocoding API with `language=en&region=il`. When the API still returns Hebrew characters in `formatted_address` — which happens with some Israeli venues — a fallback constructs an English label from the structured `address_components` fields, filtering out any component that still contains Hebrew.

### Weather Logic
Open-Meteo's free hourly forecast API is queried for the exact hour of each session. The "bad weather" flag is `windSpeed >= windThreshold || rainProbability >= rainThreshold` — a conservative OR condition that errs toward caution. Both thresholds are user-configurable and applied consistently across the dashboard UI, the Telegram message, and the event card indicators.

---

## Screenshots

> *Dashboard overview with upcoming events and Google Maps*

> *Telegram message example with multi-event forecast*

> *Settings panel — threshold configuration and schedule*

---

## Setup

```bash
git clone https://github.com/Shira-Yahav/tennis-weather-agent
cd tennis-weather-agent
npm install
# create .env.local with the variables below
npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64-encoded Google service account JSON with Calendar read access |
| `GOOGLE_CALENDAR_ID` | Calendar ID to monitor for tennis events |
| `GOOGLE_GEOCODING_KEY` | Google Cloud API key (Geocoding API + Maps JavaScript API enabled) |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Same key, exposed client-side for the map component |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat or user ID to receive messages |
| `GITHUB_TOKEN` | Personal access token with `contents:write` on the repo |
| `GITHUB_REPO` | `owner/repo` string used for config and log storage |
| `CRON_SECRET` | Secret that authenticates incoming Vercel cron requests |
