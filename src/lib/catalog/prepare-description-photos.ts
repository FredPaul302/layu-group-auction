import {
  descriptionPhotoMaxBytes, descriptionPhotoMaxCount,
  getDescriptionPhotoDimensions, validateDescriptionSourcePhoto
} from "./description-photos";

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Photo preparation was stopped.", "AbortError");
}

async function decodePhoto(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Some browsers support an image format in <img> but not ImageBitmap.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This photo could not be opened. Convert it to JPEG and try again."));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob && blob.type === "image/jpeg" ? resolve(blob) : reject(new Error("Your browser could not prepare a JPEG analysis copy.")), "image/jpeg", quality);
  });
}

function asDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  checkAborted(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const stop = () => reader.abort();
    const cleanup = () => signal?.removeEventListener("abort", stop);
    reader.onload = () => {
      cleanup();
      if (signal?.aborted) { reject(new DOMException("Photo preparation was stopped.", "AbortError")); return; }
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("This photo could not be prepared for analysis."));
    };
    reader.onerror = () => { cleanup(); reject(new Error("This photo could not be read.")); };
    reader.onabort = () => { cleanup(); reject(new DOMException("Photo preparation was stopped.", "AbortError")); };
    signal?.addEventListener("abort", stop, { once: true });
    reader.readAsDataURL(blob);
  });
}

async function preparePhoto(file: File, signal?: AbortSignal) {
  checkAborted(signal);
  validateDescriptionSourcePhoto(file);
  const decoded = await decodePhoto(file);
  const canvas = document.createElement("canvas");
  try {
    checkAborted(signal);
    let dimensions = getDescriptionPhotoDimensions(decoded.width, decoded.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Your browser does not support preparing photos for AI.");
    for (let scaleAttempt = 0; scaleAttempt < 4; scaleAttempt++) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5, 0.35]) {
        checkAborted(signal);
        const blob = await encodeJpeg(canvas, quality);
        checkAborted(signal);
        if (blob.size > 0 && blob.size <= descriptionPhotoMaxBytes) return await asDataUrl(blob, signal);
      }
      dimensions = { width: Math.max(1, Math.floor(dimensions.width * 0.75)), height: Math.max(1, Math.floor(dimensions.height * 0.75)) };
    }
    throw new Error("This photo is too complex to prepare within the AI size limit. Try a smaller JPEG.");
  } finally {
    decoded.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Only temporary analysis copies are resized. The File objects used by listing upload stay intact.
export async function prepareDescriptionPhotos(files: File[], signal?: AbortSignal): Promise<string[]> {
  checkAborted(signal);
  if (!files.length) throw new Error("Choose at least one item photo before generating a description.");
  const selected = files.slice(0, descriptionPhotoMaxCount);
  selected.forEach(validateDescriptionSourcePhoto);
  const images: string[] = [];
  for (const file of selected) {
    checkAborted(signal);
    images.push(await preparePhoto(file, signal));
  }
  return images;
}
