import { randomUUID } from "node:crypto";
import { applyBoardTurn } from "@/board/model";
import type { BoardTurn } from "@/contracts/board";
import {
  asBoardAnnotationTurn,
  asBoardTurn,
  type BoardCheckRequest,
  type TurnRequest,
  type TriageVerdict,
  type WatchVerdict,
} from "@/lib/contracts";
import {
  normalizeQuestionLabel,
  composeQuestionLabels,
  compareQuestionLabels,
} from "@/lib/questionLabel";
import { publish } from "@/lib/session/bus";
import { get, withLock } from "@/lib/session/store";
import {
  SILENT_THRESHOLD,
  type ContextEntry,
  type GhostSummaryEntry,
  type SessionState,
  type TurnMaterial,
} from "@/lib/session/types";
import { getAdapter } from "./index";
import type {
  AnnotateInput,
  ExtractInput,
  IdkInput,
  LLMAdapter,
  PromptMessage,
  ScoutInput,
  TriageInput,
  TutorInput,
  TutorTurn,
  WatchInput,
} from "./llm-adapter";

const MIN_LEVEL = 0;
const MAX_LEVEL = 3;

function clampLevel(n: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, n));
}

export interface AgentLoopDeps {
  adapter: LLMAdapter;
  publishEvent: typeof publish;
}

let activeDeps: AgentLoopDeps | undefined;

export function configureAgentLoop(deps: AgentLoopDeps): void {
  activeDeps = deps;
}

function depsOrDefault(): AgentLoopDeps {
  if (activeDeps) return activeDeps;
  const deps: AgentLoopDeps = { adapter: getAdapter(), publishEvent: publish };
  activeDeps = deps;
  return deps;
}

function findQuestion(state: NonNullable<ReturnType<typeof get>>, questionId: string) {
  return state.worksheet.find((q) => q.id === questionId);
}

function buildMaterial(
  state: SessionState,
  opts: {
    questionId?: string;
    captureHash?: string;
    pageIndex?: number;
    image?: string;
  } = {}
): TurnMaterial {
  const capture =
    (opts.captureHash
      ? state.captures.find((c) => c.hash === opts.captureHash)
      : undefined) ??
    (state.captures.length > 0 ? state.captures[state.captures.length - 1] : undefined);
  const q = opts.questionId ? findQuestion(state, opts.questionId) : undefined;
  return {
    questionId: opts.questionId,
    questionText: q?.text,
    captureId: capture?.captureId,
    captureHash: opts.captureHash ?? capture?.hash,
    pageIndex: opts.pageIndex ?? capture?.pageIndex,
    image: opts.image ?? capture?.image,
  };
}

type ContextEntryDraft =
  | Omit<Extract<ContextEntry, { kind: "capture" }>, "id" | "at">
  | Omit<Extract<ContextEntry, { kind: "extraction" }>, "id" | "at">
  | Omit<Extract<ContextEntry, { kind: "draft" }>, "id" | "at">
  | Omit<Extract<ContextEntry, { kind: "tutor" | "idk" }>, "id" | "at">
  | Omit<Extract<ContextEntry, { kind: "watch" }>, "id" | "at">
  | Omit<Extract<ContextEntry, { kind: "board" }>, "id" | "at">;

/** Append one event to the Session transcript. */
function recordContext(state: SessionState, entry: ContextEntryDraft): void {
  state.context.push({ id: randomUUID(), at: Date.now(), ...entry } as ContextEntry);
}

/** Apply a student canvas turn to canonical board state and mirror it over SSE. */
function applyBoardMutation(
  state: SessionState,
  turn: BoardTurn,
  uuid: string,
  publishEvent: typeof publish
): void {
  const before = state.board;
  state.board = applyBoardTurn(before, turn);
  recordContext(state, { kind: "board", turn });
  switch (turn.kind) {
    case "board-eraser":
      for (const elementId of turn.elementIds) {
        publishEvent(uuid, { type: "board.remove", data: { elementId } });
      }
      return;
    case "board-remove":
      publishEvent(uuid, { type: "board.remove", data: { elementId: turn.elementId } });
      return;
    case "board-text-move":
      publishEvent(uuid, {
        type: "board.text-move",
        data: {
          elementId: turn.elementId,
          x: turn.x,
          y: turn.y,
          width: turn.width,
          fontSize: turn.fontSize,
        },
      });
      return;
    case "board-pen-move":
      publishEvent(uuid, {
        type: "board.pen-move",
        data: { elementId: turn.elementId, dx: turn.dx, dy: turn.dy },
      });
      return;
    case "board-shape-move":
      publishEvent(uuid, {
        type: "board.shape-move",
        data: {
          elementId: turn.elementId,
          x: turn.x,
          y: turn.y,
          width: turn.width,
          height: turn.height,
        },
      });
      return;
    default: {
      const element = state.board[state.board.length - 1];
      if (state.board.length > before.length && element) {
        publishEvent(uuid, { type: "board.element", data: { element } });
      }
    }
  }
}

