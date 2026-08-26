import { NextRequest, NextResponse } from "next/server";
import { buildMappedAnswers } from "@/lib/match-answers";
import type { ExtractedAnswer, Question } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { questions, answers } = body as {
    questions: Question[];
    answers: ExtractedAnswer[];
  };

  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    return NextResponse.json(
      { error: "questions and answers must be arrays" },
      { status: 400 }
    );
  }

  try {
    const { mapped } = await buildMappedAnswers(questions, answers);
    return NextResponse.json({ mapped });
  } catch (error) {
    console.error("map-answers failed", error);
    return NextResponse.json(
      { error: "Failed to map answers to questions" },
      { status: 500 }
    );
  }
}
