export type BoardWorkStatus = "solid";
export type BoardAnnotateWireStatus = "solid" | "blocked";

export type BoardWorkAction =
  | { type: "annotate"; status?: BoardAnnotateWireStatus }
  | { type: "revise" };

/**
 * Per-question correctness indicator. `solid` only after an annotate pass that
 * judged the committed work complete and correct; any later student revision
 * or a blocked pass hides it.
 */
export function reduceBoardWorkStatus(
  _current: BoardWorkStatus | undefined,
  action: BoardWorkAction,
): BoardWorkStatus | undefined {
  if (action.type === "revise") return undefined;
  return action.status === "solid" ? "solid" : undefined;
}

export type AnnotationBarKind = "checking" | "solid" | "error" | "working" | null;

/** What the board status bar should show right now. Checking wins so a slow pass is never silent. */
export function annotationBarKind(input: {
  checking: boolean;
  looksSolid: boolean;
  hasTutorMarks: boolean;
  working: boolean;
}): AnnotationBarKind {
  if (input.checking) return "checking";
  if (input.looksSolid) return "solid";
  if (input.hasTutorMarks) return input.working ? "working" : "error";
  if (input.working) return "working";
  return null;
}