/** Best-effort: ask the agent for additive canvas marks after a tutor/idk turn. */
async function annotateBoard(
  state: SessionState,
  uuid: string,
  ctx: {
    questionId?: string;
    questionText?: string;
    draftText?: string;
    hint?: string;
    message?: string;
    captureHash?: string;
    image?: string;
  }
): Promise<void> {
  const { adapter, publishEvent } = depsOrDefault();
  const input: AnnotateInput = { ...ctx, board: state.board };
  let turns: BoardTurn[];
  try {
    turns = await adapter.annotate(input);
  } catch {
    return;
  }
  for (const raw of turns) {
    const turn = asBoardAnnotationTurn(raw);
    if (!turn) continue;
    const before = state.board.length;
    state.board = applyBoardTurn(state.board, turn);
    const element = state.board[state.board.length - 1];
    if (state.board.length > before && element) {
      publishEvent(uuid, {
        type: "board.element",
        data: { element, questionId: ctx.questionId },
      });
    }
  }
}

/**
 * Shared tail for a `watch` verdict: count the ghost, publish `flag`, and (unless
 * the ghost has gone silent) emit a tutor hint plus grounded board annotations.
 */
async function emitWatcherSuggestions(
  state: SessionState,
  uuid: string,
  opts: {
    questionId?: string;
    questionText?: string;
    draftText?: string;
    captureHash: string;
    source: "document" | "board";
    image?: string;
    verdict: WatchVerdict;
  }
): Promise<void> {
  const { adapter, publishEvent } = depsOrDefault();
  const { verdict, source, captureHash } = opts;
  if (!verdict.flag) return;

  const questionId = opts.questionId ?? "unknown";
  const baseGhost = verdict.ghostKey ?? `g-${captureHash.slice(0, 6)}`;
  // Namespace board ghosts so the document watcher's counts don't cross-talk.
  const ghostKey = source === "board" ? `board:${baseGhost}` : baseGhost;
  const now = Date.now();
  const newCount = (state.ghostCounts[ghostKey] ?? 0) + 1;
  state.ghostCounts[ghostKey] = newCount;
  const silent = newCount > SILENT_THRESHOLD;

  const existing = state.ghostSummary.find((g) => g.ghostKey === ghostKey);
  const summaryEntry: GhostSummaryEntry = existing
    ? { ...existing, occurrences: newCount, lastSeenAt: now, silent }
    : {
        ghostKey,
        severity: verdict.severity ?? "low",
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: newCount,
        silent,
      };
  if (!existing) state.ghostSummary.push(summaryEntry);
  else Object.assign(existing, summaryEntry);

  publishEvent(uuid, {
    type: "flag",
    data: {
      questionId,
      severity: verdict.severity ?? "low",
      ghostKey,
      reasoning: verdict.reasoning,
    },
  });

  if (silent || !opts.questionId || !opts.questionText) return;

  const thread = state.threads[opts.questionId] ?? [];
  const prevLevel = thread.length === 0 ? 0 : thread[thread.length - 1].level;
  let prompt: PromptMessage[] = [];
  const tutorTurn = await adapter.tutor({
    questionId: opts.questionId,
    questionText: opts.questionText,
    draftText: opts.draftText,
    threadHistory: thread,
    currentLevel: prevLevel,
    captureHash,
    image: opts.image,
    onPrompt: (messages) => {
      prompt = messages;
    },
  });
  recordContext(state, {
    kind: "tutor",
    questionId: opts.questionId,
    prompt,
    input: { kind: "watch", captureHash, pageIndex: 0 },
    material: buildMaterial(state, {
      questionId: opts.questionId,
      captureHash,
      image: opts.image,
    }),
    output: tutorTurn,
  });
  thread.push(tutorTurn);
  state.threads[opts.questionId] = thread;
  publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
  await annotateBoard(state, uuid, {
    questionId: opts.questionId,
    questionText: opts.questionText,
    draftText: opts.draftText,
    hint: tutorTurn.hint,
    captureHash,
    image: opts.image,
  });
}

function nextLevel(history: TutorTurn[], requestedLevel: number): number {
  if (history.length === 0) return clampLevel(requestedLevel);
  const last = history[history.length - 1].level;
  return clampLevel(last);
}

