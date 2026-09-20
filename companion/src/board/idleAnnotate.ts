/** Per-question last revision that was successfully shipped to the annotator. */
export type AnnotatedRevisions = Record<string, number>;

/**
 * True when this board has student edits that have not yet been sent. Revisions
 * are per question so switching pages does not skip an unsent board, and a
 * global idle counter cannot mark the wrong page clean.
 */
export function isBoardDirty(
  lastAnnotated: AnnotatedRevisions,
  questionId: string,
  boardRevision: number | undefined,
): boolean {
  if (boardRevision === undefined || boardRevision === 0) return false;
  return lastAnnotated[questionId] !== boardRevision;
}

export function markBoardAnnotated(
  lastAnnotated: AnnotatedRevisions,
  questionId: string,
  boardRevision: number,
): AnnotatedRevisions {
  return { ...lastAnnotated, [questionId]: boardRevision };
}
