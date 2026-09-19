/** Stable identity for extracted questions across captures (pageIndex is often always 0). */

export function slugLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Prefer printed label (`1a`, `2`) so the same question keeps one board when
 * later captures re-extract it. Fall back to a text fingerprint when label is empty.
 */
export function stableQuestionId(label: string, text: string): string {
  const slug = slugLabel(label);
  if (slug.length > 0) return `q-${slug}`;
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return `q-${hash32(normalized).toString(16)}`;
}

/** Pull a printed number/letter like `1`, `1a`, `2.` from the start of question text. */
export function inferLabelFromText(text: string, index: number): string {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(?:question\s*)?(\d+[a-z]?|[a-z])(?=[\.\)\:\s]|$)/i,
  );
  if (match?.[1]) return match[1].toLowerCase();
  return String(index + 1);
}
