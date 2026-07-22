export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_PURPOSES: ReadonlySet<string> = new Set([
  "gallery",
  "doctor-photo",
  "blog-cover",
  "admin-upload",
]);

export type MediaPurpose = "gallery" | "doctor-photo" | "blog-cover" | "admin-upload";

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];

function bytesMatch(data: Uint8Array, offset: number, sig: number[]): boolean {
  if (data.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (data[offset + i] !== sig[i]) return false;
  }
  return true;
}

export function detectSignature(data: Uint8Array): string | null {
  if (data.length < 4) return null;
  if (bytesMatch(data, 0, JPEG_SIG)) return "image/jpeg";
  if (bytesMatch(data, 0, PNG_SIG)) return "image/png";
  if (bytesMatch(data, 0, WEBP_RIFF) && bytesMatch(data, 8, WEBP_WEBP)) return "image/webp";
  return null;
}

export function validateMediaUpload(input: {
  file: File | null;
  purpose: string;
  bytes: Uint8Array;
}): { ok: true; contentType: string; purpose: MediaPurpose } | { ok: false; error: string; status: number } {
  const { file, purpose, bytes } = input;

  if (!file) {
    return { ok: false, error: "Image file is required.", status: 400 };
  }

  if (bytes.length === 0) {
    return { ok: false, error: "File is empty.", status: 400 };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 5 MB or smaller.", status: 400 };
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, and WebP images are allowed.", status: 400 };
  }

  if (!ALLOWED_PURPOSES.has(purpose)) {
    return { ok: false, error: "Unknown upload purpose.", status: 400 };
  }

  const detected = detectSignature(bytes);
  if (!detected) {
    return { ok: false, error: "Unsupported file format.", status: 400 };
  }

  if (detected !== file.type) {
    return { ok: false, error: "Declared type does not match file content.", status: 400 };
  }

  return { ok: true, contentType: detected, purpose: purpose as MediaPurpose };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function computeCropPlan(input: {
  sourceWidth: number;
  sourceHeight: number;
  rotation: number;
  zoom: number;
  panX: number;
  panY: number;
  outputSize: number;
  maxExportSize: number;
}) {
  const normRot = ((input.rotation % 360) + 360) % 360;
  const isSwapped = normRot === 90 || normRot === 270;
  const rotatedW = isSwapped ? input.sourceHeight : input.sourceWidth;
  const rotatedH = isSwapped ? input.sourceWidth : input.sourceHeight;

  const coverScale = Math.max(input.outputSize / input.sourceWidth, input.outputSize / input.sourceHeight) * input.zoom;

  const dw = input.sourceWidth * coverScale;
  const dh = input.sourceHeight * coverScale;

  const drawnScreenW = isSwapped ? dh : dw;
  const drawnScreenH = isSwapped ? dw : dh;

  const maxPanX = Math.max(0, (drawnScreenW - input.outputSize) / 2);
  const maxPanY = Math.max(0, (drawnScreenH - input.outputSize) / 2);

  const clampedPanX = Math.max(-1, Math.min(1, input.panX));
  const clampedPanY = Math.max(-1, Math.min(1, input.panY));
  const screenPanX = clampedPanX * maxPanX;
  const screenPanY = clampedPanY * maxPanY;

  const visibleSourceSide = Math.min(rotatedW, rotatedH) / input.zoom;
  const exportSize = Math.min(input.maxExportSize, Math.floor(visibleSourceSide));

  return {
    screenPanX,
    screenPanY,
    maxPanX,
    maxPanY,
    drawnScreenW,
    drawnScreenH,
    coverScale,
    exportSize,
    rotatedW,
    rotatedH,
  };
}
