import { inferLabelFromText } from "./questionIdentity";

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
