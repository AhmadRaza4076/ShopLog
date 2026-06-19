export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 50_000;

export function assertUploadSize(bytes: number, label = 'File'): void {
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(`${label} is too large — maximum size is 5 MB.`);
  }
}

export function assertTextLength(text: string, label = 'Text'): void {
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error(`${label} is too long — maximum is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
  }
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function assertBase64UploadSize(base64: string, label = 'Upload'): void {
  assertUploadSize(estimateBase64Bytes(base64), label);
}
