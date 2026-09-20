# Circlr

A split-screen tutor that reads the assignment already on your screen and coaches you through it without ever writing the answer.

It is so easy to skip through assignments and practice questions to the final answer without actually understanding the concepts those problems are supposed to train. Circlr sits on the other side of that habit. Not another chatbot you dump work into. A tutor that stays next to the problem you already have open, watches how you work, and refuses to finish it for you.

## What it does

You open the assignment the way you already would. Canvas preview, a PDF in the browser, lecture slides, whatever is on the page. You click the extension and a companion pane opens beside it. Circlr reads the screen, so you do not upload a file and you do not download one. The document is whatever you were already looking at.

It pulls the questions off the page and gives you a board for each one. On those boards you write, draw, erase, and type (KaTeX if you want). When you pause, it looks at the board. If the work looks solid, it just says so. If you made a concrete mistake, it circles that part and leaves a short comment: a hint on where and why. It will not write the final answer. When you are done, you export a PDF of your own answers, not the tutor's.

That is the loop. You do the problem. The tutor reacts to the work. You stay in the problem until you understand it, then you move on.

- **One board per question**, labeled the way they appear on the page (`1a`, `2`, …). Switch from the jump strip or the carousel.
- **Tutor marks stay visually separate** from your ink. *Working on it* holds the next pass. *Resolved* dismisses a mark once you have dealt with it.
- **Quiet-board timing.** It does not annotate every stroke. After a few seconds of quiet it sends a close-up of the work plus a transcript of any typed math, so the model can see what you drew and read what you typed instead of inventing the given values.

Review Mode (a practice loop over notes or slides) is designed and not in this build.

## How it is built

Three pieces talk over a contract we froze early so we would not invent a new API every hour.

1. **Chrome MV3 extension** lives in the side panel and screenshots the tab when you stop moving for a couple of seconds. It fingerprints each frame so the same page does not get uploaded over and over.
2. **Next.js companion** owns the session. Those JPEGs land here. A vision model extracts the questions. A cheap scout scores a draft. The tutor is only allowed to speak in hints, and the output is checked so a final answer cannot slip through. A watcher notices the same mistake showing up again and eventually goes quiet instead of nagging. The pane stays live over SSE.
3. **The boards** are the UI. Each question is its own canvas. Your pen and the tutor's marks stay separate.

The live path uses DeepSeek (text + vision) through OpenCode. Tests run against a fake adapter so they stay offline. Zod and OpenAPI hold the contract. pdfkit and pdf-lib handle export.

## Prerequisites

- Node.js 18+
- Google Chrome 114+ (side panel)
- npm

For a live tutor that actually reads the screen you also need an [OpenCode](https://opencode.ai) API key. Without one, Circlr still runs against a deterministic fake adapter (demo questions, no vision).

## Install

Clone the repo, then install both packages.

```bash
cd companion
npm install

cd ../extension
npm install
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** and pick the `extension/` directory (the one with `manifest.json`)
4. Pin **Circlr Companion** from the puzzle-piece menu if you want it on the toolbar

After you change extension source, run `npm run build` in `extension/` again and click **Reload** on the Circlr card.

## Run

Start the companion first. The side panel will fail to ignite if nothing is listening on port 3000.

```bash
cd companion
npm run dev
```

That serves the board at [http://localhost:3000](http://localhost:3000). The extension defaults to that URL.

To point the live models at a real key, put this in `companion/.env.local` and restart `npm run dev`:

```
CIRCLR_LLM=opencode
OPENCODE_API=your-key
```

Optional overrides:

| Variable | Default | What it does |
| --- | --- | --- |
| `CIRCLR_LLM` | `fake` | `fake` or `opencode` |
| `CIRCLR_OPENCODE_PLAN` | `go` | `zen` for pay-as-you-go |
| `CIRCLR_MODEL` | `deepseek-v4.1-flash` | Text roles |
| `CIRCLR_VISION_MODEL` | `deepseek-v4-flash-vision-exp` | Extract, watch, annotate |
| `OPENCODE_BASE_URL` | OpenCode Go | Override the API host |

`CIRCLR_LLM=fake` is the default. Tests and a UI walkthrough work without a key. Extraction does **not** read the capture image in that mode; it serves a fixed demo question bank.

If the companion is not on `http://localhost:3000`, open the extension options (`chrome://extensions` → Circlr → **Details** → **Extension options**, or **Settings** on the side-panel fallback) and save the base URL. No rebuild.

## Use

1. Leave `npm run dev` running in `companion/`.
2. Open the document in a normal Chrome tab. LMS PDF preview, a browser PDF viewer, or any webpage works. `chrome://` pages cannot be captured.
3. Click **Circlr Companion**. Chrome opens the side panel and starts a session.
4. Wait for *Reading capture…* to finish. Boards appear as questions are extracted. Scroll the document if more questions are off-screen; a new capture runs when you pause.
5. Work on the active board. When you stop, the tutor checks the board.
6. If it circles a step, fix it or hit **Resolved**. **Download** exports the boards as a PDF.

If the panel shows a fallback instead of the board, the companion is not reachable. Start `npm run dev` and hit **Retry**.

Closing the side panel stops capture and ends that session. A companion process restart also drops in-memory sessions; open the panel again to mint a new one.

## Repo

| Path | Role |
| --- | --- |
| `extension/` | Chrome MV3 side panel, capture loop, session ignition |
| `companion/` | Next.js board UI, session store, agent loop, export |

```bash
cd companion && npm test
cd ../extension && npm test
```

Dev-only capture inspector (what the model saw, plus the session transcript): [http://localhost:3000/inspector](http://localhost:3000/inspector) while `next dev` is running.

## What's next

Review Mode is the main cut: pose a question about the material, check the attempt, generate a similar one until it sticks. The same skip-to-the-answer problem is worse when you are just studying. The session store is also in memory, so a server restart wipes the session. Fine for a demo, not fine for a real problem set.

If Circlr works, it should feel a bit slower than a chatbot. That is the point. You do the grind, and you actually learn from it.

## Further reading

- Domain vocabulary: [`CONTEXT.md`](CONTEXT.md)
- Why we read the screen instead of downloading the file: [`docs/adr/0001-vision-llm-screen-reading.md`](docs/adr/0001-vision-llm-screen-reading.md)
- Session routes, SSE events, and the agent loop: [`docs/agentic-loop.md`](docs/agentic-loop.md)
- Extension internals: [`extension/README.md`](extension/README.md)
