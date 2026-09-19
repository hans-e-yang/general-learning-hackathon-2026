import type { BoardElement } from "@/contracts/board";
import type { AssessmentStatus } from "@/lib/contracts";

export type BoardCheckInput = {
  questionId: string;
  /** Bare base64 JPEG (no `data:` prefix), rendered at the board's 800x1200 viewBox. */
  image: string;
  hash?: string;
};

export type AssessmentTickData = {
  questionId: string;
  status: AssessmentStatus;
  reasoning: string;
};

export type TutorTurnData = {
  questionId: string;
  hint: string;
  level: number;
  escalation: string;
};

export type BoardElementData = {
  element: BoardElement;
  questionId?: string;
};

export type BoardSuggestionHandlers = {
  onTick?: (data: AssessmentTickData) => void;
  onTutor?: (data: TutorTurnData) => void;
  onBoardElement?: (data: BoardElementData) => void;
};

function base(options?: { baseUrl?: string }): string {
  return (options?.baseUrl ?? "").replace(/\/$/, "");
}

/** Ask the backend to look at the active board's rendered image. */
export async function postBoardCheck(
  sessionUuid: string,
  input: BoardCheckInput,
  options?: { baseUrl?: string },
): Promise<void> {
  const res = await fetch(`${base(options)}/session/${sessionUuid}/board`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`postBoardCheck failed: ${res.status}`);
  }
}

/**
 * Subscribe to the suggestion events the board check emits: the status tick,
 * the tutor hint, and grounded tutor marks (`board.element`).
 */
export function subscribeBoardSuggestions(
  sessionUuid: string,
  handlers: BoardSuggestionHandlers,
  options?: { baseUrl?: string },
): () => void {
  const source = new EventSource(`${base(options)}/session/${sessionUuid}/events`);
  const listen = (name: string, fn: (data: unknown) => void): (() => void) => {
    const handler = (ev: MessageEvent<string>) => {
      try {
        fn(JSON.parse(ev.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    source.addEventListener(name, handler as EventListener);
    return () => source.removeEventListener(name, handler as EventListener);
  };

  const offs = [
    listen("assessment.tick", (data) => handlers.onTick?.(data as AssessmentTickData)),
    listen("tutor.turn", (data) => handlers.onTutor?.(data as TutorTurnData)),
    listen("board.element", (data) => handlers.onBoardElement?.(data as BoardElementData)),
  ];

  return () => {
    for (const off of offs) off();
    source.close();
  };
}
