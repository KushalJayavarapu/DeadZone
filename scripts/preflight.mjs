#!/usr/bin/env node
/**
 * Demo preflight: proves, in about ten seconds, that every claim made on stage
 * is true on this laptop right now. Run it before walking up to the judges.
 *
 *   pnpm demo:check
 *
 * Part 1 checks the running demo (start it first with `pnpm demo`). It only
 * reads; it never writes a record the judges would see.
 *
 * Part 2 starts a throwaway command node on port 4100 with its own empty store
 * and drives the real protocol against it, exactly as a phone and a responder
 * would: store-and-ACK, duplicate collapse, the responder acknowledgement and
 * dispatch flowing back to the victim. Nothing it writes touches the demo data.
 *
 * Exit code 0 means every check passed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `ws` is already a dependency of the command node; borrow it from there so
// this script adds nothing to install.
const WebSocket = createRequire(path.join(ROOT, "apps/api/package.json"))("ws");
const isWin = process.platform === "win32";

const results = [];
function record(ok, label, detail = "") {
  results.push({ ok, label });
  const mark = ok === true ? "\x1b[32mPASS\x1b[0m" : ok === "warn" ? "\x1b[33mWARN\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${mark}  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}

async function get(url, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function check(label, fn) {
  try {
    const detail = await fn();
    record(true, label, detail ?? "");
  } catch (err) {
    record(false, label, err instanceof Error ? err.message : String(err));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Part 1: the running demo ─────────────────────────────────────────────── */

async function partOne() {
  console.log("\n1. The running demo (pnpm demo)");
  await check("Web app answers on :8443", async () => {
    const r = await get("http://localhost:8443/");
    await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  await check("Command node answers on :4000", async () => {
    const r = await get("http://localhost:4000/health");
    await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
  await check("Command node can read its store", async () => {
    const r = await get("http://localhost:4000/sos");
    if (!r.ok) throw new Error(`HTTP ${r.status} -- ${await r.text()}`);
    const docs = await r.json();
    return `${docs.length} incident(s) stored`;
  });
  await check("Offline map: style, a Bengaluru tile, a font glyph, sprites", async () => {
    for (const u of [
      "http://localhost:8443/tiles/style.json",
      "http://localhost:8443/tiles/bengaluru/11/1465/949.pbf",
      "http://localhost:8443/tiles/glyphs/Noto%20Sans%20Regular/0-255.pbf",
      "http://localhost:8443/tiles/sprites/dark.json",
    ]) {
      const r = await get(u);
      const body = await r.arrayBuffer(); // drain it, and prove it is not empty
      if (!r.ok || body.byteLength === 0) throw new Error(`${u} -> HTTP ${r.status}, ${body.byteLength} bytes`);
    }
    return "served from this laptop through the app's own address";
  });
  try {
    await (await get("https://example.com", 2500)).text();
    record("warn", "This laptop can reach the internet", "fine, but for the offline demo turn Wi-Fi uplink off; nothing above needs it");
  } catch {
    record(true, "No internet on this laptop", "everything above passed without it");
  }
}

/* ── Part 2: the protocol, against a throwaway command node ───────────────── */

function startScratchNode(dataDir) {
  const child = spawn(isWin ? "pnpm.cmd" : "pnpm", ["dev"], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, PORT: "4100", DEADZONE_DATA_DIR: dataDir, COUCHDB_SYNC: "off", SELF_DEVICE_ID: "preflight" },
    shell: isWin,
    detached: !isWin, // own process group, so the tsx grandchild dies with it
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  return { child, log: () => out };
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (const w of [...waiters]) if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
    });
    ws.once("open", () =>
      resolve({
        ws,
        inbox,
        send: (obj) => ws.send(JSON.stringify(obj)),
        waitFor: (match, ms = 4000) =>
          new Promise((res, rej) => {
            const hit = inbox.find(match);
            if (hit) return res(hit);
            const w = { match, resolve: res };
            waiters.push(w);
            setTimeout(() => rej(new Error("timed out waiting for the command node")), ms);
          }),
      }),
    );
    ws.once("error", reject);
  });
}

