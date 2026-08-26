const RENDER_SCALE = 2.0;

// Scans are photographic content: JPEG is dramatically smaller than PNG here, which
// keeps both the browser-side handoff and the inline-data Gemini request manageable.
const JPEG_QUALITY = 0.85;

// Longer-edge cap applied to every exported page — rendered PDF pages and
// directly-uploaded photos alike. Smaller payloads keep the inline-data Gemini
// request well inside the serverless function's time budget.
const MAX_IMAGE_DIMENSION = 1600;

// Any real scanned page encodes to tens of thousands of characters; anything
// this short means the canvas was blank or mis-sized.
const MIN_DATA_URL_LENGTH = 1000;

// Worker script is pdfjs-dist/build/pdf.worker.min.mjs, copied into public/
// so Next's production build doesn't try to minify the ESM worker file itself.
const WORKER_SRC = "/pdf.worker.min.mjs";

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get 2D canvas context");
  }
  // JPEG has no alpha channel, so any transparent pixel would encode as black.
  // Painting the page white first keeps scans looking like paper.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

/**
 * Export as JPEG, asserting the browser actually honoured the format — an
 * unsupported mime type makes toDataURL silently fall back to PNG, which would
 * quietly undo the size win.
 */
function exportJpeg(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (!dataUrl.startsWith("data:image/jpeg")) {
    throw new Error(
      `Expected a JPEG data URL, got "${dataUrl.slice(0, 20)}..." — cannot export page`
    );
  }

  console.log(
    `[pdf-to-images] page image: ${dataUrl.slice(0, 30)}... length=${dataUrl.length} ` +
      `(canvas ${canvas.width}x${canvas.height})`
  );

  // A blank or zero-sized canvas still encodes to a valid but tiny JPEG, which
  // Gemini then rejects. Fail here, where the cause is visible, instead.
  if (dataUrl.length < MIN_DATA_URL_LENGTH) {
    throw new Error(
      `Generated page image is suspiciously small/empty — check canvas resize logic ` +
        `(length=${dataUrl.length}, canvas ${canvas.width}x${canvas.height})`
    );
  }

  return dataUrl;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image file"));
    image.src = src;
  });
}

async function pdfToPageImages(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Clamp the render scale so the longer edge lands at MAX_IMAGE_DIMENSION.
    // Rendering straight to the target size beats rendering large and then
    // downscaling: same result, less memory, and no resampling pass.
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(
      RENDER_SCALE,
      MAX_IMAGE_DIMENSION / Math.max(unscaled.width, unscaled.height)
    );
    const viewport = page.getViewport({ scale });
    const { canvas, context } = createCanvas(viewport.width, viewport.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    images.push(exportJpeg(canvas));
  }

  return images;
}

async function imageFileToPageImage(file: File): Promise<string> {
  const image = await loadImage(await fileToDataUrl(file));
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const { canvas, context } = createCanvas(width, height);
  context.drawImage(image, 0, 0, width, height);
  return exportJpeg(canvas);
}

export async function fileToPageImages(file: File): Promise<string[]> {
  if (isPdfFile(file)) {
    return pdfToPageImages(file);
  }
  if (isImageFile(file)) {
    return [await imageFileToPageImage(file)];
  }
  throw new Error(`Unsupported file type: ${file.type || file.name}`);
}
