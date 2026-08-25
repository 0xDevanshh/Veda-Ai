"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import type { SessionData } from "@/lib/types";

export default function ProcessingPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const runProcessing = useCallback(async () => {
    setFailed(false);
    try {
      const raw = sessionStorage.getItem("veda-session");
      if (!raw) throw new Error("No session data found");
      const session: SessionData = JSON.parse(raw);

      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionPaperImages: session.questionPaperImages,
          answerSheetImages: session.answerSheetImages,
        }),
      });

      if (!response.ok) throw new Error("Processing request failed");

      const { sessionId } = await response.json();
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
          {failed ? <ErrorState onRetry={runProcessing} /> : <LoadingState />}
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
    <div className="relative flex h-20 w-20 items-center justify-center">
      <Sparkles
        size={56}
        className="animate-pulse text-orange-500"
        strokeWidth={1.5}
      />
      <Sparkles
        size={20}
        className="absolute -right-1 top-1 animate-pulse text-orange-400 [animation-delay:200ms]"
        strokeWidth={1.5}
      />
      <Sparkles
        size={14}
        className="absolute bottom-1 left-0 animate-pulse text-orange-300 [animation-delay:400ms]"
        strokeWidth={1.5}
      />
    </div>
  );
}
