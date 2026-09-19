"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BoardCarousel } from "@/board/BoardCarousel";
import { renderBoardToJpeg, renderBoardViewportToJpeg } from "@/board/boardImage";
import { BoardJumpStrip } from "@/board/BoardJumpStrip";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { buildBoardPdf, buildBoardPdfPages } from "@/board/exportPdf";
import { neighborQuestionId } from "@/board/multiBoard";
import { useMultiBoardSession } from "@/board/useMultiBoardSession";
import { BOARD_VIEWBOX, type BoardElement } from "@/contracts/board";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
import { subscribeWorksheet } from "@/session/worksheetChannel";

const SESSION_KEY = "circlr-session-uuid";
/** Clear the spinner if extract never returns (network / model hang). */
const CAPTURE_PROCESSING_TIMEOUT_MS = 90_000;

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

async function sessionExists(uuid: string): Promise<boolean> {
  try {
    const res = await fetch(`/session/${uuid}`);
    return res.ok;
  } catch {
    return false;
  }
}

function writeSessionToUrl(uuid: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("s", uuid);
  window.history.replaceState({}, "", url.toString());
  window.dispatchEvent(new Event("popstate"));
}

type AnnotationStatus = "idle" | "working" | "resolved";

function BoardShell({ sessionUuid }: { sessionUuid: string }) {
  const [annotationStatus, setAnnotationStatusState] = useState<
    Record<string, AnnotationStatus>
  >({});
  const annotationStatusRef = useRef<Record<string, AnnotationStatus>>({});
  const setStatusFor = useCallback(
    (questionId: string, status: AnnotationStatus) => {
      setAnnotationStatusState((prev) => {
        const next = { ...prev, [questionId]: status };
        annotationStatusRef.current = next;
        return next;
      });
    },
    [],
  );

  /** Send a snapshot to the agent so it can annotate the board over the SSE. */
  const sendSnapshot = useCallback(
    async (questionId: string, elements: BoardElement[]) => {
      if (elements.length === 0) return;
      const image = renderBoardToJpeg(elements);
      if (!image) return;
      const res = await fetch(`/session/${sessionUuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "annotate", questionId, image }),
      });
      if (!res.ok) {
        throw new Error(`annotate request failed: ${res.status}`);
      }
    },
    [sessionUuid],
  );

  /**
   * Idle canvas snapshot → agent annotations come back over the board SSE. Always
   * sends: the agent holds no per-board pause state here, so a student who is
   * still working keeps getting fresh reads of the board.
   */
  const annotateOnIdle = useCallback(
    ({ questionId, elements: snapshot }: { questionId: string; elements: BoardElement[] }) =>
      sendSnapshot(questionId, snapshot),
    [sendSnapshot],
  );

  const {
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
    selectedIds,
    setSelectedIds,
    livePoints,
    setLivePoints,
    commitStroke,
    commitShape,
    eraseStrokes,
    commitText,
    removeElement,
    moveText,
    moveSelection,
    dismissTutorMarks,
  } = useMultiBoardSession({
    sessionUuid,
    mode: "live",
    onIdle: annotateOnIdle,
  });
  const [captureProcessing, setCaptureProcessing] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "busy" | "error"
  >("idle");
  const downloadBusyRef = useRef(false);
  const downloadResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (downloadResetRef.current) clearTimeout(downloadResetRef.current);
    };
  }, []);

  const exportBoards = useCallback(async () => {
    if (questions.length === 0 || downloadBusyRef.current) return;
    if (downloadResetRef.current) {
      clearTimeout(downloadResetRef.current);
      downloadResetRef.current = undefined;
    }
    downloadBusyRef.current = true;
    setDownloadStatus("busy");
    try {
      const stage = stageRef.current;
      const viewport = {
        width: Math.max(1, stage?.clientWidth ?? BOARD_VIEWBOX.width),
        height: Math.max(1, stage?.clientHeight ?? BOARD_VIEWBOX.height),
      };
      const pixelRatio =
        typeof window !== "undefined"
          ? Math.min(2, window.devicePixelRatio || 1)
          : 1;
      const pages = buildBoardPdfPages(questions, boards, (els) =>
        renderBoardViewportToJpeg(els, viewport, pixelRatio),
      );
      const blob = await buildBoardPdf({ pages });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `circlr-boards-${sessionUuid}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadStatus("idle");
    } catch {
      setDownloadStatus("error");
      downloadResetRef.current = setTimeout(() => {
        setDownloadStatus("idle");
        downloadResetRef.current = undefined;
      }, 2500);
    } finally {
      downloadBusyRef.current = false;
    }
  }, [boards, questions, sessionUuid]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const clearBusy = () => {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
      setCaptureProcessing(false);
    };
    const unsub = subscribeWorksheet(
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
        onCaptureProcessing: (busy) => {
          if (timeout) clearTimeout(timeout);
          timeout = undefined;
          setCaptureProcessing(busy);
          if (busy) {
            timeout = setTimeout(clearBusy, CAPTURE_PROCESSING_TIMEOUT_MS);
          }
        },
      },
    );
    return () => {
      unsub();
      if (timeout) clearTimeout(timeout);
    };
  }, [sessionUuid, syncQuestions]);

  const activeLabel =
    questions.find((q) => q.id === activeQuestionId)?.label ?? null;
  const canPrev =
    neighborQuestionId(questions, activeQuestionId, -1) !== null;
  const canNext =
    neighborQuestionId(questions, activeQuestionId, 1) !== null;
  const empty = questions.length === 0;

  const activeStatus: AnnotationStatus = activeQuestionId
    ? (annotationStatus[activeQuestionId] ?? "idle")
    : "idle";
  const hasTutorMarks = elements.some((el) => el.author === "tutor");
  const showAnnotationBar = hasTutorMarks || activeStatus === "working";
  const tutorSignature = elements
    .filter((el) => el.author === "tutor")
    .map((el) => el.id)
    .join("|");

  // A fresh batch of marks after "Resolved" starts a new issue.
  useEffect(() => {
    if (!activeQuestionId || !tutorSignature) return;
    if (annotationStatusRef.current[activeQuestionId] === "resolved") {
      setStatusFor(activeQuestionId, "idle");
    }
  }, [activeQuestionId, tutorSignature, setStatusFor]);

  const markWorking = useCallback(() => {
    if (activeQuestionId) setStatusFor(activeQuestionId, "working");
  }, [activeQuestionId, setStatusFor]);

  const markResolved = useCallback(() => {
    if (!activeQuestionId) return;
    // Keep the student's ink, drop the Tutor's marks, then re-send the board so
    // the agent sees the resolved state and can start a fresh pass. The snapshot
    // is rendered from student-only elements, matching what dismissTutorMarks
    // leaves on screen.
    const questionId = activeQuestionId;
    const studentElements = elements.filter((el) => el.author !== "tutor");
    dismissTutorMarks(questionId);
    setStatusFor(questionId, "resolved");
    void fetch(`/session/${sessionUuid}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "dismissAnnotation", questionId }),
    }).catch(() => {
      /* local dismissal already stands; the agent will re-mark on the next edit */
    });
    void sendSnapshot(questionId, studentElements).catch(() => {
      /* the next idle edit re-sends; a failed resolve snapshot is not fatal */
    });
  }, [
    activeQuestionId,
    elements,
    dismissTutorMarks,
    sessionUuid,
    sendSnapshot,
    setStatusFor,
  ]);

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
        inspectHref={`/inspector?s=${encodeURIComponent(sessionUuid)}`}
        onDownload={() => {
          void exportBoards();
        }}
        downloadDisabled={questions.length === 0}
        downloadStatus={downloadStatus}
      />
      <div className="board-status-row">
        <BoardJumpStrip
          items={questions}
          activeId={activeQuestionId}
          onSelect={setActiveQuestionId}
        />
        {captureProcessing ? (
          <p className="board-capture-busy" role="status" aria-live="polite">
            <span className="board-capture-spinner" aria-hidden="true" />
            Reading capture…
          </p>
        ) : null}
      </div>
      {showAnnotationBar ? (
        <div
          className="board-annotation-bar"
          data-status={activeStatus}
          role="status"
          aria-live="polite"
        >
          <span className="board-annotation-message">
            {activeStatus === "working"
              ? "Resolving — the Tutor will hold off."
              : "The Tutor circled a step to reconsider."}
          </span>
          <div className="board-annotation-actions">
            <button
              type="button"
              className={
                activeStatus === "working"
                  ? "board-annotation-btn is-active"
                  : "board-annotation-btn"
              }
              aria-pressed={activeStatus === "working"}
              onClick={markWorking}
            >
              Working on it
            </button>
            <button
              type="button"
              className="board-annotation-btn is-primary"
              onClick={markResolved}
            >
              Resolved
            </button>
          </div>
        </div>
      ) : null}
      <BoardCarousel
        label={activeLabel}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={goPrev}
        onNext={goNext}
        onDelete={
          activeQuestionId !== null
            ? () => deleteQuestion(activeQuestionId)
            : undefined
        }
        canDelete={activeQuestionId !== null}
        empty={empty}
        processing={captureProcessing}
      >
        <div className="board-stage" ref={stageRef}>
          <BoardSurface
            key={activeQuestionId ?? "empty"}
            elements={elements}
            tool={tool}
            penColor={penColor}
            penWeight={penWeight}
            eraserSize={eraserSize}
            shapeKind={shapeKind}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            livePoints={livePoints}
            onLivePointsChange={setLivePoints}
            onStrokeCommit={commitStroke}
            onShapeCommit={commitShape}
            onEraseStrokes={eraseStrokes}
            onTextCommit={commitText}
            onTextRemove={removeElement}
            onTextMove={moveText}
            onMoveSelection={moveSelection}
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
  const [resolvedUuid, setResolvedUuid] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setBootError(null);
        // Prefer ?s= from the extension; verify it still exists (dev server restarts wipe memory).
        if (queryUuid && (await sessionExists(queryUuid))) {
          if (cancelled) return;
          window.localStorage.setItem(SESSION_KEY, queryUuid);
          setResolvedUuid(queryUuid);
          return;
        }
        // Stale ?s= or no query: mint a live Session on this server.
        const uuid = await mintSessionUuid();
        if (cancelled) return;
        window.localStorage.setItem(SESSION_KEY, uuid);
        writeSessionToUrl(uuid);
        setResolvedUuid(uuid);
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err instanceof Error ? err.message : "Failed to start a Session",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryUuid]);

  if (bootError) {
    return (
      <div className="board-app">
        <p className="board-session-error" role="alert">
          {bootError}
        </p>
      </div>
    );
  }

  if (!resolvedUuid) {
    return <div className="board-app" aria-busy="true" />;
  }

  return <BoardShell sessionUuid={resolvedUuid} />;
}
