// Side panel logic. The panel is the extension-owned frame that hosts the
// Companion: on open it tells the background to ignite a Session (POST /session),
// then mounts the returned Companion URL in an iframe. The iframe is same-origin
// to the Companion app, so its own interactions (drawing, typing) work normally.
//
// Once live it does not talk to the host page directly — every message goes
// panel → background → content script, per the spec's trust boundary.

import type { BackgroundToPanel, PanelToBackground } from "./messages.js";

const statusEl = document.getElementById("status") as HTMLElement;
const fallbackEl = document.getElementById("fallback") as HTMLElement;
const iframeEl = document.getElementById("companion") as HTMLIFrameElement;
const retryBtn = document.getElementById("retry") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings") as HTMLButtonElement;

// The Document tab is whatever the student has focused in the current window.
async function activeTab(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id ?? 0;
}

// Session is live: mount the embed and kick off the first capture so the
// panel → background → content ingest path is exercised immediately.
function showSession(companionUrl: string): void {
  fallbackEl.hidden = true;
  iframeEl.hidden = false;
  iframeEl.src = companionUrl;
  // Tell the background we are live so it can start feeding captures end-to-end.
  void (async () => {
    const tabId = await activeTab();
    const msg: PanelToBackground = { kind: "capture", tabId };
    chrome.runtime.sendMessage(msg).catch(() => {});
  })();
}

// Backend down / no uuid: hide the embed and offer a retry instead of a dead frame.
function showFallback(text: string): void {
  iframeEl.hidden = true;
  fallbackEl.hidden = false;
  statusEl.textContent = text;
}

// Ignition: ask background for a Session, then either show the Companion or the
// fallback. Runs automatically on panel open (bottom of file) and on Retry.
async function ignite(): Promise<void> {
  retryBtn.disabled = true;
  try {
    const tabId = await activeTab();
    const msg: PanelToBackground = { kind: "ignite", tabId };
    const res: BackgroundToPanel = await chrome.runtime.sendMessage(msg);
    if (res.kind === "ignited" && res.uuid) {
      showSession(res.companionUrl);
    } else {
      showFallback(
        "Could not start a session. Is the Companion backend running? (npm run dev in ./companion)"
      );
    }
  } catch (err) {
    showFallback(`Ignition failed: ${String(err)}`);
  } finally {
    retryBtn.disabled = false;
  }
}

// Background broadcasts ingest results here; surface buffering so the student
// knows captures are queued rather than lost while the backend is down.
chrome.runtime.onMessage.addListener((msg: BackgroundToPanel) => {
  if (msg.kind === "capture-ingested" && !msg.backendReachable) {
    statusEl.textContent = `Backend unreachable — buffering ${msg.pendingCount} capture(s) for flush.`;
  }
});

retryBtn.addEventListener("click", () => void ignite());
// Discoverable path to the backend URL setting from the fallback screen.
settingsBtn.addEventListener("click", () => void chrome.runtime.openOptionsPage());
void ignite();
