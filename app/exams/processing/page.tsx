"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import starIcon from "../../star_icon.png";
import { clearPendingSession, loadPendingSession } from "@/lib/pending-session";

export default function ProcessingPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const runProcessing = useCallback(async () => {
    setFailed(false);
    try {
      const session = await loadPendingSession();
      if (!session) throw new Error("No session data found");

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
