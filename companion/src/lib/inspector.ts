import type {
  GhostSummaryEntry,
  Mode,
  QuestionBlock,
  TutorTurn,
} from "@/lib/contracts";
import type { CaptureMeta, ContextEntry } from "@/lib/session/types";

/**
 * Debug-only surface. Enabled outside production, or explicitly with
 * `CIRCLR_INSPECTOR=1`. Never part of the frozen wire contract.
 */
export function isInspectorEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CIRCLR_INSPECTOR === "1";
}

/**
 * The audit view of a Session: every Capture that was sent (image included) and
 * the full server-only `context` transcript of the question context derived
 * from those images.
 */
export interface InspectorPayload {
  uuid: string;
  mode?: Mode;
  createdAt: number;
  worksheet: QuestionBlock[];
  drafts: Record<string, string>;
  threads: Record<string, TutorTurn[]>;
  ghostSummary: GhostSummaryEntry[];
  captures: CaptureMeta[];
  context: ContextEntry[];
}
