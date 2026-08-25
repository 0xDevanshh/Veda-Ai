import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { extractQuestions } from "@/lib/extract-questions";
import { extractAnswers } from "@/lib/extract-answers";
import { buildMappedAnswers } from "@/lib/match-answers";
import { gradeAnswers, buildSummary } from "@/lib/grade-answers";
import { setSession } from "@/lib/session-store";
import type { Question, ExtractedAnswer, MappedAnswer } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { questionPaperImages, answerSheetImages } = body as {
    questionPaperImages: string[];
    answerSheetImages: string[];
  };

  if (!Array.isArray(questionPaperImages) || !Array.isArray(answerSheetImages)) {
    return NextResponse.json(
      { error: "questionPaperImages and answerSheetImages must be arrays" },
      { status: 400 }
    );
  }

  const sessionId = uuidv4();

  let questions: Question[];
  try {
    questions = await extractQuestions(questionPaperImages);
  } catch (error) {
    console.error("process: extractQuestions failed", error);
    return NextResponse.json(
      { error: "Failed to extract questions from the question paper" },
      { status: 500 }
    );
  }

  let answers: ExtractedAnswer[];
  try {
    answers = await extractAnswers(answerSheetImages);
  } catch (error) {
    console.error("process: extractAnswers failed", error);
    return NextResponse.json(
      { error: "Failed to extract answers from the answer sheet" },
      { status: 500 }
    );
  }

  let mapped: MappedAnswer[];
  try {
    ({ mapped } = await buildMappedAnswers(questions, answers));
  } catch (error) {
    console.error("process: buildMappedAnswers failed", error);
    return NextResponse.json(
      { error: "Failed to map answers to questions" },
      { status: 500 }
    );
  }

  let graded: MappedAnswer[];
  try {
    graded = await gradeAnswers(mapped);
  } catch (error) {
    console.error("process: gradeAnswers failed", error);
    return NextResponse.json(
      { error: "Failed to grade answers" },
      { status: 500 }
    );
  }

  const summary = buildSummary(graded);

  setSession({
    sessionId,
    questionPaperImages,
    answerSheetImages,
    questions,
    extractedAnswers: answers,
    mappedAnswers: graded,
    summary,
  });

  return NextResponse.json({ sessionId });
}