export async function extractFromCapture(
  uuid: string,
  captureHash: string,
  pageIndex: number,
  image?: string
): Promise<void> {
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const input: ExtractInput = {
      captureHash,
      pageIndex,
      image,
      knownCount: state.worksheet.length,
      knownLabels: state.worksheet
        .map((q) => q.label)
        .filter((label): label is string => Boolean(label && label.trim())),
    };
    const extracted = await adapter.extract(input);

    const labels = composeQuestionLabels(
      extracted.map((q) => ({ label: q.label, text: q.text })),
    );
    let inserted = 0;
    for (let i = 0; i < extracted.length; i += 1) {
      const q = extracted[i];
      if (!state.worksheet.find((w) => w.id === q.id)) {
        const label =
          labels[i] ?? normalizeQuestionLabel(q.label, q.index, q.text);
        state.worksheet.push({
          id: q.id,
          index: state.worksheet.length,
          text: q.text,
          label,
          status: "blocked",
        });
        inserted += 1;
      }
    }
    // Keep the printed problem order (1 < 1a < 1b < 2 < 10) regardless of the
    // order the model returned, so every consumer sees a stable sequence.
    state.worksheet.sort((a, b) =>
      compareQuestionLabels(a.label ?? String(a.index), b.label ?? String(b.index)),
    );
    state.worksheet.forEach((q, i) => {
      q.index = i;
    });
    const partial = inserted === 0 || state.captures.length > 1;
    recordContext(state, {
      kind: "extraction",
      partial,
      questions: state.worksheet.map((q) => ({ ...q })),
    });
    publishEvent(uuid, {
      type: "extraction.update",
      data: { partial, questions: [...state.worksheet] },
    });
  });
}

function contextDigest(state: NonNullable<ReturnType<typeof get>>): string {
  const labels = state.worksheet
    .map((q) => q.label)
    .filter((label): label is string => Boolean(label && label.trim()));
  const known = state.worksheet.map((q) => q.text).join(" | ");
  return [
    `questions=${state.worksheet.length}`,
    `labels=${labels.length > 0 ? labels.join(",") : "(none)"}`,
    `captures=${state.captures.length}`,
    `text=${known.slice(0, 400)}`,
  ].join("; ");
}

export async function triageOnCapture(
  uuid: string,
  captureId: string,
  captureHash: string,
  pageIndex: number,
  image?: string
): Promise<boolean> {
  let update = true;
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const input: TriageInput = {
      captureHash,
      pageIndex,
      image,
      contextSummary: contextDigest(state),
    };
    let verdict: TriageVerdict;
    try {
      verdict = await adapter.triage(input);
    } catch {
      verdict = {
        update: true,
        reason: "triage unavailable; defaulting to a context update",
      };
    }
    update = verdict.update;
    recordContext(state, {
      kind: "capture",
      captureId,
      captureHash,
      pageIndex,
      image,
      triage: {
        update: verdict.update,
        reason: verdict.reason,
        novelty: verdict.novelty,
      },
    });
    publishEvent(uuid, {
      type: "capture.triaged",
      data: {
        captureId,
        update: verdict.update,
        reason: verdict.reason,
        novelty: verdict.novelty,
      },
    });
  });
  return update;
}

export async function watchOnCapture(
  uuid: string,
  captureHash: string,
  pageIndex: number,
  image?: string
): Promise<WatchVerdict | undefined> {
  let verdict: WatchVerdict | undefined;
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter } = depsOrDefault();
    const q = state.worksheet[state.worksheet.length - 1];
    const draft = q ? state.drafts[q.id] : undefined;
    const input: WatchInput = {
      captureHash,
      pageIndex,
      questionText: q?.text,
      draftText: draft,
      image,
    };
    verdict = await adapter.watch(input);
    recordContext(state, {
      kind: "watch",
      source: "document",
      questionId: q?.id,
      captureHash,
      pageIndex,
      verdict,
      image,
    });
    await emitWatcherSuggestions(state, uuid, {
      questionId: q?.id,
      questionText: q?.text,
      draftText: draft,
      captureHash,
      source: "document",
      image,
      verdict,
    });
  });
  return verdict;
}

/**
 * A board check: the pane rendered the active question's canvas and asked for a
 * look. Always ticks a status; on a flag, emits the shared hint + circle tail.
 */
