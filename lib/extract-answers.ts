import { callGeminiJSON } from "./gemini-client";
import type { BBox, ExtractedAnswer } from "./types";

function buildPrompt(pageCount: number): string {
  return `You are analyzing a student's handwritten exam answer sheet, made of ${pageCount} pages in order (0-indexed, page 0 first).
Identify every distinct answer block the student has written. For each block:
- detectedLabel: the question number the student wrote near this answer (e.g. '11', '11(a)', 'Q3'), or null if the student wrote no visible label.
- text: your best transcription of the handwritten content (do not skip illegible words, write [illegible] inline if needed).
- regions: array of { page, ymin, xmin, ymax, xmax } — bounding box(es) in the 0-1000 normalized coordinate system, tightly cropping just the handwritten answer content (not the whole page). If one answer clearly continues onto a later page (e.g. 'continued on next page' or the same numbering resumes), include multiple regions under the SAME answer block rather than creating a duplicate.
Do not merge two different question numbers into one block even if they are visually close together.
Return JSON array of: { detectedLabel, text, regions }`;
}

const SCHEMA_HINT = `Schema: Array<{ detectedLabel: string | null, text: string, regions: Array<{ page: number, ymin: number, xmin: number, ymax: number, xmax: number }> }>`;

function clamp(value: number): number {
  return Math.min(1000, Math.max(0, value));
}

function sanitizeRegions(
  regions: BBox[] | undefined,
  blockIndex: number
): BBox[] {
  if (!regions) return [];

  const sanitized: BBox[] = [];

  regions.forEach((region, regionIndex) => {
    const clamped: BBox = {
      page: region.page,
      ymin: clamp(region.ymin),
      xmin: clamp(region.xmin),
      ymax: clamp(region.ymax),
      xmax: clamp(region.xmax),
    };

    if (clamped.xmax <= clamped.xmin || clamped.ymax <= clamped.ymin) {
      console.warn(
        `extractAnswers: dropping invalid region ${regionIndex} on block ${blockIndex}`,
        region
      );
      return;
    }

    sanitized.push(clamped);
  });

  return sanitized;
}

export async function extractAnswers(
  answerSheetImages: string[]
): Promise<ExtractedAnswer[]> {
  const prompt = buildPrompt(answerSheetImages.length);
  const raw = await callGeminiJSON(prompt, answerSheetImages, SCHEMA_HINT);

  if (!Array.isArray(raw)) {
    throw new Error("extractAnswers: expected Gemini to return a JSON array");
  }

  return raw.map((item, index) => ({
    id: `answer-${index}`,
    detectedLabel: item.detectedLabel ?? null,
    text: item.text,
    regions: sanitizeRegions(item.regions, index),
  }));
}
