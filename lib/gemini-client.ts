import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.6-flash";
/** Retries for generic failures (malformed JSON, empty response, 5xx) — 3 attempts total. */
const MAX_RETRIES = 2;
/** Retries for 429 / RESOURCE_EXHAUSTED specifically — 5 attempts total. */
const MAX_RATE_LIMIT_RETRIES = 4;
/**
 * Only used when a 429 arrives without a RetryInfo hint. Throttling is purely
 * reactive — calls fire immediately and a wait is introduced for one call only
 * after that call is itself rate limited.
 */
const FALLBACK_RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pull the API's structured error body out of whatever the SDK threw. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorBody(error: unknown): any {
  if (!error || typeof error !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = error as any;
  if (err.status || err.details || err.code) return err.error ?? err;
  // The SDK often stringifies the JSON body into `message`.
  if (typeof err.message === "string") {
    const start = err.message.indexOf("{");
    if (start !== -1) {
      try {
        const parsed = JSON.parse(err.message.slice(start));
        return parsed.error ?? parsed;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isRateLimitError(error: unknown): boolean {
  const body = errorBody(error);
  if (body?.status === "RESOURCE_EXHAUSTED" || body?.code === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("RESOURCE_EXHAUSTED") || message.includes("429");
}

/** Parse `retryDelay` (e.g. "1.53s") out of the RetryInfo entry in error.details. */
function parseRetryDelayMs(error: unknown): number | null {
  const details = errorBody(error)?.details;
  if (!Array.isArray(details)) return null;

  const retryInfo = details.find(
    (d) => typeof d?.["@type"] === "string" && d["@type"].includes("RetryInfo")
  );
  const raw = retryInfo?.retryDelay;
  if (typeof raw !== "string") return null;

  const seconds = Number.parseFloat(raw.replace(/s$/, ""));
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function parseImageDataUrl(image: string): { mimeType: string; data: string } {
  const match = image.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) {
    return { mimeType: "image/jpeg", data: image };
  }
  return { mimeType: match[1], data: match[2] };
}

function buildContents(prompt: string, images: string[]) {
  return [
    {
      role: "user",
      parts: [
        { text: prompt },
        ...images.map((image) => ({
          inlineData: parseImageDataUrl(image),
        })),
      ],
    },
  ];
}

export async function callGeminiJSON(
  prompt: string,
  images: string[],
  schemaHint: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let currentPrompt = `${prompt}\n\n${schemaHint}`;
  let lastError: unknown;
  let genericRetries = 0;
  let rateLimitRetries = 0;
  let attempts = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts++;

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: buildContents(currentPrompt, images),
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned an empty response");
      }

      try {
        return JSON.parse(text);
      } catch (parseError) {
        lastError = parseError;
        if (genericRetries++ >= MAX_RETRIES) break;
        currentPrompt = `${prompt}\n\n${schemaHint}\n\nReturn ONLY valid JSON matching the schema, no markdown fences.`;
        continue;
      }
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error)) {
        if (rateLimitRetries++ >= MAX_RATE_LIMIT_RETRIES) break;
        // This wait applies to this call only — concurrent calls are untouched
        // and keep running unless they get rate limited themselves.
        const retryDelayMs = parseRetryDelayMs(error);
        const waitMs = retryDelayMs ?? FALLBACK_RETRY_DELAY_MS;
        console.log(
          `[gemini] rate limited — waiting ${(waitMs / 1000).toFixed(2)}s (${
            retryDelayMs !== null ? "server RetryInfo" : "no RetryInfo, fallback"
          }), retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}`
        );
        await sleep(waitMs);
        continue;
      }

      if (genericRetries++ >= MAX_RETRIES) break;
    }
  }

  throw new Error(
    `callGeminiJSON failed after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
