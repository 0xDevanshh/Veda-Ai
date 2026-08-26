import { NextRequest, NextResponse } from "next/server";
import { extractQuestions } from "@/lib/extract-questions";
import { AIBusyError, RATE_LIMIT_WINDOW_FULL } from "@/lib/gemini-client";

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
    // Both are capacity conditions, not faults — same signal to the client.
    if (
      error instanceof AIBusyError ||
      (error instanceof Error && error.message === RATE_LIMIT_WINDOW_FULL)
    ) {
      return NextResponse.json({ error: "AI_BUSY" }, { status: 503 });
    }
    console.error("extract-questions failed", error);
    return NextResponse.json(
      { error: "Failed to extract questions from the question paper" },
      { status: 500 }
    );
  }
}
