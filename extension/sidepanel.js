// Side panel logic. The panel is the extension-owned frame that hosts the
// Companion: on open it tells the background to ignite a Session (POST /session),
// then mounts the returned Companion URL in an iframe. The iframe is same-origin
// to the Companion app, so its own interactions (drawing, typing) work normally.
//
// Once live it does not talk to the host page directly — every message goes
// panel → background → content script, per the spec's trust boundary.
const statusEl = document.getElementById("status");
const fallbackEl = document.getElementById("fallback");
const iframeEl = document.getElementById("companion");
const retryBtn = document.getElementById("retry");
const settingsBtn = document.getElementById("settings");
// The Document tab is whatever the student has focused in the current window.
async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.id ?? 0;
}
// Session is live: mount the embed and kick off the first capture so the
// panel → background → content ingest path is exercised immediately.
function showSession(companionUrl) {
    fallbackEl.hidden = true;
    iframeEl.hidden = false;
    iframeEl.src = companionUrl;
    // Tell the background we are live so it can start feeding captures end-to-end.
    void (async () => {
        const tabId = await activeTab();
        const msg = { kind: "capture", tabId };
        chrome.runtime.sendMessage(msg).catch(() => { });
    })();
}
// Backend down / no uuid: hide the embed and offer a retry instead of a dead frame.
function showFallback(text) {
    iframeEl.hidden = true;
    fallbackEl.hidden = false;
    statusEl.textContent = text;
}
// Ignition: ask background for a Session, then either show the Companion or the
// fallback. Runs automatically on panel open (bottom of file) and on Retry.
async function ignite() {
    retryBtn.disabled = true;
    try {
        const tabId = await activeTab();
        const msg = { kind: "ignite", tabId };
        const res = await chrome.runtime.sendMessage(msg);
        if (res.kind === "ignited" && res.uuid) {
            showSession(res.companionUrl);
        }
        else {
            showFallback("Could not start a session. Is the Companion backend running? (npm run dev in ./companion)");
        }
    }
    catch (err) {
        showFallback(`Ignition failed: ${String(err)}`);
    }
    finally {
        retryBtn.disabled = false;
    }
}
// Background broadcasts ingest results here; surface buffering so the student
// knows captures are queued rather than lost while the backend is down.
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.kind === "capture-ingested" && !msg.backendReachable) {
        statusEl.textContent = `Backend unreachable — buffering ${msg.pendingCount} capture(s) for flush.`;
    }
});
retryBtn.addEventListener("click", () => void ignite());
// Discoverable path to the backend URL setting from the fallback screen.
settingsBtn.addEventListener("click", () => void chrome.runtime.openOptionsPage());
void ignite();
export {};
