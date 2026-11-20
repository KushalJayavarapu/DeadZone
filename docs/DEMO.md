# Demo runbook (Round 2: live working demo)

Everything needed to set up, run and rescue the live demo. Built for Think to Impact 3.0 (21 Nov 2026, Round 2 at 2:30 PM), and valid for any later demo.

**The one thing the judges must see:** a phone with **mobile data visibly off** sends an SOS. It lands on the responder's offline map. The responder dispatches a team, and **the victim's phone shows that team by name**. The internet is never involved.

---

## Kit

| Item | Notes |
|---|---|
| Laptop (command node) | Charged and plugged in. Node 20+, repo installed (`pnpm install` done **at home, with internet**). |
| 1 Android phone (victim) | Chrome. Charged. Ideally a second phone too, to show two victims. |
| Optional second screen | The responder view on the laptop is enough. |
| Pen drive | Deck PDF + PPTX, **and the backup video and screenshots**. |
| Phone charger, power strip | The day runs 9 to 5. |

---

## Before the event (do this the night before)

1. `git pull`, then `pnpm install` while you still have internet.
2. `pnpm demo --seed` and walk through the whole story once on your own phone.
3. Run `pnpm demo:check` in a second terminal. All 14 checks must pass.
4. Record the backup (needs Playwright: `npm i -g playwright && npx playwright install chromium`):
   `node scripts/capture-demo.cjs demo-backup`. Keep the folder on the laptop **and** the pen drive. Also screen-record one real run with the phone (the phone's own screen recorder is fine).
5. **Enable real GPS on the demo phone** (otherwise the pin lands at an approximate point near the city centre, because browsers block location on plain-HTTP pages):
   Chrome → `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → add `http://<laptop-hotspot-ip>:8443` → Enabled → Relaunch.
   The hotspot IP is usually stable for a given laptop (Windows: often `192.168.137.1`). Check it with `pnpm demo`'s printout.

---

## At the venue, 15 minutes before your slot

### Laptop
1. Turn **on** the laptop's mobile hotspot (Windows: Settings → Network → Mobile hotspot; "Share over: Wi-Fi").
2. Disconnect the laptop from venue Wi-Fi if you want to prove no internet. The demo doesn't need it.
3. `pnpm demo --seed`. Wait for the **"DeadZone demo is up"** banner, and note the phone address it prints.
4. Second terminal: `pnpm demo:check`. All checks must pass. The "no internet" line is a WARN if the laptop is online, which is fine.
5. Browser → `http://localhost:8443` → **Responder** → any username, password **123456**. Leave it on the Map tab.

### Phone
1. Airplane mode **on**, then Wi-Fi **on**. Mobile data must be visibly off. Show the judge.
2. Join the laptop's hotspot. When Android says "This network has no internet access", tap **Stay connected** (or "Keep Wi-Fi connection"). Also turn off *Switch to mobile data* / *Adaptive Wi-Fi* if offered. **This is the most common way this demo dies.**
3. Open the printed address, for example `http://192.168.137.1:8443`.
4. Log in as **Civilian** (any name and number), pick a blood group, Finish. Stop on the big SOS button.
5. Screen timeout to 10 min, brightness up, notifications silenced.

---

## The demo script (about 3 minutes; the 90-second version is in bold)

| # | Do | Say |
|---|---|---|
| 1 | **Hold up the phone: airplane mode, Wi-Fi to the laptop only.** | **"This phone has no mobile network and no internet, like Kodagu in 2018 or Wayanad in 2024. The only thing it can reach is this laptop, which a rescue team carries in."** |
| 2 | **Triple-tap SOS → Critical → Medical + Rescue → 3 people → Send.** | **"Three taps. It's saved on the phone first, then sent."** |
| 3 | **Point at the laptop: new red pin, incident in the rail.** | **"It's on the responder's map in under a second. The map is offline too: every tile is on this laptop."** |
| 4 | Click the incident. | "Triage is fixed START rules, not AI, and it shows its reason. Blood group and the victim's number came with the SOS." |
| 5 | **Show the phone: "Seen by a responder".** | **"This is what we added. The victim now knows a human has seen it. Before this, the old app showed a fake ETA."** |
| 6 | **Select teams → Charlie → Dispatch. Show the phone.** | **"Team dispatched, by name, on the victim's phone. Every line here has a real timestamp. Nothing is simulated."** |
| 7 | *(Optional, strongest proof.)* Turn the phone's Wi-Fi **off**, send a second SOS, show "Saved on this phone. Not yet delivered", then Wi-Fi **on**. | "No link, and nothing is lost. It's held on the phone." *(When it reconnects:)* "It delivered itself. And if you send it twice, it still collapses to one record." |
| 8 | Close. | **"No tower, no internet, no app install. Just a laptop and the phones people already have."** |

*For step 7: the top strip on the phone is driven only by the command node's heartbeat, so it turns amber 30 s after the last one and red after 2 min. It won't change the instant you cut Wi-Fi, which is correct: it reports what it has observed. The tracking screen's own "Not connected" line reacts immediately. The tracking screen only re-delivers when that page is open. After turning Wi-Fi back on, reopen `http://<ip>:8443` if the page had been closed.*

---

## If something breaks

| You see | Cause | Fix |
|---|---|---|
| Phone page won't load | The phone left the hotspot (no-internet auto-switch) | Rejoin and tap **Stay connected**. Check the IP. |
| `pnpm demo` says a port is in use | An old run is still going | Close the other terminal. Or Windows: `netstat -ano \| findstr :8443`, then `taskkill /PID <pid> /F`. |
| SOS stays "Saved on this phone" | No link to the laptop | **Use it**: "it's holding it, nothing is lost", then fix the Wi-Fi and it resends. |
| Pin lands near Bengaluru centre, not your location | GPS blocked on http | Expected without the Chrome flag above. Say: "location comes from GPS. On plain http the browser withholds it, and production runs HTTPS." |
| Grey hand-drawn blocks instead of a map | Tile server not running | It started with `pnpm demo`, so restart. Then switch the responder view to SOS and back to Map. |
| Dark map, pins visible, no streets | Tiles 404 | Narrate over it. The pins carry the story. |
| Dispatch shows "Not sent: …" | Dashboard lost its socket | Reload the dashboard (incidents come back from the store) and press Dispatch again. |
| Anything stalls > 10 s | Something unforeseen | **Switch to the backup video.** Rehearse that hand-off so it looks deliberate. |

**Reset between runs:** stop `pnpm demo`, delete `apps/api/.data` (the command node's store), then `pnpm demo --seed`. On the phone, clear site data for the address (Chrome → ⋮ → Settings → Site settings → All sites).

---

## What's proven, and how

| Claim | Evidence |
|---|---|
| SOS survives with no network | Local write before any network call (`SendingScreen.tsx`). The outbox queue has 10 unit tests. |
| Delivery confirmed, duplicates collapse | `pnpm demo:check`: ACK round trip, and 3 sends give 1 record |
| Acknowledgement and dispatch reach the victim | `pnpm demo:check` (protocol) and `scripts/capture-demo.cjs` (full UI, fails if the phone never shows the team) |
| Phone that missed it catches up | `pnpm demo:check`: `GET /sos/:id` |
| Triage rules | 43 unit tests, every START branch |
| Offline map with labels | `pnpm demo:check` fetches a tile, glyphs and sprites through the app's own address |
| Real phone over hotspot | Proven on hardware by the original SIH team (6 Sep 2026). **Re-verify on your own phone the night before.** |
| CouchDB sync on reconnect | Original team's `pnpm --filter @deadzone/api sync-test` against a local CouchDB. Not part of this demo, so don't claim it live unless CouchDB is running. |
