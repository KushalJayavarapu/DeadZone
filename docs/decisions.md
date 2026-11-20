# Decisions — what we are not building

DeadZone's demo deadline is **10 September 2026**. This is a six-day
sprint, not a product build. The bias is: fewer features, working
reliably, demonstrable offline. A judge who watches one SOS cross three
phones in airplane mode and then sync will remember it — five
half-working features leave nothing behind.

Every cut below is deliberate. If a task seems to need one of these,
stop and ask rather than implementing it. Where a cut leaves a
`TODO(post-sih)` in code, that marks the correct-but-slower path for
after the Grand Finale (December), not a bug.

## Cut list

### Voice input / faster-whisper
**Cut.** Typed SOS only.
Voice capture and local transcription add a model, a permissions
surface, and a failure mode (background noise, dialects) with no
offline fallback story we can build in six days. Typed input is
reliable and testable end to end.

### IndicTrans2
**Cut.** Hand-translated fixed Hindi strings; the LLM answers in
English.
A full translation model is another multi-GB dependency on the edge
node competing with Phi-4-mini for VRAM, for a feature (fluent
multilingual LLM output) that isn't the core pitch. UI copy that needs
Hindi is translated once, by hand, and shipped as a fixed string table.

### OSRM routing
**Cut.** Straight-line haversine distance and bearing.
Turn-by-turn road routing needs offline road-network data prepared and
hosted for the demo area, plus a routing engine to stand up and keep
running. Haversine distance/bearing is enough to rank "which responder
is closest" for the demo and has zero infrastructure cost.

### Allocation optimisation / Hungarian algorithm
**Cut.** Greedy nearest-available only.
Optimal assignment matters at scale; for a six-day build with a handful
of demo responders, greedy nearest-available produces the same visible
outcome without an optimisation library or its edge cases.

### Ed25519 signing
**Cut.** Unsigned envelopes for now.
Signing matters for a real deployment resisting spoofed SOS traffic. It
does not change what the demo shows, and it adds key management (device
identity, key exchange over an ad hoc mesh) that isn't solved yet.

### Multi-hop beyond one relay
**Cut.** The `ttl` field exists in the envelope, but only `A → B → C`
is demoed.
True multi-hop mesh routing needs a routing/forwarding strategy and
loop prevention beyond what a hop-count field alone provides. The field
is reserved in the contract so the demo path (one relay) is a real
subset of the eventual behaviour, not a special case that gets thrown
away.

### Sophisticated conflict resolution
**Cut.** Plain PouchDB sync, last-write-wins.
The same SOS document arriving via multiple relay paths already
collapses automatically because the message UUID is the PouchDB
document `_id` — see the architecture note in `CLAUDE.md`. Beyond that,
custom merge logic for concurrent edits is a real distributed-systems
problem that doesn't need solving to demonstrate offline sync working.

### Design polish
**Cut.** Unstyled but legible; visual design arrives from outside the
build team.
Screen time this week goes to the offline SOS → sync path actually
working, not to visual polish. Styling is centralised behind tokens
(`packages/ui`, still a placeholder) so a design pass can drop in later
without touching component logic.

## Why these and not others

The kept scope is exactly what's needed to demonstrate the narrative
spine — **COMMUNICATE → UNDERSTAND → PRIORITISE → COORDINATE →
DELIVER** — end to end and offline. Everything on this list is real
work that improves correctness, scale, or security, but none of it
changes whether the judges see a working offline rescue flow on
10 September.

---

## Think to Impact 3.0 decisions (20 Nov 2026)

Made by team SELECT * from Winners while adapting the SIH prototype for a
one-day ideathon with a live-demo round. Each one names what was rejected.

### Closed-loop acknowledgement is the one new feature
**Chosen:** responder "seen" and "dispatch" travel back to the victim's
phone through the command node, as a `responder_status` envelope.
**Rejected:** voice SOS, Kannada UI, LoRa, the greedy allocator in the UI.
Each is either on the cut list above, needs hardware we don't have, or
doesn't change what a judge sees. The acknowledgement fixes a real gap:
the victim had no way to know they were heard, and the screen that
pretended otherwise was scripted.

### Remove fabricated UI rather than label it
The tracking screen's hops, ETA, moving team marker and "Alpha Team, NDRF"
card were removed, not disclaimed. A judge asking "is that real?" during a
live demo is worse than a plainer screen. Copy that described radio relay
("relay path", "mesh") was reworded to "command node" and "link".

### Status updates are last-write-wins on the responder's clock
Matches the sync layer's existing rule. Allows "Undo" on a dispatch. A
stale update arriving late is ignored. Clock skew between two responder
laptops could misorder updates. That is acceptable with one command node,
and should be revisited with several (`TODO(post-sih)`).

### "Seen" is sent when a responder opens the incident
Rather than a separate "acknowledge" button. Opening it is the real event
and costs the responder no extra tap. Sent once per incident per session.

### `GET /sos/:id` returns status fields only
The victim's phone needs status, team names and timestamps, not other
people's phone numbers or medical data. The endpoint is unauthenticated
like the rest of the demo, so it exposes nothing personal.

### One-command launcher instead of fixing the Windows scripts
`START_ALL.ps1` hard-coded one developer's folder and needed Docker.
`pnpm demo` is cross-platform Node with no new dependencies. The old
scripts are kept in `docs/sih-archive/` for reference.

### Preflight runs its protocol checks on a throwaway server
A self-test must not plant a fake SOS on the map the judges are about to
see, so `pnpm demo:check` only reads from the live demo and drives the
protocol against a second command node on :4100 with an empty temporary store.

### The weather AI is out of the pitch
`apps/ai` works but isn't reachable from the app's UI, needs a cached
forecast fetched online, and needs a warm 2.5 GB model. It is mentioned
as optional and advisory, never demoed.
