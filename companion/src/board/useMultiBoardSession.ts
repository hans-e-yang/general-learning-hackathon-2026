"use client";

import { useCallback, useRef, useState } from "react";
import { applyBoardElement, applyBoardTurn } from "@/board/model";
import {
  ensureBoardSlots,
  neighborQuestionId,
  pickActiveQuestionId,
  removeBoardSlot,
  type BoardSlotMap,
} from "@/board/multiBoard";
import { renderMathText } from "@/board/mathText";
import { sortQuestionItems } from "@/lib/questionLabel";
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

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type UseMultiBoardSessionOptions = {
  onStrokeEnd?: (element: BoardElement) => void;
  /** Fired after any local board mutation; drives the debounced board check. */
  onChange?: () => void;
};

/**
 * Local multi-board session: one element list per question id.
 * No live board channel in this cut (stub/local only).
 */
export function useMultiBoardSession({
  onStrokeEnd,
  onChange,
}: UseMultiBoardSessionOptions = {}) {
  const [questions, setQuestions] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [boards, setBoards] = useState<BoardSlotMap>({});
  const [activeQuestionId, setActiveQuestionIdState] =
    useState<string | null>(null);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [penColor, setPenColor] = useState(colorForAuthor("student"));
  const [penWeight, setPenWeight] = useState(DEFAULT_PEN_WEIGHT);
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [livePoints, setLivePoints] = useState<BoardPoint[] | null>(null);
  /** Pages the student deleted; filtered from every later worksheet sync. */
  const deletedIdsRef = useRef<Set<string>>(new Set());

  const elements =
    activeQuestionId !== null ? (boards[activeQuestionId] ?? []) : [];

  /** Switch active board; clears in-flight gesture and selection when id changes. */
  const activateQuestion = useCallback(
    (resolve: string | null | ((prev: string | null) => string | null)) => {
      setActiveQuestionIdState((prev) => {
        const next = typeof resolve === "function" ? resolve(prev) : resolve;
        if (next !== prev) {
          setLivePoints(null);
          setSelectedId(null);
        }
        return next;
      });
    },
    [],
  );

  const setActiveQuestionId = useCallback(
    (resolve: string | null | ((prev: string | null) => string | null)) => {
      activateQuestion(resolve);
    },
    [activateQuestion],
  );

  const syncQuestions = useCallback(
    (qs: { id: string; label: string }[]) => {
      const visible = sortQuestionItems(
        qs.filter((q) => !deletedIdsRef.current.has(q.id)),
      );
      setQuestions(visible.map((q) => ({ id: q.id, label: q.label })));
      setBoards((prev) => ensureBoardSlots(prev, visible));
      activateQuestion((prev) => pickActiveQuestionId(prev, visible));
    },
    [activateQuestion],
  );

  /** Delete a page (question board) from the local carousel for this session. */
  const deleteQuestion = useCallback(
    (id: string) => {
      deletedIdsRef.current.add(id);
      const nextQuestions = questions.filter((q) => q.id !== id);
      setQuestions(nextQuestions);
      setBoards((prev) => removeBoardSlot(prev, id));
      activateQuestion((prev) =>
        prev === id ? pickActiveQuestionId(null, nextQuestions) : prev,
      );
    },
    [questions, activateQuestion],
  );

  const goPrev = useCallback(() => {
    activateQuestion(
      (prev) => neighborQuestionId(questions, prev, -1) ?? prev,
    );
  }, [questions, activateQuestion]);

  const goNext = useCallback(() => {
    activateQuestion(
      (prev) => neighborQuestionId(questions, prev, 1) ?? prev,
    );
  }, [questions, activateQuestion]);

  const updateActiveBoard = useCallback(
    (updater: (prev: BoardElement[]) => BoardElement[]) => {
      setBoards((prev) => {
        if (activeQuestionId === null) return prev;
        const current = prev[activeQuestionId] ?? [];
        return { ...prev, [activeQuestionId]: updater(current) };
      });
      onChange?.();
    },
    [activeQuestionId, onChange],
  );

  /** Merge a tutor mark delivered by a board check into the matching board. */
  const applyRemoteElement = useCallback(
    (questionId: string, element: BoardElement) => {
      setBoards((prev) => ({
        ...prev,
        [questionId]: applyBoardElement(prev[questionId] ?? [], element),
      }));
    },
    [],
  );

  const commitTurn = useCallback(
    (turn: BoardTurn, element: BoardElement) => {
      if (activeQuestionId === null) return;
      updateActiveBoard((prev) => applyBoardTurn(prev, turn));
      onStrokeEnd?.(element);
    },
    [activeQuestionId, onStrokeEnd, updateActiveBoard],
  );

  const commitStroke = useCallback(
    (points: BoardPoint[]) => {
      if (activeQuestionId === null || points.length < 2) return;
      const element: BoardElement = {
        id: newId("pen"),
        tool: "pen",
        author: "student",
        points,
        color: penColor,
        strokeWidth: penWeight,
      };
      commitTurn({ kind: "board-pen", element }, element);
    },
    [activeQuestionId, commitTurn, penColor, penWeight],
  );

  const commitShape = useCallback(
    (draft: {
      x: number;
      y: number;
      width: number;
      height: number;
      shape: ShapeKind;
    }) => {
      if (activeQuestionId === null) return;
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
      commitTurn({ kind: "board-shape", element }, element);
    },
    [activeQuestionId, commitTurn, penColor, penWeight],
  );

  const eraseStrokes = useCallback(
    (elementIds: string[]) => {
      if (activeQuestionId === null) return;
      const unique = [...new Set(elementIds)];
      if (unique.length === 0) return;
      updateActiveBoard((prev) =>
        applyBoardTurn(prev, { kind: "board-eraser", elementIds: unique }),
      );
      setSelectedId((id) => (id && unique.includes(id) ? null : id));
    },
    [activeQuestionId, updateActiveBoard],
  );

  const commitText = useCallback(
    (x: number, y: number, source: string) => {
      if (activeQuestionId === null) return;
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
      commitTurn({ kind: "board-text", element }, element);
    },
    [activeQuestionId, commitTurn, penColor],
  );

  const removeElement = useCallback(
    (elementId: string) => {
      if (activeQuestionId === null) return;
      updateActiveBoard((prev) =>
        applyBoardTurn(prev, { kind: "board-remove", elementId }),
      );
      setSelectedId((id) => (id === elementId ? null : id));
    },
    [activeQuestionId, updateActiveBoard],
  );

  const moveText = useCallback(
    (
      elementId: string,
      x: number,
      y: number,
      width?: number,
      fontSize?: number,
    ) => {
      if (activeQuestionId === null) return;
      updateActiveBoard((prev) =>
        applyBoardTurn(prev, {
          kind: "board-text-move",
          elementId,
          x,
          y,
          width,
          fontSize,
        }),
      );
    },
    [activeQuestionId, updateActiveBoard],
  );

  const movePen = useCallback(
    (elementId: string, dx: number, dy: number) => {
      if (activeQuestionId === null || (dx === 0 && dy === 0)) return;
      updateActiveBoard((prev) =>
        applyBoardTurn(prev, { kind: "board-pen-move", elementId, dx, dy }),
      );
    },
    [activeQuestionId, updateActiveBoard],
  );

  const moveShape = useCallback(
    (
      elementId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (activeQuestionId === null) return;
      updateActiveBoard((prev) =>
        applyBoardTurn(prev, {
          kind: "board-shape-move",
          elementId,
          x,
          y,
          width,
          height,
        }),
      );
    },
    [activeQuestionId, updateActiveBoard],
  );

  return {
    questions,
    boards,
    activeQuestionId,
    setActiveQuestionId,
    syncQuestions,
    deleteQuestion,
    applyRemoteElement,
    goPrev,
    goNext,
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
    channelMode: "stub" as const,
  };
}
