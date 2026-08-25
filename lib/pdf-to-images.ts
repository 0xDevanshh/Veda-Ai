const RENDER_SCALE = 2.0;

// Scans are photographic content: JPEG is dramatically smaller than PNG here, which
// keeps both the browser-side handoff and the inline-data Gemini request manageable.
const JPEG_QUALITY = 0.8;

// Cap for directly-uploaded photos, which can otherwise be many megapixels straight
// off a phone camera. Comfortably above what the model needs to read handwriting.
const MAX_IMAGE_DIMENSION = 2200;

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
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const { canvas, context } = createCanvas(viewport.width, viewport.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
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
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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
