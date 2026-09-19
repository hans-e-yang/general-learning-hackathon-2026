import type { BoardElement } from "@/contracts/board";
import type { PromptMessage } from "@/lib/agent/llm-adapter";
import type {
  AssessmentStatus,
  GhostSummaryEntry,
  HintEscalation,
  Mode,
  QuestionBlock,
  SseEvent,
  TurnRequest,
  TutorTurn,
} from "@/lib/contracts";

export const RECENT_HASH_LIMIT = 5;

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

export interface TurnContext {
  id: string;
  at: number;
  questionId?: string;
  prompt: PromptMessage[];
  input: TurnContextInput;
  material: TurnMaterial;
  output: TutorTurn;
}

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
  context: TurnContext[];
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
