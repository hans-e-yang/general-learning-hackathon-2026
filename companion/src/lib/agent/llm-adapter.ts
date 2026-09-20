import type { BoardAnnotationTurn, BoardElement } from "@/contracts/board";
import type {
  ExtractedQuestion,
  ScoutVerdict,
  TriageVerdict,
  TutorTurn,
  WatchVerdict,
} from "@/lib/contracts";

export type {
  AssessmentStatus,
  ExtractedQuestion,
  HintEscalation,
  QuestionBlock,
  ScoutVerdict,
  TriageNovelty,
  TriageVerdict,
  TutorTurn,
  WatchSeverity,
  WatchVerdict,
} from "@/lib/contracts";

export interface ScoutInput {
  captureHash: string;
  pageIndex: number;
  questionText?: string;
  draftText?: string;
  /** Optional student-work snapshot attached to this turn. */
  image?: string;
}

export interface ExtractInput {
  captureHash: string;
  pageIndex: number;
  questionText?: string;
  draftText?: string;
  image?: string;
  /** How many worksheet questions already exist (fake adapter grows the demo bank). */
  knownCount?: number;
  /** Soft titles already on the worksheet (vision extract should still grow past these). */
  knownLabels?: string[];
}

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type PromptSink = (messages: PromptMessage[]) => void;

export interface TutorInput {
  questionId: string;
  questionText: string;
  draftText?: string;
  message?: string;
  threadHistory: TutorTurn[];
  currentLevel: number;
  captureHash?: string;
  /** Optional student-work snapshot attached to this turn. */
  image?: string;
  /** Latest Document capture, so given values come from the printed page. */
  documentImage?: string;
  onPrompt?: PromptSink;
}

export interface WatchInput {
  captureHash: string;
  pageIndex: number;
  questionText?: string;
  draftText?: string;
  recurrenceCount?: number;
  image?: string;
}

export interface IdkInput {
  questionId: string;
  questionText: string;
  draftText?: string;
  /** Optional student-work snapshot attached to this turn. */
  image?: string;
  onPrompt?: PromptSink;
}

export interface TriageInput {
  captureHash: string;
  pageIndex: number;
  image?: string;
  contextSummary?: string;
}

export interface AnnotateInput {
  questionId?: string;
  questionText?: string;
  draftText?: string;
  hint?: string;
  message?: string;
  captureHash?: string;
  /** Current canvas elements, so the agent can place marks relative to the student's work. */
  board: BoardElement[];
  /** Snapshot of the rendered canvas (base64 JPEG), for vision-guided marks. */
  image?: string;
  /** Latest Document capture of the printed question (tables, given values). */
  documentImage?: string;
  /** ViewBox region shown in `image` when the snapshot is a close-up of student work. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Student-typed board text, so the model can read math without OCR. */
  transcript?: string;
  onPrompt?: PromptSink;
}

/** Annotate-pass verdict. Reuses Scout's solid/blocked; incomplete is annotate-only. */
export type AnnotateStatus = "solid" | "incomplete" | "blocked";

export interface AnnotateResult {
  status: AnnotateStatus;
  annotations: BoardAnnotationTurn[];
}

/** Array form is the legacy FakeAdapter / stub shape; treat marks as blocked. */
export type AnnotateOutput = AnnotateResult | BoardAnnotationTurn[];

export function normalizeAnnotateOutput(raw: AnnotateOutput): AnnotateResult {
  if (Array.isArray(raw)) {
    return {
      status: raw.length > 0 ? "blocked" : "incomplete",
      annotations: raw,
    };
  }
  return { status: raw.status, annotations: raw.annotations };
}

export interface LLMAdapter {
  readonly name: string;
  extract(input: ExtractInput): Promise<ExtractedQuestion[]>;
  scout(input: ScoutInput): Promise<ScoutVerdict>;
  triage(input: TriageInput): Promise<TriageVerdict>;
  tutor(input: TutorInput): Promise<TutorTurn>;
  watch(input: WatchInput): Promise<WatchVerdict>;
  idk(input: IdkInput): Promise<TutorTurn>;
  /** Additive Tutor marks on the shared canvas (never erase/remove/move student work). */
  annotate(input: AnnotateInput): Promise<AnnotateOutput>;
}
