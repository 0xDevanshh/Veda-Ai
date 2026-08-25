import { callGeminiJSON } from "./gemini-client";
import type { ExtractedAnswer, MappedAnswer, Question } from "./types";

export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/question\s*/g, "")
    .replace(/q\.?\s*/g, "")
    .replace(/[\s()[\]]/g, "");
}

export function matchByLabel(
  questions: Question[],
  answers: ExtractedAnswer[]
): {
  matched: MappedAnswer[];
  unmatchedAnswers: ExtractedAnswer[];
  unmatchedQuestions: Question[];
} {
  const questionsByNormalized = new Map<string, Question>();
  for (const question of questions) {
    questionsByNormalized.set(question.normalizedNumber, question);
  }

  const matched: MappedAnswer[] = [];
  const unmatchedAnswers: ExtractedAnswer[] = [];
  const matchedQuestionIds = new Set<string>();

  for (const answer of answers) {
    if (answer.detectedLabel === null) {
      unmatchedAnswers.push(answer);
      continue;
    }

    const normalized = normalizeLabel(answer.detectedLabel);
    const question = questionsByNormalized.get(normalized);

    if (!question) {
      unmatchedAnswers.push(answer);
      continue;
    }

    matchedQuestionIds.add(question.id);
    matched.push({
      question,
      answer,
      matchConfidence: "label",
    });
  }

  const unmatchedQuestions = questions.filter(
    (question) => !matchedQuestionIds.has(question.id)
  );

  return { matched, unmatchedAnswers, unmatchedQuestions };
}

const SEMANTIC_SCHEMA_HINT = `Schema: Array<{ questionNumber: string, answerIndex: number, confident: boolean }>`;

function buildSemanticPrompt(
  questions: Question[],
  answers: ExtractedAnswer[]
): string {
  const questionsList = questions
    .map((q) => `- ${q.number}: ${q.text}`)
    .join("\n");
  const answersList = answers
    .map((a, index) => `- [${index}]: ${a.text}`)
    .join("\n");

  return `Given these unanswered exam questions and these unlabeled student answer fragments, determine which fragment (if any) is most likely answering which question, based on content. Only match if reasonably confident — a fragment can be left unmatched if it doesn't correspond to any question (e.g. rough work, or an answer to a question not in this list). Return JSON array of: { questionNumber, answerIndex, confident: boolean }. Only include entries where confident is true.

Questions:
${questionsList}

Answer fragments:
${answersList}`;
}

export async function matchBySemantics(
  unmatchedQuestions: Question[],
  unmatchedAnswers: ExtractedAnswer[]
): Promise<{ matched: MappedAnswer[]; stillUnmatchedAnswers: ExtractedAnswer[] }> {
  if (unmatchedQuestions.length === 0 || unmatchedAnswers.length === 0) {
    return { matched: [], stillUnmatchedAnswers: unmatchedAnswers };
  }

  const prompt = buildSemanticPrompt(unmatchedQuestions, unmatchedAnswers);
  const raw = await callGeminiJSON(prompt, [], SEMANTIC_SCHEMA_HINT);

  if (!Array.isArray(raw)) {
    throw new Error("matchBySemantics: expected Gemini to return a JSON array");
  }

  const questionsByNumber = new Map<string, Question>();
  for (const question of unmatchedQuestions) {
    questionsByNumber.set(question.number, question);
  }

  const matched: MappedAnswer[] = [];
  const matchedAnswerIndexes = new Set<number>();

  for (const entry of raw) {
    if (!entry.confident) continue;

    const question = questionsByNumber.get(entry.questionNumber);
    const answer = unmatchedAnswers[entry.answerIndex];
    if (!question || !answer) continue;
    if (matchedAnswerIndexes.has(entry.answerIndex)) continue;

    matchedAnswerIndexes.add(entry.answerIndex);
    matched.push({
      question,
      answer,
      matchConfidence: "semantic",
    });
  }

  const stillUnmatchedAnswers = unmatchedAnswers.filter(
    (_, index) => !matchedAnswerIndexes.has(index)
  );

  return { matched, stillUnmatchedAnswers };
}

export async function buildMappedAnswers(
  questions: Question[],
  answers: ExtractedAnswer[]
): Promise<{ mapped: MappedAnswer[] }> {
  const labelResult = matchByLabel(questions, answers);

  const semanticResult = await matchBySemantics(
    labelResult.unmatchedQuestions,
    labelResult.unmatchedAnswers
  );

  const matchedQuestionIds = new Set(
    semanticResult.matched.map((m) => m.question!.id)
  );
  const remainingUnmatchedQuestions = labelResult.unmatchedQuestions.filter(
    (question) => !matchedQuestionIds.has(question.id)
  );

  const mapped: MappedAnswer[] = [
    ...labelResult.matched,
    ...semanticResult.matched,
    ...remainingUnmatchedQuestions.map((question) => ({
      question,
      answer: null,
      matchConfidence: "none" as const,
    })),
    ...semanticResult.stillUnmatchedAnswers.map((answer) => ({
      question: null,
      answer,
      matchConfidence: "none" as const,
    })),
  ];

  return { mapped };
}
