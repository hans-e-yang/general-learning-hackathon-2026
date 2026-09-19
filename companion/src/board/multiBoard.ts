import type { BoardElement } from "@/contracts/board";

export type BoardSlotMap = Record<string, BoardElement[]>;

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
