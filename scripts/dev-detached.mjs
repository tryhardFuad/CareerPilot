// Detached launcher for `next dev`. Survives the parent shell exiting.
// Usage:  node scripts/dev-detached.mjs
// Writes PID to scripts/dev.pid and logs to dev.log at the repo root.

import { spawn } from "node:child_process";
import { writeFileSync, openSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(root, "dev.log");
const pidPath = resolve(root, "scripts", "dev.pid");

const out = process.stdout;
out.write(`[dev-detached] launching detached child, log=${logPath}\n`);

const logFd = openSync(logPath, "w");

const isWin = process.platform === "win32";
const child = spawn(
  isWin ? "npm.cmd" : "npm",
  ["run", "dev"],
  {
    cwd: root,
    detached: true,
    // shell: true on Windows so Node will route the .cmd shim through
    // cmd.exe instead of failing the spawn with EINVAL.
    shell: isWin,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  },
);

child.unref();
writeFileSync(pidPath, String(child.pid));
out.write(`[dev-detached] pid=${child.pid} (see ${pidPath})\n`);
out.write(`[dev-detached] tail the log with:  Get-Content -Path "${logPath}" -Wait\n`);