export async function checkBoard(uuid: string, req: BoardCheckRequest): Promise<void> {
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const q = findQuestion(state, req.questionId);
    const draft = state.drafts[req.questionId];
    const captureHash = req.hash ?? `board-${req.questionId}`;
    const verdict = await adapter.watch({
      captureHash,
      pageIndex: 0,
      questionText: q?.text,
      draftText: draft,
      image: req.image,
    });
    recordContext(state, {
      kind: "watch",
      source: "board",
      questionId: req.questionId,
      captureHash,
      pageIndex: 0,
      verdict,
      image: req.image,
    });
    publishEvent(uuid, {
      type: "assessment.tick",
      data: {
        questionId: req.questionId,
        status: verdict.status ?? (verdict.flag ? "blocked" : "on-track"),
        reasoning: verdict.reasoning,
      },
    });
    await emitWatcherSuggestions(state, uuid, {
      questionId: req.questionId,
      questionText: q?.text,
      draftText: draft,
      captureHash,
      source: "board",
      image: req.image,
      verdict,
    });
  });
}

export async function assessDraft(
  uuid: string,
  questionId: string,
  captureHint?: { captureHash?: string; pageIndex?: number; image?: string }
): Promise<void> {
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const draft = state.drafts[questionId];
    if (!draft || draft.trim().length === 0) return;
    const q = findQuestion(state, questionId);
    const last = state.captures.length > 0 ? state.captures[state.captures.length - 1] : undefined;
    const captureHash = captureHint?.captureHash ?? last?.hash ?? "no-capture";
    const pageIndex = captureHint?.pageIndex ?? last?.pageIndex ?? 0;
    const image = captureHint?.image;
    const input: ScoutInput = {
      captureHash,
      pageIndex,
      questionText: q?.text,
      draftText: draft,
      image,
    };
    const verdict = await adapter.scout(input);
    recordContext(state, {
      kind: "draft",
      questionId,
      draft,
      questionText: q?.text,
      image,
      assessment: { status: verdict.status, reasoning: verdict.reasoning },
    });
    publishEvent(uuid, {
      type: "assessment.tick",
      data: {
        questionId,
        status: verdict.status,
        reasoning: verdict.reasoning,
      },
    });
  });
}

export async function assessAllDrafts(
  uuid: string,
  captureHint?: { captureHash: string; pageIndex: number; image?: string }
): Promise<void> {
  const state = get(uuid);
  if (!state) return;
  const qids = Object.keys(state.drafts);
  for (const qid of qids) {
    await assessDraft(uuid, qid, captureHint);
  }
}

