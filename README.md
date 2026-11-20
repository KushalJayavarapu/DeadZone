# DeadZone

**Offline-first disaster response: an SOS that reaches a rescuer, and an answer that reaches the victim, with no mobile network and no internet.**

> When networks go down, DeadZone keeps rescue operations moving.

This branch of DeadZone is the **Think to Impact 3.0** entry (Pragyan 2026, JSSATE Bengaluru, 21 Nov 2026) of team **SELECT \* from Winners**: Kushal Jayavarapu, Poorvi Holla and Samana.

It builds on **DeadZone**, an MIT-licensed prototype that Harshit Reddy Alla's team (Silicon Syndicate) built for Smart India Hackathon 2026. [`CREDITS.md`](CREDITS.md) says exactly what came from that project and what this team added. Read it before presenting or re-using this work.

---

## The problem in one paragraph

Floods, landslides and cyclones take out mobile towers and power just when people most need to call for help. India has the 112 helpline, NDRF and SDRF, but all of them assume a working phone network between the victim and the control room. When that link is gone, people with charged phones still can't be heard, and they don't know whether anyone heard them. So they re-send, panic, or leave a safe spot to look for signal.

## What DeadZone does

A responder team carries one ordinary laptop, the **field command node**, and turns on its Wi-Fi hotspot. Phones in range join it and open a web page. No app install and no internet are needed.

| Stage | What happens | Where in the code |
|---|---|---|
| **Communicate** | The victim sends an SOS in three taps: severity, help needed, people count. It is saved on the phone first, then delivered to the command node, which confirms receipt. If the link is down, the SOS waits on the phone and sends itself when the link returns. | `apps/mobile/src/components/civilian/SendingScreen.tsx`, `services/queue.ts`, `apps/api/src/mesh.ts` |
| **Prioritise** | Every SOS is triaged with fixed START mass-casualty rules, not AI, and every result carries a stated reason. | `packages/triage` |
| **Coordinate** | Responders see every SOS live on an offline Bengaluru map, with the victim's blood group and contacts, and dispatch a team. | `apps/mobile/src/components/responder/MapView.tsx`, `apps/dashboard` (tile server) |
| **Close the loop** *(added for Think to Impact)* | The victim's phone shows, with real timestamps, *delivered → seen by a responder → team X dispatched*. Nothing on that screen is simulated. | `apps/mobile/src/components/civilian/LiveTracking.tsx`, `apps/api/src/status.ts` |
| **Deliver** | When any internet link returns, the command node replicates everything to a central CouchDB. Duplicates collapse because the message id *is* the database id. | `apps/api/src/server.ts` |

**What it is not:** it isn't a mesh network. Phones don't relay for each other, and there is no Bluetooth or LoRa. A web page cannot use those radios. Each phone talks directly to the laptop over Wi-Fi. That is honest, simple, and needs no special hardware. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#transport-reality).

---

## Run the demo (5 minutes, no internet needed)

Prerequisites: **Node 20+** (22 recommended) and **pnpm** (`corepack enable`). That's all. CouchDB and Ollama are optional and the demo never touches them.

```bash
pnpm install          # once, while you still have internet
pnpm demo --seed      # starts everything; --seed adds 20 fictional Bengaluru incidents
```

Then:

1. On the laptop, open **http://localhost:8443**, choose *Responder*, enter any username and password **123456**.
2. Turn on the laptop's hotspot. Join it from a phone and open the address `pnpm demo` prints, for example `http://192.168.137.1:8443`. Choose *Civilian* and send an SOS.
3. Watch it land on the map. Click it: the phone shows *Seen by a responder*. Pick a team and press **Dispatch**: the phone shows the team.

Before going on stage, in a second terminal:

```bash
pnpm demo:check       # 14 checks in ~10 s; exit code 0 means demo-ready
```

The full stage runbook, phone setup and troubleshooting are in [`docs/DEMO.md`](docs/DEMO.md).

---

## Commands

| Command | Does |
|---|---|
| `pnpm demo [--seed]` | Starts the tile server (:3000), command node (:4000) and web app (:8443) together. Ctrl+C stops all three. Works on Windows, macOS and Linux. |
| `pnpm demo:check` | Preflight: checks the running demo, then proves the protocol on a throwaway server (store and ACK, duplicate collapse, acknowledgement and dispatch reaching the phone, catch-up after a disconnect). |
| `node scripts/capture-demo.cjs <dir>` | Records the full story as screenshots and videos, as an offline backup. Needs Playwright installed globally. |
| `pnpm seed` | Loads the fictional seed incidents (timestamps re-based to "just now") |
| `pnpm typecheck` | Typechecks every package |
| `pnpm test` | 60 unit tests: triage rules (43), offline delivery queue (10), status updates (7) |

---

## Repository map

```
apps/
  mobile/       the web app: civilian (phone) and responder (laptop) screens
  api/          the command node: WebSocket hub, PouchDB store, CouchDB sync
  dashboard/    offline map tile server (vector tiles, fonts, sprites, style)
  ai/           optional weather-explanation service (Ollama + Phi-4-mini); not used in the demo
packages/
  schema/       Zod contracts, the single source of truth for every message
  comms/        envelope (de)serialisation, peer table, coverage state
  triage/       START triage rules and greedy nearest-team allocation
data/
  seed/         20 fictional Bengaluru incidents
  tiles/        offline Bengaluru basemap
scripts/        demo launcher, preflight check, backup capture
docs/           architecture, demo runbook, decisions, pitch notes
```

## Documentation

| File | Read it when |
|---|---|
| [`CREDITS.md`](CREDITS.md) | Before presenting: what is original work and what is ours |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | You need to explain how it works, or change it |
| [`docs/DEMO.md`](docs/DEMO.md) | Setting up and running the live demo; something breaks |
| [`docs/THINK-TO-IMPACT.md`](docs/THINK-TO-IMPACT.md) | Preparing the pitch: judging criteria, numbers, judge Q&A |
| [`docs/decisions.md`](docs/decisions.md) | Why something is deliberately missing |
| [`CLAUDE.md`](CLAUDE.md) | Working on the code with an AI assistant: settled rules and guardrails |
| [`docs/sih-archive/`](docs/sih-archive/) | History: the original SIH sprint logs, rehearsal notes and Windows scripts |

## Status and licence

A prototype, **not production software**. Before any real deployment, read the production checklist in [`CONTRIBUTING.md`](CONTRIBUTING.md). Licensed under MIT, see [`LICENSE`](LICENSE).
