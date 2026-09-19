// Message contract for the panel ⇄ background flow. Discriminated unions on
// `kind` so every hop type-narrows; the config-seam equivalents (payload + SSE
// shapes) are frozen in backend issue #10.

export type CapturePayload = {
  // Snapshot
  pageIndex: number;
  scrollRatio: number;
  timestamp: number;
  // 16-hex average hash (see hash.ts), matching the frozen #10 contract.
  hash: string;
  // 1280px-wide JPEG q≈0.7, bare base64 (no `data:` prefix) per spec.
  image: string;
};

export type PanelToBackground =
  | { kind: "ignite" }
  | { kind: "capture" }
  | { kind: "stop" };

export type BackgroundToPanel =
  | { kind: "ignited"; uuid: string | null; companionUrl: string; error?: string }
  | { kind: "capture-ingested"; ok: boolean; pendingCount: number; backendReachable: boolean };

export type IngestResult = {
  ok: boolean;
  backendReachable: boolean;
  status?: number;
};
