// Background service worker.
//
// Hub of the panel ⇄ background flow, and sole owner of the capture loop:
//   1. Toolbar click → side panel opens (openPanelOnActionClick).
//   2. Panel {kind:"ignite"} → POST /session; reply with uuid + Companion URL.
//   3. Panel {kind:"capture"} → the Companion is live; start the capture loop.
//   4. Loop: every CAPTURE_INTERVAL_MS, screenshot the active tab →
//      1280px JPEG → hash → dedupe → POST /material.
//
// No detection: a screenshot fires on a fixed interval regardless of scroll,
// page changes, focus, or content. The one filter kept is dedupe: a frame whose
// hash is within Hamming <4 of a recent one is not re-uploaded.
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
  PanelToBackground
} from "./messages.js";
import { companionUrl, hydrate, ingest, igniteSession, newSessionState } from "./session.js";
import { HAMMING_THRESHOLD, isDuplicate, RECENT_HASH_LIMIT } from "./hash.js";
import { processCapture } from "./capture-image.js";

export const CAPTURE_INTERVAL_MS = 2_000;
/** Every N ticks, upload even a near-duplicate frame so incomplete extracts can catch trailing exercises. */
export const FORCE_RECAPTURE_EVERY = 10;

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
  captureTicks += 1;
  const forceRecapture = captureTicks % FORCE_RECAPTURE_EVERY === 0;
  // Drop near-identical frames so a static page does not re-upload every tick.
  // Periodically force a pass anyway — vision extract can miss trailing exercises
  // on the first look, and a frozen PDF view would otherwise never retry.
  if (!forceRecapture && isDuplicate(hash, recentHashes, HAMMING_THRESHOLD)) {
    console.log("[capture] duplicate frame; skipping upload");
    return;
  }
  if (forceRecapture) {
    console.log("[capture] forced re-upload for extract catch-up");
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

function startCapturing(): void {
  capturing = true;
  void writeCapturing(true);
  startKeepalive();
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: WATCHDOG_PERIOD_MIN });
  if (captureTimer !== null) return;
  scheduleCapture(); // immediate first frame, then every interval
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
chrome.runtime.onMessage.addListener((msg: PanelToBackground, _sender, sendResponse) => {
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
  // Panel → background: the Companion is live — start screenshotting on a timer.
  if (msg.kind === "capture") {
    startCapturing();
    sendResponse({ done: true });
    return true;
  }
  // Panel → background: the panel is closing — stop capturing.
  if (msg.kind === "stop") {
    stopCapturing();
    sendResponse({ done: true });
    return true;
  }
  return false;
});

// A worker restart keeps the uuid (hydrate) but loses the timer; if a Session is
// already live and still marked as capturing, resume without another panel message.
resumeIfLive();

// Persistent watchdog: it outlives the worker and Chrome wakes it to run this
// listener, so captures resume even after a termination. The alarm is created in
// startCapturing and cleared in stopCapturing, so it only exists while live.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) resumeIfLive();
});
