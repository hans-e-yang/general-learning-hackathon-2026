# Per-question Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Capture extract labels into grow-only Worksheet questions and give the Companion one local Board per question with slide + jump-strip navigation.

**Architecture:** Extend `QuestionBlock` / `ExtractedQuestion` with `label`. Vision (and FakeAdapter) emit labels; merge stays grow-only by `id`. Companion listens to session SSE (`snapshot` / `extraction.update`), maintains `Record<questionId, BoardElement[]>`, and shows one active board via a carousel (soft title + jump strip + prev/next). Drawing remains stub/local.

**Tech Stack:** Next.js companion, Vitest, Zod contracts, OpenAPI YAML, existing board React components, `EventSource` for SSE.

**Spec:** `docs/superpowers/specs/2026-09-19-per-question-boards-design.md`

## Global Constraints

- Grow-only boards: never remove a board when a question scrolls off-screen.
- Soft title = normalized vision `label` (`1a`, `2`, …); stable key remains `id`.
- Drawing stays client-local (stub); do not add board turns to `POST /turn`.
- Do not persist ink across refresh in this cut.
- Use CONTEXT.md terms: Capture, Document, Board, Worksheet, Session.
- Update Board glossary to per-question canvas as part of the docs task.

---

## File map

| File | Responsibility |
|------|----------------|
| `companion/src/lib/questionLabel.ts` | `normalizeQuestionLabel(raw, index)` |
| `companion/src/lib/questionLabel.test.ts` | Unit tests for normalize |
| `companion/src/lib/contracts.ts` | Add `label` to schemas |
| `companion/openapi.yaml` | Add `label` to QuestionBlock / ExtractedQuestion |
| `companion/src/lib/agent/fake-adapter.ts` | Emit sample labels |
| `companion/src/lib/agent/opencode-adapter.ts` | Extract prompt + schema include `label` |
| `companion/src/lib/agent/loop.ts` | Pass `label` into worksheet (via spread already) |
| Fixture sites in `*.test.ts` | Add `label` wherever `QuestionBlock` is constructed |
| `companion/src/board/useMultiBoardSession.ts` | Multi-board state + active id + SSE sync API |
| `companion/src/board/useMultiBoardSession.test.ts` | Slot isolation + navigation logic tests |
| `companion/src/board/BoardJumpStrip.tsx` | Label jump strip |
| `companion/src/board/BoardCarousel.tsx` | Soft title + slide chrome + empty state |
| `companion/src/board/BoardApp.tsx` | Wire multi-board + SSE |
| `companion/src/session/worksheetChannel.ts` | Subscribe to snapshot / extraction.update |
| `companion/src/app/globals.css` | Strip / title / empty styles |
| `CONTEXT.md` | Board definition update |

---

### Task 1: `normalizeQuestionLabel` + contract `label`

**Files:**
- Create: `companion/src/lib/questionLabel.ts`
- Create: `companion/src/lib/questionLabel.test.ts`
- Modify: `companion/src/lib/contracts.ts` (`QuestionBlockSchema`, `ExtractedQuestionSchema`)
- Modify: `companion/openapi.yaml` (`QuestionBlock`, `ExtractedQuestion`)
- Modify: `companion/src/lib/contracts.test.ts` (snapshot / extraction fixtures that include worksheet questions)

**Interfaces:**
- Produces: `normalizeQuestionLabel(raw: string | undefined | null, index: number): string`
- Produces: `QuestionBlock.label: string`, `ExtractedQuestion.label: string`

- [ ] **Step 1: Write the failing tests**

Create `companion/src/lib/questionLabel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeQuestionLabel } from "./questionLabel";

describe("normalizeQuestionLabel", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuestionLabel(" 1 a ", 0)).toBe("1a");
  });

  it("falls back to 1-based index when empty", () => {
    expect(normalizeQuestionLabel("", 0)).toBe("1");
    expect(normalizeQuestionLabel(undefined, 2)).toBe("3");
  });

  it("keeps compact labels like 1a / 2", () => {
    expect(normalizeQuestionLabel("1a", 0)).toBe("1a");
    expect(normalizeQuestionLabel("2", 1)).toBe("2");
  });
});
```

