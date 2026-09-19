// Backend location. Defaults to the local Next.js dev server; stored in
// chrome.storage.local so it can be re-pointed without rebuilding the extension.
export const DEFAULT_BACKEND_URL = "http://localhost:3000";
export async function getBackendUrl() {
    const { backendUrl } = await chrome.storage.local.get("backendUrl");
    return backendUrl ?? DEFAULT_BACKEND_URL;
}
export async function setBackendUrl(url) {
    await chrome.storage.local.set({ backendUrl: url });
}
