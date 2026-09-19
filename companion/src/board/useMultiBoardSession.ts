"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyBoardTurn } from "@/board/model";
import {
  applyElementToSlot,
  clearTutorMarks,
  ensureBoardSlots,
  neighborQuestionId,
  pickActiveQuestionId,
  removeBoardSlot,
  type BoardSlotMap,
} from "@/board/multiBoard";
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
  type BoardChannelMode,
} from "@/session/boardChannel";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type UseMultiBoardSessionOptions = {
  sessionUuid?: string;
  /** `live` subscribes to the Session SSE stream so Tutor marks reach the boards. */
  mode?: BoardChannelMode;
  onStrokeEnd?: (element: BoardElement) => void;
  /**
   * Called once the student has stopped changing the active board for `idleMs`.
   * The caller ships the snapshot to the agent; return a promise to keep the
   * hook from firing again until it settles.
   */
  onIdle?: (input: {
    questionId: string;
    elements: BoardElement[];
  }) => void | Promise<void>;
  /** Quiet period before `onIdle` fires. Default 5000ms. */
  idleMs?: number;
};

/**
 * Multi-board session: one element list per question id. Student ink is local;
 * a live channel routes agent (Tutor) `board.element` frames to the board named
 * by `questionId`.
 */
export function useMultiBoardSession({
  sessionUuid,
  mode,
  onStrokeEnd,
  onIdle,
  idleMs = 5000,
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
  /** Bumped only by student ink; agent marks must not restart the idle timer. */
  const [revision, setRevision] = useState(0);
  /** Pages the student deleted; filtered from every later worksheet sync. */
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const elementsRef = useRef<BoardElement[]>([]);
  const activeQuestionIdRef = useRef<string | null>(null);
  const lastAnnotatedRevisionRef = useRef<number | null>(null);
  const annotatingRef = useRef(false);

  const channel = useMemo(
    () =>
      sessionUuid
        ? createBoardChannel({ mode: mode ?? "stub", sessionUuid })
        : null,
    [mode, sessionUuid],
  );

  useEffect(() => {
    if (!channel) return;
    return channel.subscribe((event) => {
      if (event.type === "board.annotate") {
        setBoards((prev) => clearTutorMarks(prev, event.questionId));
        return;
      }
      if (event.type !== "board.element") return;
      const { questionId } = event;
      if (!questionId) return;
      setBoards((prev) => applyElementToSlot(prev, questionId, event.element));
    });
  }, [channel]);

  const elements = useMemo(
    () => (activeQuestionId !== null ? (boards[activeQuestionId] ?? []) : []),
    [boards, activeQuestionId],
  );

  useEffect(() => {
    elementsRef.current = elements;
    activeQuestionIdRef.current = activeQuestionId;
  }, [elements, activeQuestionId]);

  /**
   * Idle watch: after the student stops editing the active board, hand the
   * snapshot to `onIdle` (which ships it to the agent). Student revisions
   * restart the clock; agent marks do not, so this cannot loop.
   */
  useEffect(() => {
    if (!onIdle || activeQuestionId === null) return;
    if (revision === 0) return;
    if (lastAnnotatedRevisionRef.current === revision) return;
    const timer = setTimeout(() => {
      if (lastAnnotatedRevisionRef.current === revision) return;
      if (annotatingRef.current) return;
      const questionId = activeQuestionIdRef.current;
      const snapshot = elementsRef.current;
      if (questionId === null || snapshot.length === 0) return;
      lastAnnotatedRevisionRef.current = revision;
      annotatingRef.current = true;
      Promise.resolve(onIdle({ questionId, elements: snapshot }))
        .catch(() => {
          lastAnnotatedRevisionRef.current = null;
        })
        .finally(() => {
          annotatingRef.current = false;
        });
    }, idleMs);
    return () => clearTimeout(timer);
  }, [onIdle, activeQuestionId, revision, idleMs]);

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
      const visible = qs.filter((q) => !deletedIdsRef.current.has(q.id));
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
      if (activeQuestionId === null) return;
      setBoards((prev) => {
        const current = prev[activeQuestionId] ?? [];
        return { ...prev, [activeQuestionId]: updater(current) };
      });
      setRevision((r) => r + 1);
    },
    [activeQuestionId],
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

  /** Stub-only: drop an agent mark onto a named board for local rehearsal. */
  const injectTutorElement = useCallback(
    (questionId: string, element: BoardElement) => {
      setBoards((prev) => applyElementToSlot(prev, questionId, element));
    },
    [],
  );

  return {
    questions,
    boards,
    activeQuestionId,
    setActiveQuestionId,
    syncQuestions,
    deleteQuestion,
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
    injectTutorElement,
    channelMode: channel?.mode ?? ("stub" as const),
  };
}
