import type {
  BoardElement,
  BoardSseEvent,
  BoardTurn,
} from "@/contracts/board";

export type BoardChannelMode = "stub" | "live";

export type BoardChannel = {
  mode: BoardChannelMode;
  sessionUuid: string;
  postTurn: (turn: BoardTurn) => Promise<void>;
  subscribe: (onEvent: (event: BoardSseEvent) => void) => () => void;
  /** Stub-only: inject a Tutor board.element for local rehearsal. */
  injectTutorElement?: (element: BoardElement) => void;
};

export type CreateBoardChannelOptions = {
  mode: BoardChannelMode;
  sessionUuid: string;
  baseUrl?: string;
};

export function createBoardChannel(
  options: CreateBoardChannelOptions,
): BoardChannel {
  if (options.mode === "live") {
    return createLiveChannel(options);
  }
  return createStubChannel(options.sessionUuid);
}

function createStubChannel(sessionUuid: string): BoardChannel {
  const listeners = new Set<(event: BoardSseEvent) => void>();

  return {
    mode: "stub",
    sessionUuid,
    async postTurn() {
      // Local UI already applied the turn; stub acknowledges without fan-out.
    },
    subscribe(onEvent) {
      listeners.add(onEvent);
      return () => {
        listeners.delete(onEvent);
      };
    },
    injectTutorElement(element) {
      const event: BoardSseEvent = { type: "board.element", element };
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function createLiveChannel(
  options: CreateBoardChannelOptions,
): BoardChannel {
  const base = (options.baseUrl ?? "").replace(/\/$/, "");
  const turnUrl = `${base}/session/${options.sessionUuid}/turn`;
  const eventsUrl = `${base}/session/${options.sessionUuid}/events`;

  return {
    mode: "live",
    sessionUuid: options.sessionUuid,
    async postTurn(turn) {
      const res = await fetch(turnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(turn),
      });
      if (!res.ok) {
        throw new Error(`postTurn failed: ${res.status}`);
      }
    },
    subscribe(onEvent) {
      const source = new EventSource(eventsUrl);
      const handle = (msg: MessageEvent<string>) => {
        try {
          const data = JSON.parse(msg.data) as BoardSseEvent;
          if (
            data?.type === "board.element" ||
            data?.type === "board.remove" ||
            data?.type === "board.text-move" ||
            data?.type === "board.pen-move" ||
            data?.type === "board.shape-move"
          ) {
            onEvent(data);
          }
        } catch {
          // Ignore malformed heartbeats / non-JSON frames.
        }
      };
      source.onmessage = handle;
      source.addEventListener("board.element", handle as EventListener);
      source.addEventListener("board.remove", handle as EventListener);
      source.addEventListener("board.text-move", handle as EventListener);
      source.addEventListener("board.pen-move", handle as EventListener);
      source.addEventListener("board.shape-move", handle as EventListener);
      return () => {
        source.removeEventListener("board.element", handle as EventListener);
        source.removeEventListener("board.remove", handle as EventListener);
        source.removeEventListener("board.text-move", handle as EventListener);
        source.removeEventListener("board.pen-move", handle as EventListener);
        source.removeEventListener("board.shape-move", handle as EventListener);
        source.close();
      };
    },
  };
}