Add to `companion/src/lib/contracts.test.ts` inside an existing describe (or new):

```ts
it("requires label on QuestionBlock inside extraction.update", () => {
  const ev = {
    type: "extraction.update",
    data: {
      partial: false,
      questions: [{ id: "q-p0-0", index: 0, text: "Define f?", status: "blocked" }],
    },
  };
  expect(safeParseSseEvent(ev).success).toBe(false);
});

it("accepts extraction.update with labels", () => {
  const ev = {
    type: "extraction.update",
    data: {
      partial: false,
      questions: [
        { id: "q-p0-0", index: 0, text: "Define f?", status: "blocked", label: "1a" },
      ],
    },
  };
  expect(safeParseSseEvent(ev).success).toBe(true);
});
```

Also add `label` to the snapshot fixture worksheet arrays in this file if any question objects exist; if worksheet is empty, leave it.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd companion
npm test -- src/lib/questionLabel.test.ts src/lib/contracts.test.ts
```

Expected: `questionLabel` import/module missing FAIL; and/or extraction without `label` still succeeds until schema changes (then the “requires label” test may pass only after schema update — order: first fail on missing module).

- [ ] **Step 3: Implement normalize + schema**

`companion/src/lib/questionLabel.ts`:

```ts
export function normalizeQuestionLabel(
  raw: string | undefined | null,
  index: number,
): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, "");
  if (collapsed.length > 0) return collapsed;
  return String(index + 1);
}
```

In `companion/src/lib/contracts.ts`, update:

```ts
export const QuestionBlockSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  label: z.string().min(1),
  status: AssessmentStatusSchema,
});

export const ExtractedQuestionSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  label: z.string().min(1),
});
```

In `companion/openapi.yaml`, add `label` to `required` and `properties` for both `QuestionBlock` and `ExtractedQuestion`:

```yaml
label:
  type: string
  minLength: 1
  description: Soft board title from the printed question label (e.g. 1a, 2)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd companion
