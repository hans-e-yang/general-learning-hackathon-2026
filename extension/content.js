"use strict";
// Content script on the Document page. This is the "content" hop in the
// panel ⇄ background ⇄ content-script flow: the background pokes it when a page
// finishes loading, and it replies with a content-side capture (page metadata
// only for now — the background takes the authoritative screenshot itself).
//
// The full capture policy (scroll debounce, visibility pause, average-hash
// dedupe, rate caps) lands with issue #13; this tracer only proves the wiring.
//
// NOTE: this file must contain NO top-level import/export. Manifest content
// scripts are classic scripts, not modules, so tsc emitting `export {}` here
// would be a syntax error at injection time. Shared shapes are referenced with
// inline `import()` type queries instead.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.kind !== "capture-request")
        return false;
    const payload = {
        // Tracer simplification: per-page indexing / scroll tracking arrives with #13
        pageIndex: 0,
        scrollRatio: window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight),
        timestamp: Date.now(),
        hash: "",
        image: ""
    };
    const out = { kind: "capture", payload };
    sendResponse(out);
    void chrome.runtime.sendMessage(out).catch(() => { });
    return true;
});
