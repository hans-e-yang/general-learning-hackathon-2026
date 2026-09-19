// Session lifecycle + capture ingest against the Companion backend.
//
// The Session uuid is the single handle for all state (spec #2). The ordering
// problem this module solves: a capture can happen before POST /session has
// returned a uuid, so captures are buffered locally (bounded) and flushed once
// the uuid exists. A capture arriving with no uuid also triggers ignition.
//
// Durability: MV3 terminates the background worker after ~30s idle, which would
// lose the uuid and the buffer. State is therefore mirrored to
// chrome.storage.session (survives worker restarts, cleared on browser exit) and
// rehydrated by the background at startup.
import { getBackendUrl } from "./config.js";
// Bounded in-memory buffer for captures not yet accepted by /material.
const BUFFER_LIMIT = 32;
// Fewer captures are persisted, because storage.session is capped (~10 MB) and
// base64 JPEGs are large; the uuid is the part that must survive.
const PERSIST_LIMIT = 8;
const STORAGE_KEY = "circlrSessionState";
export function newSessionState() {
    return { uuid: null, pending: [] };
}
// Best-effort mirror to storage.session. Never throws: on worker shutdown the
// write may be dropped, which only costs a re-ignite later.
async function save(state) {
    if (!chrome.storage.session)
        return; // Chrome < 102
    try {
        await chrome.storage.session.set({
            [STORAGE_KEY]: { uuid: state.uuid, pending: state.pending.slice(-PERSIST_LIMIT) }
        });
    }
    catch {
        /* shutting down */
    }
}
// Restore uuid + buffer into `state` after a worker restart. Malformed stored
// data is ignored field-by-field so we fall back to a fresh session.
export async function hydrate(state) {
    if (!chrome.storage.session)
        return;
    try {
        const stored = (await chrome.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
        if (!stored)
            return;
        if (typeof stored.uuid === "string" || stored.uuid === null)
            state.uuid = stored.uuid ?? null;
        if (Array.isArray(stored.pending))
            state.pending = stored.pending.slice(-BUFFER_LIMIT);
    }
    catch {
        /* keep fresh state */
    }
}
// Buffer captures that have not been accepted by /material yet; oldest is
// dropped at the cap. Safe to call whether or not a uuid exists (a failed live
// POST re-buffers here for the next attempt).
export function bufferCapture(state, payload) {
    if (state.pending.length >= BUFFER_LIMIT)
        state.pending.shift();
    state.pending.push(payload);
    void save(state);
}
// POST /session → uuid, then flushes whatever was buffered while the request was
// in flight. `firstCapture` is for callers that have NOT buffered it yet. Returns
// null if the backend is unreachable or does not hand back a uuid (panel then
// shows a retry fallback). A uuid restored from storage.session is reused rather
// than minting a new Session on every panel open / worker restart.
export async function igniteSession(state, firstCapture) {
    if (state.uuid)
        return state.uuid;
    const baseUrl = await getBackendUrl();
    try {
        const res = await fetch(`${baseUrl}/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({})
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        if (!data.uuid)
            return null;
        state.uuid = data.uuid;
        if (firstCapture)
            state.pending.unshift(firstCapture);
        await flushBuffer(state);
        return state.uuid;
    }
    catch {
        return null;
    }
}
// The URL the side panel embeds. Falls back to the bare app URL without a uuid.
export function companionUrl(uuid) {
    return (async () => {
        const baseUrl = await getBackendUrl();
        return uuid ? `${baseUrl}/?s=${uuid}` : baseUrl;
    })();
}
// Cheap liveness ping for the periodic force tick. Static frames are never
// re-uploaded, so the interval that used to force a duplicate capture now just
// proves the backend is still reachable. No uuid needed.
export async function healthCheck() {
    const baseUrl = await getBackendUrl();
    try {
        return (await fetch(`${baseUrl}/health`)).ok;
    }
    catch {
        return false;
    }
}
// Single definition of the Capture ingest call, shared by flush and live ingest.
function postMaterial(baseUrl, uuid, payload) {
    return fetch(`${baseUrl}/session/${uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
    });
}
// Drain the buffer oldest-first. Stops at the first failure so ordering is kept
// and the remaining captures stay buffered until the next ingest attempt.
export async function flushBuffer(state) {
    if (!state.uuid)
        return;
    const baseUrl = await getBackendUrl();
    let drained = false;
    while (state.pending.length > 0) {
        const payload = state.pending[0];
        try {
            const res = await postMaterial(baseUrl, state.uuid, payload);
            if (!res.ok)
                throw new Error(`ingest failed: ${res.status}`);
            state.pending.shift();
            drained = true;
        }
        catch {
            break; // keep buffering if backend not reachable
        }
    }
    if (drained)
        void save(state);
}
// The single entry point for a capture after ignition:
//   - no uuid yet → buffer it and try to ignite (buffered captures flush then)
//   - uuid present → drain anything buffered earlier, then POST this capture;
//     on network failure it goes back to the buffer for the next attempt
export async function ingest(state, payload) {
    if (!state.uuid) {
        bufferCapture(state, payload);
        // Payload is already buffered, so do not also pass it as firstCapture.
        const uuid = await igniteSession(state);
        if (!uuid)
            return { ok: false, backendReachable: false };
        return { ok: true, backendReachable: true };
    }
    await flushBuffer(state);
    const baseUrl = await getBackendUrl();
    try {
        const res = await postMaterial(baseUrl, state.uuid, payload);
        if (!res.ok)
            return { ok: false, backendReachable: true, status: res.status };
        return { ok: true, backendReachable: true };
    }
    catch {
        bufferCapture(state, payload);
        return { ok: false, backendReachable: false };
    }
}