npm test -- src/lib/questionLabel.test.ts src/lib/contracts.test.ts
```

Expected: PASS for these two files. Broader suite may fail until Task 2/fixtures — that is OK if you commit only after greening fixtures in Step 5–6 of this task.

- [ ] **Step 5: Fix all in-repo QuestionBlock fixtures**

Every object shaped like `{ id, index, text, status }` needs `label`. Search:

```bash
cd companion
rg "status: \"(blocked|on-track|solid)\"" -g "*.ts"
```

Add a sensible `label` (e.g. `"1"`, `"1a"`, or `String(index + 1)`). Touch at least:

- `src/lib/agent/loop.test.ts`
- `src/lib/export/blocks.test.ts`
- `src/app/session/__tests__/routes.test.ts`
- `src/lib/session/bus.test.ts` (only if worksheet entries appear)
- Any other hits

- [ ] **Step 6: Run full companion tests**

```bash
cd companion
npm test
```

Expected: FAIL only on FakeAdapter / OpenCode extract missing `label` (Task 2). If other failures remain from missing fixture labels, fix them before committing.

- [ ] **Step 7: Commit**

```bash
git add companion/src/lib/questionLabel.ts companion/src/lib/questionLabel.test.ts companion/src/lib/contracts.ts companion/openapi.yaml companion/src/lib/contracts.test.ts companion/src/lib/agent/loop.test.ts companion/src/lib/export/blocks.test.ts companion/src/app/session/__tests__/routes.test.ts
git commit -m "feat(contracts): add question label for per-question boards"
```

---

### Task 2: Adapters emit `label`

**Files:**
- Modify: `companion/src/lib/agent/fake-adapter.ts`
- Modify: `companion/src/lib/agent/opencode-adapter.ts` (`ExtractResultSchema`, `EXTRACT_SYSTEM`, `extract()`)
- Modify: `companion/src/lib/agent/loop.ts` (normalize label on insert)
- Test: `companion/src/lib/agent/fake-adapter.test.ts` (if extract assertions exist) and `companion/src/lib/agent/loop.test.ts`

**Interfaces:**
- Consumes: `normalizeQuestionLabel`, `ExtractedQuestion.label`
- Produces: extract results always include normalized `label`

- [ ] **Step 1: Write failing adapter/loop assertions**

In `companion/src/lib/agent/loop.test.ts`, inside the test that populates worksheet from a fresh capture, after extract:

```ts
for (const q of state!.worksheet) {
  expect(q.label).toBeTruthy();
  expect(typeof q.label).toBe("string");
}
```

If `fake-adapter.test.ts` asserts extract shape, add:

```ts
const qs = await adapter.extract({ captureHash: "0123456789abcdef", pageIndex: 0 });
for (const q of qs) {
  expect(q.label.length).toBeGreaterThan(0);
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd companion
npm test -- src/lib/agent/loop.test.ts
```

Expected: FAIL — extracted questions missing `label` / Zod or property undefined.

- [ ] **Step 3: Implement FakeAdapter labels**

In `fake-adapter.ts` `extract`:

```ts
const SAMPLE_LABELS = ["1a", "1b", "1c", "2", "3"];
// inside loop:
questions.push({
  id,
  index: i,
  text,
  label: SAMPLE_LABELS[i] ?? String(i + 1),
});
```

- [ ] **Step 4: Implement OpenCode extract labels**

Update `ExtractResultSchema`:

```ts
const ExtractResultSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string().min(1),
      label: z.string().optional(),
    }),
  ),
});
```

Update `EXTRACT_SYSTEM` to require labels:

```ts
const EXTRACT_SYSTEM = [
  "You extract exam questions from photos of student worksheets.",
  'Respond with strict JSON: {"questions":[{"label":"1a","text":"..."}]}.',
  "Use the printed question number/letter as label (e.g. 1, 1a, 2b). Treat sub-parts as separate questions.",
  "Transcribe each question faithfully in reading order; never answer, solve, or paraphrase.",
  "If no question is legible, return an empty array.",
].join(" ");
```

In `extract()` map:

```ts
import { normalizeQuestionLabel } from "@/lib/questionLabel";
// ...
return data.questions.map((q, index) => ({
  id: `q-p${input.pageIndex}-${index}`,
  index,
  text: q.text.trim(),
  label: normalizeQuestionLabel(q.label, index),
}));
```

- [ ] **Step 5: Normalize on worksheet insert in loop**

In `loop.ts` `extractFromCapture`, when pushing:

```ts
import { normalizeQuestionLabel } from "@/lib/questionLabel";
// ...
state.worksheet.push({
  id: q.id,
  index: q.index,
  text: q.text,
  label: normalizeQuestionLabel(q.label, q.index),
  status: "blocked",
});
```

(Do not rely on spread alone if older callers omit label.)

- [ ] **Step 6: Run tests**

```bash
cd companion
npm test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add companion/src/lib/agent/fake-adapter.ts companion/src/lib/agent/opencode-adapter.ts companion/src/lib/agent/loop.ts companion/src/lib/agent/loop.test.ts companion/src/lib/agent/fake-adapter.test.ts
git commit -m "feat(extract): emit normalized question labels"
```

---

### Task 3: Worksheet SSE channel

**Files:**
- Create: `companion/src/session/worksheetChannel.ts`
- Create: `companion/src/session/worksheetChannel.test.ts`

**Interfaces:**
- Produces:

```ts
export type WorksheetQuestion = {
  id: string;
  index: number;
  text: string;
  label: string;
  status: "blocked" | "on-track" | "solid";
};

export type WorksheetListener = (questions: WorksheetQuestion[]) => void;

export function subscribeWorksheet(
  sessionUuid: string,
  onQuestions: WorksheetListener,
  options?: { baseUrl?: string },
): () => void;
```

- Parses `snapshot` → `data.worksheet` and `extraction.update` → `data.questions`.
- Ignores other event types; ignores malformed JSON.

- [ ] **Step 1: Write failing tests**

`worksheetChannel.test.ts` should unit-test a pure parser helper exported for testability:

```ts
export function questionsFromSsePayload(
  type: string,
  data: unknown,
): WorksheetQuestion[] | null;
```

```ts
import { describe, expect, it } from "vitest";
import { questionsFromSsePayload } from "./worksheetChannel";

