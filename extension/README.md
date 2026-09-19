# Circlr extension

Chrome MV3 extension (TypeScript, no framework, per spec #2 / #3). It ignites a
Session and mounts the Companion pane in the browser side panel beside the
Document.

## Scope

- Session ignition from the toolbar action
- Side Panel hosting with the Companion iframe (`panel ⇄ background`)
- Capture ingest with local buffering and `chrome.storage.session` persistence
- Interval capture: a screenshot of the active tab on a fixed
  `CAPTURE_INTERVAL_MS` timer, with average-hash dedupe and an MV3 keepalive /
  watchdog so the loop keeps running
- The LMS drop layer is a later ticket (#18)

Set up last, after and against contract-freeze work with the `companion/` Next.js app.

## Prerequisites

- Google Chrome (desktop). Side panel requires Chrome 114+.
- Node.js 18+ and npm (to build the extension).

## Build

```bash
cd extension
npm install
npm run build
```

`build` runs three steps: `tsc` compiles `src/*.ts` flat into `extension/`
(`background.js`, `sidepanel.js`, …), `scripts/icon.mjs` generates the icon, and
`scripts/clean.mjs` removes source maps. The root `*.js` files are build output —
edit `src/*.ts`, never the generated files.

## Load it in Chrome

1. Build (above), or the manifest will reference missing `.js` files.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** (top right) on.
4. Click **Load unpacked** and select the `extension/` directory (the one
   containing `manifest.json`).
5. Pin **Circlr Companion** to the toolbar if you like (puzzle-piece icon →
   pin).

After any later `npm run build`, click the **Reload** (circular arrow) button on
the Circlr card in `chrome://extensions` to pick up the new code.

## Run it

1. Open the page holding your Document (an LMS preview, a PDF viewer, any
   webpage).
2. Click the **Circlr Companion** toolbar action. Chrome opens the side panel
   beside the page; the panel ignites a Session and mounts the Companion.

On first run the Companion backend almost certainly is not running yet, so the
panel shows a fallback with **Retry** and **Settings** instead of the app.

## Point it at a backend

The backend base URL defaults to `http://localhost:3000`. Set it without
rebuilding:

1. Open the extension's options: `chrome://extensions` → Circlr →
   **Details** → **Extension options**, or click **Settings** on the panel's
   fallback screen.
2. Enter the base URL (http/https) and **Save**. It is stored in
   `chrome.storage.local` and read on every ignition/ingest, so it applies to
   the next Retry — no extension reload.

The backend must implement:

- `POST /session` → `{ "uuid": "..." }`
- `POST /session/:uuid/material` ← JSON `CapturePayload`
- (later) `GET /session/:uuid/events` for SSE

The Companion Next.js app (`../companion`) does not implement these routes yet.
To exercise the extension in the meantime, run the **capture inspector** — a
dependency-free stand-in that live-streams every uploaded capture to a viewer:

```bash
npm run inspect        # http://localhost:3000, override with PORT=...
```

With the extension pointed at the same URL (the default), click Circlr on a
document page. The side panel's iframe loads the inspector at `/?s=<uuid>`, so
each capture appears in the panel as it is uploaded; you can also open
`http://localhost:3000` in a normal tab. It implements `POST /session`,
`POST /session/:uuid/material`, `GET /session/:uuid/events` (SSE) and
`GET /health`. Captures live in memory only — nothing is written to disk.

## Capture loop

`src/background.ts` screenshots the **active tab** on a fixed
`CAPTURE_INTERVAL_MS` timer: `captureVisibleTab` → 1280px JPEG q≈0.7 →
average-hash fingerprint → dedupe → `POST /material`. There is no scroll / page /
focus detection — every tick is captured, and a frame whose 16-hex average hash
is within Hamming <4 of the rolling last-32 is skipped rather than re-uploaded.
Protected pages (`chrome://…`) skip the tick. Captures are serialized so uploads
stay ordered.

The loop starts when the panel reports the Companion is live. To survive the
MV3 ~30s idle kill, a cheap `chrome.runtime.getPlatformInfo()` call every
`KEEPALIVE_MS` (20s) keeps the worker awake, and a persistent `chrome.alarms`
watchdog (`WATCHDOG_ALARM`, every 0.5 min) revives the worker and restarts the
loop if it was terminated anyway. Closing the panel sends `stop`, which clears
the timer, keepalive, and watchdog and marks the Session as no-longer-capturing,
so nothing resurrects it. Sessions are only resumed if one already exists and is
still marked capturing, so the watchdog never mints a Session on its own.

## Tests

The pure seam (`hash.ts`) imports no `chrome.*` or DOM, so it runs under vitest
without a browser:

```bash
npm test
```

## Debugging

- **Worker logs / network**: `chrome://extensions` → Circlr → **service
  worker**. The DevTools Network tab shows the `POST /session` and
  `POST /session/:uuid/material` calls; the `/material` payload contains the
  capture as a bare base64 JPEG (16-hex `hash`), which the inspector renders.
- **Panel logs**: right-click inside the side panel → **Inspect**.
- **Session state**: the worker is an MV3 service worker, killed after ~30s
  idle. The capture loop's keepalive keeps it awake, and the `chrome.alarms`
  watchdog restarts the loop if it is killed anyway. `session.uuid` and the
  pending capture buffer are mirrored to `chrome.storage.session` and rehydrated
  on restart (cleared when the browser closes). Inspect it with
  `chrome.storage.session.get(null)` in the worker console or the panel console.
  The watchdog alarm itself is visible at `chrome://extensions` → service worker
  → Application → Alarms.
