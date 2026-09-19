import type { BoardAnnotationTurn } from "@/contracts/board";
import { stableQuestionId } from "@/lib/questionIdentity";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
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

/** Stable bank so later captures grow boards instead of colliding on q-p0-N. */
const QUESTION_BANK: { label: string; text: string }[] = [
  { label: "1", text: "Question 1. Describe the sample space for this experiment." },
  { label: "2", text: "Question 2. Compute P(A ∪ B) given the information on the page." },
  { label: "3", text: "Question 3. Are events A and B independent? Justify briefly." },
  { label: "4", text: "Question 4. Find the conditional probability P(A|B)." },
  { label: "5", text: "Question 5. State Bayes' theorem and identify each term." },
  { label: "6", text: "Question 6. Give an example of mutually exclusive events." },
  { label: "7", text: "Question 7. Compute the expected value of the discrete r.v." },
  { label: "8", text: "Question 8. Sketch the cdf of the distribution on the sheet." },
];

const TUTOR_SYSTEM =
  "You are a Socratic tutor inside a study companion. (fake adapter)";
const IDK_SYSTEM = 'A student pressed "I don\'t know". (fake adapter)';

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
    // Disjoint windows per pageIndex so scrolling/new pages add new boards.
    const windowSize = 3;
    const start = Math.min(
      input.pageIndex * windowSize,
      Math.max(0, QUESTION_BANK.length - windowSize),
    );
    return QUESTION_BANK.slice(start, start + windowSize).map((q, i) => {
      const index = start + i;
      const label = normalizeQuestionLabel(q.label, index, q.text);
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
      return { flag: false, reasoning: "no detectable slip at this checkpoint" };
    }
    const severity: WatchSeverity = lastHex < 8 ? "high" : lastHex < 12 ? "medium" : "low";
    return {
      flag: true,
      severity,
      ghostKey: `g-${hash.slice(0, 6)}`,
      reasoning: `deterministic watcher flagged hash ${hash.slice(0, 6)} (severity=${severity})`,
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
    const hasScene = Boolean(input.questionText || input.hint || input.board.length > 0);
    if (!hasScene) return [];
    const id = `tutor-note-${hash32(`${input.questionId ?? ""}:${input.hint ?? ""}`)}`;
    return [
      {
        kind: "board-text",
        element: {
          id,
          author: "tutor",
          x: 32,
          y: 32,
          source: "Check this step.",
        },
      },
    ];
  }
}

export const fakeAdapter = new FakeAdapter();

export const __testing = { clampLevel, HINT_LADDER, looksLikeFinalAnswer };
