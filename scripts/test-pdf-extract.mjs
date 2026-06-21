import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromDocument, DOCUMENT_MIME } from '../lib/document-extract.ts';

const pdfPath =
  process.argv[2] ||
  'c:/Users/ahmad/AppData/Roaming/Cursor/User/workspaceStorage/efe1be102842185b79c85c9addd34b88/pdfs/272ce2ed-c863-4f91-9f22-8339ec1f922e/Appollo HW Price List (03-April-26).pdf';

try {
  const buf = fs.readFileSync(pdfPath);
  const text = await extractTextFromDocument(buf, DOCUMENT_MIME.pdf);
  console.log('OK', text.length, 'chars');
  console.log(text.slice(0, 200));
} catch (e) {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
}
