# CLAUDE.md

Standing context for Claude Code on this repo. Read before any task.

---

## What this is

**DeadZone** — an offline-first disaster response app, originally built for Smart India Hackathon 2026 by Harshit Reddy Alla's team, and carried forward by team SELECT * from Winners for **Think to Impact 3.0** (Pragyan 2026, 21 Nov 2026). Who built what is in `CREDITS.md`; keep it accurate when you add work.

Core claim: when cellular and internet fail, victims can still send an SOS, responders still coordinate, and everything syncs once a link returns.

One-line pitch: *"When networks go down, DeadZone keeps rescue operations moving."*

The narrative spine, used in the pitch, the demo order, and the build order:
**COMMUNICATE → UNDERSTAND → PRIORITISE → COORDINATE → DELIVER**

For Think to Impact the spine is told as **COMMUNICATE → PRIORITISE → COORDINATE → CLOSE THE LOOP → DELIVER**: the weather AI (UNDERSTAND) is not in the app UI, so it is not demoed, and the closed-loop acknowledgement to the victim is this team's addition. Pitch material: `docs/THINK-TO-IMPACT.md`; stage runbook: `docs/DEMO.md`.

---

## Deadline reality

**Current: Think to Impact 3.0, Saturday 21 November 2026** — Round 1 a 10-minute pitch judged equally on real-world use, feasibility, sustainability, strengths and challenges; Round 2 a live demo. 0% plagiarism tolerance, hence `CREDITS.md`.

*Historical: SIH demo deadline was 10 September 2026; the sprint guidance below dates from then and still holds.*

This is a six-day sprint, not a product build. Bias every decision toward: fewer features, working reliably, demonstrable offline. A judge who watches one SOS cross three phones in airplane mode and then sync will remember it. Five half-working features leave nothing behind.

When a choice is between "correct" and "shippable by Tuesday," pick shippable and leave a `TODO(post-sih)` comment.

---

## Stack

| Layer | Choice |
|---|---|
| Mobile | Vite / React / TypeScript — a **web app**, served over the LAN and opened in the phone's browser. One app, civilian and responder roles. Not React Native, not Expo. |
| Transport | WebSocket over the responder's Wi-Fi hotspot LAN. A browser cannot reach Nearby Connections or BLE — see "Transport reality" below. |
| Local data | Server: PouchDB (`apps/api/.data/local`). Browser: `localStorage` — `apps/mobile/src/services/pouchdb.ts` is named for PouchDB but does not use it. |
| Sync | PouchDB ↔ CouchDB bidirectional replication |
| API | Node / Express / TypeScript |
| AI | Ollama + Phi-4-mini on a laptop edge node, reached over local Wi-Fi |
| Maps | MapLibre + PMTiles, self-hosted glyphs and sprites |
| Monorepo | pnpm workspaces |

---

## Architecture decisions

These are settled. Do not relitigate them in code or suggestions.

**AI runs on an edge node, not on the phone.** Phi-4-mini needs ~2.5 GB VRAM; phones can't host it. The responder carries a laptop acting as a field command node — this mirrors how NDRF actually deploys. Phones are thin clients calling it over the local hotspot. Rejected: on-device LLM (VRAM), and a two-model hybrid (prompt duplication, degraded Hindi output).

**Life-critical decisions never touch the LLM.** Triage and resource allocation are deterministic rules derived from the START mass-casualty protocol, with explicit reason codes on every output. The LLM is used only for natural-language weather explanation, where fluent phrasing is the point and a wrong word is not fatal. This is a core pitch argument — preserve it.

**Message UUID is the document `_id`.** The same SOS arriving twice collapses to one document automatically — proven server-side, where the envelope id becomes the PouchDB/CouchDB `_id`. Do not add a separate dedup layer at the DB level.

**Coverage is measured, never estimated.** The coverage meter derives GREEN/AMBER/RED from the recency of observed peer heartbeats — nothing else. Never state a fixed range in metres or kilometres anywhere in code comments, UI copy, or docs: the app has no way to measure distance, so any number would be invented.

