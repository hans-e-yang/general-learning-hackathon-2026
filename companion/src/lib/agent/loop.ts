import type { TurnRequest, WatchVerdict } from "@/lib/contracts";
import { publish } from "@/lib/session/bus";
import { get, withLock } from "@/lib/session/store";
import { SILENT_THRESHOLD, type GhostSummaryEntry } from "@/lib/session/types";
import { getAdapter } from "./index";
import type {
  ExtractInput,
  IdkInput,
  LLMAdapter,
  ScoutInput,
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

function nextLevel(history: TutorTurn[], requestedLevel: number): number {
  if (history.length === 0) return clampLevel(requestedLevel);
  const last = history[history.length - 1].level;
  return clampLevel(last);
}

export async function extractFromCapture(uuid: string, captureHash: string, pageIndex: number): Promise<void> {
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const input: ExtractInput = { captureHash, pageIndex };
    const extracted = await adapter.extract(input);

    let inserted = 0;
    for (const q of extracted) {
      if (!state.worksheet.find((w) => w.id === q.id)) {
        state.worksheet.push({ ...q, status: "blocked" });
        inserted += 1;
      }
    }
    const partial = inserted === 0 || state.captures.length > 1;
    publishEvent(uuid, {
      type: "extraction.update",
      data: { partial, questions: [...state.worksheet] },
    });
  });
}

export async function watchOnCapture(
  uuid: string,
  captureHash: string,
  pageIndex: number
): Promise<WatchVerdict | undefined> {
  let verdict: WatchVerdict | undefined;
  await withLock(uuid, async () => {
    const state = get(uuid);
    if (!state) return;
    const { adapter, publishEvent } = depsOrDefault();
    const q = state.worksheet[state.worksheet.length - 1];
    const draft = q ? state.drafts[q.id] : undefined;
    const input: WatchInput = {
      captureHash,
      pageIndex,
      questionText: q?.text,
      draftText: draft,
    };
    verdict = await adapter.watch(input);
    if (!verdict.flag) return;
    const questionId = q?.id ?? "unknown";
    const ghostKey = verdict.ghostKey ?? `g-${captureHash.slice(0, 6)}`;
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

    if (silent || !q) return;
    const thread = state.threads[questionId] ?? [];
    const prevLevel = thread.length === 0 ? 0 : thread[thread.length - 1].level;
    const tutorInput: TutorInput = {
      questionId,
      questionText: q.text,
      draftText: draft,
      threadHistory: thread,
      currentLevel: prevLevel,
      captureHash,
    };
    const tutorTurn = await adapter.tutor(tutorInput);
    thread.push(tutorTurn);
    state.threads[questionId] = thread;
    publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
  });
  return verdict;
}

export async function assessDraft(uuid: string, questionId: string, captureHint?: { captureHash: string; pageIndex: number }): Promise<void> {
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
    const input: ScoutInput = {
      captureHash,
      pageIndex,
      questionText: q?.text,
      draftText: draft,
    };
    const verdict = await adapter.scout(input);
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

export async function assessAllDrafts(uuid: string, captureHint?: { captureHash: string; pageIndex: number }): Promise<void> {
  const state = get(uuid);
  if (!state) return;
  const qids = Object.keys(state.drafts);
  for (const qid of qids) {
    await assessDraft(uuid, qid, captureHint);
  }
}

export async function processTurn(uuid: string, turn: TurnRequest): Promise<void> {
  if (turn.kind === "saveDraft") {
    await withLock(uuid, async () => {
      const state = get(uuid);
      if (!state) return;
      state.drafts[turn.questionId] = turn.draft;
    });
    await assessDraft(uuid, turn.questionId);
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
        };
        const tutorTurn = await adapter.tutor(input);
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });

        const draft = state.drafts[turn.questionId] ?? "";
        const verdict = await adapter.scout({
          captureHash: input.captureHash ?? "no-capture",
          pageIndex:
            state.captures.length > 0
              ? state.captures[state.captures.length - 1].pageIndex
              : 0,
          questionText: q?.text,
          draftText: draft,
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
      case "ask": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        const target = nextLevel(thread, 0);
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
        };
        const tutorTurn = await adapter.tutor(input);
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        return;
      }
      case "idk": {
        const { adapter, publishEvent } = depsOrDefault();
        const thread = state.threads[turn.questionId] ?? [];
        const q = findQuestion(state, turn.questionId);
        const input: IdkInput = {
          questionId: turn.questionId,
          questionText: q?.text ?? "(question text unavailable)",
          draftText: state.drafts[turn.questionId],
        };
        const tutorTurn = await adapter.idk(input);
        thread.push(tutorTurn);
        state.threads[turn.questionId] = thread;
        publishEvent(uuid, { type: "tutor.turn", data: tutorTurn });
        return;
      }
    }
  });
}
