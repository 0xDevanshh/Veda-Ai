import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL_FALLBACK_CHAIN = ["gemini-2.0-flash", "gemini-2.5-flash"];

const callTimestamps: number[] = [];
const MAX_CALLS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

async function respectSlidingWindow(): Promise<void> {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const oldest = callTimestamps[0];
    const waitMs = WINDOW_MS - (now - oldest) + 100;
    if (waitMs > 0) {
      console.log(`[gemini] sliding window full — waiting ${(waitMs / 1000).toFixed(1)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// --- Minimal shape of a Gemini API error response, just the fields we read ---
interface GeminiErrorDetail {
  "@type"?: string;
  retryDelay?: string;
}

interface GeminiErrorBody {
  code?: number;
  status?: string;
  details?: GeminiErrorDetail[];
}

interface GeminiApiError {
  error?: GeminiErrorBody;
  status?: number;
}

function parseRetryDelayMs(err: unknown): number | null {
  const gErr = err as GeminiApiError;
  const details = gErr.error?.details;
  if (!details) return null;
  const retryInfo = details.find((d) => d["@type"]?.includes("RetryInfo"));
  const raw = retryInfo?.retryDelay; // e.g. "13s" or "1.53s"
  if (!raw) return null;
  const seconds = parseFloat(raw.replace("s", ""));
  return isNaN(seconds) ? null : seconds * 1000;
}

function isRateLimitError(err: unknown): boolean {
  const gErr = err as GeminiApiError;
  const status = gErr.error?.code ?? gErr.status;
  return status === 429 || gErr.error?.status === "RESOURCE_EXHAUSTED";
}

async function callOneModel(
  model: string,
  prompt: string,
  images: string[]
): Promise<string> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  for (const img of images) {
    const [meta, data] = img.split(",");
    const mimeType = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
    parts.push({ inlineData: { mimeType, data } });
  }

  await respectSlidingWindow();
  callTimestamps.push(Date.now());

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json" },
  });

  return response.text ?? "";
}

export async function callGeminiJSON<T = unknown>(
  prompt: string,
  images: string[],
  schemaHint: string
): Promise<T> {
  let lastError: unknown = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    let jsonRetries = 0;
    let rateLimitRetries = 0;
    let currentPrompt = prompt;

    while (jsonRetries < 2 && rateLimitRetries < 3) {
      try {
        const text = await callOneModel(model, currentPrompt, images);
        try {
          return JSON.parse(text.replace(/```json|```/g, "").trim()) as T;
        } catch {
          jsonRetries++;
          currentPrompt = `${prompt}\n\nReturn ONLY valid JSON matching the schema: ${schemaHint}. No markdown fences, no preamble.`;
          continue;
        }
      } catch (err: unknown) {
        lastError = err;

        if (!isRateLimitError(err)) {
          jsonRetries++;
          continue;
        }

        rateLimitRetries++;
        const retryDelayMs = parseRetryDelayMs(err);
        const backoffMs = retryDelayMs ?? Math.min(2000 * 2 ** rateLimitRetries, 8000);
        console.log(
          `[gemini] 429 on ${model} — waiting ${(backoffMs / 1000).toFixed(1)}s ` +
          `(${retryDelayMs ? "server retryDelay" : "backoff, no RetryInfo"}), ` +
          `attempt ${rateLimitRetries}/3`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    console.log(`[gemini] exhausted retries on ${model}, falling back to next model`);
  }

  throw new Error(
    `callGeminiJSON failed on all models after retries: ${JSON.stringify(lastError)}`
  );
}