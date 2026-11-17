export interface ProcessedIllustration {
  dataUrl: string;
  width: number;
  height: number;
  approxKb: number;
}

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1280;

export async function processUploadedIllustration(
  file: File,
): Promise<ProcessedIllustration> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPEG, WebP, or GIF).');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image file exceeds the 20 MB upload limit.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error('Could not decode this image file. Try PNG, JPEG, or WebP.'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width || 1024;
    const naturalH = img.naturalHeight || img.height || 1024;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalW, naturalH));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable for image processing.');
    }

    // Fill white background before drawing so transparent PNGs render cleanly as JPEG/WebP
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', 0.84);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    }

    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    const approxKb = Math.max(1, Math.round(approxBytes / 1024));

    return {
      dataUrl,
      width,
      height,
      approxKb,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