export async function processTurn(uuid: string, turn: TurnRequest): Promise<void> {
  const boardTurn = asBoardTurn(turn);
  if (boardTurn) {
    await withLock(uuid, async () => {
      const state = get(uuid);
      if (!state) return;
      const { publishEvent } = depsOrDefault();
      applyBoardMutation(state, boardTurn, uuid, publishEvent);
    });
    return;
  }

  if (turn.kind === "saveDraft") {
    await withLock(uuid, async () => {
      const state = get(uuid);
      if (!state) return;
      state.drafts[turn.questionId] = turn.draft;
    });
    await assessDraft(uuid, turn.questionId, turn.image ? { image: turn.image } : undefined);
    return;
  }

  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) {
      return;
    }

    switch (turn.kind) {
      case "setMode":
        state.mode = turn.mode;
        return;
      case "requestCheck": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        const target = nextLevel(thread, 0);
        let prompt: PromptMessage[] = [];
        const input: TutorInput = {
          questionId: turn.questionId,
          questionText: q?.text ?? "(question text unavailable)",
          draftText: state.drafts[turn.questionId],
          threadHistory: thread,
          currentLevel: target,
          captureHash:
            state.captures.length > 0
              ? state.captures[state.captures.length - 1].hash
              : undefined,
          image: turn.image,
          onPrompt: (messages) => {
            prompt = messages;
          },
        };
        const tutorTurn = await adapter.tutor(input);
        recordContext(state, {
          kind: "tutor",
          questionId: turn.questionId,
          prompt,
          input: { kind: "turn", turn },
          material: buildMaterial(state, { questionId: turn.questionId, image: turn.image }),
          output: tutorTurn,
        });
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        await annotateBoard(state, uuid, {
          questionId: turn.questionId,
          questionText: q?.text,
          draftText: state.drafts[turn.questionId],
          hint: tutorTurn.hint,
          captureHash: input.captureHash,
        });

        const draft = state.drafts[turn.questionId] ?? "";
        const verdict = await adapter.scout({
          captureHash: input.captureHash ?? "no-capture",
          pageIndex:
            state.captures.length > 0
              ? state.captures[state.captures.length - 1].pageIndex
              : 0,
          questionText: q?.text,
          draftText: draft,
          image: turn.image,
        });
        recordContext(state, {
          kind: "draft",
          questionId: turn.questionId,
          draft,
          questionText: q?.text,
          image: turn.image,
          assessment: { status: verdict.status, reasoning: verdict.reasoning },
        });
        publishEvent(uuid, {
          type: "assessment.tick",
          data: {
            questionId: turn.questionId,
            status: verdict.status,
            reasoning: verdict.reasoning,
          },
        });
        return;
      }
      case "assess": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        const draft = state.drafts[turn.questionId] ?? "";
        const lastCapture =
          state.captures.length > 0 ? state.captures[state.captures.length - 1] : undefined;
        const verdict = await adapter.scout({
          captureHash: lastCapture?.hash ?? "no-capture",
          pageIndex: lastCapture?.pageIndex ?? 0,
          questionText: q?.text,
          draftText: draft,
          image: turn.image,
        });
        recordContext(state, {
          kind: "draft",
          questionId: turn.questionId,
          draft,
          questionText: q?.text,
          image: turn.image,
          assessment: { status: verdict.status, reasoning: verdict.reasoning },
        });
        publishEvent(uuid, {
          type: "assessment.tick",
          data: {
            questionId: turn.questionId,
            status: verdict.status,
            reasoning: verdict.reasoning,
          },
        });
        const prevLevel = thread.length === 0 ? 0 : thread[thread.length - 1].level;
        if (!verdict.escalate || prevLevel >= MAX_LEVEL) return;
        let prompt: PromptMessage[] = [];
        const tutorTurn = await adapter.tutor({
          questionId: turn.questionId,
          questionText: q?.text ?? "(question text unavailable)",
          draftText: draft,
          threadHistory: thread,
          currentLevel: nextLevel(thread, 0),
          captureHash: lastCapture?.hash,
          image: turn.image,
          onPrompt: (messages) => {
            prompt = messages;
          },
        });
        recordContext(state, {
          kind: "tutor",
          questionId: turn.questionId,
          prompt,
          input: { kind: "turn", turn },
          material: buildMaterial(state, {
            questionId: turn.questionId,
            captureHash: lastCapture?.hash,
            pageIndex: lastCapture?.pageIndex,
            image: turn.image,
          }),
          output: tutorTurn,
        });
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        await annotateBoard(state, uuid, {
          questionId: turn.questionId,
          questionText: q?.text,
          draftText: draft,
          hint: tutorTurn.hint,
          captureHash: lastCapture?.hash,
        });
        return;
      }
      case "ask": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        const target = nextLevel(thread, 0);
        let prompt: PromptMessage[] = [];
        const input: TutorInput = {
          questionId: turn.questionId,
          questionText: q?.text ?? "(question text unavailable)",
          draftText: state.drafts[turn.questionId],
          message: turn.message,
          threadHistory: thread,
          currentLevel: target,
          captureHash:
            state.captures.length > 0
              ? state.captures[state.captures.length - 1].hash
              : undefined,
          image: turn.image,
          onPrompt: (messages) => {
            prompt = messages;
          },
        };
        const tutorTurn = await adapter.tutor(input);
        recordContext(state, {
          kind: "tutor",
          questionId: turn.questionId,
          prompt,
          input: { kind: "turn", turn },
          material: buildMaterial(state, { questionId: turn.questionId, image: turn.image }),
          output: tutorTurn,
        });
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        await annotateBoard(state, uuid, {
          questionId: turn.questionId,
          questionText: q?.text,
          draftText: state.drafts[turn.questionId],
          hint: tutorTurn.hint,
          message: turn.message,
          captureHash: input.captureHash,
        });
        return;
      }
      case "idk": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        let prompt: PromptMessage[] = [];
        const input: IdkInput = {
          questionId: turn.questionId,
          questionText: q?.text ?? "(question text unavailable)",
          draftText: state.drafts[turn.questionId],
          image: turn.image,
          onPrompt: (messages) => {
            prompt = messages;
          },
        };
        const tutorTurn = await adapter.idk(input);
        recordContext(state, {
          kind: "idk",
          questionId: turn.questionId,
          prompt,
          input: { kind: "turn", turn },
          material: buildMaterial(state, { questionId: turn.questionId, image: turn.image }),
          output: tutorTurn,
        });
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        await annotateBoard(state, uuid, {
          questionId: turn.questionId,
          questionText: q?.text,
          draftText: state.drafts[turn.questionId],
          hint: tutorTurn.hint,
        });
        return;
      }
    }
  });
}
