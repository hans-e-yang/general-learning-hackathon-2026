"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyBoardElement,
  applyBoardTurn,
  removeBoardElement,
} from "@/board/model";
import { renderMathText } from "@/board/mathText";
import type {
  BoardElement,
  BoardPoint,
  BoardTool,
  BoardTurn,
  TextElement,
} from "@/contracts/board";
import { colorForAuthor } from "@/contracts/board";
import {
  createBoardChannel,
  type BoardChannel,
  type BoardChannelMode,
} from "@/session/boardChannel";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type UseBoardSessionOptions = {
  sessionUuid: string;
  mode?: BoardChannelMode;
  onStrokeEnd?: (element: BoardElement) => void;
};

export function useBoardSession({
  sessionUuid,
  mode = "stub",
  onStrokeEnd,
}: UseBoardSessionOptions) {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [livePoints, setLivePoints] = useState<BoardPoint[] | null>(null);

  const channel = useMemo<BoardChannel>(
    () => createBoardChannel({ mode, sessionUuid }),
    [mode, sessionUuid],
  );

  useEffect(() => {
    return channel.subscribe((event) => {
      if (event.type === "board.element") {
        setElements((prev) => applyBoardElement(prev, event.element));
      } else if (event.type === "board.remove") {
        setElements((prev) => removeBoardElement(prev, event.elementId));
      } else if (event.type === "board.text-move") {
        setElements((prev) =>
          applyBoardTurn(prev, {
            kind: "board-text-move",
            elementId: event.elementId,
            x: event.x,
            y: event.y,
          }),
        );
      }
    });
  }, [channel]);

  const commitTurn = useCallback(
    async (turn: BoardTurn, element: BoardElement) => {
      setElements((prev) => applyBoardTurn(prev, turn));
      onStrokeEnd?.(element);
      try {
        await channel.postTurn(turn);
      } catch (err) {
        console.error("Board postTurn failed", err);
        setElements((prev) => prev.filter((el) => el.id !== element.id));
      }
    },
    [channel, onStrokeEnd],
  );

  const commitStroke = useCallback(
    async (points: BoardPoint[], strokeTool: "pen" | "eraserMask") => {
      if (points.length < 2) return;
      const id = newId(strokeTool === "pen" ? "pen" : "erase");
      if (strokeTool === "pen") {
        const element: BoardElement = {
          id,
          tool: "pen",
          author: "student",
          points,
          color: colorForAuthor("student"),
        };
        await commitTurn({ kind: "board-pen", element }, element);
      } else {
        const element: BoardElement = {
          id,
          tool: "eraserMask",
          author: "student",
          points,
        };
        await commitTurn({ kind: "board-eraser", element }, element);
      }
    },
    [commitTurn],
  );

  const commitText = useCallback(
    async (x: number, y: number, source: string) => {
      const trimmed = source.trim();
      if (!trimmed) return;
      const rendered = renderMathText(trimmed);
      const degraded = rendered.kind === "plain" && rendered.degraded === true;
      const element: TextElement = {
        id: newId("text"),
        tool: "text",
        author: "student",
        x,
        y,
        source: trimmed,
        color: colorForAuthor("student"),
        ...(degraded ? { degraded: true } : {}),
      };
      await commitTurn({ kind: "board-text", element }, element);
    },
    [commitTurn],
  );

  const removeElement = useCallback(
    async (elementId: string) => {
      let removed: BoardElement | undefined;
      setElements((prev) => {
        removed = prev.find((el) => el.id === elementId);
        return applyBoardTurn(prev, { kind: "board-remove", elementId });
      });
      try {
        await channel.postTurn({ kind: "board-remove", elementId });
      } catch (err) {
        console.error("Board remove failed", err);
        if (removed) {
          setElements((prev) => applyBoardElement(prev, removed!));
        }
      }
    },
    [channel],
  );

  const moveText = useCallback(
    async (elementId: string, x: number, y: number) => {
      let previous: TextElement | undefined;
      setElements((prev) => {
        const found = prev.find((el) => el.id === elementId);
        if (found?.tool === "text") previous = found;
        return applyBoardTurn(prev, {
          kind: "board-text-move",
          elementId,
          x,
          y,
        });
      });
      try {
        await channel.postTurn({
          kind: "board-text-move",
          elementId,
          x,
          y,
        });
      } catch (err) {
        console.error("Board text move failed", err);
        if (previous) {
          setElements((prev) =>
            applyBoardTurn(prev, {
              kind: "board-text-move",
              elementId,
              x: previous!.x,
              y: previous!.y,
            }),
          );
        }
      }
    },
    [channel],
  );

  const injectTutorDemo = useCallback(() => {
    channel.injectTutorElement?.({
      id: newId("tutor-pen"),
      tool: "pen",
      author: "tutor",
      points: [
        { x: 120, y: 180 },
        { x: 220, y: 180 },
        { x: 220, y: 280 },
        { x: 120, y: 280 },
        { x: 120, y: 180 },
      ],
      color: colorForAuthor("tutor"),
    });
    channel.injectTutorElement?.({
      id: newId("tutor-text"),
      tool: "text",
      author: "tutor",
      x: 240,
      y: 200,
      source: "Check the exponent: $x^{2}$",
      color: colorForAuthor("tutor"),
    });
  }, [channel]);

  return {
    elements,
    tool,
    setTool,
    livePoints,
    setLivePoints,
    commitStroke,
    commitText,
    removeElement,
    moveText,
    injectTutorDemo,
    channelMode: channel.mode,
  };
}
