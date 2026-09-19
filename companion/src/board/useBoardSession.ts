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
  ShapeElement,
  ShapeKind,
  TextElement,
} from "@/contracts/board";
import {
  DEFAULT_ERASER_SIZE,
  DEFAULT_PEN_WEIGHT,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
  colorForAuthor,
} from "@/contracts/board";
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
  const [penColor, setPenColor] = useState(colorForAuthor("student"));
  const [penWeight, setPenWeight] = useState(DEFAULT_PEN_WEIGHT);
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        setSelectedId((id) => (id === event.elementId ? null : id));
      } else if (event.type === "board.text-move") {
        setElements((prev) =>
          applyBoardTurn(prev, {
            kind: "board-text-move",
            elementId: event.elementId,
            x: event.x,
            y: event.y,
            width: event.width,
            fontSize: event.fontSize,
          }),
        );
      } else if (event.type === "board.pen-move") {
        setElements((prev) =>
          applyBoardTurn(prev, {
            kind: "board-pen-move",
            elementId: event.elementId,
            dx: event.dx,
            dy: event.dy,
          }),
        );
      } else if (event.type === "board.shape-move") {
        setElements((prev) =>
          applyBoardTurn(prev, {
            kind: "board-shape-move",
            elementId: event.elementId,
            x: event.x,
            y: event.y,
            width: event.width,
            height: event.height,
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
    async (points: BoardPoint[]) => {
      if (points.length < 2) return;
      const element: BoardElement = {
        id: newId("pen"),
        tool: "pen",
        author: "student",
        points,
        color: penColor,
        strokeWidth: penWeight,
      };
      await commitTurn({ kind: "board-pen", element }, element);
    },
    [commitTurn, penColor, penWeight],
  );

  const commitShape = useCallback(
    async (draft: {
      x: number;
      y: number;
      width: number;
      height: number;
      shape: ShapeKind;
    }) => {
      if (Math.abs(draft.width) < 4 && Math.abs(draft.height) < 4) return;
      const element: ShapeElement = {
        id: newId("shape"),
        tool: "shape",
        shape: draft.shape,
        author: "student",
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        color: penColor,
        strokeWidth: penWeight,
      };
      await commitTurn({ kind: "board-shape", element }, element);
    },
    [commitTurn, penColor, penWeight],
  );

  const eraseStrokes = useCallback(
    async (elementIds: string[]) => {
      const unique = [...new Set(elementIds)];
      if (unique.length === 0) return;
      let removed: BoardElement[] = [];
      setElements((prev) => {
        removed = prev.filter((el) => unique.includes(el.id));
        return applyBoardTurn(prev, {
          kind: "board-eraser",
          elementIds: unique,
        });
      });
      setSelectedId((id) => (id && unique.includes(id) ? null : id));
      try {
        await channel.postTurn({
          kind: "board-eraser",
          elementIds: unique,
        });
      } catch (err) {
        console.error("Board erase failed", err);
        for (const el of removed) {
          setElements((prev) => applyBoardElement(prev, el));
        }
      }
    },
    [channel],
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
        color: penColor,
        width: DEFAULT_TEXT_WIDTH,
        fontSize: DEFAULT_TEXT_FONT_SIZE,
        ...(degraded ? { degraded: true } : {}),
      };
      await commitTurn({ kind: "board-text", element }, element);
    },
    [commitTurn, penColor],
  );

  const removeElement = useCallback(
    async (elementId: string) => {
      let removed: BoardElement | undefined;
      setElements((prev) => {
        removed = prev.find((el) => el.id === elementId);
        return applyBoardTurn(prev, { kind: "board-remove", elementId });
      });
      setSelectedId((id) => (id === elementId ? null : id));
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
    async (
      elementId: string,
      x: number,
      y: number,
      width?: number,
      fontSize?: number,
    ) => {
      let previous: TextElement | undefined;
      setElements((prev) => {
        const found = prev.find((el) => el.id === elementId);
        if (found?.tool === "text") previous = found;
        return applyBoardTurn(prev, {
          kind: "board-text-move",
          elementId,
          x,
          y,
          width,
          fontSize,
        });
      });
      try {
        await channel.postTurn({
          kind: "board-text-move",
          elementId,
          x,
          y,
          width,
          fontSize,
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
              width: previous!.width,
              fontSize: previous!.fontSize,
            }),
          );
        }
      }
    },
    [channel],
  );

  const movePen = useCallback(
    async (elementId: string, dx: number, dy: number) => {
      if (dx === 0 && dy === 0) return;
      setElements((prev) =>
        applyBoardTurn(prev, { kind: "board-pen-move", elementId, dx, dy }),
      );
      try {
        await channel.postTurn({
          kind: "board-pen-move",
          elementId,
          dx,
          dy,
        });
      } catch (err) {
        console.error("Board pen move failed", err);
        setElements((prev) =>
          applyBoardTurn(prev, {
            kind: "board-pen-move",
            elementId,
            dx: -dx,
            dy: -dy,
          }),
        );
      }
    },
    [channel],
  );

  const moveShape = useCallback(
    async (
      elementId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      let previous: ShapeElement | undefined;
      setElements((prev) => {
        const found = prev.find((el) => el.id === elementId);
        if (found?.tool === "shape") previous = found;
        return applyBoardTurn(prev, {
          kind: "board-shape-move",
          elementId,
          x,
          y,
          width,
          height,
        });
      });
      try {
        await channel.postTurn({
          kind: "board-shape-move",
          elementId,
          x,
          y,
          width,
          height,
        });
      } catch (err) {
        console.error("Board shape move failed", err);
        if (previous) {
          setElements((prev) =>
            applyBoardTurn(prev, {
              kind: "board-shape-move",
              elementId,
              x: previous!.x,
              y: previous!.y,
              width: previous!.width,
              height: previous!.height,
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
      strokeWidth: DEFAULT_PEN_WEIGHT,
    });
    channel.injectTutorElement?.({
      id: newId("tutor-text"),
      tool: "text",
      author: "tutor",
      x: 240,
      y: 200,
      source: "Check the exponent: $x^{2}$",
      color: colorForAuthor("tutor"),
      width: DEFAULT_TEXT_WIDTH,
      fontSize: DEFAULT_TEXT_FONT_SIZE,
    });
  }, [channel]);

  return {
    elements,
    tool,
    setTool,
    penColor,
    setPenColor,
    penWeight,
    setPenWeight,
    eraserSize,
    setEraserSize,
    shapeKind,
    setShapeKind,
    selectedId,
    setSelectedId,
    livePoints,
    setLivePoints,
    commitStroke,
    commitShape,
    eraseStrokes,
    commitText,
    removeElement,
    moveText,
    movePen,
    moveShape,
    injectTutorDemo,
    channelMode: channel.mode,
  };
}
