import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Primary model is gemini-2.5-flash-lite. The rest of the chain is fallback:
// gemini-3.6-flash and gemini-flash-latest were both verified callable with
// this project's API key, so a request still completes if the primary fails.
// Note: a probe on 2026-08-26 had gemini-2.5-flash-lite and gemini-2.5-flash
// returning 404 "no longer available to new users" for this key, despite both
// appearing in ListModels — a 404 costs one fast attempt and falls through.
const MODEL_FALLBACK_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

// Keyed by model name: each model has its own quota bucket, so usage of
// gemini-2.5-flash must not block a fallback model that hasn't been called at
// all in this window.
const callTimestampsByModel = new Map<string, number[]>();
const MAX_CALLS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

function timestampsFor(model: string): number[] {
  let timestamps = callTimestampsByModel.get(model);
  if (!timestamps) {
    timestamps = [];
    callTimestampsByModel.set(model, timestamps);
  }
  return timestamps;
}

/** Hard ceiling on a single Gemini request, well inside the function's 60s limit. */
const CALL_TIMEOUT_MS = 12_000;

/**
 * Whole-call budget. Once this much time has gone by, starting another attempt
 * risks the platform's own 60s cutoff, so we stop and report the service as busy.
 */
const OVERALL_DEADLINE_MS = 45_000;

/** Retries allowed after a hard timeout before giving up on this model. */
const MAX_TIMEOUT_RETRIES = 1;

const TIMEOUT_MESSAGE = "gemini call timed out";

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.message === TIMEOUT_MESSAGE;
}

/**
 * Longest wait the sliding window may impose inside a request. Waiting longer
 * than this burns time budget the serverless function needs for the call itself,
 * so we fail fast and let the caller return a 503 instead.
 */
const MAX_WINDOW_WAIT_MS = 15_000;

export const RATE_LIMIT_WINDOW_FULL = "RATE_LIMIT_WINDOW_FULL";

/**
 * Every attempt failed for a capacity reason (503 high demand or 429 quota) —
 * never a malformed response or bad request. Callers surface this as "try
 * again shortly" rather than a hard error, since the request itself was fine.
 */
export class AIBusyError extends Error {
  constructor(message = "AI model is receiving high demand") {
    super(message);
    this.name = "AIBusyError";
  }
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms)
    ),
  ]);

async function respectSlidingWindow(model: string): Promise<void> {
  const callTimestamps = timestampsFor(model);
  const now = Date.now();

  console.log(
    `[gemini] window check for ${model} — now=${new Date(now).toISOString()}, ` +
      `${callTimestamps.length} recorded call(s): [${callTimestamps
        .map((t) => `${new Date(t).toISOString()} (${((now - t) / 1000).toFixed(1)}s ago)`)
        .join(", ")}]`
  );

  while (callTimestamps.length && now - callTimestamps[0] > WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const oldest = callTimestamps[0];
    const waitMs = WINDOW_MS - (now - oldest) + 100;
    if (waitMs > MAX_WINDOW_WAIT_MS) {
      console.log(
        `[gemini] sliding window full for ${model} — would need ${(waitMs / 1000).toFixed(
          1
        )}s, over the ${MAX_WINDOW_WAIT_MS / 1000}s cap; failing fast`
      );
      throw new Error(RATE_LIMIT_WINDOW_FULL);
    }
    if (waitMs > 0) {
      console.log(
        `[gemini] sliding window full for ${model} — waiting ${(waitMs / 1000).toFixed(1)}s`
      );
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

/**
 * A model that is unavailable to this key will never become available by
 * retrying, so these skip straight to the next model in the chain.
 */
function isModelUnavailableError(err: unknown): boolean {
  const gErr = err as GeminiApiError;
  const status = gErr.error?.code ?? gErr.status;
  return status === 404 || gErr.error?.status === "NOT_FOUND";
}

/**
 * Transient server-side congestion. Unlike a 429 quota wall — which will still
 * be there in a few seconds, so the right move is a different model — a 503
 * usually clears on its own, making a short backoff on the SAME model worthwhile.
 */
function isTransientError(err: unknown): boolean {
  const gErr = err as GeminiApiError;
  const status = gErr.error?.code ?? gErr.status;
  return status === 503 || gErr.error?.status === "UNAVAILABLE";
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

  await respectSlidingWindow(model);

  // Recorded once, immediately before the one and only network call this
  // function makes — so the count tracks real Gemini requests for this model.
  timestampsFor(model).push(Date.now());

  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json" },
    }),
    CALL_TIMEOUT_MS
  );

  return response.text ?? "";
}

