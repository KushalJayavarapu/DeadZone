# Architecture

How DeadZone works, why it is built this way, and where each piece lives. Written so someone with no prior context can explain it to a judge or change it safely.

---

## Governing principle

**The network is an optional enhancement, never a dependency.**

Every write goes to local storage first. Delivery and sync happen afterwards and may be delayed indefinitely. No code path needs a network call to succeed. Most emergency software assumes the opposite, so it stops working exactly when it is needed.

---

## The pieces

```
     VICTIM'S PHONE (any browser)                 FIELD COMMAND NODE (one laptop)
 ┌───────────────────────────────┐          ┌───────────────────────────────────────────┐
 │ web app, civilian screens     │          │ apps/mobile   Vite dev server :8443       │
 │  · SOS in 3 taps              │  Wi-Fi   │   serves the app, proxies /mesh /sos /tiles│
 │  · saved to localStorage FIRST│ hotspot  │ apps/api      command node :4000          │
 │  · outbox queue, retries      │◄────────►│   WebSocket hub /mesh                      │
 │  · "Your SOS" tracking screen │ WebSocket│   PouchDB store (apps/api/.data/local)     │
 └───────────────────────────────┘          │   GET /sos, GET /sos/:id                   │
                                            │ apps/dashboard tile server :3000           │
     RESPONDER (browser on the laptop,      │   Bengaluru vector tiles, fonts, sprites   │
     or a second laptop/tablet on the       │ apps/ai (optional) weather explainer :4001 │
     same hotspot)                          └───────────────┬───────────────────────────┘
 ┌───────────────────────────────┐                          │ only when an internet
 │ web app, responder screens    │                          │ link exists (satellite,
 │  · offline map + incident rail│                          │ restored fibre, a phone
 │  · START triage with reasons  │                          ▼ tether at a base camp)
 │  · medical profile, dispatch  │                  ┌──────────────────┐
 └───────────────────────────────┘                  │ central CouchDB  │
                                                    └──────────────────┘
```

There is one app (`apps/mobile`) with two roles chosen at login. Everything the phone needs is served by the laptop. The phone never needs the internet.

---

## Transport reality

This is the part most often described wrongly.

- The app is a **web page in a phone browser**. A browser cannot use Bluetooth Low Energy scanning, Android Nearby Connections, Wi-Fi Direct, LoRa or signal strength (RSSI). None of those are used.
- Each phone holds **one WebSocket** to the command node over the laptop's Wi-Fi hotspot. There is **no device-to-device relay**: an SOS goes phone → laptop, one hop. The `ttl` field on the envelope is reserved and never acted on.
- **Reach** is whatever the laptop's hotspot reaches. The app never states a range in metres, because it cannot measure distance. The coverage meter is derived only from how recently the phone heard the command node's heartbeat (`packages/comms/src/coverage.ts`).
- **Why this is still the right design for a prototype:** it needs no app install, no special hardware and no permissions, and it works on any phone with a browser. Extending reach is a hardware question, covered under the roadmap in [`THINK-TO-IMPACT.md`](THINK-TO-IMPACT.md): a better access point, a vehicle-mounted router, or LoRa gateways feeding the same command node.

---

## Data flow: one SOS, end to end