**Transport reality — read this before writing or saying anything about the mesh.** The app is a web page in a phone browser. That rules out Android Nearby Connections, BLE, and RSSI: the browser exposes none of them. What actually exists is a WebSocket from each phone to the responder's laptop over its Wi-Fi hotspot. `rssi` survives as an optional field on `PeerSchema` and is never populated. Claims about BLE mesh, P2P_CLUSTER, signal strength, or metre ranges are not supported by this code — do not put them in the UI, the docs, or the pitch.

---

## Cut list — do not build these

Decided deliberately. If a task seems to need one of these, stop and ask rather than implementing it.

- Voice input / faster-whisper — typed SOS only
- IndicTrans2 — hand-translated fixed Hindi strings; LLM answers in English
- OSRM routing — straight-line haversine distance and bearing
- Allocation optimisation / Hungarian algorithm — greedy nearest-available only
- Ed25519 signing — unsigned envelopes for now
- Relaying of any kind — there is no device-to-device hop at all. Each phone holds a direct WebSocket to the command node. `ttl` exists on the envelope and is never decremented or acted on.
- Sophisticated conflict resolution — plain PouchDB sync, last-write-wins
- Design polish — unstyled but legible; visual design arrives from outside the build team

---

## Conventions

- **Zod schemas are the source of truth.** Always `export const XSchema = z.object(...)` then `export type X = z.infer<typeof XSchema>`. Never hand-write a type that duplicates a schema.
- `packages/schema` is the contract. Changes there affect every package — flag them explicitly rather than editing quietly.
- Everything must pass `pnpm typecheck` and `pnpm test` before it is considered done. Before any demo, `pnpm demo:check` must pass.
- Offline-first means **write locally first, always.** No code path may require a network call to succeed.
- No hardcoded colours. Styling goes through tokens in `packages/ui` so external design can be applied late.
- Seed data lives in `data/seed/` and is clearly fictional. Bengaluru-area coordinates.

---

## Structure

```
apps/
  mobile/       Vite React web app — civilian + responder
  api/          Express coordination + sync
  dashboard/    offline map tile server (tiles, glyphs, sprites)
  ai/           optional weather explainer (Ollama); not in the demo
packages/
  schema/       Zod contracts — source of truth
  comms/        envelope, peer table, transport
  triage/       START rules + allocation
  ui/           placeholder — design tokens
data/seed/      fictional demo records
infra/          docker-compose (CouchDB)
docs/           ARCHITECTURE, DEMO (runbook), THINK-TO-IMPACT (pitch), decisions; sih-archive/ = SIH-era logs
scripts/        demo.mjs (pnpm demo), preflight.mjs (pnpm demo:check), capture-demo.cjs (backup)
```

---

## Guardrails

- **Never modify `apps/mobile` unless a task says so explicitly.** It is a Figma Make export (see its Figma plugins in `vite.config.ts`) and may be edited there concurrently; unannounced edits get overwritten or cause conflicts. There is no native build — that was the old reason, and it no longer applies. (Wolf / Kushal explicitly approved the Think to Impact edits on 20 Nov 2026: LiveTracking, SendingScreen, App, MapView, copy fixes. Ask again for new work there.)
- Do not add dependencies beyond what the current task strictly needs. Every dependency is a Vite bundling risk this week.
- Do not scaffold ahead. Placeholder directories stay empty until their task arrives.
- Do not "helpfully" implement cut-list items.
- When something on the cut list looks necessary, say so and wait — don't decide unilaterally.

---

## Known risks

- The whole transport is one WebSocket to the laptop. There is no device-to-device path and no relay: if the laptop is unreachable, nothing moves. The "Relay 1 / Relay 2" hop chain in `SendingScreen` is animation, not transport.
- Offline maps commonly render tiles but no labels, because the style JSON reaches for remote glyphs and sprites. Both must be self-hosted.
- Android drops Wi-Fi networks with no internet uplink (captive-portal detection). Affects the hotspot demo path.
- The phone is a browser tab. Backgrounding it, locking the screen, or Chrome discarding the tab kills the WebSocket and any in-flight send — there is no background service to fall back on.
