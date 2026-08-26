import { NextRequest, NextResponse } from "next/server";
import { gradeAnswers, buildSummary } from "@/lib/grade-answers";
import { AIBusyError, RATE_LIMIT_WINDOW_FULL } from "@/lib/gemini-client";
import type { MappedAnswer } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { mapped } = body as { mapped: MappedAnswer[] };

  if (!Array.isArray(mapped)) {
    return NextResponse.json({ error: "mapped must be an array" }, { status: 400 });
  }

  try {
    const graded = await gradeAnswers(mapped);
    return NextResponse.json({ mapped: graded, summary: buildSummary(graded) });
  } catch (error) {
    if (
      error instanceof AIBusyError ||
      (error instanceof Error && error.message === RATE_LIMIT_WINDOW_FULL)
    ) {
      return NextResponse.json({ error: "AI_BUSY" }, { status: 503 });
    }
    console.error("grade failed", error);
    return NextResponse.json({ error: "Failed to grade answers" }, { status: 500 });
  }
}
