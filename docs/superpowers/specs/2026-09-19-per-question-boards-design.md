# Per-question Boards (from Capture Extract)

**Date:** 2026-09-19  
**Branch:** `shared-board-captures`  
**Status:** Approved for implementation planning

## Problem

Students work from a Document (often a PDF of questions) shown in the active browser tab. Capture already screenshots that tab and vision extract fills a Worksheet. The Board is still **one shared canvas per Session**, so ink is not tied to a specific question. The Tutor/LLM later needs a clear signal for *which* question the student is solving.

## Goals

1. Confirm and use the existing active-tab Capture → `/material` → extract pipeline.
2. Vision extract returns a **structured label** per question/subpart (e.g. `1a`, `1b`, `2`).
3. Create **one Board per extracted question**, soft-titled with that label.
4. Student works **one question exclusively** on the active board (slides + jump strip).
5. Boards **grow only** as new questions appear across captures.

## Non-goals (this cut)

- Persisting board ink on the server / board turns on `POST /turn`.
- Sending `activeQuestionId` into Tutor turns (hook left ready via question `id`).
- Student-renamed labels; model relabel of an existing `id`.
- Strict “only what’s on screen now” board lists.
- Exported Board crops in PDF.

## Decisions locked

| Topic | Choice |
|--------|--------|
| Label source | Vision extract returns `label`; becomes soft title |
| Board lifecycle | Grow-only; never remove when question scrolls off |
| Navigation | Horizontal slides **and** compact label jump strip |
| Depth | Live extract → boards via SSE; drawing stays local (stub) |
| Architecture | Boards keyed off Worksheet (one source of truth) |

## Architecture

### Domain

- **Board** (updated): one freehand canvas **per extracted question** in a Session, soft-titled by vision `label`. Student ink on a board is exclusive to that question. Tutor marks (later) remain distinguished; Tutor never writes a final answer on the Board.
- **Worksheet** remains the grow-only list of questions; each block owns one board slot.
- **Capture** unchanged: periodic `captureVisibleTab`, average-hash dedupe, `POST /session/{uuid}/material`.

### Identity

| Field | Role |
|--------|------|
| `id` | Stable key (e.g. `q-p{pageIndex}-{index}`) — drafts, threads, future LLM |
| `label` | Soft title (`1a`, `1b`, `2`) |
| `index` | Order in strip / slide sequence |

### Data flow

```
active tab capture
  → POST /session/{uuid}/material
  → extract → { id, index, text, label }
  → merge into worksheet (grow-only by id)
  → SSE extraction.update (full worksheet)
  → Companion: ensure board slot per question; carousel shows active board
```

### Client board state (this cut)

```ts
activeQuestionId: string | null
boards: Record<questionId, BoardElement[]>  // local only
```

Drawing tools are shared; strokes commit only to the active question’s element list.

## Extract contract & merge

### Schema

Add required `label: string` to `ExtractedQuestion` and `QuestionBlock` (and OpenAPI / SSE payloads that carry questions).

### Vision

Prompt asks for every visible question/subpart with its **printed** label. Adapter keeps assigning `id` as `q-p{pageIndex}-{index}`.

### Normalize

- Trim; collapse internal whitespace.
- Prefer compact form students expect (`1a`, not `Question 1 (a)`).
- If model omits label → fallback `String(index + 1)` so every board has a title.

### Merge

Unchanged grow-only rule: insert when `id` is new; re-extract of same page indices does not duplicate. New pages append new boards. `extraction.update` sends the full worksheet including labels.

### Fake adapter

Emit labeled samples (`1a`, `1b`, `2`, …) for tests/UI without vision.

## UI

1. **Jump strip** (top): labels in worksheet order; active emphasized; tap jumps.
2. **Soft title** on canvas: quiet identifier for the active board.
3. **Slides**: one visible board; swipe / prev–next between boards.
4. **Empty state:** no questions yet → placeholder until first `extraction.update`.
5. First board created → select it; later inserts do not steal focus.
6. A11y: strip controls named by label; arrow keys move slides when focus is in board chrome (not while using text tool).

## Wiring, errors, resume

- Companion subscribes to session SSE (`snapshot`, `extraction.update`).
- Resume/snapshot rebuilds labels and order; **local ink is not restored** until board persistence exists (accepted for this cut).
- Extract failure → existing `error` SSE; boards unchanged.
- Missing/malformed label → fallback title.

## Testing

- Contract: `label` present after normalize.
- Fake extract returns labeled questions.
- Merge grow-only still holds with labels.
- N questions → N board slots; jump + next/prev change `activeQuestionId`; strokes do not leak across boards.

## Docs follow-up

- Update `CONTEXT.md` Board definition to per-question canvas.
- Optional short README note; new ADR only if multi-board needs a durable decision record beyond CONTEXT.

## Success criteria

- With Capture running on a multi-question Document, Companion shows one board per extracted labeled question.
- Student can slide and jump between boards; ink on `1a` never appears on `2`.
- Worksheet/`extraction.update` remain the single source of question identity for boards.
