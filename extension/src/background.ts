// Background service worker.
//
// Hub of the panel ⇄ background flow, and sole owner of the capture loop:
//   1. Toolbar click → side panel opens (openPanelOnActionClick).
//   2. Panel {kind:"ignite"} → POST /session; reply with uuid + Companion URL.
//   3. Panel {kind:"capture"} → the Companion is live; start the capture loop.
//   4. Loop: an injected activity detector in the Document page reports when the
//      student has been idle for ~2s; that {kind:"active"} message triggers a
//      screenshot of the active tab → 1280px JPEG → hash → dedupe →
//      POST /material. A low-rate CAPTURE_INTERVAL_MS fallback fires even if the
//      detector's message is missed (e.g. the page was reloaded mid-session), and
//      every FORCE_RECAPTURE_EVERY ticks it pings GET /health instead of
//      re-uploading a near-duplicate frame.
//
// The idle trigger is why this feels eager: the capture happens right after the
// student stops working, not on an arbitrary tick. Dedupe still drops a frame
// whose hash is within Hamming <4 of a recent one, so idle-triggered captures of
// an unchanged page do not re-POST.
//
// MV3 lifecycle: Chrome terminates an extension service worker after ~30s idle.
// A `setInterval` does not count as activity and is lost when the worker dies,
// which is what makes captures stop. Two guards keep the loop running:
//   - a cheap chrome.* call every KEEPALIVE_MS resets the 30s idle timer, and
//   - a persistent chrome.alarms watchdog wakes the worker and restarts the loop
//     if it was terminated anyway.
// The session uuid is rehydrated from chrome.storage.session, so a revived
// worker can resume without waiting for the panel.

import type {
  BackgroundToPanel,
  CapturePayload,
  IngestResult,
  PageToBackground,
  PanelToBackground
} from "./messages.js";
import {
  companionUrl,
  endSession,
  healthCheck,
  hydrate,
  ingest,
  igniteSession,
  newSessionState
} from "./session.js";
import { HAMMING_THRESHOLD, isDuplicate, RECENT_HASH_LIMIT } from "./hash.js";
import { processCapture } from "./capture-image.js";

// Fallback cadence. The primary trigger is the page activity detector reporting
// ~2s of idle; this timer catches the case where that message is missed (the
// document page was reloaded without re-injecting the detector). Kept equal to
// the detector's IDLE_MS so the cadence is unchanged if the fallback takes over.
export const CAPTURE_INTERVAL_MS = 2_000;
/**
 * Every N ticks, ping GET /health instead of re-uploading a near-duplicate frame.
 * A static page would otherwise re-POST the same JPEG; this keeps a liveness
 * signal on the same cadence without the bytes or a re-extraction pass.
 */
export const FORCE_RECAPTURE_EVERY = 10;

// The idle detector is injected as a self-contained function
// (chrome.scripting func form) rather than a separate content-script file, so it
// survives tsc's module wrapping and cannot be broken by a stray `export {}` in
// a classic-script context. It runs only on the active tab, for the duration of a
// Session, under the broad host_permissions we already hold.

// Runs IN THE PAGE (not the worker): serialized by chrome.scripting, so it must
// not close over anything here. Sends {kind:"active"} to the worker after IDLE_MS
// of no input. Edge-triggered — it will not re-report until activity resumes.
function installActivityDetector(): void {
  const IDLE_MS = 2_000;
  const THROTTLE_MS = 250;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSignal = 0;
  let reported = false;

  function reportIdle(): void {
    if (reported) return;
    reported = true;
    try {
      chrome.runtime.sendMessage({ kind: "active" }).catch(() => {});
    } catch {
      /* extension context invalidated */
    }
  }

  function noteActivity(): void {
    const now = Date.now();
    if (now - lastSignal < THROTTLE_MS) return;
    lastSignal = now;
    reported = false;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(reportIdle, IDLE_MS);
  }

  for (const type of ["keydown", "pointerdown", "scroll", "mousemove"] as const) {
    window.addEventListener(type, noteActivity, { passive: true, capture: true });
  }

  // A page that is loaded but never touched should capture its initial state.
  idleTimer = setTimeout(reportIdle, IDLE_MS);
}

