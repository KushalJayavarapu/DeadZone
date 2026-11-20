import type PouchDB from "pouchdb";
import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import {
  tryDeserializeEnvelope,
  PeerTable,
  type PeerHeartbeatPayload,
} from "@deadzone/comms";
import {
  ResponderStatusUpdateSchema,
  SOSRequestSchema,
  type Envelope,
  type SOSRequest,
} from "@deadzone/schema";
import { applyStatusUpdate } from "./status";

/**
 * Mesh server: WebSocket endpoint at /mesh for LAN-based peer-to-peer
 * message passing. No relaying of any kind (see CLAUDE.md cut list).
 *
 * Every message is an Envelope; the server validates it against the schema,
 * writes it to PouchDB using the envelope.id as _id (dedup for free), echoes
 * an ACK to the sender, and fans the envelope out to every other connected
 * client. That fan-out is what puts an SOS on the responder's screen: the
 * dashboard holds a socket like any other client and renders what arrives.
 * It is server-to-client delivery, not a device-to-device hop -- relaying of
 * any kind remains on the cut list.
 *
 * Broadcast: peers receive heartbeats from the responder every 10 seconds,
 * carrying its current geo + responder status. Used by coverage.ts to
 * compute GREEN/AMBER/RED coverage metrics.
 */

export interface MeshServerConfig {
  db: PouchDB.Database<SOSRequest>;
  peerTable: PeerTable;
  selfDeviceId: string;
  selfIsResponder: boolean;
  /** Same value startHeartbeat() broadcasts, so the greeting below matches. */
  selfGeo?: { lat: number; lng: number };
}

export function attachMeshServer(httpServer: HttpServer, config: MeshServerConfig): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/mesh" });

  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[mesh] client connected (${clients.size} connected)`);
    ws.on("close", () => clients.delete(ws));
    handleClient(ws, config, clients);
  });

  return wss;
}

async function handleClient(ws: WebSocket, config: MeshServerConfig, clients: Set<WebSocket>) {
  // Register this client as a peer and start receiving heartbeats from the
  // local peer table (which broadcasts heartbeats on a 10s interval).
  let clientDeviceId: string | null = null;

  const sendHeartbeat = (payload: PeerHeartbeatPayload) => {
    const msg = JSON.stringify({ type: "heartbeat", payload, ts: new Date().toISOString() });
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  };
  config.peerTable.onHeartbeat((heartbeat) => {
    sendHeartbeat(heartbeat.payload);
  });

  // Greet immediately. The interval broadcast only fires every 10s, so without
  // this a freshly-connected client has no observation to reason about and its
  // coverage meter correctly -- but unhelpfully -- reads RED until the next
  // tick. This changes nothing about the interval or the coverage thresholds;
  // it just stops the client's first evaluation happening in the dark.
  sendHeartbeat({
    deviceId: config.selfDeviceId,
    isResponder: config.selfIsResponder,
    geo: config.selfGeo,
  });

  ws.on("message", async (raw: Buffer) => {
    let envelope: Envelope | null = null;
    try {
      envelope = tryDeserializeEnvelope(raw.toString());
      if (!envelope) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid envelope JSON" }));
        return;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: `Envelope validation failed: ${err}` }));
      return;
    }

    // Track the sender as a peer
    if (!clientDeviceId) {
      clientDeviceId = envelope.orig;
      config.peerTable.updatePeer({
        deviceId: clientDeviceId,
        isResponder: false, // phones connecting to this server are not responders
      });
    }

    // Store the envelope in PouchDB. What "store" means depends on the type.
    const stored = await storeEnvelope(config.db, envelope);
    if (!stored.ok) {
      ws.send(JSON.stringify({ type: "error", message: stored.message, envelopeId: envelope.id }));
      return;
    }

    // Echo an ACK to the sender.
    ws.send(JSON.stringify({ type: "ack", envelopeId: envelope.id }));

    // Then hand it to everyone else. Wrapped in an outer {type:"envelope"}
    // rather than sent bare: Envelope.type has its own vocabulary ("sos",
    // "ack", ...) that would collide with the control messages above.
    const payload = JSON.stringify({ type: "envelope", envelope });
    let fannedOut = 0;
    for (const peer of clients) {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(payload);
        fannedOut++;
      }
    }
    console.log(`[mesh] stored ${envelope.id}, fanned out to ${fannedOut} other client(s)`);
  });

  ws.on("close", () => {
    console.log("[mesh] client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[mesh] client error:", err);
  });
}

type StoreResult = { ok: true } | { ok: false; message: string };

/**
 * Persists one envelope on the command node.
 *
 * - `sos`: the body is the SOS record, stored with the envelope id as `_id`,
 *   so the same SOS delivered twice collapses to one document (409 = already
 *   have it, which is success).
 * - `responder_status`: a responder acknowledging or dispatching. Applied to
 *   the SOS it names, last-write-wins on the responder's timestamp
 *   (status.ts). A duplicate or stale update is accepted and changes nothing.
 *
 * Before this function existed every envelope body was written as if it were
 * an SOS, whatever its type -- harmless only because nothing but SOS was ever
 * sent.
 */
async function storeEnvelope(db: PouchDB.Database<SOSRequest>, envelope: Envelope): Promise<StoreResult> {
  if (envelope.type === "sos") {
    const sos = SOSRequestSchema.safeParse(envelope.body);
    if (!sos.success) return { ok: false, message: "SOS body failed validation" };
    try {
      await db.put({ ...sos.data, _id: envelope.id });
    } catch (err) {
      if ((err as { status?: number }).status !== 409) {
        console.error("[mesh] failed to write SOS:", err);
        return { ok: false, message: "Failed to store message" };
      }
      // Already stored (same envelope, same UUID) -- idempotent.
    }
    return { ok: true };
  }

  if (envelope.type === "responder_status") {
    const update = ResponderStatusUpdateSchema.safeParse(envelope.body);
    if (!update.success) return { ok: false, message: "Status update failed validation" };
    // Two responders pressing at once can race on _rev; retry a couple of
    // times rather than dropping the update.
    for (let attempt = 0; attempt < 3; attempt++) {
      let doc: PouchDB.Core.ExistingDocument<SOSRequest>;
      try {
        doc = await db.get(update.data.sosId);
      } catch {
        return { ok: false, message: "No SOS with that id on the command node" };
      }
      const next = applyStatusUpdate(doc, update.data);
      if (!next) return { ok: true }; // stale or duplicate: nothing to change
      try {
        await db.put(next);
        console.log(`[mesh] ${update.data.sosId} -> ${update.data.status}`);
        return { ok: true };
      } catch (err) {
        if ((err as { status?: number }).status !== 409) {
          console.error("[mesh] failed to apply status update:", err);
          return { ok: false, message: "Failed to store status update" };
        }
      }
    }
    return { ok: false, message: "Status update kept conflicting; try again" };
  }

  return { ok: false, message: `Envelope type "${envelope.type}" is not handled by the command node` };
}
