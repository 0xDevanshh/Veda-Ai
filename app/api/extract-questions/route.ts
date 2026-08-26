import { NextRequest, NextResponse } from "next/server";
import { extractQuestions } from "@/lib/extract-questions";
import { RATE_LIMIT_WINDOW_FULL } from "@/lib/gemini-client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { questionPaperImages } = body as { questionPaperImages: string[] };

  if (!Array.isArray(questionPaperImages)) {
    return NextResponse.json(
      { error: "questionPaperImages must be an array" },
      { status: 400 }
    );
  }

  try {
    const questions = await extractQuestions(questionPaperImages);
    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof Error && error.message === RATE_LIMIT_WINDOW_FULL) {
      return NextResponse.json(
        { error: "AI service busy, please try again in a few seconds" },
        { status: 503 }
      );
    }
    console.error("extract-questions failed", error);
    return NextResponse.json(
      { error: "Failed to extract questions from the question paper" },
      { status: 500 }
    );
  }
}