// MV3 keepalive/watchdog (see header). 20s < the 30s idle timeout; 0.5min is
// chrome.alarms' minimum period.
const KEEPALIVE_MS = 20_000;
const WATCHDOG_ALARM = "circlr-capture-watchdog";
const WATCHDOG_PERIOD_MIN = 0.5;
// Persisted so a revived worker knows whether the panel is still meant to be
// capturing (the panel may have been closed while the worker was dead).
const CAPTURING_KEY = "circlrCapturing";

// One shared session state for this "one session at a time" trivial orchestration.
const session = newSessionState();
const hydrated = hydrate(session);

let captureTimer: ReturnType<typeof setInterval> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let capturing = false;
// Serializes captures so the payloads that reach /material stay ordered.
let captureChain: Promise<void> = Promise.resolve();
// Rolling dedupe window, oldest first: identical frames are not re-uploaded.
const recentHashes: string[] = [];
let captureTicks = 0;

async function readCapturing(): Promise<boolean> {
  try {
    const { [CAPTURING_KEY]: on } = await chrome.storage.session.get(CAPTURING_KEY);
    return on === true;
  } catch {
    return false;
  }
}

async function writeCapturing(on: boolean): Promise<void> {
  try {
    await chrome.storage.session.set({ [CAPTURING_KEY]: on });
  } catch {
    /* shutting down */
  }
}

// Clicking the toolbar action toggles the side panel: Chrome does this natively
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("sidePanel behavior:", err));

// Fallback in case openPanelOnActionClick does not apply
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

function broadcast(out: BackgroundToPanel): void {
  // Fire-and-forget: nobody listening (panel closed) is not an error
  chrome.runtime.sendMessage(out).catch(() => {});
}

async function emitIngest(payload: CapturePayload): Promise<void> {
  const result: IngestResult = await ingest(session, payload);
  broadcast({
    kind: "capture-ingested",
    ok: result.ok,
    pendingCount: session.pending.length,
    backendReachable: result.backendReachable
  });
}

// Screenshot the active tab and run it through the hash/ingest pipeline.
// `captureVisibleTab` can only photograph the active tab of a window, so the
// active tab is the only pane we can read. Protected pages just skip this tick.
async function captureActiveTab(): Promise<void> {
  if (!capturing) return; // a stop may have landed while this was queued
  await hydrated; // restored uuid lets captures continue after a worker restart
  captureTicks += 1;
  // Every N ticks, ping the backend instead of re-uploading a near-duplicate
  // frame. A static page would otherwise re-POST the same JPEG forever; the
  // healthcheck keeps the liveness signal on the same cadence without the bytes.
  if (captureTicks % FORCE_RECAPTURE_EVERY === 0) {
    const reachable = await healthCheck();
    console.log(
      reachable
        ? "[capture] healthcheck ok"
        : "[capture] healthcheck failed (backend unreachable?)"
    );
    return;
  }
  let tab: chrome.tabs.Tab | undefined;
  try {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  } catch {
    return;
  }
  if (!tab || tab.id === undefined) return;
  let raw: string;
  try {
    raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  } catch (err) {
    console.warn("[capture] captureVisibleTab failed (protected page?)", err);
    return; // e.g. protected chrome:// pages can't be captured
  }
  const { image, hash } = await processCapture(raw);
  // Drop near-identical frames so a static page does not re-upload every tick.
  if (isDuplicate(hash, recentHashes, HAMMING_THRESHOLD)) {
    console.log("[capture] duplicate frame; skipping upload");
    return;
  }
  recentHashes.push(hash);
  if (recentHashes.length > RECENT_HASH_LIMIT) recentHashes.shift();
  const payload: CapturePayload = {
    pageIndex: 0,
    scrollRatio: 0,
    timestamp: Date.now(),
    hash,
    image
  };
  await emitIngest(payload);
}

