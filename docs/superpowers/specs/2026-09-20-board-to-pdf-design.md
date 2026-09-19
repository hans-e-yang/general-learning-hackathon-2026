# Board slides → downloadable PDF

**Date:** 2026-09-20  
**Branch:** `board-to-pdf`  
**Status:** Approved for implementation planning

## Problem

Students work one extracted question per Board slide. The Session Export PDF is still a worksheet text dump (`GET /session/:uuid/export`: cover page, then question + draft + tutor hints). That file does not show the student’s ink, and the Board toolbar has no download control.

The earlier per-question-boards cut listed “Exported Board crops in PDF” as a non-goal. This cut is that export: every Board slide in one PDF the student can download.

## Goals

1. Combine every Board in the Session into one PDF.
2. One slide = one page, in jump-strip / worksheet order.
3. Each page: small question-label header, then the Board filling the rest.
4. Student ink only — Tutor marks never appear in the file.
5. Download from a Board toolbar control, as a local file.

## Non-goals (this cut)

- Replacing or changing `GET /session/:uuid/export` (worksheet text PDF stays).
- Drop-to-submit / LMS DataTransfer (#18).
- Uploading Board snapshots to the server, or persisting ink for server-side PDF.
- Vector PDF paths (pen/shape/text replay).
- KaTeX-accurate text in the raster (reuse the existing JPEG renderer’s plain-text draw).
- Review Mode / Notes export.
- Cover page, table of contents, or worksheet text alongside the Boards.

## Decisions locked

| Topic | Choice |
|--------|--------|
| Contents | Boards only; not worksheet drafts or hints |
| Authorship | `author === "student"` only |
| Page chrome | Small label header, then Board |
| Download UI | Board toolbar, next to Inspect |
| Generation | Client raster + in-browser `pdf-lib` |
| Empty boards | Still a page (label + blank white Board) |
| No boards yet | Download disabled |
| Existing export URL | Unchanged |

## Architecture

Download is Companion-only. Student ink lives in the local `BoardSlotMap`; it is not on the session store. The toolbar reads that map, rasterizes slides in the tab, builds the PDF in the browser, and triggers a file download. No new HTTP route.

```
toolbar Download click
  → questions in worksheet order (same as the jump strip)
  → for each question: studentInk(boards[id]) → JPEG
  → buildBoardPdf([{ label, jpeg }, …])
  → browser download circlr-boards-<uuid>.pdf
```

Ink never leaves the tab. Rasterize sequentially so a large Session does not paint every canvas at once.

## Components

### `studentInk(elements)`

Pure filter over a single Board’s element list.

- Keep elements with `author === "student"`.
- Drop Tutor-authored elements.
- Drop legacy `eraserMask` records (the Board already ignores them at render time).

Used only by export so Tutor marks never reach the rasterizer. The on-screen Board is unchanged (Tutor marks still show while working).

### `buildBoardPdf({ pages })`

Given ordered `{ label, jpeg }[]` (JPEG bytes or base64 without a data-URL prefix):

- Create a `pdf-lib` document.
- One page per entry.
- Page size follows the **on-screen Board surface** (plus a 40 pt header), not a fixed 800×1200 viewBox. Rasterize at the visible wrap size with the same SVG `xMidYMin meet` mapping; the PDF board area keeps that image’s aspect (longest edge 800 pt).
- Header: question `label` left-aligned on a light bar, dark text, distinct from the white Board.
- Embed the JPEG edge-to-edge in the remaining frame.
- Return a `Blob`.

Runnable in Node tests without a browser canvas (tests pass fixture JPEGs).

### Toolbar Download

`BoardToolbar` grows a **Download** button next to Inspect.

`BoardApp` / `BoardShell` wires it from `useMultiBoardSession`:

- Disabled when `questions.length === 0`.
- On click: for each question in worksheet order, `renderBoardToJpeg(studentInk(boards[id] ?? []))`, then `buildBoardPdf`, then trigger download of `circlr-boards-<uuid>.pdf`.
- While building, the button is busy (`Exporting…`) and not re-entrant.

Carousel, jump strip, and `GET /session/:uuid/export` do not change.

## Error handling

| Case | Behavior |
|------|----------|
| No boards yet | Download disabled; no file |
| A slide returns no JPEG (no 2d canvas) | Abort the whole download; no partial PDF; button shows `Couldn’t export`, then recovers to **Download** |
| `buildBoardPdf` throws | Same abort + failure state |
| Existing `/export` 404/409 | Unrelated; this button does not call that URL |

Empty student ink is not a failure: `renderBoardToJpeg([])` already paints a white Board, and that page is included.

## Testing

- **`studentInk`**: drops Tutor elements; keeps student pen/shape/text; ignores legacy eraser masks.
- **`buildBoardPdf`**: N labeled JPEGs → valid PDF (`%PDF` … `%%EOF`) with N pages; a blank-board JPEG still counts as a page; each page’s label is drawn with `drawText` so the PDF bytes contain those label strings.
- **Toolbar**: Download disabled with zero questions; enabled once a board slot exists; click path uses filtered student ink (test double for `buildBoardPdf` / download, not a real file picker).

No new assertions on `/session/:uuid/export`.

## Success criteria

- With N extracted questions, Download produces an N-page PDF, one slide per page, labels matching the jump strip.
- Tutor marks visible on the Board do not appear in the file.
- Empty slides are blank pages with their label, not omitted.
- Download is disabled before the first board exists.
- Worksheet `GET /session/:uuid/export` still returns the text PDF.

## Files (expected)

- `companion/src/board/exportPdf.ts` — `studentInk`, `buildBoardPdf`
- `companion/src/board/exportPdf.test.ts`
- `companion/src/board/BoardToolbar.tsx` — Download control
- `companion/src/board/BoardApp.tsx` — wire click / disabled / busy / error
- `companion/package.json` — add `pdf-lib`

Reuse `renderBoardToJpeg` in `companion/src/board/boardImage.ts` as-is.

## Docs follow-up

- Note in `docs/agentic-loop.md` that Board PDF download is client-side and distinct from `#17` worksheet export.
- Do not redefine CONTEXT.md **Export** in this cut (that term still names the assignment-end worksheet PDF / drop-to-submit path).
