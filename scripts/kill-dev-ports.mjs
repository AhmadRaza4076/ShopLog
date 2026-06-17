/**
 * Frees ports 3000–3010 before starting the dev server.
 * Stale `npm run dev` sessions were stacking up and bumping the port each time.
 */
import { execSync } from 'child_process';

const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

function killWindowsPort(port) {
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
      } catch {
        // already gone
      }
    }
  } catch {
    // port not in use
  }
}

function killUnixPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
  } catch {
    // port not in use
  }
}

for (const port of PORTS) {
  if (process.platform === 'win32') killWindowsPort(port);
  else killUnixPort(port);
}