describe("questionsFromSsePayload", () => {
  it("reads worksheet from snapshot", () => {
    const qs = questionsFromSsePayload("snapshot", {
      uuid: "11111111-1111-4111-8111-111111111111",
      captures: [],
      worksheet: [
        { id: "q-p0-0", index: 0, text: "x", label: "1a", status: "blocked" },
      ],
      drafts: {},
      ghostSummary: [],
      exportReady: false,
    });
    expect(qs?.[0]?.label).toBe("1a");
  });

  it("reads questions from extraction.update", () => {
    const qs = questionsFromSsePayload("extraction.update", {
      partial: false,
      questions: [
        { id: "q-p0-0", index: 0, text: "x", label: "1b", status: "blocked" },
      ],
    });
    expect(qs?.[0]?.label).toBe("1b");
  });

  it("returns null for unrelated events", () => {
    expect(questionsFromSsePayload("material.accepted", { captureId: "c", deduped: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd companion
npm test -- src/session/worksheetChannel.test.ts
```

- [ ] **Step 3: Implement**

```ts
import { QuestionBlockSchema, SessionSnapshotSchema } from "@/lib/contracts";
import { z } from "zod";

export type WorksheetQuestion = z.infer<typeof QuestionBlockSchema>;
export type WorksheetListener = (questions: WorksheetQuestion[]) => void;

const ExtractionDataSchema = z.object({
  partial: z.boolean(),
  questions: z.array(QuestionBlockSchema),
});

export function questionsFromSsePayload(
  type: string,
  data: unknown,
): WorksheetQuestion[] | null {
  if (type === "snapshot") {
    const parsed = SessionSnapshotSchema.safeParse(data);
    return parsed.success ? parsed.data.worksheet : null;
  }
  if (type === "extraction.update") {
    const parsed = ExtractionDataSchema.safeParse(data);
    return parsed.success ? parsed.data.questions : null;
  }
  return null;
}

export function subscribeWorksheet(
  sessionUuid: string,
  onQuestions: WorksheetListener,
  options?: { baseUrl?: string },
): () => void {
  const base = (options?.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}/session/${sessionUuid}/events`;
  const source = new EventSource(url);

  const handle = (type: string, raw: string) => {
    try {
      const data = JSON.parse(raw) as unknown;
      const qs = questionsFromSsePayload(type, data);
      if (qs) onQuestions(qs);
    } catch {
      // ignore heartbeats / bad frames
    }
  };

  source.addEventListener("snapshot", (ev) => {
    handle("snapshot", (ev as MessageEvent).data);
  });
  source.addEventListener("extraction.update", (ev) => {
    handle("extraction.update", (ev as MessageEvent).data);
  });
  source.onmessage = (ev) => {
    // Some encoders put type in JSON; prefer named events above.
    try {
      const parsed = JSON.parse(ev.data) as { type?: string; data?: unknown };
      if (parsed?.type && parsed.data !== undefined) {
        const qs = questionsFromSsePayload(parsed.type, parsed.data);
        if (qs) onQuestions(qs);
      }
    } catch {
      // ignore
    }
  };

  return () => source.close();
}
```

Verify how SSE is encoded in `companion/src/app/session/[uuid]/events/route.ts` / bus encoder — match `event: <type>` + `data: <json of event.data only OR full event>`. Adjust `handle` so tests and live path agree with the real wire format (read `encodeEvent` if present).

- [ ] **Step 4: Align parser with wire format**

Read the events route encoder. If `data:` is the full `{type, data}` object, parse accordingly in `subscribeWorksheet` only; keep `questionsFromSsePayload(type, data)` as the pure core.

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd companion
npm test -- src/session/worksheetChannel.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add companion/src/session/worksheetChannel.ts companion/src/session/worksheetChannel.test.ts
git commit -m "feat(session): worksheet SSE channel for board labels"
```

---

### Task 4: Multi-board session state (logic)

**Files:**
- Create: `companion/src/board/multiBoard.ts`
- Create: `companion/src/board/multiBoard.test.ts`
- Create: `companion/src/board/useMultiBoardSession.ts` (thin React wrapper over pure helpers + existing stroke APIs)

**Interfaces:**
- Produces pure helpers:

```ts
export type BoardSlotMap = Record<string, import("@/contracts/board").BoardElement[]>;

export function ensureBoardSlots(
  boards: BoardSlotMap,
  questions: { id: string }[],
): BoardSlotMap; // grow-only: add missing ids with []

export function pickActiveQuestionId(
  prev: string | null,
  questions: { id: string }[],
): string | null; // keep prev if still present; else first id; else null

export function neighborQuestionId(
  questions: { id: string }[],
  activeId: string | null,
  delta: -1 | 1,
): string | null;
```

- `useMultiBoardSession` exposes: questions, activeQuestionId, setActiveQuestionId, goPrev/goNext, elements for active board, and the same drawing mutators as `useBoardSession` but scoped to active id.

- [ ] **Step 1: Write failing pure tests**

```ts
import { describe, expect, it } from "vitest";
import {
  ensureBoardSlots,
  neighborQuestionId,
  pickActiveQuestionId,
} from "./multiBoard";

describe("ensureBoardSlots", () => {
  it("adds empty slots without dropping existing ink keys", () => {
    const prev = { "q-p0-0": [{ id: "pen-1" } as never] };
    const next = ensureBoardSlots(prev, [{ id: "q-p0-0" }, { id: "q-p0-1" }]);
    expect(next["q-p0-0"]).toHaveLength(1);
    expect(next["q-p0-1"]).toEqual([]);
  });
});

describe("pickActiveQuestionId", () => {
  it("selects first on empty prev", () => {
    expect(pickActiveQuestionId(null, [{ id: "a" }, { id: "b" }])).toBe("a");
  });
  it("keeps prev when still present", () => {
    expect(pickActiveQuestionId("b", [{ id: "a" }, { id: "b" }])).toBe("b");
  });
});

describe("neighborQuestionId", () => {
  it("moves next/prev in order", () => {
    const qs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(neighborQuestionId(qs, "a", 1)).toBe("b");
    expect(neighborQuestionId(qs, "c", 1)).toBeNull();
    expect(neighborQuestionId(qs, "b", -1)).toBe("a");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd companion
npm test -- src/board/multiBoard.test.ts
```

- [ ] **Step 3: Implement `multiBoard.ts`**

Implement the three helpers exactly as specified in Interfaces.

- [ ] **Step 4: Implement `useMultiBoardSession.ts`**

Pattern:

- State: `questions`, `boards`, `activeQuestionId`, plus tool state copied from `useBoardSession`.
- `syncQuestions(qs)` → `setBoards(ensureBoardSlots(...))` + `setActiveQuestionId(pick...)`.
- Drawing callbacks read/write `boards[activeQuestionId]` only; no-op if `activeQuestionId` is null.
- Keep `mode: "stub"` channel behavior per active board **or** skip channel entirely for multi-board stub (local only). Prefer: no live board channel in this cut; local state only (YAGNI vs wiring N channels).

Reuse stroke construction from `useBoardSession` by either:

1. Extracting shared helpers, or
2. Copying the commit functions and keying by `activeQuestionId`.

Prefer minimal churn: copy/adapt commit logic into `useMultiBoardSession` keyed by active id; leave `useBoardSession` in place unused by `BoardApp` (or have `BoardApp` switch entirely).

- [ ] **Step 5: Add a focused isolation test** (pure)

```ts
it("ink map keys stay isolated when ensuring new slots", () => {
  const boards = ensureBoardSlots(
    { a: [{ id: "x" } as never] },
    [{ id: "a" }, { id: "b" }],
  );
  expect(boards.a).toHaveLength(1);
  expect(boards.b).toHaveLength(0);
});
```

- [ ] **Step 6: Run board + companion tests**

```bash
cd companion
npm test -- src/board/multiBoard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add companion/src/board/multiBoard.ts companion/src/board/multiBoard.test.ts companion/src/board/useMultiBoardSession.ts
git commit -m "feat(board): multi-board slot state and navigation helpers"
```

---

### Task 5: Jump strip + carousel UI

**Files:**
- Create: `companion/src/board/BoardJumpStrip.tsx`
- Create: `companion/src/board/BoardCarousel.tsx`
- Modify: `companion/src/board/BoardApp.tsx`
- Modify: `companion/src/app/globals.css`

**Interfaces:**
- Consumes: `questions: {id,label}[]`, `activeQuestionId`, `onSelect(id)`, `onPrev`, `onNext`, active `elements` + existing `BoardSurface` / `BoardToolbar` props from `useMultiBoardSession`.

- [ ] **Step 1: Add empty-state + strip markup in components**

`BoardJumpStrip.tsx`:

```tsx
"use client";

type Item = { id: string; label: string };

export function BoardJumpStrip(props: {
  items: Item[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <nav className="board-jump-strip" aria-label="Questions">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            item.id === props.activeId
              ? "board-jump-item is-active"
              : "board-jump-item"
          }
          aria-current={item.id === props.activeId ? "true" : undefined}
          onClick={() => props.onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
```

`BoardCarousel.tsx`: wrap children with soft title + prev/next:

```tsx
"use client";

export function BoardCarousel(props: {
  label: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (props.empty) {
    return (
      <div className="board-empty" role="status">
        Waiting for questions from the Document…
      </div>
    );
  }
  return (
    <div className="board-carousel">
      <div className="board-carousel-chrome">
        <button type="button" className="board-slide-nav" disabled={!props.canPrev} onClick={props.onPrev} aria-label="Previous question">
          ‹
        </button>
        <p className="board-soft-title">{props.label}</p>
        <button type="button" className="board-slide-nav" disabled={!props.canNext} onClick={props.onNext} aria-label="Next question">
          ›
        </button>
      </div>
      {props.children}
    </div>
  );
}
```

- [ ] **Step 2: Wire `BoardApp`**

- Use `useMultiBoardSession`.
- `useEffect` → `subscribeWorksheet(sessionUuid, syncQuestions)`.
- Render `BoardJumpStrip` + `BoardCarousel` + existing toolbar/surface.
- Optional: pointer swipe on surface wrap (`touchstart`/`touchend` deltaX > 50 → prev/next) — include if low-cost; otherwise prev/next + strip satisfy “slides + strip”.

- [ ] **Step 3: CSS**

Add quiet styles (no purple glow / pill cluster). Soft title: large, low-contrast. Strip: text buttons, active = darker/heavier weight. Empty: centered muted line.

- [ ] **Step 4: Manual smoke (dev)**

```bash
cd companion
npm run dev
```

With FakeAdapter / CIRCLR_LLM=fake, POST a material capture (or use extension). Confirm boards appear with labels and navigation works.

- [ ] **Step 5: Run tests**

```bash
cd companion
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add companion/src/board/BoardJumpStrip.tsx companion/src/board/BoardCarousel.tsx companion/src/board/BoardApp.tsx companion/src/board/useMultiBoardSession.ts companion/src/app/globals.css
git commit -m "feat(board): jump strip and per-question carousel UI"
```

---

### Task 6: CONTEXT + README touch

**Files:**
- Modify: `CONTEXT.md` (Board definition)
- Modify: `README.md` or `companion` docs only if they still say “single shared canvas”

- [ ] **Step 1: Update Board glossary**

Replace Board entry with per-question wording from the spec (one canvas per extracted question; soft title = label; exclusive student work per board).

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md README.md
git commit -m "docs: Board is one canvas per extracted question"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Capture pipeline unchanged / confirmed | (prerequisite; used by Tasks 2–5) |
| Vision `label` → soft title | Tasks 1–2, 5 |
| Grow-only boards | Task 4 `ensureBoardSlots` |
| Slides + jump strip | Task 5 |
| Live extract → boards via SSE; drawing local | Tasks 3–5 |
| Worksheet as source of truth | Tasks 2–4 |
| Fallback label | Task 1 `normalizeQuestionLabel` |
| Fake labeled samples | Task 2 |
| Tests: contract, merge, isolation | Tasks 1–4 |
| CONTEXT Board update | Task 6 |
| Non-goals (persist ink, tutor turns, export crops) | Explicitly omitted |

No TBD placeholders. Types consistently use `label: string` and `questionId` / `id` as board keys.
