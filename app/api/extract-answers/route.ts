import { NextRequest, NextResponse } from "next/server";
import { extractAnswers } from "@/lib/extract-answers";

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
    console.error("extract-answers failed", error);
    return NextResponse.json(
      { error: "Failed to extract answers from the answer sheet" },
      { status: 500 }
    );
  }
}
