#!/usr/bin/env node
/**
 * One command to bring up the whole DeadZone demo on the laptop that acts as
 * the field command node:
 *
 *   pnpm demo            start tile server, command node and web app
 *   pnpm demo --seed     load the fictional seed incidents first
 *
 * Works the same on Windows, macOS and Linux. Needs no internet, no CouchDB
 * and no Ollama: each of those is optional and the demo path does not touch
 * them. Ctrl+C stops everything.
 *
 * It replaces START_ALL.ps1 / START_ALL.bat, which hard-coded one person's
 * Windows path and required Docker.
 */
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const isWin = process.platform === "win32";
const pnpm = isWin ? "pnpm.cmd" : "pnpm";

const SERVICES = [
  { name: "tiles ", color: 36, port: 3000, cmd: process.execPath, args: ["src/server.js"], cwd: "apps/dashboard" },
  { name: "node  ", color: 33, port: 4000, cmd: pnpm, args: ["dev"], cwd: "apps/api" },
  { name: "app   ", color: 35, port: 8443, cmd: pnpm, args: ["dev"], cwd: "apps/mobile" },
];

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) out.push({ name, address: i.address });
    }
  }
  return out;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

function prefix(name, color, chunk) {
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  return chunk
    .toString()
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => tag + l)
    .join("\n");
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) {
    console.error(`Node 20+ is required (found ${process.versions.node}).`);
    process.exit(1);
  }

  for (const s of SERVICES) {
    if (!(await portFree(s.port))) {
      console.error(
        `Port ${s.port} (${s.name.trim()}) is already in use. Is the demo already running in another window?\n` +
          `Stop it, or free the port, and run again.`,
      );
      process.exit(1);
    }
  }

  if (args.has("--seed")) {
    console.log("Loading fictional seed incidents into the command node's store...");
    const r = spawnSync(pnpm, ["seed"], { cwd: path.join(ROOT, "apps/api"), stdio: "inherit", shell: isWin });
    if (r.status !== 0) {
      console.error("Seeding failed; see the output above.");
      process.exit(1);
    }
  }

  const children = SERVICES.map((s) => {
    const child = spawn(s.cmd, s.args, {
      cwd: path.join(ROOT, s.cwd),
      env: { ...process.env, PORT: String(s.port), FORCE_COLOR: "1" },
      shell: isWin,
      detached: !isWin, // own process group, so Ctrl+C also stops pnpm's children
    });
    child.stdout.on("data", (d) => console.log(prefix(s.name, s.color, d)));
    child.stderr.on("data", (d) => console.log(prefix(s.name, s.color, d)));
    child.on("exit", (code) => {
      if (!shuttingDown) {
        console.error(`\n[${s.name.trim()}] exited with code ${code}. Stopping the demo.`);
        shutdown(1);
      }
    });
    return child;
  });

  let shuttingDown = false;
  function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const c of children) {
      if (isWin) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"]);
      else { try { process.kill(-c.pid, "SIGTERM"); } catch { /* already gone */ } }
    }
    setTimeout(() => process.exit(code), 500);
  }
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  // Print the addresses once the web app has had a moment to come up.
  setTimeout(() => {
    const lan = lanAddresses();
    const lines = [
      "",
      "================ DeadZone demo is up ================",
      "Responder dashboard (this laptop):  http://localhost:8443",
      ...(lan.length
        ? ["Phones on this laptop's hotspot / Wi-Fi open:", ...lan.map((l) => `   http://${l.address}:8443   (${l.name})`)]
        : ["No LAN address found: turn on the hotspot or join a Wi-Fi network for phones."]),
      "Responder login: any username, password 123456",
      "Self-test (in another terminal):  pnpm demo:check",
      "Stop: Ctrl+C",
      "=====================================================",
      "",
    ];
    console.log(lines.join("\n"));
  }, 4000);
}

main();
