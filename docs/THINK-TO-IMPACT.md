# Think to Impact 3.0: pitch notes

Pragyan 2026 Day 2, JSSATE Bengaluru, **Saturday 21 Nov 2026**. Team **SELECT \* from Winners** (Kushal Jayavarapu, Poorvi Holla, Samana).

This file is the source behind the deck. It covers how we're judged, what we claim and the evidence for each claim, and answers to the hard questions. The deck lives outside the repo, in the project's shared files (`think-to-impact/DeadZone-Think-to-Impact.pptx` / `.pdf`).

---

## How we're judged

| Round | Format | What matters |
|---|---|---|
| 1 · Pitch, 10:00 AM | **10 min hard cap**, PPT/PDF | Five criteria, **10 points each, equally weighted**: Real-world use · Feasibility · Sustainability · Strengths · Challenges thought through |
| 2 · Live demo, 2:30 PM (shortlist only) | Working prototype, hardware or software | A working model. Bring an offline backup (video/screenshots) |
| Rules | 0% plagiarism tolerance · judges' decisions final | Every claim maps to code, a test or a live step |

Since all five criteria are worth the same, the deck spends roughly equal time on each. "Challenges" is the one teams usually skimp on, so it is our cheapest place to beat other teams.

---

## Our claims and the evidence for each

| Claim | Evidence we can show |
|---|---|
| Disasters cut the phone network exactly when it's needed | Kerala 2018: mobile networks broke down as floods cut power and fuel ([Scroll](https://scroll.in/latest/890953/scroll_in)), and Indus Towers alone had to restore about 2,500 towers ([ElectronicsB2B](https://www.electronicsb2b.com/industry-buzz/indus-towers-restore-2500-telecom-towers-in-kerala/)). Wayanad 2024: landslide-hit areas "found voice through ham radio" ([Deccan Herald](https://deccanherald.com/amp/story/india%2Fkerala%2Flandslide-hit-areas-of-wayanad-find-voice-through-ham-radio-3135642)). Chennai, Cyclone Michaung 2023: residents battled power and mobile disruption ([Business Standard](https://www.business-standard.com/india-news/cyclone-michaung-chennai-residents-battle-power-mobile-disruption-123120500994_1.html)). Close to home: Bengaluru's own 2022 floods. |
| An SOS works with no mobile network and no internet | Live demo with airplane mode on. Local write before any network call. |
| Nothing is lost, and nothing is counted twice | `pnpm demo:check`: ACK round trip, and 3 sends give 1 record. 10 queue tests. |
| The victim knows help is coming (**our addition**) | Live demo: *Seen by a responder* → *Team dispatched*, with real timestamps. Verified end to end by `scripts/capture-demo.cjs`. |
| No AI decides who gets help first | 43 START triage tests. Every result has a reason code. |
| Runs on hardware a rescue team already carries | One laptop plus phones. No install, no special radios. |

**Never claim:** mesh networking or device-to-device relay, Bluetooth, LoRa (except as roadmap), a range in metres or km, an ETA, "AI-powered triage", or that it is deployed or used by NDRF. None of these are true.

---

## The five criteria: what we say

### 1. Real-world use
- **Who:** people stranded in floods, landslides or cyclones with a charged phone but no network, and the NDRF/SDRF/fire-and-rescue teams searching for them.
- **When:** the first 24 to 72 hours, before towers are restored. Telecom restoration took days in Kerala 2018, and ham radio filled the gap in Wayanad 2024.
- **Bengaluru angle:** urban flooding (2022 Outer Ring Road). Our seed data and offline map are Bengaluru.
- **How it's used:** the team switches on the laptop hotspot at the edge of the affected area. Anyone nearby opens one address. No app store and no data are needed.
- **What changes for the victim:** they know their SOS arrived and which team is coming. That reduces repeat SOS calls and stops risky moves to "find signal". This is the problem our addition solves.

