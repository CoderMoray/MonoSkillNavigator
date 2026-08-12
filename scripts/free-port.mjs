#!/usr/bin/env node
import { execSync } from "node:child_process";
import { platform } from "node:os";

function listListeningPids(port) {
  if (platform() === "win32") {
    let output = "";
    try {
      output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      // findstr exits 1 when nothing matches — port is free
      return [];
    }

    const pids = new Set();
    const portSuffix = `:${port}`;
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) {
        continue;
      }
      // Avoid matching :3001 when looking for :3000 (e.g. 0.0.0.0:30001)
      if (!line.includes(portSuffix)) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      const localAddress = parts[1] ?? "";
      if (!localAddress.endsWith(portSuffix)) {
        continue;
      }
      const pid = parts.at(-1);
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        pids.add(pid);
      }
    }
    return [...pids];
  }

  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (platform() === "win32") {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    return;
  }

  try {
    process.kill(Number(pid), "SIGTERM");
  } catch {
    execSync(`kill -9 ${pid}`, { stdio: "ignore" });
  }
}

function freePort(port) {
  const pids = listListeningPids(port);
  if (pids.length === 0) {
    console.log(`[free-port] ${port} is free`);
    return;
  }

  console.log(`[free-port] port ${port} in use by PID ${pids.join(", ")}, stopping...`);
  for (const pid of pids) {
    try {
      killPid(pid);
      console.log(`[free-port] stopped PID ${pid} on port ${port}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[free-port] failed to stop PID ${pid} on port ${port}: ${message}`);
    }
  }
}

const ports = process.argv.slice(2).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
if (ports.length === 0) {
  console.error("Usage: node scripts/free-port.mjs <port> [port...]");
  process.exit(1);
}

for (const port of ports) {
  freePort(port);
}