async function partTwo() {
  console.log("\n2. The protocol, on a throwaway command node (:4100, empty store)");
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "deadzone-preflight-"));
  const node = startScratchNode(dataDir);
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await sleep(250);
      up = await get("http://localhost:4100/health", 500).then(async (r) => (await r.text(), r.ok)).catch(() => false);
    }
    if (!up) {
      record(false, "Throwaway command node started", node.log().slice(-400));
      return;
    }

    const phone = await openSocket("ws://localhost:4100/mesh");
    const responder = await openSocket("ws://localhost:4100/mesh");
    await check("Phone hears the command node's heartbeat on connect", async () => {
      await phone.waitFor((m) => m.type === "heartbeat");
      return "drives the coverage meter";
    });

    const sosId = randomUUID();
    const deviceId = randomUUID();
    const now = new Date().toISOString();
    const geo = { lat: 12.9352, lng: 77.6245 };
    const sos = {
      id: sosId, deviceId, reporterName: "Preflight check", incidentType: "trapped", priority: "critical",
      victimCount: 3, description: "3 people affected - needs rescue", geo, status: "new", createdAt: now,
    };
    const envelope = { id: sosId, orig: deviceId, ts: now, ttl: 5, prio: "critical", type: "sos", geo, body: sos };

    await check("SOS is stored and acknowledged (ACK back to the phone)", async () => {
      const t0 = Date.now();
      phone.send(envelope);
      await phone.waitFor((m) => m.type === "ack" && m.envelopeId === sosId);
      return `${Date.now() - t0} ms round trip`;
    });
    await check("Responder screen receives the SOS live", async () => {
      await responder.waitFor((m) => m.type === "envelope" && m.envelope.id === sosId);
    });
    await check("Same SOS sent again collapses to one record", async () => {
      phone.send(envelope);
      phone.send(envelope);
      await sleep(300);
      const docs = await (await get("http://localhost:4100/sos")).json();
      const n = docs.filter((d) => d._id === sosId).length;
      if (n !== 1) throw new Error(`${n} copies stored`);
      return "3 sends, 1 record (message id is the document id)";
    });

    const status = (s, teams, at) => ({
      id: randomUUID(), orig: randomUUID(), ts: at, ttl: 0, prio: "high", type: "responder_status", geo,
      body: { sosId, status: s, teams, responderName: "Preflight", at },
    });
    const ackAt = new Date(Date.now() + 1000).toISOString();
    const ack = status("acknowledged", [], ackAt);
    await check("Responder acknowledgement reaches the victim's phone", async () => {
      responder.send(ack);
      await responder.waitFor((m) => m.type === "ack" && m.envelopeId === ack.id);
      await phone.waitFor((m) => m.type === "envelope" && m.envelope.id === ack.id);
    });
    const dispatch = status("dispatched", ["NDRF Charlie"], new Date(Date.now() + 2000).toISOString());
    await check("Dispatch with team name reaches the victim's phone", async () => {
      responder.send(dispatch);
      const m = await phone.waitFor((x) => x.type === "envelope" && x.envelope.id === dispatch.id);
      if (m.envelope.body.teams?.[0] !== "NDRF Charlie") throw new Error("team name lost");
    });
    await check("A phone that missed it live can catch up (GET /sos/:id)", async () => {
      const s = await (await get(`http://localhost:4100/sos/${sosId}`)).json();
      if (s.status !== "dispatched" || s.assignedTeams?.[0] !== "NDRF Charlie") throw new Error(JSON.stringify(s));
      if ("reporterPhone" in s || "bloodGroup" in s) throw new Error("leaks personal fields");
      return "status only, no personal data";
    });
    await check("A late, older update does not overwrite the dispatch", async () => {
      const late = status("acknowledged", [], ackAt); // same time as the first ack: stale
      late.id = randomUUID();
      responder.send(late);
      await responder.waitFor((m) => m.type === "ack" && m.envelopeId === late.id);
      const s = await (await get(`http://localhost:4100/sos/${sosId}`)).json();
      if (s.status !== "dispatched") throw new Error(`status went back to ${s.status}`);
    });
    await check("Malformed message is rejected, not stored", async () => {
      phone.ws.send("{not json");
      await phone.waitFor((m) => m.type === "error");
    });

    phone.ws.close();
    responder.ws.close();
  } finally {
    if (isWin) spawn("taskkill", ["/pid", String(node.child.pid), "/T", "/F"]);
    else { try { process.kill(-node.child.pid, "SIGTERM"); } catch { /* already gone */ } }
    await sleep(500);
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir; the OS cleans it */ }
  }
}

const skipLive = process.argv.includes("--protocol-only");
console.log("DeadZone demo preflight");
if (!skipLive) await partOne();
await partTwo();

const failed = results.filter((r) => r.ok === false);
console.log(
  failed.length
    ? `\n\x1b[31m${failed.length} check(s) failed.\x1b[0m Fix these before the demo; docs/DEMO.md has the troubleshooting table.\n`
    : `\n\x1b[32mAll ${results.length} checks passed.\x1b[0m\n`,
);
process.exit(failed.length ? 1 : 0);
