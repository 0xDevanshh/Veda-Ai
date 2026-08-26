import { NextRequest, NextResponse } from "next/server";
import { extractAnswers } from "@/lib/extract-answers";
import { AIBusyError, RATE_LIMIT_WINDOW_FULL } from "@/lib/gemini-client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { answerSheetImages } = body as { answerSheetImages: string[] };

  if (!Array.isArray(answerSheetImages)) {
    return NextResponse.json(
      { error: "answerSheetImages must be an array" },
      { status: 400 }
    );
  }

  try {
    const answers = await extractAnswers(answerSheetImages);
    return NextResponse.json({ answers });
  } catch (error) {
    // Both are capacity conditions, not faults — same signal to the client.
    if (
      error instanceof AIBusyError ||
      (error instanceof Error && error.message === RATE_LIMIT_WINDOW_FULL)
    ) {
      return NextResponse.json({ error: "AI_BUSY" }, { status: 503 });
    }
    console.error("extract-answers failed", error);
    return NextResponse.json(
      { error: "Failed to extract answers from the answer sheet" },
      { status: 500 }
    );
  }
}
