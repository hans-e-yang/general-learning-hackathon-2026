// Options page: the only user-facing writer of chrome.storage.local.backendUrl.
// config.ts reads that key on every ignite/ingest, so saving here takes effect
// immediately without reloading the extension.

import { DEFAULT_BACKEND_URL, getBackendUrl, setBackendUrl } from "./config.js";

const input = document.getElementById("backendUrl") as HTMLInputElement;
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

function showStatus(text: string): void {
  statusEl.textContent = text;
}

// Reject anything that can't be the base of a URL we will fetch. http/https only.
function normalize(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

async function save(): Promise<void> {
  const normalized = normalize(input.value);
  if (!normalized) {
    showStatus("Enter a valid http(s) URL, e.g. http://localhost:3000");
    return;
  }
  await setBackendUrl(normalized);
  input.value = normalized;
  showStatus("Saved.");
}

async function reset(): Promise<void> {
  await setBackendUrl(DEFAULT_BACKEND_URL);
  input.value = DEFAULT_BACKEND_URL;
  showStatus("Reset to default.");
}

saveBtn.addEventListener("click", () => void save());
resetBtn.addEventListener("click", () => void reset());

// Seed the field with the currently effective value.
void getBackendUrl().then((url) => {
  input.value = url;
});
