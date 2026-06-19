/**
 * Prevents `npm run build` from clobbering `.next` while `next dev` is running.
 */
import { execSync } from 'child_process';
import { debugLog } from './debug-log.mjs';

function isPort3000InUse() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano | findstr :3000', { encoding: 'utf8' });
      return out.includes('LISTENING');
    }
    execSync('lsof -ti :3000', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (isPort3000InUse()) {
  debugLog('ensure-not-dev.mjs', 'build blocked — dev server on 3000', {}, 'H4');
  console.error(
    '\nError: Dev server is running on port 3000.\n' +
      'Stop it (Ctrl+C) before `npm run build` — building while dev runs corrupts .next and causes Server Error.\n'
  );
  process.exit(1);
}
