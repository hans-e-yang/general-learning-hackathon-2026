import type { BoardElement } from "@/contracts/board";
import type { BoardSlotMap } from "@/board/multiBoard";

/** The slice of board state that survives a navigation within the tab. */
export type PersistedBoards = {
  questions: { id: string; label: string }[];
  boards: BoardSlotMap;
  activeQuestionId: string | null;
};

const PREFIX = "circlr-boards:";

export function boardStorageKey(sessionUuid: string): string {
  return `${PREFIX}${sessionUuid}`;
}

/** Parse a stored payload, dropping anything malformed so a bad write can't wedge the board. */
export function parsePersistedBoards(raw: string | null): PersistedBoards | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedBoards>;
    if (!parsed || typeof parsed !== "object") return null;
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter(
          (q): q is { id: string; label: string } =>
            Boolean(q) &&
            typeof q === "object" &&
            typeof (q as { id?: unknown }).id === "string" &&
            typeof (q as { label?: unknown }).label === "string",
        )
      : [];
    const boards: BoardSlotMap = {};
    if (parsed.boards && typeof parsed.boards === "object") {
      for (const [key, value] of Object.entries(parsed.boards)) {
        if (Array.isArray(value)) boards[key] = value as BoardElement[];
      }
    }
    const activeQuestionId =
      typeof parsed.activeQuestionId === "string" ? parsed.activeQuestionId : null;
    return { questions, boards, activeQuestionId };
  } catch {
    return null;
  }
}

export function readPersistedBoards(
  storage: Storage | undefined,
  sessionUuid: string,
): PersistedBoards | null {
  if (!storage) return null;
  try {
    return parsePersistedBoards(storage.getItem(boardStorageKey(sessionUuid)));
  } catch {
    return null;
  }
}

export function writePersistedBoards(
  storage: Storage | undefined,
  sessionUuid: string,
  state: PersistedBoards,
): void {
  if (!storage) return;
  try {
    storage.setItem(boardStorageKey(sessionUuid), JSON.stringify(state));
  } catch {
    // Quota or storage disabled: the board just won't survive navigation.
  }
}
