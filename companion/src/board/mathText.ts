import katex from "katex";

const WRAPPED_MATH = /^\$([^$]+)\$|\\\((.+?)\\\)|\\\[(.+?)\\\]$/;
const INLINE_CHUNK = /\$([^$]+)\$|\\\((.+?)\\\)|\\\[(.+?)\\\]/g;

export type MathRenderResult =
  | { kind: "html"; html: string }
  | { kind: "plain"; source: string; degraded: true }
  | { kind: "plain"; source: string; degraded?: false };

/** True when the source looks like it contains math syntax. */
export function hasMathSyntax(source: string): boolean {
  return /\$[^$]+\$|\\\(|\\\[|\\[a-zA-Z]+/.test(source);
}

function renderLatex(latex: string): string {
  return katex.renderToString(latex, {
    throwOnError: true,
    displayMode: false,
    trust: false,
    strict: "warn",
  });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * String seam for Board text: KaTeX when math is present; plain otherwise.
 * Malformed LaTeX degrades to plain source with degraded: true (no throw).
 */
export function renderMathText(source: string): MathRenderResult {
  if (!hasMathSyntax(source)) {
    return { kind: "plain", source };
  }

  try {
    const wrapped = source.trim().match(WRAPPED_MATH);
    if (wrapped) {
      const latex = wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? "";
      return { kind: "html", html: renderLatex(latex) };
    }

    if (/\\[a-zA-Z]+/.test(source) && !source.includes("$")) {
      return { kind: "html", html: renderLatex(source) };
    }

    let html = "";
    let last = 0;
    let matched = false;
    INLINE_CHUNK.lastIndex = 0;
    for (const match of source.matchAll(INLINE_CHUNK)) {
      matched = true;
      const index = match.index ?? 0;
      html += escapeHtml(source.slice(last, index));
      const latex = match[1] ?? match[2] ?? match[3] ?? "";
      html += renderLatex(latex);
      last = index + match[0].length;
    }
    if (!matched) {
      return { kind: "html", html: renderLatex(source) };
    }
    html += escapeHtml(source.slice(last));
    return { kind: "html", html };
  } catch {
    return { kind: "plain", source, degraded: true };
  }
}
