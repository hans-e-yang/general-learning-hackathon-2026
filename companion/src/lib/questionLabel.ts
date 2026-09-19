export function normalizeQuestionLabel(
  raw: string | undefined | null,
  index: number,
): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, "");
  if (collapsed.length > 0) return collapsed;
  return String(index + 1);
}
