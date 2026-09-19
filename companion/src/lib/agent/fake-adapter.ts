import { looksLikeFinalAnswer } from "./answer-guard";
import type {
  ExtractInput,
  ExtractedQuestion,
  HintEscalation,
  IdkInput,
  LLMAdapter,
  ScoutInput,
  ScoutVerdict,
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

export class FakeAdapter implements LLMAdapter {
  readonly name = "fake";

  async extract(input: ExtractInput): Promise<ExtractedQuestion[]> {
    const seed = hash32(`extract:${input.captureHash}:${input.pageIndex}`);
    const n = (seed % 3) + 1;
    const questions: ExtractedQuestion[] = [];
    for (let i = 0; i < n; i += 1) {
      const id = `q-p${input.pageIndex}-${i}`;
      const tag = input.captureHash.slice(0, 4);
      const text = `Question ${i + 1} on page ${input.pageIndex} (capture ${tag}…)`;
      questions.push({ id, index: i, text });
    }
    return questions;
  }

  async scout(input: ScoutInput): Promise<ScoutVerdict> {
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
    return {
      questionId: input.questionId,
      hint,
      level: 0,
      escalation: "same",
    };
  }
}

export const fakeAdapter = new FakeAdapter();

export const __testing = { clampLevel, HINT_LADDER, looksLikeFinalAnswer };