1. **Saved.** The victim taps SOS, picks severity, needs and people count. `SendingScreen` builds an `SOSRequest` with a fresh UUID and writes it to the phone's local store, then adds the id to the outbox queue (`services/queue.ts`). **This step works with no network at all.**
2. **Sent.** The phone wraps it in an `Envelope` (`packages/schema/src/envelope.ts`, `id` = the SOS id) and sends it over the WebSocket.
3. **Stored and confirmed.** The command node (`apps/api/src/mesh.ts`) validates it against the Zod schema and stores it in PouchDB with `_id` = envelope id. If that id already exists it is a duplicate (a retry), so it is accepted and ignored. Then it **ACKs** the phone. Only on that ACK does the phone remove the SOS from its outbox.
4. **Shown.** The command node fans the envelope out to every other connected socket. The responder dashboard is one of them, so a pin appears on the offline map with no reload. A dashboard opened later loads everything already stored from `GET /sos`.
5. **Triaged.** The dashboard runs `triageSOSReport` (START rules from `packages/triage`) and shows a colour and a reason. A phone-sent SOS has no vital signs, so the START inputs are approximated from the self-reported severity (`packages/triage/src/adapter.ts`). This is a conservative, explainable default, not a clinical assessment.
6. **Seen** *(Think to Impact addition)*. When a responder opens the incident, the dashboard sends a `responder_status` envelope with status `acknowledged`.
7. **Dispatched** *(Think to Impact addition)*. The responder picks one or more teams and presses Dispatch. A `responder_status` envelope with status `dispatched` and the team names goes out. The dashboard shows "Dispatched" only after the command node ACKs it.
8. **Back to the victim** *(Think to Impact addition)*. The command node applies each status update to the stored SOS (`apps/api/src/status.ts`, last-write-wins on the responder's timestamp) and fans it out. The victim's "Your SOS" screen (`LiveTracking.tsx`) listens for updates about its own SOS id. Whenever its socket reconnects, it also calls `GET /sos/:id`, so a phone that was out of reach when the team was dispatched still finds out. That endpoint returns status fields only, never phone numbers or medical data.
9. **Synced.** When the laptop has any internet link, PouchDB replicates to the central CouchDB (`live: true, retry: true`). Without one it retries quietly forever. Nothing waits on it.

### If the link is down at step 2

The SOS stays in the outbox. The victim sees "Saved on this phone. Not yet delivered", and the tracking screen says it will send by itself. On the next successful connection, `drainQueue` resends everything pending, in order. Re-sending is safe because of step 3's id rule.

---

## Design decisions that matter in a pitch

| Decision | Why |
|---|---|
| **Message id = database id** | The same SOS arriving twice, from a retry or a reconnect, collapses to one record with no dedup code. CouchDB replication inherits the property for free. Proven by `pnpm demo:check`: 3 sends, 1 record. |
| **No AI in life-critical decisions** | Triage and allocation are fixed START rules, each with a reason code, and are fully unit-tested (43 tests). A model that can hallucinate never decides who gets help first. The optional LLM (`apps/ai`) only rephrases weather facts that were computed deterministically, and it isn't part of the demo. |
| **ACK before "delivered"** | The phone shows "delivered" only after the command node confirms it stored the SOS. The dashboard shows "dispatched" only after the command node confirms it stored the dispatch. Neither screen claims anything it didn't observe. |
| **No invented numbers** | No ETA, no distance range, no device counts. Nothing in the system measures them, so the UI doesn't show them. |
| **Status is last-write-wins** | It matches the sync layer's rule. A late, older update can't overwrite a newer one. A newer one can undo a dispatch. Covered by `apps/api/src/status.test.ts`. |
| **Web app, not native** | No install and no Play Store, so it works on any phone in the crowd. The cost: no radio access, and the socket dies if the tab is backgrounded. Both are noted under known limits. |

---

## Contracts (packages/schema)

All wire formats are Zod schemas. Types are inferred from them, never written by hand.

| Schema | Used for |
|---|---|
| `EnvelopeSchema` | Every WebSocket message: `id, orig, ts, ttl, prio, type, geo, body` |
| `SOSRequestSchema` | The SOS record. It includes optional blood group, up to 3 emergency contacts, medical notes, and (new) `assignedTeams` |
| `ResponderStatusUpdateSchema` *(new)* | Body of a `responder_status` envelope: `sosId, status, teams?, responderName?, at` |

Server → client control messages (not envelopes): `{type:"heartbeat"}`, `{type:"ack", envelopeId}`, `{type:"envelope", envelope}`, `{type:"error", message}`.

---

## Known limits (say them before a judge does)

- **One laptop is a single point of failure.** If it is down, nothing moves, although phones keep their SOS queued. Mitigation: a spare laptop with the same image. Multi-node sync is on the roadmap.
- **Reach = one Wi-Fi hotspot.** It depends on the hardware, walls and terrain, and the app cannot measure it. Never quote a number on stage.
- **Browser tab must stay open.** Locking the phone or switching apps can drop the socket. The SOS is safe in the outbox and resends when the page is reopened.
- **Location over plain HTTP.** Browsers only give GPS to secure pages. Served as `http://<laptop-ip>`, the phone falls back to an approximate point near the city centre. [`DEMO.md`](DEMO.md) shows how to enable real GPS on the demo phone. Production needs HTTPS on the command node.
- **Team roster is fictional** (`MOCK_TEAMS`). The tested greedy allocator (`packages/triage/src/allocate.ts`) isn't wired to the dashboard yet. Dispatch is a human choice.
- **No authentication or signing.** Anyone on the hotspot could send an SOS. That is acceptable for a demo and listed in `decisions.md` for production.
- **Android may leave a Wi-Fi network with no internet.** Tap "stay connected". See `DEMO.md`.
