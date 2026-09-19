import type { BoardAnnotationTurn, BoardElement } from "@/contracts/board";
import { stableQuestionId } from "@/lib/questionIdentity";
import { composeQuestionLabels } from "@/lib/questionLabel";
import { looksLikeFinalAnswer } from "./answer-guard";
import type {
  AnnotateInput,
  AssessmentStatus,
  ExtractInput,
  ExtractedQuestion,
  HintEscalation,
  IdkInput,
  LLMAdapter,
  PromptMessage,
  ScoutInput,
  ScoutVerdict,
  TriageInput,
  TriageVerdict,
  TutorInput,
  TutorTurn,
  WatchInput,
  WatchSeverity,
  WatchVerdict,
} from "./llm-adapter";

const HINT_LADDER = [
  "What part of the question is unclear? Try reading it again out loud.",
  "What assumption are you making here? Name it before you continue.",
  "Try working the problem from the definition. What does each symbol mean?",
  "Walk me through each step. Do not yet write your final sentence.",
];

/** Demo bank only — FakeAdapter does NOT read the capture image. */
const QUESTION_BANK: { label: string; text: string }[] = [
  { label: "1a", text: "Exercise 1\na) A biased die and a probability table." },
  { label: "1b", text: "b) Expected value and an indicator function." },
  { label: "1c", text: "c) Entropy / mutual information for independent variables." },
  { label: "1d", text: "d) Further entropy / information identity on the sheet." },
  { label: "2", text: "Exercise 2. Maximum likelihood estimates of naive Bayes (Laplacian)." },
  { label: "3", text: "Exercise 3. Posterior of LDA is a sigmoid; prove the form." },
  { label: "4", text: "Exercise 4. Further worksheet problem visible after scrolling." },
  { label: "5", text: "Exercise 5. Later worksheet problem visible after scrolling." },
];

const TUTOR_SYSTEM =
  "You are a Socratic tutor inside a study companion. (fake adapter)";
const IDK_SYSTEM = 'A student pressed "I don\'t know". (fake adapter)';
const ANNOTATE_SYSTEM =
  "You mark a shared whiteboard beside a student working on a question. (fake adapter)";

