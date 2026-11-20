# Credits and attribution

Think to Impact 3.0 has a 0% plagiarism rule, so this file states exactly who built what. Keep it accurate if you change anything.

## The original project

**DeadZone** was designed and built by **Harshit Reddy Alla** and team **Silicon Syndicate** for Smart India Hackathon 2026 (problem statement 26206, Disaster Management, Software). All commits from 4 to 11 September 2026 in this repository's history are theirs. It is published under the MIT licence (see [`LICENSE`](LICENSE)), which permits re-use and modification with attribution. The Think to Impact organising panel knows this entry builds on it.

From the original project:

- The offline-first idea and the overall architecture: a laptop command node, a phone web app, PouchDB to CouchDB sync
- The civilian and responder web app (`apps/mobile`, originally a Figma Make export)
- The command node's WebSocket hub and store (`apps/api`)
- START triage rules and allocation (`packages/triage`), and Zod contracts (`packages/schema`)
- The offline Bengaluru basemap and tile server (`apps/dashboard`, `data/tiles`)
- The optional weather-explanation AI service (`apps/ai`)
- The SIH-era documentation, now in [`docs/sih-archive/`](docs/sih-archive/)

## What team SELECT \* from Winners added (Think to Impact 3.0, November 2026)

Team: **Kushal Jayavarapu** (lead), **Poorvi Holla**, **Samana** (ECE, 2nd year, JSSATE Bengaluru).

The work is on branch `claude/project-thread-pydq17`, in commits dated 20 November 2026 and after.

1. **Closed-loop acknowledgement.** In the original, nothing ever came back to the victim. The phone's tracking screen was scripted ("5 hops, acknowledged by Responder Alpha, 4 min ETA") whatever actually happened. Now a responder opening an incident tells the victim *seen*, and pressing Dispatch tells the victim *which team*, through the command node. A phone that was out of reach catches up when it reconnects. The tracking screen shows only real events with real times.
   New: `packages/schema/src/status.ts`, `apps/api/src/status.ts` (+7 tests), the `responder_status` handling in `apps/api/src/mesh.ts`, `GET /sos/:id`, the rewritten `LiveTracking.tsx`, and the dispatch wiring in `App.tsx` and `MapView.tsx`.
2. **Demo reliability.**
   - `pnpm demo`, a one-command cross-platform launcher. It replaces Windows scripts that hard-coded one person's folder and needed Docker.
   - `pnpm demo:check`, a 14-check preflight that proves the protocol on a throwaway server.
   - `scripts/capture-demo.cjs`, which records the offline backup.
3. **Bug fixes found while preparing the demo.**
   - On a fresh clone the command node could not store anything (`IO error: .data/local/LOCK`) until the seed script had happened to run first.
   - The command node's own source (`apps/api/src`) was never typechecked. Including it surfaced a type error.
   - The phone app's test script could not run (`tsx` missing).
   - Seed incidents showed "77 d ago".
4. **Honesty pass on the copy.** Removed "relay" and "mesh" wording that described radio behaviour the app doesn't have.
5. **Documentation and pitch.** A rewritten README and architecture, a stage runbook, the judging-criteria mapping, and a new deck.

## Third-party data

- Basemap: © OpenStreetMap contributors, via Protomaps (see `data/tiles/README.md`).
- Seed incidents are fictional. Names and phone numbers are invented.
- START triage: based on the public START adult triage algorithm (CHEMM, US HHS).
