// Smoke test for the trip dashboard. Serves the repo with a tiny static
// server, loads the page in headless Chromium, and fails on any page error,
// console error, missing feature, or horizontal overflow at phone width.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

const failures = [];
function check(name, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures.push(name);
}

(async () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const fallbackBlock = (indexSource.match(/\/\/ Safe boot-failure fallback:[\s\S]*?<\/script>/) || [''])[0];
  check('boot fallback cannot render stale embedded routes', fallbackBlock.includes('renderLegacyFailureNotice') && !fallbackBlock.includes('initDayByDay();') && !fallbackBlock.includes('renderFuel();'));
  check('boot fallback waits and preserves rendered navigation', fallbackBlock.includes('}, 3000);') && fallbackBlock.includes('interfaceReady') && !fallbackBlock.includes("nav.innerHTML = ''"));

  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('#')[0].split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  const browser = await chromium.launch({
    executablePath: process.env.SMOKE_CHROMIUM_PATH || undefined
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });

  check('trip data JSON parses', await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('trip-data').textContent).days.length === 8; } catch (e) { return false; }
  }));
  check('trip-control app booted', await page.evaluate(() => window.__tripControlBooted === true));
  check('lands on Trip control', await page.locator('#live').isVisible());
  check('countdown card renders', (await page.locator('.countdown-card').count()) === 1);
  check('header uses the minimum octane requirement', (await page.locator('header').innerText()).includes('91 AKI minimum'));

  const tabs = ['live', 'overview', 'daybyday', 'food', 'attractions', 'hotels', 'sanity', 'checklist', 'offline'];
  for (const tab of tabs) {
    await page.click(`#nav [data-section=${tab}]`);
    await page.waitForTimeout(100);
    const visible = await page.locator('#' + tab).isVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('tab ' + tab + ' visible, no overflow', visible && overflow <= 0, 'overflow=' + overflow + 'px');
  }
  check('board hides Sources, Fuel, and the travel-mode selector',
    (await page.locator('#nav [data-section=sources]').count()) === 0 &&
    (await page.locator('#nav [data-section=fuel]').count()) === 0 &&
    (await page.locator('#liveMode').count()) === 0);

  check('route map renders 7 stops', (await page.locator('.route-map .city-dot').count()) === 7);
  check('route map labels Hopewell as estimated and staff-controlled', (await page.locator('.route-map').textContent()).includes('Estimated 9 AM–2:45 PM · confirm with staff'));
  check('milestones render', (await page.locator('.milestone').count()) === 7);
  check('reservation call list has 5 numbers', (await page.locator('.reservation-card .tel-link').count()) === 5);
  check('emergency card has route-critical numbers', (await page.locator('#offline .emergency-list .tel-link').count()) === 13);
  check('packing list has items', (await page.locator('[data-packing-id]').count()) >= 25);

  await page.click('#nav [data-section=food]');
  const newGlasgowCard = page.locator('#food .sugg-card').filter({ hasText: 'New Glasgow Lobster Suppers' }).first();
  const newGlasgowText = await newGlasgowCard.textContent();
  check('New Glasgow card shows the walk-in rule', newGlasgowText.includes('Walk-in for a family of three') && !newGlasgowText.includes('Check/confirm ahead'));

  await page.click('#nav [data-section=attractions]');
  check('attractions are grouped by trip day', (await page.locator('#attractions .day-group[data-day^="2026-08-"]').count()) >= 6);
  check('attraction day groups are visible', await page.locator('#attractions .day-group[data-day="2026-08-14"]').isVisible());
  check('Aug 16 offers multiple on-route attractions', (await page.locator('#attractions .day-group[data-day="2026-08-16"] .sugg-card').count()) >= 4);
  check('photo and scenic plan stops appear as attractions', (await page.locator('#attractions .sugg-card').filter({ hasText: 'Hartland Covered Bridge' }).count()) >= 2 && (await page.locator('#attractions .sugg-card').filter({ hasText: 'Kamouraska' }).count()) >= 2);
  const magneticCard = page.locator('#attractions .sugg-card:has(h3:text-is("Magnetic Hill Illusion"))').first();
  check('Magnetic Hill card uses the official address', (await magneticCard.textContent()).includes('2846 Mountain Road') && (await magneticCard.locator('a[href*="2846"]').count()) >= 1);
  const grandFallsCard = page.locator('#attractions .sugg-card').filter({ hasText: 'Grand Falls Gorge' }).first();
  check('Grand Falls is clearly a backup, not Plan A', (await grandFallsCard.textContent()).includes('Backup only') && !(await grandFallsCard.textContent()).includes('In plan'));

  await page.click('#nav [data-section=hotels]');
  check('hotel nights are grouped day by day', (await page.locator('#hotels .day-group[data-day^="2026-08-"]').count()) === 7);
  check('hotel day groups are visible', await page.locator('#hotels .day-group[data-day="2026-08-14"]').isVisible());
  check('every hotel night has two backups', (await page.locator('#hotels .hotel-backup').count()) === 14);
  check('hotel backups include booking links', (await page.locator('#hotels .hotel-backup a').count()) === 28);
  check('hotel options state outdoor parking and easy access', (await page.locator('#hotels .hotel-backup .category-drive').count()) === 14 && (await page.locator('#hotels .hotel-backup').allTextContents()).every((text) => text.includes('Parking:') && text.includes('Access:')));
  check('hotel backups are collapsed by default', (await page.locator('#hotels details.hotel-backups:not([open])').count()) === 7);

  const fuelText = await page.locator('#fuel').innerText();
  check('fuel plan uses family-safe quarter-tank trigger', fuelText.includes('25%') && fuelText.includes('91 AKI minimum') && fuelText.includes('120–150 km'));
  check('fuel plan removed old low-fuel rule', !fuelText.includes('10%') && !fuelText.includes('conservative 800'));

  async function dayText(date) {
    await page.click('#nav [data-section=daybyday]');
    await page.selectOption('#daySelectV2', date);
    await page.waitForTimeout(100);
    return page.locator('#dayResult').textContent();
  }

  const aug14Text = await dayText('2026-08-14');
  check('Aug 14 separates snack and proper lunch', aug14Text.includes('Morning snack / washroom') && aug14Text.includes('Packed Morrisburg lunch') && aug14Text.includes('50-60 min'));

  const aug15Text = await dayText('2026-08-15');
  check('Aug 15 protects Montmorency lunch', aug15Text.includes('Morning snack / washroom') && aug15Text.includes('Montmorency lunch'));

  const aug16Text = await dayText('2026-08-16');
  check('Aug 16 has realistic service breaks', aug16Text.includes('Edmundston service + driver swap') && aug16Text.includes('About 120 km / 1 h 20 from Hartland') && !aug16Text.includes('Grand Falls Gorge'));

  const aug17Text = await dayText('2026-08-17');
  check('Aug 17 uses corrected Magnetic Hill and walk-in rules', aug17Text.includes('2846 Mountain Road') && aug17Text.includes('groups of 8+') && !aug17Text.includes('NB Military History Museum'));

  const aug18Text = await dayText('2026-08-18');
  check('Aug 18 exposes opening, waitlist and later beach plan', aug18Text.includes('09:00 opening') && aug18Text.includes('same-day waitlist') && aug18Text.includes('14:30–15:00'));

  // Aug 19 tide plan is wired through
  const aug19Text = await dayText('2026-08-19');
  check('Aug 19 anchored to staff-controlled tide window', aug19Text.includes('10:15–10:30 entrance') && aug19Text.includes('10:45 stairs') && aug19Text.toLowerCase().includes('staff discretion'));
  check('Aug 19 removes the Sackville detour', !aug19Text.includes('Sackville Waterfowl'));

  const aug20Text = await dayText('2026-08-20');
  check('Aug 20 protects early departure and cooler lunch', aug20Text.includes('Wake 05:30') && aug20Text.includes('Edmundston cooler lunch') && aug20Text.toLowerCase().includes('quarter tank'));

  const aug21Text = await dayText('2026-08-21');
  const aug21Requirements = ['14:00 overnight checkpoint', 'About 200 km / 2–2.5 h', '20:00–21:00+', 'fatigue'];
  const aug21Missing = aug21Requirements.filter((item) => !aug21Text.toLowerCase().includes(item.toLowerCase()));
  check('Aug 21 has a fatigue-based overnight checkpoint', aug21Missing.length === 0, 'missing=' + aug21Missing.join(', '));
  check('Aug 21 fallback stays westbound', aug21Text.includes('Brockville/Kingston') && !aug21Text.includes('Cornwall'));
  check('day cards expose clear plan badges and optional detail', (await page.locator('#dayResult .priority-badge').count()) > 0 && (await page.locator('#dayResult details.stop-more').count()) > 0);
  check('stop categories use distinct colors', await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('#dayResult .kind-badge'));
    const colors = new Set(badges.map((badge) => getComputedStyle(badge).backgroundColor));
    return badges.some((badge) => badge.classList.contains('category-food')) && badges.some((badge) => badge.classList.contains('category-drive')) && colors.size >= 3;
  }));
  check('day navigation buttons render', (await page.locator('#previousDay').count()) === 1 && (await page.locator('#nextDay').count()) === 1);
  await page.click('#previousDay');
  check('previous-day control changes the selected day', (await page.locator('#daySelectV2').inputValue()) === '2026-08-20');

  await page.click('#nav [data-section=sanity]');
  check('high-risk drive cards start expanded', (await page.locator('#sanity details.warn[open]').count()) >= 1);
  check('lower-risk drive cards start collapsed', (await page.locator('#sanity details:not(.warn):not([open])').count()) >= 1);

  // Deep link boot
  await page.goto(base + '/index.html#checklist', { waitUntil: 'networkidle' });
  check('deep link #checklist boots to checklist', await page.locator('#checklist').isVisible());
  await page.goto(base + '/index.html#attractions', { waitUntil: 'networkidle' });
  check('deep link #attractions shows cards', await page.locator('#attractions .day-group[data-day="2026-08-14"]').isVisible() && (await page.locator('#attractions .sugg-card').count()) === 35);
  await page.goto(base + '/index.html#hotels', { waitUntil: 'networkidle' });
  check('deep link #hotels shows cards', await page.locator('#hotels .day-group[data-day="2026-08-14"]').isVisible() && (await page.locator('#hotels .data-card').count()) === 7);

  // Theme toggle produces dark background
  await page.click('#themeToggle');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark theme applies', bg === 'rgb(18, 23, 29)', bg);

  check('no console/page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  if (failures.length) {
    console.error('\n' + failures.length + ' check(s) failed');
    process.exit(1);
  }
  console.log('\nAll smoke checks passed');
})();