### 2. Feasibility
- **It already works.** We show it live in Round 2 on a normal laptop and phone.
- **Stack:** web standards (React, WebSocket), Node, PouchDB/CouchDB, open map data. Everything is open source with no licence fees.
- **Hardware:** a laptop the team already has (₹0 extra). An optional outdoor Wi-Fi access point costs a few thousand rupees. *(Quote a range only if asked, and say it's an estimate.)*
- **Setup:** one command (`pnpm demo`), ready in under a minute. A 14-point self-test proves it's ready.
- **Engineering evidence:** 60 unit tests, an end-to-end UI test, and a typechecked monorepo.

### 3. Sustainability
- **Cost to run:** no servers, no SIMs, no cloud bill in the field. CouchDB sync can use the district's existing server when a link returns.
- **Who owns it:** a District Disaster Management Authority (DDMA) or SDRF unit adds a "DeadZone laptop" to its existing go-kit. NGOs and NSS/NCC units can run the same kit for community drills.
- **Maintenance:** open source (MIT). A college club or the state IT department can maintain it. The data formats are open, so records export to whatever system the control room uses.
- **Pre-positioning:** keep the offline map tiles and the app on the laptop. Refresh them yearly before monsoon, together with the district's flood-drill schedule.
- **Environmental:** reuses existing devices and needs no new radios or towers.
- **Path to scale:** pilot with one district's mock drill, then the NDMA/SDRF go-kit spec. Roadmap: HTTPS + PWA so the app is cached and GPS works, a vehicle-mounted access point for more reach, LoRa gateways for long range, and multiple command nodes syncing with each other.

### 4. Strengths
1. **Works with zero infrastructure:** no tower, no internet, no install.
2. **Closed loop (ours):** the victim sees *delivered → seen → team dispatched*, all real. Most SOS apps stop at "sent".
3. **Nothing lost, nothing doubled:** saved on the phone first. The message id is the database id.
4. **Safe by design:** no AI in life-or-death decisions. START rules with stated reasons. No invented numbers (ETA, range) on screen.
5. **Medical context travels with the SOS:** blood group, emergency contacts, notes.
6. **Honest engineering:** every claim on our slides maps to a test or a live step.

### 5. Challenges thought through
| Challenge | What we do now | What we'd do next |
|---|---|---|
| **Reach** is one Wi-Fi hotspot | Responders bring the node toward the area. Phones show measured link status, never a fake range. | Vehicle/drone-mounted access point, LoRa gateways |
| **Laptop is a single point of failure** | Phones keep the SOS queued, and it resends to any node that comes up | A second node and node-to-node sync (CouchDB already supports it) |
| **Battery** on phones and laptop | One small web page with no background drain. The laptop runs on a power bank or vehicle power. | Low-power mode, a smaller payload |
| **Fake or spam SOS** | Responder sees reporter number and context. Triage ranks by stated severity. | Signed messages, rate-limiting per device |
| **Victim must open a web page** | One address, posters or loudspeaker at the camp, works on any browser | Captive portal that opens the app automatically on joining the hotspot |
| **GPS needs HTTPS** | Demo phone flag. Approximate fallback that is labelled as such. | HTTPS on the command node, installable PWA |
| **Android drops "no-internet" Wi-Fi** | "Stay connected" step in the runbook | Captive-portal handling |
| **Privacy of medical data** | The victim's catch-up endpoint returns status only, with no phone or medical fields | Encryption at rest, role-based access |
| **Language and literacy** | Big icons, three taps | Kannada/Hindi UI strings (Hindi was planned earlier), voice prompts |
| **Adoption by government teams** | Builds on START, a protocol responders already know | Pilot in a DDMA mock drill, feedback from NDRF/SDRF |

---

## Judge Q&A: likely questions, straight answers

**"How far does it reach?"**
As far as the laptop's Wi-Fi hotspot. The app doesn't invent a number because it can't measure distance. In the field you extend it with a better access point, not with a different app.

**"Why not Bluetooth mesh or phone-to-phone relay?"**
A web page cannot use those radios, and installing a native app is a big ask in a disaster. We chose zero-install over theoretical reach. Mesh and LoRa are on the roadmap as hardware add-ons that feed the same command node.

**"What if the laptop dies?"**
Every phone keeps its SOS saved and resends automatically when any node is back. A spare laptop with the same setup takes over. Nothing is lost.

**"How is this better than calling 112?"**
112 needs a working network. This is for when the network is gone. When it returns, everything syncs to the central database for the control room.

**"Where's the AI?"**
Deliberately not in the decisions. Triage uses START, a standard mass-casualty protocol, with a stated reason for every result. An optional local model can explain weather risk in plain language. It runs offline on the laptop, but it advises and never decides.

**"How do you stop fake SOS?"**
Today, the responder sees the reporter's number and the details. Next is signing messages per device and rate limits. We'd rather get a fake SOS than miss a real one.

**"Is the location real?"**
From GPS when the page is served securely. Over plain HTTP the browser withholds GPS, so the demo phone has a flag enabled. Production runs HTTPS.

**"What does it cost?"**
Software: ₹0, open source. Hardware: a laptop the team already has, plus optionally a low-cost outdoor access point.

**"Has it been tested on real phones?"**
Yes. A real Android phone on a laptop hotspot, and we'll show it live. The protocol is checked by an automated 14-point self-test.
