"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BoardCarousel } from "@/board/BoardCarousel";
import { BoardJumpStrip } from "@/board/BoardJumpStrip";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { neighborQuestionId } from "@/board/multiBoard";
import { useMultiBoardSession } from "@/board/useMultiBoardSession";
import { subscribeWorksheet } from "@/session/worksheetChannel";

const SESSION_KEY = "circlr-session-uuid";

function readSessionUuid(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("s");
  if (fromQuery) return fromQuery;
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function subscribeSession() {
  return () => {};
}

function getSessionSnapshot(): string {
  return readSessionUuid();
}

function getServerSnapshot(): null {
  return null;
}

function BoardShell({ sessionUuid }: { sessionUuid: string }) {
  const {
    questions,
    activeQuestionId,
    setActiveQuestionId,
    syncQuestions,
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
  } = useMultiBoardSession();

  useEffect(() => {
    return subscribeWorksheet(sessionUuid, syncQuestions);
  }, [sessionUuid, syncQuestions]);

  const activeLabel =
    questions.find((q) => q.id === activeQuestionId)?.label ?? null;
  const canPrev =
    neighborQuestionId(questions, activeQuestionId, -1) !== null;
  const canNext =
    neighborQuestionId(questions, activeQuestionId, 1) !== null;
  const empty = questions.length === 0;

  return (
    <div className="board-app">
      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWeight={penWeight}
        onPenWeightChange={setPenWeight}
        eraserSize={eraserSize}
        onEraserSizeChange={setEraserSize}
        shapeKind={shapeKind}
        onShapeKindChange={setShapeKind}
      />
      <BoardJumpStrip
        items={questions}
        activeId={activeQuestionId}
        onSelect={setActiveQuestionId}
      />
      <BoardCarousel
        label={activeLabel}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={goPrev}
        onNext={goNext}
        empty={empty}
      >
        <div className="board-stage">
          <BoardSurface
            key={activeQuestionId ?? "empty"}
            elements={elements}
            tool={tool}
            penColor={penColor}
            penWeight={penWeight}
            eraserSize={eraserSize}
            shapeKind={shapeKind}
            selectedId={selectedId}
            onSelectedIdChange={setSelectedId}
            livePoints={livePoints}
            onLivePointsChange={setLivePoints}
            onStrokeCommit={commitStroke}
            onShapeCommit={commitShape}
            onEraseStrokes={eraseStrokes}
            onTextCommit={commitText}
            onTextRemove={removeElement}
            onTextMove={moveText}
            onPenMove={movePen}
            onShapeMove={moveShape}
          />
        </div>
      </BoardCarousel>
    </div>
  );
}

export function BoardApp() {
  const sessionUuid = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot,
  );

  if (!sessionUuid) {
    return <div className="board-app" aria-busy="true" />;
  }

  return <BoardShell sessionUuid={sessionUuid} />;
}