function scheduleCapture(): void {
  captureChain = captureChain
    .then(captureActiveTab)
    .catch((err) => console.error("[capture] failed", err));
}

// Calling any chrome.* API resets the worker's 30s idle timer. This no-op call
// is the cheapest reliable keepalive while the capture loop is live.
function startKeepalive(): void {
  if (keepaliveTimer !== null) return;
  keepaliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, KEEPALIVE_MS);
}

// Inject the activity detector into the active tab. Best-effort: it cannot run
// on protected pages (chrome://, the Web Store, other extensions), where we fall
// back to the interval timer. Uses the `func` form so the serialized function is
// immune to tsc's module wrappers (a `files:` content script that ends up with an
// `export {}` is a classic-script SyntaxError and never runs).
async function injectActivityDetector(): Promise<void> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  } catch {
    return;
  }
  if (!tab || tab.id === undefined) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: installActivityDetector
    });
  } catch (err) {
    console.warn("[capture] could not inject activity detector (protected page?)", err);
  }
}

function startCapturing(): void {
  capturing = true;
  void writeCapturing(true);
  startKeepalive();
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: WATCHDOG_PERIOD_MIN });
  void injectActivityDetector();
  if (captureTimer !== null) return;
  scheduleCapture(); // immediate first frame, then every interval (fallback)
  captureTimer = setInterval(scheduleCapture, CAPTURE_INTERVAL_MS);
}

// The panel closed (or the extension was otherwise taken down): stop the clock,
// the keepalive, and the watchdog so nothing wakes this worker until the panel
// is opened again.
function stopCapturing(): void {
  capturing = false;
  captureTicks = 0;
  void writeCapturing(false);
  if (captureTimer !== null) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
  if (keepaliveTimer !== null) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  void chrome.alarms.clear(WATCHDOG_ALARM);
}

// Resume the loop only for a Session that already exists AND was still meant to
// be capturing when the worker went away. Closing the panel clears the flag, so
// the watchdog cannot resurrect a closed Session.
function resumeIfLive(): void {
  void (async () => {
    await hydrated;
    if (session.uuid && (await readCapturing())) startCapturing();
  })();
}

// Single onMessage router. Returning `true` keeps the sendResponse channel open
// for the async reply each branch below needs.
chrome.runtime.onMessage.addListener(
  (msg: PanelToBackground | PageToBackground, _sender, sendResponse) => {
    // Page → background: the student went idle — a good moment to capture.
    if (msg.kind === "active") {
      if (capturing) scheduleCapture();
      return false;
    }
    // Panel → background: start a Session, reply with uuid + Companion embed URL.
    if (msg.kind === "ignite") {
      void (async () => {
        await hydrated;
        let uuid: string | null;
        try {
          uuid = await igniteSession(session);
        } catch {
          uuid = null;
        }
        const out: BackgroundToPanel = {
          kind: "ignited",
          uuid,
          companionUrl: await companionUrl(uuid),
          error: uuid ? undefined : "backend-unreachable"
        };
        sendResponse(out);
      })();
      return true; // async response
    }
    // Panel → background: the Companion is live — start screenshotting.
    if (msg.kind === "capture") {
      startCapturing();
      sendResponse({ done: true });
      return true;
    }
    // Panel → background: the panel is closing — stop capturing and end the
    // Session so reopening does not resurrect the old Document's Worksheet.
    if (msg.kind === "stop") {
      stopCapturing();
      endSession(session);
      sendResponse({ done: true });
      return true;
    }
    return false;
  }
);

// A worker restart keeps the uuid (hydrate) but loses the timer; if a Session is
// already live and still marked as capturing, resume without another panel message.
resumeIfLive();

// Persistent watchdog: it outlives the worker and Chrome wakes it to run this
// listener, so captures resume even after a termination. The alarm is created in
// startCapturing and cleared in stopCapturing, so it only exists while live.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) resumeIfLive();
});
