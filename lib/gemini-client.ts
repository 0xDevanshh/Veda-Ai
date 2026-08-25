import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.6-flash";
const MAX_RETRIES = 2;

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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        currentPrompt = `${prompt}\n\n${schemaHint}\n\nReturn ONLY valid JSON matching the schema, no markdown fences.`;
        continue;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `callGeminiJSON failed after ${MAX_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