function promptPair(system: string, user: string): PromptMessage[] {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const MIN_LEVEL = 0;
const MAX_LEVEL = 3;

function clampLevel(n: number): number {
  if (n < MIN_LEVEL) return MIN_LEVEL;
  if (n > MAX_LEVEL) return MAX_LEVEL;
  return n;
}

function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function scoutDraft(input: ScoutInput): { status: AssessmentStatus; reasoning: string } {
  const draft = (input.draftText ?? "").trim();
  if (draft.length === 0) {
    return {
      status: "blocked",
      reasoning: "no attempt yet; the student has not typed anything",
    };
  }
  const lower = draft.toLowerCase();
  if (draft.length < 12) {
    return {
      status: "blocked",
      reasoning: "draft is too short to evaluate",
    };
  }
  if (looksLikeFinalAnswer(draft)) {
    return {
      status: "blocked",
      reasoning: "draft looks like a pasted final answer",
    };
  }
  const signals = ["therefore", "thus", "hence", "because", "so "];
  const hasSignal = signals.some((w) => lower.includes(w));
  const seed = hash32(`${input.captureHash}:${draft}`);
  const roll = seed % 100;
  if (hasSignal && roll > 30) {
    return {
      status: "solid",
      reasoning: "draft cites reasoning and stays under the level-3 hint",
    };
  }
  if (hasSignal) {
    return {
      status: "on-track",
      reasoning: "draft shows the right direction; double-check the chain",
    };
  }
  if (roll < 25) {
    return {
      status: "blocked",
      reasoning: "draft does not yet show the reasoning being asked for",
    };
  }
  return {
    status: "on-track",
    reasoning: "draft is heading in the right direction; keep going",
  };
}

export class FakeAdapter implements LLMAdapter {
  readonly name = "fake";

  async extract(input: ExtractInput): Promise<ExtractedQuestion[]> {
    // Demo only: ignores the JPEG. Grow the unlocked prefix as the worksheet
    // already has questions (extension pageIndex is often stuck at 0).
    // Same knownCount → same prefix (stable re-extract); more known → unlock +2.
    const known = Math.max(0, input.knownCount ?? 0);
    const count = Math.min(
      QUESTION_BANK.length,
      known === 0 ? 3 : Math.min(QUESTION_BANK.length, known + 2),
    );
    return QUESTION_BANK.slice(0, count).map((q, index) => {
      const label =
        composeQuestionLabels([{ label: q.label, text: q.text }])[0] ?? q.label;
      return {
        id: stableQuestionId(label, q.text),
        index,
        text: q.text,
        label,
      };
    });
  }

  async scout(input: ScoutInput): Promise<ScoutVerdict> {
    const { status, reasoning } = scoutDraft(input);
    return { status, reasoning, escalate: status !== "solid" };
  }

  async triage(_input: TriageInput): Promise<TriageVerdict> {
    // Always accept so boards can grow as captures arrive (pageIndex is often 0).
    return {
      update: true,
      reason: "accepting capture so newly visible questions can extend the worksheet",
      novelty: "new-questions",
    };
  }

  async tutor(input: TutorInput): Promise<TutorTurn> {
    const draft = (input.draftText ?? "").trim();
    const message = (input.message ?? "").trim();

    const signals = ["therefore", "thus", "hence", "so ", "because of this"];
    const showsReasoning = draft.length >= 30 && signals.some((w) => draft.toLowerCase().includes(w));
    const stuck = draft.length === 0 || draft.length < 12;

    let escalation: HintEscalation;
    if (message.length > 0) {
      escalation = "same";
    } else if (stuck) {
      escalation = "up";
    } else if (showsReasoning) {
      escalation = "down";
    } else {
      escalation = "same";
    }

    let level = clampLevel(input.currentLevel);
    if (escalation === "up" && level < MAX_LEVEL) level += 1;
    if (escalation === "down" && level > MIN_LEVEL) level -= 1;
    level = clampLevel(level);

    const base = HINT_LADDER[level] ?? HINT_LADDER[HINT_LADDER.length - 1];
    const hint = message.length > 0
      ? `${base}\n\nYou asked: "${message}". Rephrase that in your own words first.`
      : base;

    if (looksLikeFinalAnswer(hint)) {
      throw new Error("FakeAdapter invariant violated: hint looks like a final answer");
    }

    const history =
      input.threadHistory
        .slice(-4)
        .map((t) => `[level ${t.level}, ${t.escalation}] ${t.hint}`)
        .join("\n") || "(no prior turns)";
    const lines = [
      `Question:\n${input.questionText}`,
      `Student draft:\n${draft || "(no attempt yet)"}`,
      `Current hint level: ${level}`,
      `Prior turns:\n${history}`,
    ];
    if (message.length > 0) lines.push(`Student asks:\n${message}`);
    input.onPrompt?.(promptPair(TUTOR_SYSTEM, lines.join("\n\n")));

    return {
      questionId: input.questionId,
      hint,
      level,
      escalation,
    };
  }

  async watch(input: WatchInput): Promise<WatchVerdict> {
    const hash = input.captureHash ?? "";
    const lastHex = hash.length > 0 ? parseInt(hash[hash.length - 1], 16) : 0;
    if (Number.isNaN(lastHex) || lastHex % 2 !== 0) {
      return {
        flag: false,
        reasoning: "no detectable slip at this checkpoint",
        status: "on-track",
      };
    }
    const severity: WatchSeverity = lastHex < 8 ? "high" : lastHex < 12 ? "medium" : "low";
    return {
      flag: true,
      severity,
      ghostKey: `g-${hash.slice(0, 6)}`,
      reasoning: `deterministic watcher flagged hash ${hash.slice(0, 6)} (severity=${severity})`,
      status: "blocked",
    };
  }

  async idk(input: IdkInput): Promise<TutorTurn> {
    const q = (input.questionText ?? "").trim();
    const snippet = q.length > 0 ? q.slice(0, 80) : "(question text unavailable)";
    const hint = q.length > 0
      ? `What does the question ask, in your own words? Start with "${snippet}${q.length > 80 ? "…" : ""}"`
      : "Pick the smallest piece you don't know and name it.";
    if (looksLikeFinalAnswer(hint)) {
      throw new Error("FakeAdapter invariant violated: idk hint looks like a final answer");
    }
    input.onPrompt?.(promptPair(IDK_SYSTEM, `Question:\n${q || "(question text unavailable)"}`));
    return {
      questionId: input.questionId,
      hint,
      level: 0,
      escalation: "same",
    };
  }

  async annotate(input: AnnotateInput): Promise<BoardAnnotationTurn[]> {
    input.onPrompt?.(
      promptPair(
        ANNOTATE_SYSTEM,
        `Question:\n${(input.questionText ?? "").trim() || "(none)"}\n\n` +
          `Student draft:\n${(input.draftText ?? "").trim() || "(no attempt yet)"}`
      )
    );
    const hasScene = Boolean(input.questionText || input.hint || input.board.length > 0);
    if (!hasScene) return [];
    const seed = hash32(`${input.questionId ?? ""}:${input.hint ?? ""}`);
    const target = pickTargetRect(input.board);
    const pad = 14;
    return [
      {
        kind: "board-shape",
        element: {
          id: `tutor-ring-${seed}`,
          author: "tutor",
          shape: "ellipse",
          x: target.x - pad,
          y: target.y - pad,
          width: target.width + pad * 2,
          height: target.height + pad * 2,
        },
      },
      {
        kind: "board-text",
        element: {
          id: `tutor-note-${seed}`,
          author: "tutor",
          x: target.x + target.width + 18,
          y: target.y,
          source: reasoningComment(input),
        },
      },
    ];
  }
}

type Rect = { x: number; y: number; width: number; height: number };

const DEFAULT_TARGET: Rect = { x: 80, y: 80, width: 240, height: 140 };

function elementRect(el: BoardElement): Rect | null {
  if (el.tool === "pen") {
    if (el.points.length === 0) return null;
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  if (el.tool === "shape") {
    return {
      x: Math.min(el.x, el.x + el.width),
      y: Math.min(el.y, el.y + el.height),
      width: Math.abs(el.width),
      height: Math.abs(el.height),
    };
  }
  if (el.tool === "text") {
    return { x: el.x, y: el.y, width: el.width, height: el.fontSize * 2 };
  }
  return null;
}

/** Ring the student's most recent mark; fall back to a default region. */
function pickTargetRect(board: readonly BoardElement[]): Rect {
  for (let i = board.length - 1; i >= 0; i -= 1) {
    const el = board[i]!;
    if (el.author !== "student") continue;
    const rect = elementRect(el);
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;
  }
  return DEFAULT_TARGET;
}

const COMMENT_LIMIT = 190;

function clampComment(text: string): string {
  return text.length <= COMMENT_LIMIT
    ? text
    : `${text.slice(0, COMMENT_LIMIT - 1).trimEnd()}…`;
}

/**
 * FakeAdapter has no vision, so it reasons from whatever text context it was
 * given — the tutor hint/student message first, then the draft and question.
 * The result is a full sentence explaining what to re-examine, never a bare
 * "check this step".
 */
function reasoningComment(input: AnnotateInput): string {
  const direct = (input.hint ?? input.message ?? "").replace(/\s+/g, " ").trim();
  if (direct) return clampComment(direct);

  const draft = (input.draftText ?? "").replace(/\s+/g, " ").trim();
  if (draft) {
    const snippet = draft.length > 90 ? `${draft.slice(0, 89).trimEnd()}…` : draft;
    return clampComment(
      `Your step “${snippet}” may not follow from the line before it. Check which rule justifies that move before continuing.`,
    );
  }

  const question = (input.questionText ?? "").replace(/\s+/g, " ").trim();
  if (question) {
    const snippet =
      question.length > 90 ? `${question.slice(0, 89).trimEnd()}…` : question;
    return clampComment(
      `Before continuing: restate what “${snippet}” is asking and name the definition each symbol should use.`,
    );
  }

  return "Re-examine this step and check that each line follows from the one before it.";
}

export const fakeAdapter = new FakeAdapter();

export const __testing = { clampLevel, HINT_LADDER, looksLikeFinalAnswer };
