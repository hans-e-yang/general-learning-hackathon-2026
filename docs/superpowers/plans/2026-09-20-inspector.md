# In-server Capture & Context Inspector Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Serve a live inspector from the Next.js companion that shows every screenshot material sent to a Session and the question context derived from those images (triage verdict, extracted questions, worksheet, drafts, tutor material).

**Architecture:** The companion already holds the full audit record server-side — `SessionState.captures[].image` (every JPEG posted to `/material`) and `SessionState.context[]` (`ContextEntry` = capture+triage, extraction, draft+assessment, tutor/idk prompt/material/output, watch, board). `buildSnapshot()` deliberately strips images and context, and the SSE wire carries no image bytes. The inspector adds a read-only, dev-gated JSON endpoint that returns captures + context **with inline base64 images**, plus a standalone `/inspector` page. The page subscribes to the existing `GET /session/:uuid/events` SSE purely as a change signal and refetches the JSON; no new bus, event type, or frozen-contract change.

**Tech Stack:** Next.js App Router (nodejs runtime route handler + client page), React 19, Tailwind v4, Vitest, existing in-process store/`SessionState`.

**Spec:** none (debug tooling); decisions captured here.

## Decisions

- **Images:** inline base64 in the inspector JSON (chosen over a separate asset route). Accept the larger payload; this is a local dev surface.
- **Placement:** separate `/inspector` page, `?s=<uuid>` (same param as `BoardApp`), `localStorage["circlr-session-uuid"]` fallback. Leaves `/` (the side-panel BoardApp) untouched.
- **Gating:** 404 unless `NODE_ENV !== "production"` **or** `CIRCLR_INSPECTOR=1`. Applies to both the page and the endpoint; the endpoint is the security boundary.
- **No contract change:** `openapi.yaml` / `contracts.ts` wire shapes and the #10 invariant stay frozen. Inspector types live outside `contracts.ts`.
- **Live updates:** refetch on relevant SSE event types only (`snapshot`, `material.accepted`, `capture.triaged`, `extraction.update`, `assessment.tick`, `tutor.turn`, `flag`, `error`), debounced; ignore high-volume `board.*` events.

## Global Constraints

- Do not change the frozen SSE/contract shapes (`contracts.ts`, `openapi.yaml`) or the #10 test.
- Server-only context must not leak through `SessionSnapshot`, `/events`, or `/turn`.
- Use CONTEXT.md terms: Session, Capture, Document, Worksheet, Tutor.
- Keep all existing tests green (`npm test`) and lint clean (`npm run lint`).

---

## File map

| File | Responsibility |
|------|----------------|
| `companion/src/lib/inspector.ts` | `isInspectorEnabled()` gate + `InspectorPayload` type |
| `companion/src/app/session/[uuid]/inspector/route.ts` | `GET` read-only captures + context JSON (gated) |
| `companion/src/app/inspector/page.tsx` | Server component: gate (`notFound()`), render client |
| `companion/src/app/inspector/InspectorClient.tsx` | Client UI: capture grid + context timeline + SSE refetch |
| `companion/src/app/session/__tests__/inspector.test.ts` | Route tests (payload, gate, 404) |
| `docs/agentic-loop.md` | Note the inspector as the §13 audit-record seam |

---

### Task 1: Gate helper + payload type

**Files:**
- Create: `companion/src/lib/inspector.ts`

**Interfaces:**
- Produces: `isInspectorEnabled(): boolean`
- Produces: `InspectorPayload` (uuid/mode/worksheet/drafts/threads/ghostSummary/captures-with-image/context)

- [x] **Step 1:** Write `isInspectorEnabled()` returning `process.env.NODE_ENV !== "production" || process.env.CIRCLR_INSPECTOR === "1"`.
- [x] **Step 2:** Define `InspectorPayload` from existing types: `session/types.ts` (`SessionState`, `ContextEntry`, `CaptureMeta`) and `contracts.ts` (`QuestionBlock`, `TutorTurn`, `GhostSummaryEntry`, `Mode`). Captures keep `image?: string`; context entries are returned verbatim.

**Verify:** `npx tsc --noEmit` clean.

---

### Task 2: Inspector route

**Files:**
- Create: `companion/src/app/session/[uuid]/inspector/route.ts`
- Create: `companion/src/app/session/__tests__/inspector.test.ts`

**Interfaces:**
- Consumes: `isInspectorEnabled`, `InspectorPayload`, `get(uuid)` from `lib/session/store`.
- Produces: `GET /session/:uuid/inspector` → `200 InspectorPayload` | `404` (unknown uuid or gate off).

- [x] **Step 1: Write the failing tests** in `inspector.test.ts`: seed a session + capture with a JPEG image, assert the payload includes `captures[].image` and `context`; assert unknown uuid 404s; assert the gate 404s when `NODE_ENV=production` and `CIRCLR_INSPECTOR` unset (restore env after).
- [x] **Step 2: Run tests to confirm they fail** (`npm test -- inspector`).
- [x] **Step 3:** Implement the route: `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`, gate check, `get(uuid)`, return the payload with `cache-control: no-store`. Optional `?images=0` to drop base64 for a metadata-only view.
- [x] **Step 4: Run tests** green.

**Verify:** `npm test -- inspector`.

---

### Task 3: `/inspector` page

**Files:**
- Create: `companion/src/app/inspector/page.tsx`
- Create: `companion/src/app/inspector/InspectorClient.tsx`

**Interfaces:**
- Consumes: `GET /session/:uuid/inspector`, `GET /session/:uuid/events`.
- Produces: a page at `/inspector?s=<uuid>`.

- [x] **Step 1:** `page.tsx` (server): `if (!isInspectorEnabled()) notFound();` then render `<InspectorClient />`.
- [x] **Step 2:** `InspectorClient.tsx` (`"use client"`): resolve uuid from `?s=` then `localStorage`; fetch the payload; subscribe to the SSE event list and debounce-refetch; render:
  - header: connection dot, title, session id, capture count;
  - left: capture grid (image `data:image/jpeg;base64,...`, page/hash/timestamp/deduped);
  - right: context timeline, one row per `ContextEntry` badged by `kind` — capture→triage verdict/novelty, extraction→labels + question text, draft→Scout assessment, tutor/idk→prompt/material/output; inline thumbnail where `entry.image` exists;
  - worksheet panel with labels/status.
- [x] **Step 3:** Tailwind-styled dark developer layout; empty/error/404 states.
- [x] **Step 4:** Add an **Inspect** link to `BoardToolbar` (threaded from `BoardApp` as `/inspector?s=<uuid>`) and a **← Board** link back, so it toggles inside the same side panel.

**Verify:** `npm run lint`; `npm run dev` and open `/inspector?s=<uuid>`.

---

### Task 4: Docs

**Files:**
- Modify: `docs/agentic-loop.md` (§13)

- [x] **Step 1:** Add one paragraph noting `GET /session/:uuid/inspector` + `/inspector` expose the audit record (`captures` with images, `context`) for debugging, dev-gated, and never part of the wire contract.

**Verify:** prose matches routes.

---

## Verification checklist

- [x] `npm test` in `companion/` — existing suite + new inspector tests green.
- [x] `npm run lint` clean.
- [x] Manual: extension capture appears in `/inspector` with its image; triage verdict + extracted question labels render for the same capture; tutor rows show prompt/material.
- [x] Gate: with `NODE_ENV=production CIRCLR_INSPECTOR= npm start`, `/inspector` and the endpoint 404.
