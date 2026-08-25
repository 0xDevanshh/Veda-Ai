import { callGeminiJSON } from "./gemini-client";
import type { MappedAnswer } from "./types";

const GRADING_SCHEMA_HINT = `Schema: Array<{ verdict: 'correct' | 'partial' | 'incorrect', marksAwarded: number, feedback: string }>`;

function buildGradingPrompt(entries: MappedAnswer[]): string {
  const pairs = entries
    .map((entry, index) => {
      const question = entry.question!;
      const maxMarks = question.maxMarks ?? 10;
      return `[${index}]\nQuestion (maxMarks: ${maxMarks}): ${question.text}\nStudent answer: ${entry.answer!.text}`;
    })
    .join("\n\n");

  return `For each question+student answer pair below, evaluate correctness. Be a fair, consistent grader.
Return JSON array aligned by index: { verdict: 'correct'|'partial'|'incorrect', marksAwarded: number, feedback: string (1-2 sentences, specific, constructive) }.
If maxMarks is given for a question, marksAwarded must be between 0 and maxMarks. If no maxMarks given, grade out of 10.

${pairs}`;
}

export async function gradeAnswers(
  mapped: MappedAnswer[]
): Promise<MappedAnswer[]> {
  const gradable: { entry: MappedAnswer; index: number }[] = [];
  const result: MappedAnswer[] = mapped.map((entry, index) => {
    if (entry.question === null) {
      return entry;
    }

    if (entry.answer === null) {
      return {
        ...entry,
        grading: {
          marksAwarded: 0,
          maxMarks: entry.question.maxMarks ?? 10,
          verdict: "ungraded" as const,
          feedback: "Not answered",
        },
      };
    }

    gradable.push({ entry, index });
    return entry;
  });

  if (gradable.length === 0) {
    return result;
  }

  const prompt = buildGradingPrompt(gradable.map((g) => g.entry));
  const raw = await callGeminiJSON(prompt, [], GRADING_SCHEMA_HINT);

  if (!Array.isArray(raw)) {
    throw new Error("gradeAnswers: expected Gemini to return a JSON array");
  }

  gradable.forEach(({ entry, index }, i) => {
    const grading = raw[i];
    const maxMarks = entry.question!.maxMarks ?? 10;

    if (!grading) {
      result[index] = {
        ...entry,
        grading: {
          marksAwarded: 0,
          maxMarks,
          verdict: "ungraded",
          feedback: "Grading failed",
        },
      };
      return;
    }

    result[index] = {
      ...entry,
      grading: {
        marksAwarded: grading.marksAwarded,
        maxMarks,
        verdict: grading.verdict,
        feedback: grading.feedback,
      },
    };
  });

  return result;
}

export function buildSummary(mapped: MappedAnswer[]): {
  totalAwarded: number;
  totalMax: number;
  answeredCount: number;
  unansweredCount: number;
  unmatchedAnswerCount: number;
} {
  let totalAwarded = 0;
  let totalMax = 0;
  let answeredCount = 0;
  let unansweredCount = 0;
  let unmatchedAnswerCount = 0;

  for (const entry of mapped) {
    if (entry.question === null) {
      unmatchedAnswerCount++;
      continue;
    }

    if (entry.grading) {
      totalAwarded += entry.grading.marksAwarded;
      totalMax += entry.grading.maxMarks;
    }

    if (entry.answer === null) {
      unansweredCount++;
    } else {
      answeredCount++;
    }
  }

  return {
    totalAwarded,
    totalMax,
    answeredCount,
    unansweredCount,
    unmatchedAnswerCount,
  };
}
