# Agentic loop (Lane B) — flow & contract

The repo's `session` branch owns Lane B of the Circlr build: the Next.js server that
mints sessions, ingests document/board captures, runs the Socratic watcher loop,
and produces the export PDF. The other two branches (extension + `shared-board` /
side-panel) talk only to this surface; everything documented here is the truth they
build against.

Term-strict vocabulary lives in `CONTEXT.md`. Issue bodies are at
https://github.com/hans-e-yang/general-learning-hackathon-2026 (private). The spec
issue is #2; Lane B sub-issues are #10, #11, #12, #14, #15, #16, #17, #20, #22, #23.

## 1. Components

```
 Chrome MV3 extension          Lane B (this branch)              Companion pane (UI)
 +------------------+          +-------------------------+       +----------------+
 | captureVisibleTab|--POST--> | /session /material       |       | Worksheet      |
 | capture-policy   |          | /session/:uuid/events    |<--SSE--| Tutor thread   |
 | side-panel shell |<---HTML--| /session/:uuid/turn      |       | Notes          |
 | drop layer       |<-- PDF --| /session/:uuid/export    |       | Board canvas   |
 +------------------+          | AgentLoop (server-side)  |       +----------------+
                               | LLMAdapter (Fake by def.)|
                               +-------------------------+
```

