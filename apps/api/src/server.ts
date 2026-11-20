import os from "node:os";
import { mkdirSync } from "node:fs";
import { createServer } from "http";
import express from "express";
import PouchDB from "pouchdb";
import { PeerTable } from "@deadzone/comms";
import { couchDbUrl, getCouchConfig, remotePouchDbOptions } from "../scripts/couchdb";
import { attachMeshServer } from "./mesh";
import { publicStatus } from "./status";

/**
 * DeadZone coordination server. Runs on the responder's laptop,
 * co-located with the AI edge node (apps/ai). Handles:
 * - Local PouchDB for offline-first SOS storage
 * - WebSocket mesh at /mesh for LAN peer-to-peer messaging
 * - Peer table and heartbeat broadcasting (10s interval)
 * - Replication to remote CouchDB when network is available
 */

async function main() {
  const config = getCouchConfig();
  const app = express();
  const httpServer = createServer(app);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Initialize PouchDB (local + remote sync)
  // LevelDB will not create a missing parent directory, and .data/ is
  // gitignored, so on a fresh clone every write failed with "IO error:
  // .data/local/LOCK" until someone happened to run the seed script first.
  // DEADZONE_DATA_DIR lets the preflight check (scripts/preflight.mjs) run a
  // throwaway server without touching the demo's real records.
  const dataDir = process.env.DEADZONE_DATA_DIR ?? ".data";
  mkdirSync(dataDir, { recursive: true });
  const db = new PouchDB<any>(`${dataDir}/local`);

  // Continuous replication to the central CouchDB, when one is reachable. With
  // no CouchDB (the normal state in the field and at a demo table) this just
  // retries quietly in the background; nothing waits on it.
  // COUCHDB_SYNC=off skips it entirely.
  if (process.env.COUCHDB_SYNC !== "off") {
    const remote = new PouchDB<any>(couchDbUrl(config), remotePouchDbOptions(config));
    db.sync(remote, { live: true, retry: true })
      .on("error", (err) => console.error("[sync] error:", err))
      .on("paused", (err) => console.log(err ? `[sync] paused: ${err}` : "[sync] paused (up to date, or CouchDB unreachable -- retrying)"))
      .on("active", () => console.log("[sync] active"));
  }

  // Snapshot for a dashboard that connects after an SOS was already sent, or
  // that reloads mid-incident. The mesh fan-out is the live path; this is what
  // fills the screen on first paint.
  app.get("/sos", async (_req, res) => {
    try {
      const result = await db.allDocs({ include_docs: true });
      const docs = result.rows
        .map((row) => row.doc)
        .filter((doc) => Boolean(doc) && !String((doc as { _id: string })._id).startsWith("_design/"));
      res.json(docs);
    } catch (err) {
      console.error("[api] /sos failed:", err);
      res.status(500).json({ error: "Could not read the local store" });
    }
  });

  // One SOS's status, for the victim's tracking screen. The phone calls this
  // whenever its socket (re)connects, so a dispatch that happened while the
  // phone was out of reach still shows up. Returns only status fields -- not
  // the reporter's phone number or medical profile.
  app.get("/sos/:id", async (req, res) => {
    try {
      const doc = await db.get(req.params.id);
      res.json(publicStatus(doc));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        res.status(404).json({ error: "Not on the command node yet" });
        return;
      }
      console.error("[api] /sos/:id failed:", err);
      res.status(500).json({ error: "Could not read the local store" });
    }
  });

  // Peer table and heartbeat
  const peerTable = new PeerTable();
  const lanIp = getLanIp() ?? "localhost";
  const selfDeviceId = process.env.SELF_DEVICE_ID ?? "responder-laptop";

  const selfGeo = { lat: 12.9716, lng: 77.5946 }; // TODO(post-sih): from actual device location

  peerTable.startHeartbeat({
    deviceId: selfDeviceId,
    isResponder: true,
    geo: selfGeo,
  });

  // Attach WebSocket mesh server
  attachMeshServer(httpServer, {
    db,
    peerTable,
    selfDeviceId,
    selfIsResponder: true,
    selfGeo,
  });

  const PORT = Number(process.env.PORT ?? 4000);
  const HOST = "0.0.0.0";

  httpServer.listen(PORT, HOST, () => {
    console.log(`DeadZone coordination server listening on ${HOST}:${PORT}`);
    console.log(`Reachable from phones at: ws://${lanIp}:${PORT}/mesh`);
    console.log(
      process.env.COUCHDB_SYNC === "off"
        ? "Remote CouchDB sync: off"
        : `Remote CouchDB (synced when reachable): ${couchDbUrl(config)}`,
    );
  });
}

function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
