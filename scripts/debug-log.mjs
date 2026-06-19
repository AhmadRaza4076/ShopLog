/** Shared NDJSON debug logger for dev scripts (session eefe71). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEBUG_LOG_PATH = path.join(__dirname, '..', 'debug-eefe71.log');
export const DEBUG_SESSION_ID = 'eefe71';

export function debugLog(location, message, data = {}, hypothesisId = '') {
  const line =
    JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      timestamp: Date.now(),
      location,
      message,
      data,
      hypothesisId,
      runId: process.env.DEBUG_RUN_ID || 'dev',
    }) + '\n';
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch {
    // ignore
  }
}
