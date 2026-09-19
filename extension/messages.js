// Message contract for the panel ⇄ background flow. Discriminated unions on
// `kind` so every hop type-narrows; the config-seam equivalents (payload + SSE
// shapes) are frozen in backend issue #10.
export {};
