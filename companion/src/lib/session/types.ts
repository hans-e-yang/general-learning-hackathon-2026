import type {
  AssessmentStatus,
  GhostSummaryEntry,
  HintEscalation,
  Mode,
  QuestionBlock,
  SseEvent,
  TutorTurn,
} from "@/lib/contracts";

export const RECENT_HASH_LIMIT = 5;

export interface CaptureMeta {
  captureId: string;
  pageIndex: number;
  hash: string;
  timestamp: number;
  deduped: boolean;
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
