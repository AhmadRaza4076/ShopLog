import 'pdf-parse/worker';
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export const DOCUMENT_MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type DocumentMimeType = (typeof DOCUMENT_MIME)[keyof typeof DOCUMENT_MIME];

export function isDocumentMimeType(mime: string): mime is DocumentMimeType {
  return mime === DOCUMENT_MIME.pdf || mime === DOCUMENT_MIME.docx;
}

export async function extractTextFromDocument(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === DOCUMENT_MIME.pdf) {
    const parser = new PDFParse({ data: buffer, CanvasFactory });
    try {
      const result = await parser.getText();
      const text = result.text?.trim() ?? '';
      if (!text) {
        throw new Error(
          'No readable text in this PDF. If it is a scanned image, use Photo of list instead.'
        );
      }
      return text;
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === DOCUMENT_MIME.docx) {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() ?? '';
    if (!text) {
      throw new Error('No readable text in this Word document.');
    }
    return text;
  }

  throw new Error('Unsupported file type. Use PDF or Word (.docx) only — legacy .doc is not supported.');
}
