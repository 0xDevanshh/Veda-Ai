import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.6-flash";
/** Retries for generic failures (malformed JSON, empty response, 5xx) — 3 attempts total. */
const MAX_RETRIES = 2;
/** Retries for 429 / RESOURCE_EXHAUSTED specifically — 5 attempts total. */
const MAX_RATE_LIMIT_RETRIES = 4;
/** Minimum gap between the START of any two Gemini calls, app-wide. */
const MIN_CALL_GAP_MS = 13_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared throttle. Every call to callGeminiJSON chains onto `queueTail`, so
 * requests fire one at a time with at least MIN_CALL_GAP_MS between starts —
 * across the whole app, not per call site.
 */
let queueTail: Promise<void> = Promise.resolve();
let lastCallTime = 0;

function acquireCallSlot(): Promise<void> {
  const slot = queueTail.then(async () => {
    const waitMs = MIN_CALL_GAP_MS - (Date.now() - lastCallTime);
    if (waitMs > 0) {
      console.log(
        `[gemini] queued — waiting ${(waitMs / 1000).toFixed(1)}s to respect the ${
          MIN_CALL_GAP_MS / 1000
        }s gap between calls`
      );
      await sleep(waitMs);
    }
    lastCallTime = Date.now();
  });
  // Keep the chain alive even if a waiter is cancelled upstream.
  queueTail = slot.catch(() => {});
  return slot;
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
    await acquireCallSlot();
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
        const retryDelayMs = parseRetryDelayMs(error);
        if (retryDelayMs !== null) {
          console.log(
            `[gemini] rate limited — server asked for ${(retryDelayMs / 1000).toFixed(
              2
            )}s, retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}`
          );
          await sleep(retryDelayMs);
        } else {
          console.log(
            `[gemini] rate limited — no RetryInfo in response, retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} after the queue gap`
          );
        }
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
