// Message contract for the panel ⇄ background ⇄ content-script flow.
// Discriminated unions on `kind` so every hop type-narrows; the config-seam
// equivalents (payload + SSE shapes) are frozen in backend issue #10.

export type CapturePayload = {
  // Snapshot
  pageIndex: number;
  scrollRatio: number;
  timestamp: number;
  hash: string;
  // 1280px-wide JPEG data URL as per spec
  image: string;
};

export type PanelToBackground =
  | { kind: "ignite"; tabId: number }
  | { kind: "capture"; tabId: number };

export type ContentToBackground =
  | { kind: "capture"; payload: CapturePayload };

export type BackgroundToPanel =
  | { kind: "ignited"; uuid: string | null; companionUrl: string; error?: string }
  | { kind: "capture-ingested"; ok: boolean; pendingCount: number; backendReachable: boolean };

export type BackgroundToContent =
  | { kind: "capture-request" };

export type IngestResult = {
  ok: boolean;
  backendReachable: boolean;
  status?: number;
};
