import { applyBoardElement } from "@/board/model";
import type { BoardElement } from "@/contracts/board";

export type BoardSlotMap = Record<string, BoardElement[]>;

/**
 * Apply one incoming element (typically a Tutor annotation) to a specific
 * question board. Grow-only: a duplicate element id is ignored, and an unknown
 * question id gets a fresh slot so a mark is never dropped.
 */
export function applyElementToSlot(
  boards: BoardSlotMap,
  questionId: string,
  element: BoardElement,
): BoardSlotMap {
  const current = boards[questionId] ?? [];
  if (current.some((el) => el.id === element.id)) return boards;
  return { ...boards, [questionId]: applyBoardElement(current, element) };
}

/**
 * Drop the agent's marks from one question board, leaving the student's ink.
 * Used before a fresh annotation batch lands so marks never pile up.
 */
export function clearTutorMarks(
  boards: BoardSlotMap,
  questionId: string,
): BoardSlotMap {
  const current = boards[questionId];
  if (!current || !current.some((el) => el.author === "tutor")) return boards;
  return {
    ...boards,
    [questionId]: current.filter((el) => el.author !== "tutor"),
  };
}

/** Grow-only: add missing question ids with empty element arrays; keep existing ink. */
export function ensureBoardSlots(
  boards: BoardSlotMap,
  questions: { id: string }[],
): BoardSlotMap {
  const next: BoardSlotMap = { ...boards };
  for (const q of questions) {
    if (!(q.id in next)) {
      next[q.id] = [];
    }
  }
  return next;
}

/** Keep prev if still present; else first question id; else null. */
export function pickActiveQuestionId(
  prev: string | null,
  questions: { id: string }[],
): string | null {
  if (prev !== null && questions.some((q) => q.id === prev)) {
    return prev;
  }
  return questions[0]?.id ?? null;
}

/** Drop a page (its slot and ink) from the board map. Other pages are untouched. */
export function removeBoardSlot(
  boards: BoardSlotMap,
  id: string,
): BoardSlotMap {
  if (!(id in boards)) return boards;
  const next: BoardSlotMap = { ...boards };
  delete next[id];
  return next;
}

/** Adjacent question id by delta; null at ends or when active is missing. */
export function neighborQuestionId(
  questions: { id: string }[],
  activeId: string | null,
  delta: -1 | 1,
): string | null {
  if (activeId === null || questions.length === 0) return null;
  const idx = questions.findIndex((q) => q.id === activeId);
  if (idx < 0) return null;
  const next = idx + delta;
  if (next < 0 || next >= questions.length) return null;
  return questions[next]!.id;
}