Lane B is the only piece that holds the canonical `SessionState` and the only
piece that calls an LLM. Sessions are identified by a single `uuid` minted on
`POST /session`; the browser persists **only** that uuid in `localStorage`
(spec story #12, implemented by the `GET /session/:uuid` resume endpoint).

## 2. Repo layout (Lane B surface)

| Path | Role |
| --- | --- |
| `companion/src/lib/contracts.ts` | zod schemas + inferred types for every wire shape (issue #10). Single source of truth. |
| `companion/openapi.yaml` | OpenAPI 3.1 spec mirrored from `contracts.ts`. Served as JSON at `GET /openapi.json`. |
| `companion/src/app/api-docs/route.ts` | Swagger UI shell (CDN-served `swagger-ui-dist`). |
| `companion/src/app/openapi.json/route.ts` | Serves the OpenAPI YAML as `application/json`. |
| `companion/src/app/session/route.ts` | `POST /session` → mints uuid. |
| `companion/src/app/session/[uuid]/route.ts` | `GET /session/:uuid` → snapshot for resume (#20). |
| `companion/src/app/session/[uuid]/events/route.ts` | `GET` SSE stream; snapshot first, then replay + live. |
| `companion/src/app/session/[uuid]/material/route.ts` | `POST` capture ingest; triggers extract + scout ticks + watcher. |
| `companion/src/app/session/[uuid]/turn/route.ts` | `POST` student actions (`setMode`, `saveDraft`, `requestCheck`, `ask`, `idk`). |
| `companion/src/app/session/[uuid]/export/route.ts` | `GET` PDF generation with `attachment; filename="circlr-<uuid>.pdf"`. |
| `companion/src/lib/session/{types,store,bus,snapshot}.ts` | Canonical `SessionState`, in-process map + per-uuid mutex, event bus + replay buffer, snapshot projection. |
| `companion/src/lib/agent/llm-adapter.ts` | Adapter interface: `extract`, `scout`, `tutor`, `watch`, `idk`. |
| `companion/src/lib/agent/fake-adapter.ts` | Default adapter (deterministic, no vendor). |
| `companion/src/lib/agent/loop.ts` | `processTurn`, `extractFromCapture`, `assessAllDrafts`/`assessDraft`, `watchOnCapture` — the agent loop. |
| `companion/src/lib/export/{pdf,blocks}.ts` | PDF generation via `pdfkit` (cover page + one page per block). |

## 3. Canonical state

`SessionState` lives in `src/lib/session/types.ts`. Every Lane B code path reads
or writes this object under a per-uuid async mutex (`withLock(uuid, fn)`).

```
SessionState
  uuid: string
  mode: 'assignment' | 'review'
  captures[]: { captureId, pageIndex, hash, timestamp, deduped }
  recentHashes: string[]   // rolling last 5, drives /material dedupe
  worksheet[]: { id, index, text, label?, status }
  drafts: Record<questionId, string>
  threads: Record<questionId, TutorTurn[]>
  board[]: BoardElement                            // shared canvas, student + tutor marks
  ghostCounts: Record<ghostKey, number>           // added in #23
  ghostSummary[]: { ghostKey, severity, firstSeenAt, lastSeenAt, occurrences, silent }  // #23
  exportReady: boolean
```

Browser-facing projection (`GET /session/:uuid`) is `SessionSnapshot` — same
shape minus server-only fields plus `drafts`, used to re-hydrate the pane after
a refresh.

## 4. Adapter surface

`LLMAdapter` (`src/lib/agent/llm-adapter.ts`) is the only seam Lane B owns.

| Method | Role | Called from |
| --- | --- | --- |
| `extract({captureHash, pageIndex})` → `ExtractedQuestion[]` | Vision + structuring. Stable IDs from printed `label` (fallback text fingerprint). | `/material` after a non-deduped capture (#14). |
| `scout({captureHash, pageIndex, draftText, questionText})` → `ScoutVerdict` | Cheap/fast quality assessment. `escalate` says whether the Tutor should speak (#29). | Material route + every `saveDraft` (#15); `/turn kind:"assess"` (#29). |
| `tutor({questionId, questionText, draftText, message?, threadHistory, currentLevel, captureHash?})` → `TutorTurn` | Socratic turn. Hint level 0–3; never a final answer (#16). | `/turn requestCheck`, `/turn ask`, flag escalations from the watcher (#23). |
| `watch({captureHash, pageIndex, questionText?, draftText?, recurrenceCount?})` → `WatchVerdict` | Live canvas watcher. Returns `{flag, severity?, ghostKey?, reasoning}` (#22). | `/material` after a non-deduped capture. |
| `idk({questionId, questionText, draftText?})` → `TutorTurn` | Smallest-unblock escape hatch (#23). Level 0; never a final answer. | `/turn idk`. |
| `triage({captureHash, pageIndex, image, contextSummary})` → `TriageVerdict` | Small vision gate: does this capture carry information the session context does not already hold? | `/material`, before `extract` (#28). |
| `annotate({questionId?, questionText?, draftText?, hint?, message?, captureHash?, board})` → `BoardAnnotationTurn[]` | Additive Tutor marks on the shared canvas: text, shapes (circle/arrow/line), pen strokes. Never erase/remove/move student work; never a final answer. | Loop, after every `tutor`/`idk` turn (`requestCheck`, `ask`, `assess`, `idk`, watcher escalation). |

`FakeAdapter` is the default (`CIRCLR_LLM=fake`). All 110 tests run against it
without network calls or vendor keys per the spec's test discipline.

`OpenCodeAdapter` (`src/lib/agent/opencode-adapter.ts`) is the real vendor seam,
selected with `CIRCLR_LLM=opencode`. It calls an OpenAI-compatible
`POST /chat/completions` on OpenCode, defaulting to the **Go** base URL
(`https://opencode.ai/zen/go/v1`; set `CIRCLR_OPENCODE_PLAN=zen` for Zen
pay-as-you-go, or `OPENCODE_BASE_URL` to override) using `OPENCODE_API`. Requests
send `user-agent: circlr-companion/...` and `x-opencode-session` (env
`OPENCODE_SESSION` or a per-process id) as Go requires. Text roles use
`CIRCLR_MODEL` (default `deepseek-v4.1-flash`); `extract`/`watch` use
`CIRCLR_VISION_MODEL` (default `deepseek-v4-flash-vision-exp`) and receive the
capture JPEG via the `image` field on `ExtractInput`/`WatchInput` (threaded from
`/material`).

## 5. Routes

| Verb + path | Purpose | Issue |
| --- | --- | --- |
| `POST /session` | mints uuid, returns `{uuid, eventsUrl}` | #11 |
| `GET /session/:uuid` | snapshot for resume | #20 |
| `GET /session/:uuid/events` | SSE stream; `snapshot` first, then events with `id > Last-Event-ID` and live updates | #11 |
| `POST /session/:uuid/material` | `MaterialCapture` ingest; dedupe; triage gate; then extract/scout/watch | #11, #14, #15, #22, #28 |
| `POST /session/:uuid/turn` | student actions (`setMode`, `saveDraft`, `requestCheck`, `assess`, `ask`, `idk`) and canvas turns (`board-pen`, `board-shape`, `board-text`, `board-eraser`, `board-remove`, `board-text-move`, `board-pen-move`, `board-shape-move`) | #11, #15, #16, #23, #29 |
| `GET /session/:uuid/export` | PDF response | #17 |
| `GET /openapi.json` | OpenAPI YAML as JSON | #10 |
| `GET /api-docs` | Swagger UI shell | #10 |

All route handlers run on the Node runtime (`export const runtime = "nodejs"`)
because spec issue #11 mandates it and Next.js 16's edge runtime rejects
`node:crypto` / `node:events`.

## 6. SSE event timeline (Assignment Mode, one capture)

```
client                         Lane B (Node)                    adapter
  |                                |                              |
  |-- POST /session ------------->|                              |
  |<-- 201 {uuid, eventsUrl} -----|                              |
  |                                |                              |
  |-- GET /session/<uuid>/events ->|                              |
  |<-- snapshot (id=0) -----------|-+                             |
  |                                | |                             |
  |-- POST /session/<uuid>/material>| (capture accepted)           |
  |                                |--> extract(capture) -------->|
  |                                |<-- ExtractedQuestion[] ------|
  |<-- extraction.update (id=N) ---|                              |
  |                                |--> scout(question,draft) --->|
  |                                |<-- ScoutVerdict --------------|
  |<-- assessment.tick (id=N+1) ---|                              |
  |                                |--> watch(capture) ----------->|
  |                                |<-- WatchVerdict --------------|
  |                                |   if flag:                  |
  |<-- flag (id=N+2) --------------|     (count > threshold ? silent) |
  |<-- tutor.turn (id=N+3) -------|←--- tutor.turn appended if not silent
  |                                |                              |
  |-- POST /session/<uuid>/turn -->|   kind: saveDraft|requestCheck|ask|idk
  |<-- 202 ------------------------| (state mutations + tutor/idk event over SSE)
```

Wire shape (every SSE frame is JSON):

```
id: <monotonic>
event: <type>            // snapshot | material.accepted | capture.triaged
                         // | extraction.update | assessment.tick | tutor.turn
                         // | board.element | board.remove | board.text-move
                         // | board.pen-move | board.shape-move
                         // | flag | error
data: <json>
```

`Last-Event-ID: N` on (re)connect skips events with `id ≤ N`.

## 7. End-to-end flows

### 7.1 Session ignition (Assignment)

1. `POST /session` → server calls `crypto.randomUUID()`, writes a fresh
   `SessionState` to `globalThis.__circlrStore` (`src/lib/session/store.ts`),
   returns `{uuid, eventsUrl}`. The extension stores only the uuid.

### 7.2 A captured page

1. Extension's capture-policy (`/extension`, lane A) takes the JPEG, encodes
   to 1280 px JPEG q≈0.7, computes a 16-hex average hash.
2. `POST /session/:uuid/material` body
   `{pageIndex, scrollRatio, timestamp, hash, image (base64 JPEG)}`.
3. Server validates with `MaterialCaptureSchema`. The image **must** be a
   FFD8FF-prefixed JPEG (validated in `contracts.ts:base64JpegSchema`). PNG is
   rejected — `shared-board` must call `canvas.toDataURL('image/jpeg')`.
4. `recordCapture()` in `store.ts` checks the rolling-5 hash window and
   populates `recentHashes`. Matches skip the rest.
5. On a non-deduped capture the route publishes `material.accepted` and runs:
   - `triageOnCapture` → `adapter.triage()` decides whether this frame carries
     new context; publishes `capture.triaged`. On `update:false` extraction is
     skipped (see §12.1); the watcher still runs.
   - `extractFromCapture` (only when triage accepts) → appends new questions to
     the worksheet, publishes `extraction.update {partial:false on first
     capture, true afterwards}`.
   - `assessAllDrafts` → for every non-empty draft, publishes `assessment.tick`.
   - `watchOnCapture` → `adapter.watch()` → on `flag`, increments
     `ghostCounts[ghostKey]` and (if `count ≤ SILENT_THRESHOLD=2`) appends a
     `tutor.turn` to the question's thread. Always publishes `flag`.
6. The companion pane renders new `capture.triaged`, `extraction.update`,
   `assessment.tick`, and `tutor.turn` events from `/events`.

### 7.3 Student asks for a hint / reflection

- `POST /turn` with `kind: "requestCheck"`. Loop calls `adapter.tutor()` with
  `currentLevel = thread[last].level` (or 0). Empty/short drafts escalate,
  drafts showing reasoning (`therefore`/`thus`/`hence`/`so `) de-escalate.
  `escalation` is the field the UI reads to choose the rung.
- `kind: "ask"` carries `message`. The fake echoes the message into the hint.
- `kind: "saveDraft"` records under `state.drafts[questionId]` and immediately
  runs a Scout tick (`assessment.tick`) on the affected question.
- `kind: "assess"` is the frontend-triggered check: it runs Scout, publishes
  `assessment.tick`, and only calls the Tutor when `ScoutVerdict.escalate` is
  true and the thread is below level 3 (see §12.2). Unlike `saveDraft`, it can
  produce a `tutor.turn`.

### 7.4 Intervention ladder (#23)

When the watcher flags the same `ghostKey` repeatedly:

- count 1, 2 → emit `flag` *and* a ladder `tutor.turn` (the watcher's manual
  escalation reuses the same `adapter.tutor` call).
- count 3+ → emit `flag` only; the ghost is **silent** during the checkpoint
  phase. The `ghostSummary` entry's `silent` flag flips to `true`.
- The summary is exposed via the snapshot (`GET /session/:uuid`) so the
  session wrap-up UI can render the full list. Observability: count
  `tutor.turn` events per session — they trend toward zero as familiar
  ghosts fade.

### 7.5 IDK escape hatch (#23)

`POST /turn` with `kind: "idk"`. The adapter's `idk()` returns a level-0 hint
that mirrors the question's first sentence back to the student and is
checked against the never-final-answer guard. The result is published as a
`tutor.turn` over SSE.

### 7.6 Resume after refresh

Frontend reads `localStorage.circlrUuid` → calls `GET /session/:uuid` to
re-hydrate worksheet + drafts + ghost summary → optionally re-opens
`GET /session/:uuid/events` to receive any new turns/scores/flags since
the snapshot was taken. (Spec story #12.)

### 7.7 Export PDF

1. `GET /session/:uuid/export` (or click the Download button — same URL).
2. `buildExportBlocks(state)` adapts `SessionState` to `ExportBlock[]` (one
   per worksheet question, draft + thread attached).
3. `generateExport()` in `src/lib/export/pdf.ts` builds a Letter-sized PDF
   via `pdfkit`: a cover sheet (uuid / mode / generated-at), then one page
   per question. Empty drafts render as `[no answer provided]`. Tutor turns
   render as `[level N, up|down|same] <hint>`. No final-answer text (the
   never-final-answer invariant is enforced one level up by `tutor`/`idk`).
4. Response: `application/pdf`, `Content-Disposition: attachment;
   filename="circlr-<uuid>.pdf"`. The companion's drop layer is the
   extension's concern (#18).

### 7.8 Canvas turns and agent annotations

The Board is the single shared canvas for the Session (CONTEXT.md). Lane B treats
every canvas mutation as a `board-*` turn on the existing `POST
/session/:uuid/turn` route, so `src/session/boardChannel.ts` posts to the same
endpoint it always did.

- **Student → server.** A `board-*` turn is validated by `TurnRequestSchema`,
  applied to `state.board` with the pure `applyBoardTurn` reducer, and mirrored
  to every subscriber as a board SSE event:

  | Turn | SSE event |
  | --- | --- |
  | `board-pen` / `board-shape` / `board-text` | `board.element` `{element}` |
  | `board-eraser` | one `board.remove` `{elementId}` per id |
  | `board-remove` | `board.remove` `{elementId}` |
  | `board-text-move` | `board.text-move` `{elementId,x,y,width?,fontSize?}` |
  | `board-pen-move` | `board.pen-move` `{elementId,dx,dy}` |
  | `board-shape-move` | `board.shape-move` `{elementId,x,y,width,height}` |

- **Agent → canvas.** After every `tutor`/`idk` turn the loop calls
  `adapter.annotate()`, which returns zero or more **additive** turns
  (`BoardAnnotationTurn` = pen | shape | text, `author:"tutor"`). The loop applies
  them with the same reducer and publishes `board.element`. Anchoring/erasing the
  student's work is not in the annotation toolset, and annotation failures are
  swallowed so they never break the tutor turn.

- **Resume.** `GET /session/:uuid` returns `SessionSnapshot.board`, and the first
  SSE frame (`snapshot`) carries it too, so a refresh re-hydrates the canvas.
  Lane B frames board events as `event: board.*` + `data: <payload>`; the board
  channel re-attaches the type from the event name on the client.

## 8. Test culture (spec mandate, kept intact)

- All Lane B unit/integration tests target the external surface: HTTP
  routes, SSE event stream, agent return shapes — never internals.
- `LLMAdapter` is **always injected as a fake** at the seam (`FakeAdapter`
  used by default; `getAdapter()` is the only entry point a vendor would
  plug into). No test calls a network or a vendor key.
- The one exception is the opt-in live suite
  (`src/lib/agent/opencode-adapter.live.test.ts`, `npm run test:live`), which
  hits OpenCode Go for all five adapter roles. It is skipped unless
  `CIRCLR_LLM_TEST_LIVE=1` and `OPENCODE_API` are set, so the default
  `npm run test` and CI stay offline; the key is read from `.env` locally.
- The OpenAPI invariant from #10 asserts the four endpoints and the
  no-`answer`/`final` field on `TutorTurn` so the wire shape can't
  regress. The smoke scripts (`next start` + curl) replay the canonical
  captures → flags → turns → PDF flow before commit.

## 9. Lane B issue trail

| Issue | Title | Where it landed |
| --- | --- | --- |
| #10 | Contract freeze: payloads + SSE event shapes | `src/lib/contracts.ts`, `openapi.yaml`, `/openapi.json`, `/api-docs` |
| #11 | Session skeleton: uuid sessions, capture ingest, SSE channel | `src/lib/session/*`, `src/app/session/{route,[uuid]/*}` |
| #12 | LLM adapter: Scout/Tutor roles with injected fake | `src/lib/agent/*` |
| #14 | Extraction tracer: first captures → Worksheet blocks | `extractFromCapture` in `loop.ts`; called from `/material` |
| #15 | Worksheet drafts + Scout continuous-assessment status ticks | `saveDraft` branch + `assessAllDrafts` in `loop.ts` |
| #16 | Socratic Tutor turns: per-question thread + hint escalation | `tutor()` in `fake-adapter.ts`; `processTurn` requestCheck/ask |
| #17 | Export PDF + Download button | `src/lib/export/{pdf,blocks}.ts`, `/session/[uuid]/export/route.ts` |
| #20 | Resume: localStorage uuid + refresh survival | `GET /session/[uuid]/route.ts`; `drafts` in `SessionSnapshot` |
| #22 | Watcher loop: checkpoint → vision check → flag | `watch()` on the adapter; `watchOnCapture` in `loop.ts`; `flag` SSE event |
| #23 | Intervention ladder: Flag → Hint → Silent (fading) + IDK | recurrence in `watchOnCapture`, `idk()` on the adapter, `turn.kind:"idk"`, `ghostSummary` in `SessionSnapshot` |
| #28 | Capture triage: small vision agent gates context updates | `triage()` on the adapter, `triageOnCapture` in `loop.ts`, `capture.triaged` SSE event |
| #29 | Scout-first assessment with conditional Tutor escalation | `turn.kind:"assess"`, `ScoutVerdict.escalate`, `assess` branch in `processTurn` |

## 10. What other branches need from this surface

| Branch | Dependency on Lane B |
| --- | --- |
| `extension` (Lane A) | `POST /session`, `POST /session/:uuid/material`, `POST /session/:uuid/turn`, `GET /session/:uuid/events` (subscribe). |
| `shared-board` (Board UI) | Same routes as the extension. Canvas turns post to `/turn` and come back as `board.*` SSE events; tutor annotations arrive as `board.element` (author `tutor`); flag events become visual highlights on the canvas. |
| `side-panel` (companion pane host) | Hosts the side panel that points at `/{s.uuid}` (resume + live SSE). |

## 11. Known limitations / deferred

- **Resume across process restart:** the in-process `Map<uuid, SessionState>`
  is keyed off `globalThis`, not durable storage. A full Next.js process
  restart drops every session. The spec accepts this for the first build
  ("no DBs beyond an in-process store"); `GET /session/:uuid` then 404s and
  the UI starts fresh.
- **Real vendor adapter:** wired via `getAdapter()` + `LLMAdapter`. Selection:
  `CIRCLR_LLM=opencode` (default stays `fake`); OpenCode Go by default
  (`CIRCLR_OPENCODE_PLAN=zen` for Zen), model via `CIRCLR_MODEL` and
  `CIRCLR_VISION_MODEL`, key via `OPENCODE_API`. Adapter transport failures
  propagate as 5xx from the route — there is no automatic fallback to `fake`.
- **Multi-tab / concurrent sessions per uuid:** mutexed via `withLock`;
  two simultaneous `/turn` calls serialize naturally. No fan-out across
  uuids is intentionally exposed.
- **Practice Loop (issue #19):** deferred per the spec; lane C stubs only.
- **Watcher consensus / multiple checks per capture:** the design fires the
  watcher once per accepted capture. A future revision could fire per
  board stroke via a separate event stream if performance justifies it.

## 12. Capture triage and Scout-first assessment

Both extensions are implemented. Contract shapes live in `contracts.ts` and
`openapi.yaml`; the `FakeAdapter` is deterministic and the default.

### 12.1 Capture triage (#28)

Hash dedupe only rejects byte-identical frames, so an overlapping scroll would
otherwise re-ingest known questions. After `material.accepted`, the route runs a
small vision agent (`adapter.triage`) that compares the capture against a digest
of the session's current context and returns:

```
TriageVerdict { update: boolean, reason: string, novelty?: "new-questions" | "new-material" | "none" }
```

- `update:false` → publish `capture.triaged` and skip `extractFromCapture`. The
  watcher (`watchOnCapture`) **still runs**: it inspects the student's visible
  work, which is independent of whether the document text is new.
- `update:true` → publish `capture.triaged`, then run the existing extract step.
- Adapter error fails open (`update:true`) so ingestion never silently stops.

The SSE event always carries `captureId`, `update`, and `reason`; `novelty` is
present when the triage model supplies it.

Timeline delta:

```
|-- POST /session/<uuid>/material>| (capture accepted)
|                                |--> triage(capture, contextDigest) -->|
|                                |<-- TriageVerdict -------------------|
|<-- capture.triaged (id=N) -----|   update:false ? skip extract : extract
|                                |--> extract(capture) ---------------->|
|                                |--> watch(capture) ------------------>|
```

### 12.2 Scout-first assessment with Tutor escalation (#29)

The frontend has an explicit "assess this draft" trigger; the Tutor speaks on
`requestCheck`/`ask`, watcher flags, and now an escalating `assess`. A new turn
kind on `POST /session/:uuid/turn`:

```
{ kind: "assess", questionId }
```

1. run `adapter.scout()` on the current draft,
2. publish `assessment.tick` (always),
3. if `ScoutVerdict.escalate` is `true` and the thread level is below 3, run
   `adapter.tutor()` and publish `tutor.turn`.

`saveDraft` keeps its non-escalating tick so typing never spams the Tutor.
Tutor output remains a suggestion entry per #9 and never mutates the Draft
field server-side. The frontend triggers this route; Lane B stays the only LLM
caller. The OpenCode adapter requests `escalate` from the model and falls back
to `status !== "solid"` when the model omits it.

Timeline delta:

```
|-- POST /session/<uuid>/turn -->|   kind:"assess"
|                                |--> scout(question,draft) ----------->|
|                                |<-- ScoutVerdict {escalate} ----------|
|<-- assessment.tick (id=N) -----|
|                                |   escalate & level<3 ? tutor() : stop
|                                |--> tutor(thread,currentLevel) ------>|
|<-- tutor.turn (id=N+1) --------|
```
