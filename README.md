# VedaAI — Answer Sheet Grader

An AI-powered tool that lets a teacher upload a question paper and a student's handwritten answer sheet, automatically extracts questions and answers, maps each answer to its question, highlights the **exact region** on the answer sheet, and grades it with AI-generated feedback — all side by side in one view.


---

## Live Demo

- **App:** `https://veda-ai-blue-gamma.vercel.app/`
- **Repo:** `https://github.com/0xDevanshh/Veda-Ai`

---

## Core Flow

```
Question Paper Upload ─┐
                        ├──► Question Extraction ──► Answer Mapping ──► Grading & Feedback ──► Result View
Answer Sheet Upload ────┘         │                        │
                                   └──► Answer Extraction ──┘
```

1. **Question Extraction** — every question and labelled sub-part (e.g. `11(a)`, `11(b)`) is extracted from the question paper, in printed order, with original numbering preserved.
2. **Answer Extraction** — every distinct handwritten answer block on the answer sheet is transcribed, along with the label the student wrote (if any) and its **exact bounding box region** on the page (supports multi-page answers).
3. **Answer Mapping** — answers are matched to questions in two passes:
   - **Label match** — normalizes labels like `"Q11 a)"` vs `"11(a)"` and matches exactly.
   - **Semantic fallback** — for unlabelled or ambiguous answers, a second AI pass matches by content.
   - Anything left over becomes an explicit **unanswered question** or **unmatched answer** — never silently dropped.
4. **Grading & Feedback** — each matched question–answer pair is graded (marks, correct/partial/incorrect verdict, short feedback), and an overall summary is generated.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | API routes + frontend in one deployable unit |
| Styling | Tailwind CSS | Fast to match the Figma design system exactly |
| PDF → Image | `pdfjs-dist` (client-side) | Avoids server-side PDF rendering entirely; every upload (PDF or photo) is normalized into a flat list of page images before any AI call |
| AI model | Gemini (`gemini-2.0-flash` family, via `@google/genai`) | Only free-tier-accessible model family with usable **bounding-box grounding** on images — required for exact-region highlighting on handwriting |
| Storage | In-memory only | No DB required per assignment constraints; session data is passed straight through to the browser rather than persisted server-side (see [Architecture Notes](#architecture-notes)) |
| Deployment | Vercel | Zero-config deploy for both frontend and `/api/*` serverless routes |

---

## Getting Started Locally

```bash
git clone https://github.com/<your-username>/veda-ai.git
cd veda-ai
npm install
cp .env.local.example .env.local
```

Add your Gemini API key to `.env.local`:

```
GEMINI_API_KEY=your_key_here
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Test Files

Two sample files are included under `/test-files` (or attached separately) for evaluation without needing a real scanned exam:

- `question_paper.pdf` — a clean, printed 15-question biology paper, including a numbered sub-part (`11(a)` / `11(b)`) to test sub-part handling.
- `answer_sheet.pdf` — a simulated handwritten (blue pen, ruled paper) 2-page answer sheet, deliberately constructed to exercise every required edge case:

| Edge case | How it's represented |
|---|---|
| Answered out of order | Page 1 opens with **Q2**, before Q1 |
| Answer spans multiple pages | **Q4** starts on page 1, continues as "Q4 (contd.)" on page 2 |
| Label doesn't match paper's exact format | Student writes `"Q11 a)"` where the paper prints `"11(a)"` |
| Unlabelled answer (should not match anything) | A rough scratch calculation with no question label |
| Labelled answer that matches no question | `"Q15."` — the paper only goes up to Q14 |
| Never answered | Q5, Q6, Q7, Q8, Q10, Q12, Q13, Q14 are left blank |

---

## Architecture Notes

**Why session data isn't stored server-side between requests.**
On Vercel, serverless functions don't guarantee the same warm container across two separate requests. An in-memory `Map` populated by `POST /api/process` is not reliably readable by a later `GET /api/session/[id]` call — it may land on a fresh container with an empty map. To avoid an intermittent, hard-to-reproduce bug, `/api/process` returns the full processed result in its response, and the client holds it (via `sessionStorage`) for the result page — "in-memory" storage in the sense the assignment intends, just living in the browser tab rather than a server process that isn't guaranteed to persist.

**Why bounding boxes are normalized to a 0–1000 coordinate system.**
Gemini returns bounding boxes in a normalized `[0, 1000]` range per axis, independent of the image's actual pixel dimensions. The highlight overlay converts this directly to CSS percentages (`value / 10 = %`), so the highlighted region stays correctly positioned regardless of how the answer sheet image is scaled or zoomed in the UI — no canvas or pixel-math needed.

**Why matching happens in two passes.**
A single matching strategy can't handle both "the student labelled their answer, but slightly differently than the question paper" and "the student didn't label their answer at all." The first pass does exact normalized-label matching (handles numbering-format mismatches); anything unresolved goes through a second, content-based semantic match. Whatever's still unresolved after both passes is surfaced explicitly in the UI as unanswered or unmatched, rather than hidden.

**Known constraint: Gemini free-tier rate limits.**
The free tier enforces both a daily and a per-minute request cap (varies by model/account). Since one grading run makes 3–4 sequential Gemini calls (question extraction, answer extraction, semantic matching, grading), calls are queued with an enforced minimum gap between requests, and 429 responses are retried using the server-provided `retryDelay` rather than a fixed backoff. If quota is exhausted for the day, the UI surfaces a specific "AI quota reached" message rather than a generic error.

---

## Project Structure

```
app/
  exams/
    upload/page.tsx           # Upload screen
    processing/page.tsx       # "Extracting..." loading screen
    result/[sessionId]/page.tsx
  api/
    process/route.ts          # Orchestrates the full pipeline
    session/[id]/route.ts     # (fallback) session lookup
components/
  AppShell.tsx                 # Sidebar + top bar, responsive (drawer on mobile)
  UploadStep.tsx
  ProcessingStep.tsx
  ResultView.tsx                # Side-by-side (desktop) / tabbed (mobile) result UI
lib/
  types.ts                     # Question, ExtractedAnswer, MappedAnswer, SessionData
  pdf-to-images.ts              # PDF/image → normalized page images
  gemini-client.ts              # Rate-limited, retry-aware Gemini call wrapper
  extract-questions.ts
  extract-answers.ts
  match-answers.ts              # Label match + semantic fallback
  grade-answers.ts
```

---

## What's Handled

- ✅ Every question and labelled sub-part extracted in printed order, numbering preserved
- ✅ Answers matched regardless of the order they were written in
- ✅ Unanswered questions shown explicitly (not omitted)
- ✅ Answers with no matching question shown in a separate "Unmatched Answers" section
- ✅ Exact answer region highlighted on click, including regions spanning multiple pages
- ✅ Per-question AI feedback + marks, plus an overall grading summary
- ✅ Responsive layout — sidebar becomes a drawer, side-by-side panels become tabs on mobile

## Known Limitations

- Bounding-box accuracy depends on handwriting legibility and scan quality; very messy handwriting may produce loosely-cropped regions.
- Grading is AI-generated and should be read as a first-pass assistant, not a final authoritative score.
- Gemini's free-tier rate limits mean rapid repeated testing can trigger a temporary quota wait (see Architecture Notes).

---

## License

Built for the VedaAI Hiring Assignment. Not licensed for other use.
