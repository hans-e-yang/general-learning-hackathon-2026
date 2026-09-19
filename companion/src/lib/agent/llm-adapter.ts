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
}

export interface ExtractInput {
  captureHash: string;
  pageIndex: number;
  questionText?: string;
  draftText?: string;
  image?: string;
}

export interface TutorInput {
  questionId: string;
  questionText: string;
  draftText?: string;
  message?: string;
  threadHistory: TutorTurn[];
  currentLevel: number;
  captureHash?: string;
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
}

export interface TriageInput {
  captureHash: string;
  pageIndex: number;
  image?: string;
  contextSummary?: string;
}

export interface LLMAdapter {
  readonly name: string;
  extract(input: ExtractInput): Promise<ExtractedQuestion[]>;
  scout(input: ScoutInput): Promise<ScoutVerdict>;
  triage(input: TriageInput): Promise<TriageVerdict>;
  tutor(input: TutorInput): Promise<TutorTurn>;
  watch(input: WatchInput): Promise<WatchVerdict>;
  idk(input: IdkInput): Promise<TutorTurn>;
}
