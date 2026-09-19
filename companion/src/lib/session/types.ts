import type { BoardElement, BoardTurn } from "@/contracts/board";
import type { PromptMessage } from "@/lib/agent/llm-adapter";
import type {
  AssessmentStatus,
  GhostSummaryEntry,
  HintEscalation,
  Mode,
  QuestionBlock,
  SseEvent,
  TriageNovelty,
  TurnRequest,
  TutorTurn,
  WatchVerdict,
} from "@/lib/contracts";

export const RECENT_HASH_LIMIT = 5;
/** Same perceptual hash may be re-ingested after this gap so incomplete extracts can catch up on a static PDF view. */
export const RECAPTURE_COOLDOWN_MS = 20_000;

export type TurnContextInput =
  | { kind: "turn"; turn: TurnRequest }
  | { kind: "watch"; captureHash: string; pageIndex: number };

export interface TurnMaterial {
  questionId?: string;
  questionText?: string;
  captureId?: string;
  captureHash?: string;
  pageIndex?: number;
  image?: string;
}

interface ContextEntryBase {
  id: string;
  at: number;
  questionId?: string;
}

/** A capture arrived from the extension (with the triage verdict on it). */
export interface CaptureContextEntry extends ContextEntryBase {
  kind: "capture";
  captureId: string;
  captureHash: string;
  pageIndex: number;
  image?: string;
  triage?: { update: boolean; reason: string; novelty?: TriageNovelty };
}

/** Questions were extracted from a capture — the "question" side of the session. */
export interface ExtractionContextEntry extends ContextEntryBase {
  kind: "extraction";
  partial: boolean;
  questions: QuestionBlock[];
}

/** The student saved an answer, plus the Scout assessment of it. */
export interface DraftContextEntry extends ContextEntryBase {
  kind: "draft";
  questionId: string;
  draft: string;
  questionText?: string;
  /** Student-work snapshot attached to this turn, if any. */
  image?: string;
  assessment?: { status: AssessmentStatus; reasoning: string };
}

/** A tutor / idk turn: the full prompt, the material it used, and the AI output. */
export interface TutorContextEntry extends ContextEntryBase {
  kind: "tutor" | "idk";
  input: TurnContextInput;
  prompt: PromptMessage[];
  material: TurnMaterial;
  output: TutorTurn;
}

/** The live watcher ran on a capture; the verdict is recorded whether or not it flagged. */
export interface WatchContextEntry extends ContextEntryBase {
  kind: "watch";
  /** "document" = extension screenshot; "board" = the student's rendered canvas. */
  source: "document" | "board";
  captureHash: string;
  pageIndex: number;
  verdict: WatchVerdict;
  image?: string;
}

/** The student mutated the shared canvas. */
export interface BoardContextEntry extends ContextEntryBase {
  kind: "board";
  turn: BoardTurn;
}

/**
 * Append-only transcript of everything that happened in a Session, in order:
 * captures, extracted questions, student answers, assessments, tutor turns,
 * watcher verdicts, and canvas edits.
 */
export type ContextEntry =
  | CaptureContextEntry
  | ExtractionContextEntry
  | DraftContextEntry
  | TutorContextEntry
  | WatchContextEntry
  | BoardContextEntry;

export interface CaptureMeta {
  captureId: string;
  pageIndex: number;
  hash: string;
  timestamp: number;
  deduped: boolean;
  image?: string;
}

export interface SessionState {
  uuid: string;
  mode?: Mode;
  createdAt: number;
  captures: CaptureMeta[];
  recentHashes: string[];
  worksheet: QuestionBlock[];
  drafts: Record<string, string>;
  threads: Record<string, TutorTurn[]>;
  context: ContextEntry[];
  board: BoardElement[];
  ghostCounts: Record<string, number>;
  ghostSummary: GhostSummaryEntry[];
  exportReady: boolean;
}

export type {
  AssessmentStatus,
  GhostSummaryEntry,
  HintEscalation,
  Mode,
  QuestionBlock,
  SseEvent,
  TutorTurn,
};

export const SILENT_THRESHOLD = 2;
