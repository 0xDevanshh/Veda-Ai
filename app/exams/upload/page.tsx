"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ladyIllustration from "@/app/lady.png";
import { v4 as uuidv4 } from "uuid";
import { ArrowRight, Check, Upload } from "lucide-react";
import clsx from "clsx";
import AppShell from "@/components/AppShell";
import { fileToPageImages } from "@/lib/pdf-to-images";
import { savePendingSession } from "@/lib/pending-session";
import type { SessionData } from "@/lib/types";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PAGES = 15;

function oversizedFile(files: File[]): File | undefined {
  return files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
}

export default function UploadPage() {
  const router = useRouter();
  const [questionPaper, setQuestionPaper] = useState<File | null>(null);
  const [answerSheets, setAnswerSheets] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothSelected = Boolean(questionPaper && answerSheets.length > 0);

  const handleSelectQuestionPaper = (files: File[]) => {
    const oversized = oversizedFile(files);
    if (oversized) {
      setError(`"${oversized.name}" is larger than 8MB. Please upload a smaller file.`);
      return;
    }
    setError(null);
    setQuestionPaper(files[0] ?? null);
  };

  const handleSelectAnswerSheets = (files: File[]) => {
    const oversized = oversizedFile(files);
    if (oversized) {
      setError(`"${oversized.name}" is larger than 8MB. Please upload a smaller file.`);
      return;
    }
    setError(null);
    setAnswerSheets(files);
  };

  const handleStartMapping = async () => {
    if (!questionPaper || answerSheets.length === 0 || isProcessing) return;
    setError(null);
    setIsProcessing(true);
    try {
      const [questionPaperImages, answerSheetImagesPerFile] = await Promise.all([
        fileToPageImages(questionPaper),
        Promise.all(answerSheets.map((file) => fileToPageImages(file))),
      ]);
      const answerSheetImages = answerSheetImagesPerFile.flat();

      const totalPages = questionPaperImages.length + answerSheetImages.length;
      if (totalPages > MAX_TOTAL_PAGES) {
        setError(
          `These files add up to ${totalPages} pages — please keep uploads to ${MAX_TOTAL_PAGES} pages or fewer.`
        );
        setIsProcessing(false);
        return;
      }

      const session: SessionData = {
        sessionId: uuidv4(),
        questionPaperImages,
        answerSheetImages,
        questions: [],
        extractedAnswers: [],
        mappedAnswers: [],
      };

      await savePendingSession(session);
      router.push("/exams/processing");
    } catch (err) {
      console.error(err);
      setError("Could not process one of the files. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <AppShell breadcrumb="Exams" collapsed={false}>
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-8 md:px-6 md:py-12">
        <h1 className="text-center text-xl font-bold leading-snug text-gray-900 md:text-3xl md:leading-tight">
          Upload{" "}
          <span className="rounded-lg bg-orange-100 px-2 py-1 text-orange-600">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-3 text-center text-sm text-gray-500">
          Upload both files to get started
        </p>

        <DecorativeIllustration />

        <div className="mt-8 flex w-full flex-col gap-4 md:flex-row md:[&>*]:flex-1">
          <UploadCard
            highlight="Question Paper"
            files={questionPaper ? [questionPaper] : []}
            onSelect={handleSelectQuestionPaper}
          />
          <UploadCard
            highlight="Answer Sheet"
            multiple
            files={answerSheets}
            onSelect={handleSelectAnswerSheets}
          />
        </div>

        <button
          type="button"
          disabled={!bothSelected || isProcessing}
          onClick={handleStartMapping}
          className={clsx(
            "mt-8 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium transition-colors md:w-auto md:py-3",
            bothSelected && !isProcessing
              ? "bg-black text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-200 text-gray-400"
          )}
        >
          {isProcessing ? "Processing..." : "Start Mapping"}
          <ArrowRight size={22} />
        </button>

        {error && (
          <p className="mt-3 text-center text-sm text-red-500">{error}</p>
        )}

        <p className="mt-3 max-w-[420px] text-center text-sm text-gray-400">
          Once both files are uploaded, you&apos;ll able to map answers with
          questions
        </p>
      </div>
    </AppShell>
  );
}

function DecorativeIllustration() {
  return (
    <div
      aria-hidden
      className="mt-6 flex items-center justify-center gap-3 md:mt-8 md:gap-0"
    >
      <div className="relative flex h-28 w-28 shrink-0 items-center justify-center md:h-40 md:w-40">
        <Image
          src={ladyIllustration}
          alt=""
          priority
          className="h-full w-full object-contain"
        />

        {/* Desktop: pill floats over the lower-right of the circle */}
        
      </div>

      {/* Mobile: pill sits beside the circle so it can't clip off-screen */}
      
        
        
      
    </div>
  );
}

interface UploadCardProps {
  highlight: string;
  files: File[];
  multiple?: boolean;
  onSelect: (files: File[]) => void;
}

function UploadCard({ highlight, files, multiple, onSelect }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) onSelect(selected);
  };

  const hasFiles = files.length > 0;

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center transition-colors hover:border-orange-300 hover:bg-orange-50/30"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />

      {hasFiles ? (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Check size={18} className="text-green-600" />
          </div>
          <p className="max-w-full truncate text-sm font-medium text-gray-800">
            {files.length === 1
              ? files[0].name
              : `${files.length} files selected`}
          </p>
        </>
      ) : (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Upload size={18} className="text-gray-500" />
          </div>
          <p className="text-lg font-medium text-gray-800">
            Upload <span className="text-orange-600">{highlight}</span>
          </p>
          <p className="text-base text-gray-400">Max 10MB</p>
        </>
      )}
    </button>
  );
}
