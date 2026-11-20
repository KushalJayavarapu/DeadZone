#!/usr/bin/env node
/**
 * Records the whole demo story, headlessly, as numbered screenshots and two
 * videos (phone + dashboard). This is the offline backup the organisers ask
 * for ("in case Wi-Fi fails"), and doubles as an end-to-end test of the
 * closed loop: it fails loudly if the victim's phone never shows the team.
 *
 *   pnpm demo --seed            # in one terminal
 *   node scripts/capture-demo.cjs [outDir]
 *
 * Needs Playwright with Chromium (`npm i -g playwright && npx playwright
 * install chromium`). It is deliberately not a repo dependency: nothing in the
 * product needs it, and it is a large download.
 */
const path = require('node:path');
const fs = require('node:fs');
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  console.error('Playwright is not installed. See the header of this file.');
  process.exit(1);
}

const URL = process.env.DEMO_URL || 'http://localhost:8443/';
const OUT = path.resolve(process.argv[2] || 'demo-backup');
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('  saved', path.basename(file));
};

(async () => {
  const browser = await chromium.launch();

  // Responder dashboard on the laptop.
  const t0 = Date.now();
  const rctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  });
  const r = await rctx.newPage();
  await r.goto(URL);
  await r.waitForTimeout(800);
  let ins = await r.$$('input');
  await ins[0].fill('Insp. Kavya');
  await ins[1].fill('9000000001');
  await r.getByText('Responder', { exact: true }).click();
  await r.fill('input[placeholder="your.name"]', 'kavya');
  await r.fill('input[placeholder="123456"]', '123456');
  await r.getByText('Sign in to dashboard').click();
  await r.waitForTimeout(3000);
  await shot(r, 'dashboard-offline-map');

  // Victim's phone.
  const phoneOffsetMs = Date.now() - t0;
  const pctx = await browser.newContext({
    ...devices['Pixel 7'],
    recordVideo: { dir: OUT, size: { width: 412, height: 915 } },
  });
  const p = await pctx.newPage();
  await p.goto(URL);
  await p.waitForTimeout(800);
  await shot(p, 'phone-login');
  ins = await p.$$('input');
  await ins[0].fill('Asha Kumari');
  await ins[1].fill('9876543210');
  await p.getByText('Civilian', { exact: true }).click();
  await p.getByText('Continue', { exact: true }).click();
  await p.waitForTimeout(500);
  await p.getByText('O+', { exact: true }).click();
  await shot(p, 'phone-medical-profile');
  await p.getByText('Finish', { exact: true }).click();
  await p.waitForTimeout(1000);
  await shot(p, 'phone-home-sos-button');
  const sos = p.getByText('SOS', { exact: true }).first();
  await sos.click(); await sos.click(); await sos.click();
  await p.waitForTimeout(600);
  await p.getByText('Critical', { exact: true }).click();
  await p.waitForTimeout(600);
  await shot(p, 'phone-what-help');
  for (const t of ['Medical', 'Rescue']) {
    const l = p.getByText(t, { exact: true }).first();
    if (await l.count()) await l.click();
  }
  await p.getByText(/^Continue/).first().click();
  await p.waitForTimeout(600);
  await p.locator('button', { hasText: /^3$/ }).first().click();
  await shot(p, 'phone-how-many');
  await p.getByText(/^Send SOS/).first().click();
  await p.waitForTimeout(1500);
  await shot(p, 'phone-sending');
  await p.waitForTimeout(4500);
  await shot(p, 'phone-delivered-waiting');

  // Responder sees it, opens it (= "seen"), dispatches a team.
  await r.waitForTimeout(800);
  await shot(r, 'dashboard-sos-arrived');
  await r.getByText('3 people affected', { exact: false }).first().click();
  await r.waitForTimeout(1200);
  await shot(r, 'dashboard-incident-opened');
  await p.waitForTimeout(800);
  await shot(p, 'phone-seen-by-responder');
  await r.getByText('Select teams...').click();
  await r.getByText('Charlie', { exact: false }).first().click();
  await r.getByText(/^DISPATCH 1 TEAM/).click();
  await r.waitForTimeout(1200);
  await shot(r, 'dashboard-dispatched');
  await p.waitForTimeout(1000);
  await shot(p, 'phone-team-on-the-way');

  const card = await p.getByTestId('team-card').innerText();
  const ok = /Charlie/.test(card);
  console.log(ok ? '\nClosed loop verified: the phone shows the dispatched team.' : `\nFAILED: phone team card says: ${card}`);

  const rvid = await r.video().path();
  const pvid = await p.video().path();
  await rctx.close();
  await pctx.close();
  // Stable names, plus the offset needed to line the two videos up side by side.
  fs.renameSync(rvid, path.join(OUT, 'video-dashboard.webm'));
  fs.renameSync(pvid, path.join(OUT, 'video-phone.webm'));
  fs.writeFileSync(path.join(OUT, 'video-timing.json'), JSON.stringify({ phoneStartsAfterDashboardMs: phoneOffsetMs }, null, 2));
  await browser.close();
  console.log(`Screenshots and videos in ${OUT}`);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
