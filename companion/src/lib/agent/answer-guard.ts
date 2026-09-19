const FINAL_ANSWER_PATTERNS = [
  /^\s*the answer is\b/i,
  /\banswer\s*[:=]\s*\S/i,
  /\bfinal answer\b/i,
  /\bcorrect answer is\b/i,
];

export function looksLikeFinalAnswer(text: string): boolean {
  return FINAL_ANSWER_PATTERNS.some((p) => p.test(text));
}
