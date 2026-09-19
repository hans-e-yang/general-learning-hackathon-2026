"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BoardCarousel } from "@/board/BoardCarousel";
import { BoardJumpStrip } from "@/board/BoardJumpStrip";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { neighborQuestionId } from "@/board/multiBoard";
import { useMultiBoardSession } from "@/board/useMultiBoardSession";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
import { subscribeWorksheet } from "@/session/worksheetChannel";

const SESSION_KEY = "circlr-session-uuid";

function readQuerySessionUuid(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("s");
}

function subscribeSession(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getSessionSnapshot(): string | null {
  return readQuerySessionUuid();
}

function getServerSnapshot(): null {
  return null;
}

async function mintSessionUuid(): Promise<string> {
  const res = await fetch("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`POST /session failed: ${res.status}`);
  const data = (await res.json()) as { uuid?: string };
  if (!data.uuid) throw new Error("POST /session returned no uuid");
  return data.uuid;
}

function BoardShell({ sessionUuid }: { sessionUuid: string }) {
  const [sseError, setSseError] = useState<string | null>(null);
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
    setSseError(null);
    return subscribeWorksheet(
      sessionUuid,
      (qs) => {
        syncQuestions(
          qs.map((q) => ({
            id: q.id,
            label: normalizeQuestionLabel(q.label, q.index, q.text),
          })),
        );
      },
      {
        onError: () => {
          setSseError(
            "Cannot reach this Session’s events stream. Open Companion from the extension side panel so ?s= matches the capture Session.",
          );
        },
      },
    );
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
      {sseError ? (
        <p className="board-session-error" role="alert">
          {sseError}
        </p>
      ) : null}
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
  const queryUuid = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot,
  );
  const [mintedUuid, setMintedUuid] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  useEffect(() => {
    if (queryUuid) {
      window.localStorage.setItem(SESSION_KEY, queryUuid);
      setMintedUuid(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const existing = window.localStorage.getItem(SESSION_KEY);
        const uuid = existing ?? (await mintSessionUuid());
        if (cancelled) return;
        window.localStorage.setItem(SESSION_KEY, uuid);
        const url = new URL(window.location.href);
        url.searchParams.set("s", uuid);
        window.history.replaceState({}, "", url.toString());
        setMintedUuid(uuid);
      } catch (err) {
        if (!cancelled) {
          setMintError(
            err instanceof Error ? err.message : "Failed to start a Session",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryUuid]);

  const sessionUuid = queryUuid ?? mintedUuid;

  if (mintError) {
    return (
      <div className="board-app">
        <p className="board-session-error" role="alert">
          {mintError}
        </p>
      </div>
    );
  }

  if (!sessionUuid) {
    return <div className="board-app" aria-busy="true" />;
  }

  return <BoardShell sessionUuid={sessionUuid} />;
}
