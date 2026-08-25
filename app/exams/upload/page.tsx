"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { ArrowRight, Check, MousePointer2, Upload } from "lucide-react";
import clsx from "clsx";
import AppShell from "@/components/AppShell";
import { pdfToImages } from "@/lib/pdf-to-image";
import type { SessionData } from "@/lib/types";

export default function UploadPage() {
  const router = useRouter();
  const [questionPaper, setQuestionPaper] = useState<File | null>(null);
  const [answerSheet, setAnswerSheet] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothSelected = Boolean(questionPaper && answerSheet);

  const handleStartMapping = async () => {
    if (!questionPaper || !answerSheet || isProcessing) return;
    setError(null);
    setIsProcessing(true);
    try {
      const [questionPaperImages, answerSheetImages] = await Promise.all([
        pdfToImages(questionPaper),
        pdfToImages(answerSheet),
      ]);

      const session: SessionData = {
        sessionId: uuidv4(),
        questionPaperImages,
        answerSheetImages,
        questions: [],
        extractedAnswers: [],
        mappedAnswers: [],
      };

      sessionStorage.setItem("veda-session", JSON.stringify(session));
      router.push("/exams/processing");
    } catch (err) {
      console.error(err);
      setError("Could not process one of the PDFs. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <AppShell breadcrumb="Exams" collapsed={false}>
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-6 py-12">
        <h1 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
          Upload{" "}
          <span className="rounded-lg bg-orange-100 px-2 py-1 text-orange-600">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-3 text-center text-sm text-gray-500">
          Upload both files to get started
        </p>

        <DecorativeIllustration />

        <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <UploadCard
            highlight="Question Paper"
            file={questionPaper}
            onSelect={setQuestionPaper}
          />
          <UploadCard
            highlight="Answer Sheet"
            file={answerSheet}
            onSelect={setAnswerSheet}
          />
        </div>

        <button
          type="button"
          disabled={!bothSelected || isProcessing}
          onClick={handleStartMapping}
          className={clsx(
            "mt-8 flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors",
            bothSelected && !isProcessing
              ? "bg-black text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-200 text-gray-400"
          )}
        >
          {isProcessing ? "Processing..." : "Start Mapping"}
          <ArrowRight size={16} />
        </button>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <p className="mt-3 text-center text-xs text-gray-400">
          Once both files are uploaded, you&apos;ll able to map answers with
          questions
        </p>
      </div>
    </AppShell>
  );
}

function DecorativeIllustration() {
  return (
    <div className="relative mt-8 flex h-40 w-40 items-center justify-center">
      <div className="absolute h-40 w-40 rounded-full bg-orange-50" />
      <div className="absolute h-32 w-32 rounded-full bg-orange-100/80" />
      <div className="absolute h-24 w-24 rounded-full bg-orange-200/70" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gray-300 text-sm font-semibold text-gray-600 ring-4 ring-white">
        AI
      </div>
      <div className="absolute -bottom-2 right-0 flex items-center gap-1 rounded-full bg-yellow-300 px-2.5 py-1 text-xs font-medium text-gray-800 shadow-sm">
        <MousePointer2 size={12} />
        Anonymous
      </div>
    </div>
  );
}

interface UploadCardProps {
  highlight: string;
  file: File | null;
  onSelect: (file: File) => void;
}

function UploadCard({ highlight, file, onSelect }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onSelect(selected);
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center transition-colors hover:border-orange-300 hover:bg-orange-50/30"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleChange}
      />

      {file ? (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Check size={18} className="text-green-600" />
          </div>
          <p className="max-w-full truncate text-sm font-medium text-gray-800">
            {file.name}
          </p>
        </>
      ) : (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Upload size={18} className="text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-800">
            Upload <span className="text-orange-600">{highlight}</span>
          </p>
          <p className="text-xs text-gray-400">Max 10MB</p>
        </>
      )}
    </button>
  );
}
