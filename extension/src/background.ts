// Background service worker.
//
// This is the hub of the panel ⇄ background ⇄ content-script message flow:
//   1. Toolbar click → side panel opens (openPanelOnActionClick).
//   2. The panel sends {kind:"ignite"}; we POST /session and reply with the uuid +
//      the Companion URL ({backend}/?s=<uuid>) that the panel loads in an iframe.
//   3. The panel sends {kind:"capture"}; we snapshot the Document tab
//      (captureVisibleTab) and ingest it into the session.
//   4. Content scripts can also push {kind:"capture", payload} from the Document
//      page itself, and get an ack plus a fresh background snapshot ingested.
// The whole runtime state is the in-memory `session`, so in MV3 terms the
// service worker restarts fresh — the session uuid loss on restart is acceptable
// for this tracer.

import type {
  BackgroundToContent,
  BackgroundToPanel,
  CapturePayload,
  ContentToBackground,
  PanelToBackground,
  IngestResult
} from "./messages.js";
import { companionUrl, hydrate, ingest, igniteSession, newSessionState } from "./session.js";

// One shared session state for this "one session at a time" trivial orchestration.
// MV3 kills this worker after ~30s idle, so the state is rehydrated from
// chrome.storage.session on each startup; every handler awaits `hydrated` before
// touching `session`.
const session = newSessionState();
const hydrated = hydrate(session);

// Clicking the toolbar action toggles the side panel: Chrome does this natively
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("sidePanel behavior:", err));

// Fallback in case openPanelOnActionClick does not apply
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

// Average-hash helper: downscale the JPEG to `size`×`size`, then emit one bit per
// row-pixel above that row's mean brightness. A tiny perceptual fingerprint used
// by the dedupe logic landing with issue #13 (not enforced here yet).
function downscaleHash(dataUrl: string, size: number): Promise<string> {
  const img = new Image();
  const url = dataUrl;
  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("");
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const bits: string[] = [];
      for (let y = 0; y < size; y++) {
        const rowMean =
          Array.from({ length: size }, (_, x) => data[(y * size + x) * 4]).reduce((a, b) => a + b, 0) / size;
        for (let x = 1; x < size; x++) bits.push(data[(y * size + x) * 4] > rowMean ? "1" : "0");
      }
      resolve(bits.join(""));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

// Snapshot the visible Document tab and push it through ingest (which either
// POSTs to /material or buffers locally until the uuid arrives). The result is
// broadcast to the panel so its status line stays honest about buffering.
async function takeAndIngestCapture(tabId: number): Promise<void> {
  await hydrated; // restored uuid lets captures continue after a worker restart
  // captureVisibleTab takes a windowId, not a tabId — resolve the tab's window.
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // tab went away
  }
  let dataUrl: string;
  // 1280px-wide JPEG q≈0.7 is the spec's capture encoding; quality 70 ≈ 0.7
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  } catch {
    return; // e.g. protected chrome:// pages can't be captured
  }
  // send to the backend site
  const payload: CapturePayload = {
    // Tracer simplification: per-page scroll tracking arrives with #13
    pageIndex: 0,
    scrollRatio: 0,
    timestamp: Date.now(),
    hash: await downscaleHash(dataUrl, 4),
    image: dataUrl
  };
  const result: IngestResult = await ingest(session, payload);
  const out: BackgroundToPanel = {
    kind: "capture-ingested",
    ok: result.ok,
    pendingCount: session.pending.length,
    backendReachable: result.backendReachable
  };
  // Fire-and-forget: nobody listening (panel closed) is not an error
  chrome.runtime.sendMessage(out).catch(() => {});
}

// Single onMessage router. Returning `true` keeps the sendResponse channel open
// for the async reply each branch below needs.
chrome.runtime.onMessage.addListener(
  (msg: PanelToBackground | ContentToBackground | BackgroundToContent, sender, sendResponse) => {
    // Panel → background: start a Session, reply with uuid + Companion embed URL.
    // The panel mounts that URL in its iframe, completing the Split View.
    if (msg.kind === "ignite" && "tabId" in msg) {
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
    // Panel → background: "the Companion is live" — take one end-to-end capture
    // right away so the ingest path is exercised even before scroll/changes (#13).
    if (msg.kind === "capture" && "tabId" in msg) {
      void takeAndIngestCapture(msg.tabId).then(() => sendResponse({ done: true }));
      return true;
    }
    // Content script → background: a capture from the Document page itself.
    // Ack the sender, then immediately take our authoritative background capture.
    if (msg.kind === "capture" && "payload" in msg && sender.tab?.id !== undefined) {
      void (async () => {
        await hydrated;
        await ingest(session, msg.payload);
        sendResponse({ ok: true });
        await takeAndIngestCapture(sender.tab!.id!);
      })();
      return true;
    }
    if (msg.kind === "capture-request") {
      // not for background; ignore
      return false;
    }
    return false;
  }
);

// Background → content: poke the content script on every completed load so the
// capture loop knows the Document page exists (real capture triggers land in #13).
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.id !== undefined) {
    const msg: BackgroundToContent = { kind: "capture-request" };
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
});
