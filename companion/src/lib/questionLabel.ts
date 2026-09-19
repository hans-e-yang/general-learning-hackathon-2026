import { inferLabelFromText, slugLabel } from "./questionIdentity";

export function normalizeQuestionLabel(
  raw: string | undefined | null,
  index: number,
  text?: string,
): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, "");
  if (collapsed.length > 0) return collapsed;
  if (text && text.trim().length > 0) return inferLabelFromText(text, index);
  return String(index + 1);
}

type LabelSource = { label?: string; text: string };

function exerciseNumberInText(text: string): number | null {
  const match = text.match(/(?:exercise|problem|question)\s*(\d+)/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function subpartLetter(text: string, raw: string): string | null {
  if (/^[a-z]$/i.test(raw)) return raw.toLowerCase();
  // "a)" or "b." at start of text or after a newline (under an Exercise header)
  const match = text.match(/(?:^|\n)\s*([a-z])[\)\.](?=\s|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Turn model/raw labels into board soft titles that match printed structure:
 * Exercise 1 + a)/b) → 1a, 1b (not bare 1, 2, 3).
 */
export function composeQuestionLabels(items: LabelSource[]): string[] {
  let exercise = 0;
  return items.map((item, index) => {
    const text = item.text.trim();
    const raw = slugLabel(item.label ?? "");

    const fromText = exerciseNumberInText(text);
    if (fromText !== null) exercise = fromText;

    // Already composite: 1a, 2b
    if (/^\d+[a-z]$/i.test(raw)) {
      exercise = Number.parseInt(raw, 10);
      return raw.toLowerCase();
    }

    const letter = subpartLetter(text, raw);

    // Bare exercise number, or exercise header with no sub-part
    if (/^\d+$/.test(raw) || (fromText !== null && !letter && !raw)) {
      if (/^\d+$/.test(raw)) exercise = Number.parseInt(raw, 10);
      if (letter) {
        if (exercise < 1) exercise = 1;
        return `${exercise}${letter}`;
      }
      return String(exercise > 0 ? exercise : normalizeQuestionLabel(raw, index, text));
    }

    if (letter) {
      if (exercise < 1) exercise = 1;
      return `${exercise}${letter}`;
    }

    // "1a)" glued at the start
    const glued = text.match(/^(\d+)([a-z])\b/i);
    if (glued) {
      exercise = Number.parseInt(glued[1], 10);
      return `${exercise}${glued[2].toLowerCase()}`;
    }

    return normalizeQuestionLabel(item.label, index, text);
  });
}
