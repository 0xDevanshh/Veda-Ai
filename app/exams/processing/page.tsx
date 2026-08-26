"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import { AlertTriangle, Clock } from "lucide-react";
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

/** Thrown when a route reports 503 { error: "AI_BUSY" } — capacity, not a fault. */
class AIBusyResponse extends Error {
  constructor() {
    super("AI_BUSY");
    this.name = "AIBusyResponse";
  }
}

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
    if (response.status === 503 && detail === "AI_BUSY") {
      throw new AIBusyResponse();
    }
    throw new Error(detail ?? `${path} failed`);
  }

  return response.json();
}

/** Results already earned, so a retry resumes rather than restarting. */
interface PipelineCache {
  questions?: Question[];
  answers?: ExtractedAnswer[];
  mapped?: MappedAnswer[];
  graded?: { mapped: MappedAnswer[]; summary: SessionSummary };
}

type Phase = "loading" | "busy" | "error";

export default function ProcessingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const cache = useRef<PipelineCache>({});

  const runProcessing = useCallback(async () => {
    setPhase("loading");
    const done = cache.current;
    try {
      const session = await loadPendingSession();
      if (!session) throw new Error("No session data found");

      // Each round-trip makes at most one Gemini call, so no single function
      // invocation runs long enough to hit the platform's 60s ceiling. The two
      // extractions don't depend on each other, so they go out together. Each
      // caches on success, so if only one fails a retry re-runs just that one.
      const [questions, answers] = await Promise.all([
        done.questions ??
          postStep<{ questions: Question[] }>("/api/extract-questions", {
            questionPaperImages: session.questionPaperImages,
          }).then((r) => (done.questions = r.questions)),
        done.answers ??
          postStep<{ answers: ExtractedAnswer[] }>("/api/extract-answers", {
            answerSheetImages: session.answerSheetImages,
          }).then((r) => (done.answers = r.answers)),
      ]);

      const mapped =
        done.mapped ??
        (done.mapped = (
          await postStep<{ mapped: MappedAnswer[] }>("/api/map-answers", {
            questions,
            answers,
          })
        ).mapped);

      const graded =
        done.graded ??
        (done.graded = await postStep<{
          mapped: MappedAnswer[];
          summary: SessionSummary;
        }>("/api/grade", { mapped }));

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
      setPhase(err instanceof AIBusyResponse ? "busy" : "error");
    }
  }, [router]);

  useEffect(() => {
    runProcessing();
  }, [runProcessing]);

  return (
    <AppShell breadcrumb="Exams" collapsed>
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex h-full max-h-[560px] w-full max-w-[720px] flex-col items-center justify-center rounded-xl bg-white p-16 shadow-sm">
          {phase === "loading" && <LoadingState />}
          {phase === "busy" && <AIBusyState onRetry={runProcessing} />}
          {phase === "error" && <ErrorState onRetry={runProcessing} />}
        </div>
      </div>
    </AppShell>
  );
}

function LoadingState() {
  return (
    <>
      <SparkleBurst />
      <p className="mt-8 text-2xl font-bold text-gray-900">Extracting...</p>
      <p className="mt-2 text-sm text-gray-500">This may take a while</p>
    </>
  );
}

function AIBusyState({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-amber-100" />
        <Clock size={36} className="relative text-amber-500" />
      </div>
      <p className="mt-8 text-center text-2xl font-bold text-gray-900">
        The AI model is receiving high demand right now 😅
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        Please try again in a minute.
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
