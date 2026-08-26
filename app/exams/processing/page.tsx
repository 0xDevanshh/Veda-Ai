"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import { AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import starIcon from "../../star_icon.png";
import {
  clearPendingSession,
  loadPendingSession,
  saveCompletedSession,
} from "@/lib/pending-session";
import type {
  ExtractedAnswer,
  MappedAnswer,
  Question,
  SessionSummary,
} from "@/lib/types";

const STEP_LABELS = [
  "Reading the question paper and answer sheet...",
  "Matching answers to questions...",
  "Grading answers...",
] as const;

async function postStep<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((data) => data?.error)
      .catch(() => null);
    throw new Error(detail ?? `${path} failed`);
  }

  return response.json();
}

export default function ProcessingPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);

  const runProcessing = useCallback(async () => {
    setFailed(false);
    setStep(0);
    try {
      const session = await loadPendingSession();
      if (!session) throw new Error("No session data found");

      // Each round-trip makes at most one Gemini call, so no single function
      // invocation runs long enough to hit the platform's 60s ceiling. The two
      // extractions don't depend on each other, so they go out together.
      const [{ questions }, { answers }] = await Promise.all([
        postStep<{ questions: Question[] }>("/api/extract-questions", {
          questionPaperImages: session.questionPaperImages,
        }),
        postStep<{ answers: ExtractedAnswer[] }>("/api/extract-answers", {
          answerSheetImages: session.answerSheetImages,
        }),
      ]);

      setStep(1);
      const { mapped } = await postStep<{ mapped: MappedAnswer[] }>(
        "/api/map-answers",
        { questions, answers }
      );

      setStep(2);
      const graded = await postStep<{
        mapped: MappedAnswer[];
        summary: SessionSummary;
      }>("/api/grade", { mapped });

      const sessionId = uuidv4();
      await saveCompletedSession({
        ...session,
        sessionId,
        questions,
        extractedAnswers: answers,
        mappedAnswers: graded.mapped,
        summary: graded.summary,
      });

      await clearPendingSession();
      router.push(`/exams/result/${sessionId}`);
    } catch (err) {
      console.error(err);
      setFailed(true);
    }
  }, [router]);

  useEffect(() => {
    runProcessing();
  }, [runProcessing]);

  return (
    <AppShell breadcrumb="Exams" collapsed>
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex h-full max-h-[560px] w-full max-w-[720px] flex-col items-center justify-center rounded-xl bg-white p-16 shadow-sm">
          {failed ? <ErrorState onRetry={runProcessing} /> : <LoadingState step={step} />}
        </div>
      </div>
    </AppShell>
  );
}

function LoadingState({ step }: { step: number }) {
  return (
    <>
      <SparkleBurst />
      <p className="mt-8 text-center text-2xl font-bold text-gray-900">
        {STEP_LABELS[step] ?? "Extracting..."}
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Step {step + 1} of {STEP_LABELS.length} — this may take a while
      </p>
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-red-100" />
        <AlertTriangle size={36} className="relative text-red-500" />
      </div>
      <p className="mt-8 text-2xl font-bold text-gray-900">
        Something went wrong
      </p>
      <p className="mt-2 text-sm text-gray-500">
        We couldn&apos;t finish processing your files
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Retry
      </button>
    </>
  );
}

function SparkleBurst() {
  return (
    <Image
      src={starIcon}
      alt=""
      width={84}
      height={88}
      priority
      className="sparkle-pulse"
    />
  );
}
