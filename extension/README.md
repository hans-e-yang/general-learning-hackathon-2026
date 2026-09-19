# Circlr extension

Chrome MV3 extension (TypeScript) that ignites a Session and mounts the
Companion pane in the browser side panel beside the Document.

## Scope

- Session ignition from the toolbar action
- Side Panel hosting with the Companion iframe (`panel ⇄ background ⇄ content script`)
- Capture ingest with local buffering and `chrome.storage.session` persistence
- Capture policy (scroll debounce, dedupe, rate caps) and the LMS drop layer are
  later tickets (#13, #18)

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
To exercise the extension in the meantime, run a throwaway mock:

```bash
node -e '
const http=require("http"),fs=require("fs");
http.createServer((q,s)=>{
  let b="";q.on("data",c=>b+=c);q.on("end",()=>{
    if(q.url==="/session"){s.setHeader("content-type","application/json");return s.end(JSON.stringify({uuid:"dev-1"}));}
    if(q.url.endsWith("/material")){
      const {image}=JSON.parse(b||"{}"), p="cap-"+Date.now()+".jpg";
      if(image) fs.writeFileSync(p,Buffer.from(image.split(",")[1],"base64"));
      console.log("saved",p);
    }
    s.end("ok");
  });
}).listen(3000);'
```

It returns a uuid and writes each capture to `cap-*.jpg` in the current
directory.

## Debugging

- **Worker logs / network**: `chrome://extensions` → Circlr → **service
  worker**. The DevTools Network tab shows the `POST /session` and
  `POST /session/:uuid/material` calls; the `/material` payload contains the
  capture as a `data:image/jpeg;base64,...` string you can paste into a tab to
  view.
- **Panel logs**: right-click inside the side panel → **Inspect**.
- **Session state**: the worker is an MV3 service worker; it is killed after
  ~30s idle and restarted on the next event. `session.uuid` and the pending
  capture buffer are mirrored to `chrome.storage.session` and rehydrated on
  restart (cleared when the browser closes). Inspect it with
  `chrome.storage.session.get(null)` in the worker console or the panel console.
