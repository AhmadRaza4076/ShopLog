/**
 * Frees ports 3000–3010 and clears stale .next cache before starting dev.
 * Kills processes FIRST so we never delete .next while a dev server is still running.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { debugLog } from './debug-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nextDir = path.join(__dirname, '..', '.next');

const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

function killWindowsPort(port) {
  const killed = [];
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Freed port ${port} (PID ${pid})`);
        killed.push(pid);
      } catch {
        // already gone
      }
    }
  } catch {
    // port not in use
  }
  return killed;
}

function killUnixPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
    return ['unix'];
  } catch {
    return [];
  }
}

const portsFreed = [];
for (const port of PORTS) {
  const killed =
    process.platform === 'win32' ? killWindowsPort(port) : killUnixPort(port);
  if (killed.length) portsFreed.push({ port, killed });
}

debugLog('kill-dev-ports.mjs', 'ports freed', { portsFreed }, 'H3');

if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('Cleared .next cache');
  debugLog('kill-dev-ports.mjs', 'cleared .next after killing ports', {}, 'H3');
}
