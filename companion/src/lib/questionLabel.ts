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

export interface QuestionOrderKey {
  /** Leading problem number, if the label has one (e.g. 1 in "1a"). */
  number: number | null;
  /** Sub-part letter, lowercased (e.g. "a" in "1a"); "" when absent. */
  letter: string;
  /** Normalized whole label, used as the final tie-breaker. */
  text: string;
}

/** Split a problem label ("1a", "12", "b", "1a.iii") into sortable parts. */
export function parseQuestionLabel(label: string): QuestionOrderKey {
  const trimmed = label.trim().toLowerCase();
  const numbered = trimmed.match(/^(\d+)\s*([a-z])?/);
  if (numbered) {
    return {
      number: Number.parseInt(numbered[1], 10),
      letter: numbered[2] ?? "",
      text: trimmed,
    };
  }
  const lettered = trimmed.match(/^([a-z])/);
  if (lettered) {
    return { number: null, letter: lettered[1], text: trimmed };
  }
  return { number: null, letter: "", text: trimmed };
}

/**
 * Natural problem order: numeric before alphabetic, then by number, then by
 * sub-part letter, then label text. So 1 < 1a < 1b < 2 < 10 (not "1, 10, 2").
 * Unnumbered labels (e.g. "iv") sort after numbered ones, alphabetically.
 */
export function compareQuestionLabels(a: string, b: string): number {
  const ka = parseQuestionLabel(a);
  const kb = parseQuestionLabel(b);

  if (ka.number !== null && kb.number !== null) {
    if (ka.number !== kb.number) return ka.number - kb.number;
    if (ka.letter !== kb.letter) return ka.letter < kb.letter ? -1 : 1;
  } else if (ka.number !== null) {
    return -1;
  } else if (kb.number !== null) {
    return 1;
  } else if (ka.letter !== kb.letter) {
    return ka.letter < kb.letter ? -1 : 1;
  }

  return ka.text < kb.text ? -1 : ka.text > kb.text ? 1 : 0;
}

/** Stable sort of labeled items into natural problem order. */
export function sortQuestionItems<T extends { label: string }>(
  items: readonly T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (x, y) =>
        compareQuestionLabels(x.item.label, y.item.label) || x.index - y.index,
    )
    .map(({ item }) => item);
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