export async function callGeminiJSON<T = unknown>(
  prompt: string,
  images: string[],
  schemaHint: string
): Promise<T> {
  const functionStartTime = Date.now();
  let lastError: unknown = null;
  // Stays true only while every failure seen is a capacity failure (503/429 —
  // and timeouts, which are congestion in practice). A parse failure or other
  // real error clears it for good.
  let allFailuresWereCapacity = true;

  for (const model of MODEL_FALLBACK_CHAIN) {
    let jsonRetries = 0;
    let rateLimitRetries = 0;
    let transientRetries = 0;
    let timeoutRetries = 0;
    let currentPrompt = prompt;

    while (
      jsonRetries < 2 &&
      rateLimitRetries < 3 &&
      transientRetries < 3 &&
      timeoutRetries <= MAX_TIMEOUT_RETRIES
    ) {
      const elapsed = Date.now() - functionStartTime;
      if (elapsed > OVERALL_DEADLINE_MS) {
        console.error(
          `[gemini] ${(elapsed / 1000).toFixed(1)}s elapsed, past the ${
            OVERALL_DEADLINE_MS / 1000
          }s budget — stopping instead of trying further models`
        );
        throw new AIBusyError();
      }

      try {
        const text = await callOneModel(model, currentPrompt, images);
        try {
          return JSON.parse(text.replace(/```json|```/g, "").trim()) as T;
        } catch {
          jsonRetries++;
          allFailuresWereCapacity = false;
          currentPrompt = `${prompt}\n\nReturn ONLY valid JSON matching the schema: ${schemaHint}. No markdown fences, no preamble.`;
          continue;
        }
      } catch (err: unknown) {
        lastError = err;

        console.error(
          `[gemini] call failed on ${model}:`,
          JSON.stringify({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: (err as any)?.status,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            message: (err as any)?.message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            errorBody: (err as any)?.error,
          })
        );

        // Nothing to retry against: every model shares one window, and waiting
        // it out would exceed the function's budget. Let the route return a 503.
        if (err instanceof Error && err.message === RATE_LIMIT_WINDOW_FULL) {
          throw err;
        }

        // Retrying a model this key can't use just burns the time budget.
        // Deliberately does NOT clear allFailuresWereCapacity: a model this key
        // can't reach never participates, so it shouldn't decide whether the run
        // was a capacity problem. Otherwise one dead model at the head of the
        // chain would suppress AIBusyError for every request.
        if (isModelUnavailableError(err)) {
          console.log(`[gemini] ${model} unavailable to this key — next model`);
          break;
        }

        // A hung call gets one more shot, then we move on rather than spending
        // another 12s of the budget on a model that isn't responding.
        if (isTimeoutError(err)) {
          timeoutRetries++;
          console.log(
            `[gemini] timeout on ${model} after ${CALL_TIMEOUT_MS / 1000}s — ` +
              (timeoutRetries <= MAX_TIMEOUT_RETRIES
                ? `retrying once (${timeoutRetries}/${MAX_TIMEOUT_RETRIES})`
                : "next model")
          );
          continue;
        }

        // Checked before the jsonRetries fallthrough: a 503 is a service
        // hiccup, not a malformed response, and re-prompting won't help.
        if (isTransientError(err)) {
          transientRetries++;
          const backoffMs = 2000 * 2 ** (transientRetries - 1);
          console.log(
            `[gemini] 503 on ${model} — waiting ${backoffMs / 1000}s, ` +
              `transient retry attempt ${transientRetries}/3`
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        if (!isRateLimitError(err)) {
          jsonRetries++;
          allFailuresWereCapacity = false;
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

  // Purely a capacity problem: the request was well formed and would likely
  // succeed later, so callers can invite a retry instead of reporting a fault.
  if (allFailuresWereCapacity) {
    console.error("[gemini] all models busy (503/429 only) — surfacing AIBusyError");
    throw new AIBusyError();
  }

  throw new Error(
    `callGeminiJSON failed on all models after retries: ${JSON.stringify(lastError)}`
  );
}