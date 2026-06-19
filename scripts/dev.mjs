/**
 * Dev server wrapper: auto-recovers from stale webpack chunks (Cannot find module './276.js').
 * Next.js dev HMR on Windows can leave the server referencing deleted chunk files mid-session.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { debugLog } from './debug-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const nextDir = path.join(root, '.next');

const CHUNK_ERROR = /Cannot find module '\.\/\d+\.js'/;
const STATIC_404 = /\/_next\/static\/chunks\/.*\s404/;

const MAX_RESTARTS = 8;

function clearNextCache(reason) {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    debugLog('dev.mjs:clearNextCache', 'cleared .next', { reason }, 'H1');
    console.log('Cleared .next cache (' + reason + ')');
  }
}

function runDev(restartCount = 0) {
  debugLog('dev.mjs:runDev', 'starting next dev', { restartCount }, 'H1');

  let child = null;
  let restarting = false;
  let chunkErrorSeen = false;
  let static404Count = 0;

  const scheduleRestart = (reason) => {
    if (restarting || restartCount >= MAX_RESTARTS) return;
    restarting = true;
    chunkErrorSeen = true;
    debugLog('dev.mjs:scheduleRestart', reason, { restartCount }, 'H1');
    console.log('\n⚠ Stale webpack cache detected — restarting dev server...\n');
    if (child && !child.killed) {
      child.kill('SIGTERM');
    } else {
      clearNextCache(reason);
      runDev(restartCount + 1);
    }
  };

  child = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: root,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DEBUG_RUN_ID: restartCount > 0 ? `restart-${restartCount}` : 'initial',
    },
  });

  const handleOutput = (chunk, isStderr) => {
    const text = chunk.toString();
    (isStderr ? process.stderr : process.stdout).write(text);

    if (CHUNK_ERROR.test(text)) {
      debugLog('dev.mjs:output', 'chunk MODULE_NOT_FOUND', { restartCount }, 'H1');
      scheduleRestart('chunk-module-not-found');
      return;
    }

    for (const line of text.split('\n')) {
      if (STATIC_404.test(line)) {
        static404Count += 1;
        debugLog('dev.mjs:output', 'static chunk 404', { static404Count }, 'H2');
        if (static404Count >= 3) {
          scheduleRestart('static-chunk-404-cascade');
        }
      }
    }
  };

  child.stdout.on('data', (d) => handleOutput(d, false));
  child.stderr.on('data', (d) => handleOutput(d, true));

  process.on('SIGINT', () => {
    if (child && !child.killed) child.kill('SIGINT');
    process.exit(0);
  });

  child.on('exit', (code, signal) => {
    debugLog('dev.mjs:exit', 'next dev exited', { code, signal, chunkErrorSeen, restartCount }, 'H1');

    if (signal === 'SIGINT') {
      process.exit(0);
    }

    if (chunkErrorSeen && restartCount < MAX_RESTARTS) {
      clearNextCache('after-chunk-error');
      runDev(restartCount + 1);
      return;
    }

    if (code !== 0 && code !== null && restartCount >= MAX_RESTARTS) {
      console.error(`Dev server failed after ${MAX_RESTARTS} restarts. Stop other Next processes and run npm run dev again.`);
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

runDev();
