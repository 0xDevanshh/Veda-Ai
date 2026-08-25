"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import clsx from "clsx";
import type { MappedAnswer, SessionData } from "@/lib/types";

const BASE_WIDTH = 640;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

function rowId(m: MappedAnswer): string {
  return m.question ? `q-${m.question.id}` : `ans-${m.answer!.id}`;
}

function parseQuestionNumber(number: string): { main: string; sub: string | null } {
  const match = number.match(/^(\d+)\s*\(([a-zA-Z]+)\)$/);
  if (match) return { main: match[1], sub: match[2] };
  return { main: number, sub: null };
}

function scoreBadgeClasses(verdict: string): string {
  switch (verdict) {
    case "correct":
      return "bg-green-100 text-green-700";
    case "partial":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-red-100 text-red-700";
  }
}

interface ResultViewProps {
  sessionId: string;
}

export default function ResultView({ sessionId }: ResultViewProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError(null);

    fetch(`/api/session/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Session not found");
        return res.json();
      })
      .then((data: SessionData) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this result. Please try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!session) {
    return <ResultSkeleton />;
  }

  return <ResultViewContent session={session} />;
}

function ResultSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:flex-row">
      <div className="flex min-h-0 w-full flex-1 flex-col rounded-xl bg-white p-5 shadow-sm md:h-full md:w-[55%] md:flex-none">
        <div className="flex items-center justify-between">
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-7 w-24 animate-pulse rounded-full bg-gray-200" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
              <div className="h-4 flex-1 animate-pulse rounded bg-gray-200" />
              <div className="h-6 w-12 shrink-0 animate-pulse rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden h-full min-h-0 w-[45%] flex-col rounded-xl bg-white shadow-sm md:flex">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-40 animate-pulse rounded-full bg-gray-200" />
        </div>
        <div className="flex-1 p-5">
          <div className="h-full w-full animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function ResultViewContent({ session }: { session: SessionData }) {
  const questionRows = useMemo(
    () =>
      session.mappedAnswers
        .filter((m) => m.question !== null)
        .sort((a, b) => a.question!.order - b.question!.order),
    [session.mappedAnswers]
  );

  const unmatchedRows = useMemo(
    () => session.mappedAnswers.filter((m) => m.question === null),
    [session.mappedAnswers]
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  // Only meaningful below md, where the two panels are tabbed instead of side by side.
  const [activeTab, setActiveTab] = useState<"questions" | "answer">("questions");

  const allExpanded =
    questionRows.length > 0 && questionRows.every((m) => expandedIds.has(rowId(m)));

  const toggleExpandAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(questionRows.map(rowId)));
  };

  const toggleRow = (m: MappedAnswer) => {
    const id = rowId(m);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedId((current) => (current === id ? null : current));
      } else {
        next.add(id);
        setSelectedId(id);
        // Below md this reveals the highlight without a second tap; at md and
        // above both panels are already visible, so it has no visible effect.
        setActiveTab("answer");
      }
      return next;
    });
  };

  const selected = useMemo(
    () => [...questionRows, ...unmatchedRows].find((m) => rowId(m) === selectedId) ?? null,
    [questionRows, unmatchedRows, selectedId]
  );

  const totalPages = session.answerSheetImages.length;

  useEffect(() => {
    if (!selected?.answer || selected.answer.regions.length === 0) return;
    const firstPage = Math.min(...selected.answer.regions.map((r) => r.page));
    setCurrentPage(firstPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectedPages = useMemo(() => {
    if (!selected?.answer) return new Set<number>();
    return new Set(selected.answer.regions.map((r) => r.page));
  }, [selected]);

  const spansMultiplePages = selectedPages.size > 1;
  const otherPages = Array.from(selectedPages)
    .filter((p) => p !== currentPage)
    .sort((a, b) => a - b);

  const currentPageRegions = useMemo(
    () => selected?.answer?.regions.filter((r) => r.page === currentPage) ?? [],
    [selected, currentPage]
  );

  const selectedLabel = selected?.question ? `Q${selected.question.number}` : "?";
  const hasQuestions = session.questions.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 md:flex-row md:gap-4">
      {/* Mobile-only tab switcher */}
      <div className="flex shrink-0 items-center gap-1 self-center rounded-full bg-gray-100 p-1 md:hidden">
        {(
          [
            { key: "questions", label: "Questions" },
            { key: "answer", label: "Answer Sheet" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-black text-white"
                : "bg-transparent text-gray-500"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={clsx(
          "min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-xl bg-white p-5 shadow-sm md:flex md:h-full md:w-[55%] md:flex-none",
          activeTab === "questions" ? "flex" : "hidden"
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            Extracted Questions (from question paper)
          </h2>
          {hasQuestions && (
            <button
              type="button"
              onClick={toggleExpandAll}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          )}
        </div>

        {!hasQuestions && (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No questions detected — try re-uploading a clearer scan.
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {questionRows.map((m) => {
            const id = rowId(m);
            const isExpanded = expandedIds.has(id);
            const isSelected = selectedId === id;
            const question = m.question!;

            return (
              <div
                key={id}
                onClick={() => toggleRow(m)}
                className={clsx(
                  "cursor-pointer rounded-lg border px-4 py-3 transition-all",
                  isSelected
                    ? "border-[1.5px] border-orange-400 bg-white shadow-sm"
                    : "border-transparent hover:bg-gray-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <QuestionBadge number={question.number} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                    {question.text}
                  </p>
                  {m.grading && (
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        scoreBadgeClasses(m.grading.verdict)
                      )}
                    >
                      {m.grading.marksAwarded}/{m.grading.maxMarks}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={clsx(
                      "shrink-0 text-gray-400 transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>

                {isExpanded && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-bold text-gray-700">AI Feedback</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {m.answer === null ? "Not answered" : m.grading?.feedback}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setUnmatchedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              Unmatched Answers
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
                {unmatchedRows.length}
              </span>
            </span>
            <ChevronDown
              size={16}
              className={clsx(
                "text-gray-400 transition-transform",
                unmatchedOpen && "rotate-180"
              )}
            />
          </button>

          {unmatchedOpen && (
            <div className="flex flex-col gap-2 border-t border-gray-100 px-3 py-3">
              {unmatchedRows.length === 0 && (
                <p className="px-1 py-2 text-xs text-gray-400">No unmatched answers</p>
              )}
              {unmatchedRows.map((m) => {
                const id = rowId(m);
                const isExpanded = expandedIds.has(id);
                const isSelected = selectedId === id;

                return (
                  <div
                    key={id}
                    onClick={() => toggleRow(m)}
                    className={clsx(
                      "cursor-pointer rounded-lg border px-3 py-2.5 transition-all",
                      isSelected
                        ? "border-[1.5px] border-orange-400 bg-white shadow-sm"
                        : "border-transparent hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500">
                        ?
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                        {m.answer!.text}
                      </p>
                      <ChevronDown
                        size={16}
                        className={clsx(
                          "shrink-0 text-gray-400 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>

                    {isExpanded && (
                      <div className="mt-3 rounded-lg bg-gray-50 p-3">
                        <p className="text-xs font-bold text-gray-700">AI Feedback</p>
                        <p className="mt-1 text-sm text-gray-600">
                          No matching question found.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={clsx(
          "min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-xl bg-white shadow-sm md:flex md:h-full md:w-[45%] md:flex-none",
          activeTab === "answer" ? "flex" : "hidden"
        )}
      >
        {/* Mobile-only back-reference to the highlighted question */}
        {selected && (
          <button
            type="button"
            onClick={() => setActiveTab("questions")}
            className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-5 py-2.5 text-left md:hidden"
          >
            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-bold text-white">
              {selectedLabel}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
              Highlighted below
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-gray-600">
              <ChevronLeft size={14} />
              Questions
            </span>
          </button>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Answer Sheet</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-full border border-gray-200 px-1.5 py-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-xs font-medium text-gray-600">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="whitespace-nowrap text-xs font-medium text-gray-600">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {spansMultiplePages && otherPages.length > 0 && (
          <div className="mx-5 mt-3 shrink-0 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            This answer continues on page{otherPages.length > 1 ? "s" : ""}{" "}
            {otherPages.map((p) => p + 1).join(", ")} — page forward to see the rest.
          </div>
        )}

        <div className="flex-1 overflow-auto p-5">
          <div className="mx-auto" style={{ width: `${(BASE_WIDTH * zoom) / 100}px` }}>
            <div className="relative">
              {session.answerSheetImages[currentPage] && (
                <img
                  src={session.answerSheetImages[currentPage]}
                  alt={`Answer sheet page ${currentPage + 1}`}
                  className="w-full rounded-lg border border-gray-100"
                />
              )}
              {currentPageRegions.map((region, index) => (
                <div
                  key={`${selectedId}-${index}`}
                  className="answer-highlight-in absolute border-2 border-green-500 bg-green-400/20"
                  style={{
                    left: `${region.xmin / 10}%`,
                    top: `${region.ymin / 10}%`,
                    width: `${(region.xmax - region.xmin) / 10}%`,
                    height: `${(region.ymax - region.ymin) / 10}%`,
                  }}
                >
                  <span className="absolute -top-2.5 left-0 -translate-y-full rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {selectedLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionBadge({ number }: { number: string }) {
  const { main, sub } = parseQuestionNumber(number);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
        {main}
      </div>
      {sub && <span className="text-xs font-semibold text-gray-500">{sub}.</span>}
    </div>
  );
}
