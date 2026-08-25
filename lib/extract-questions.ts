import { callGeminiJSON } from "./gemini-client";
import type { Question } from "./types";

const PROMPT = `You are analyzing a scanned exam question paper (may be multiple pages, in order).
Extract EVERY question and every labelled sub-part as a SEPARATE entry, in the exact order they appear in the document.
Rules:
- If a question has sub-parts like (a), (b), (c) — or i, ii, iii — each sub-part is its own entry with number formatted as '11(a)', '11(b)' etc.
- Preserve the original numbering exactly as printed, including any prefixes (Q1, Question 2, 3.), but normalize the stored 'number' field to just the number+subpart, e.g. '11(a)'.
- Include the full question text.
- If marks are printed (e.g. '[5 marks]', '(10)'), extract as maxMarks (integer). Omit if not present.
- Do not skip questions even if they look similar or repeated.
Return JSON array of: { number, text, maxMarks }`;

const SCHEMA_HINT = `Schema: Array<{ number: string, text: string, maxMarks?: number }>`;

function slugify(number: string): string {
  return number
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(number: string): string {
  return number.toLowerCase().replace(/[\s()]/g, "");
}

export async function extractQuestions(
  questionPaperImages: string[]
): Promise<Question[]> {
  const raw = await callGeminiJSON(PROMPT, questionPaperImages, SCHEMA_HINT);

  if (!Array.isArray(raw)) {
    throw new Error("extractQuestions: expected Gemini to return a JSON array");
  }

  return raw.map((item, index) => ({
    id: slugify(item.number),
    number: item.number,
    normalizedNumber: normalize(item.number),
    text: item.text,
    maxMarks: typeof item.maxMarks === "number" ? item.maxMarks : undefined,
    order: index,
  }));
}
