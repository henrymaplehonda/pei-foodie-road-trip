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

  const tabs = ['live', 'overview', 'daybyday', 'food', 'attractions', 'hotels', 'fuel', 'sanity', 'checklist', 'offline', 'sources'];
  for (const tab of tabs) {
    await page.click(`#nav [data-section=${tab}]`);
    await page.waitForTimeout(100);
    const visible = await page.locator('#' + tab).isVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('tab ' + tab + ' visible, no overflow', visible && overflow <= 0, 'overflow=' + overflow + 'px');
  }

  check('route map renders 7 stops', (await page.locator('.route-map .city-dot').count()) === 7);
  check('milestones render', (await page.locator('.milestone').count()) === 7);
  check('reservation call list has 5 numbers', (await page.locator('.reservation-card .tel-link').count()) === 5);
  check('emergency card has 8 numbers', (await page.locator('#offline .emergency-list .tel-link').count()) === 8);
  check('packing list has items', (await page.locator('[data-packing-id]').count()) >= 25);

  await page.click('#nav [data-section=hotels]');
  check('every hotel night has two backups', (await page.locator('#hotels .hotel-backup').count()) === 14);
  check('hotel backups include booking links', (await page.locator('#hotels .hotel-backup a').count()) === 28);

  // Aug 19 tide plan is wired through
  await page.click('#nav [data-section=daybyday]');
  await page.selectOption('#daySelectV2', '2026-08-19');
  await page.waitForTimeout(150);
  const dayText = await page.locator('#dayResult').innerText();
  check('Aug 19 anchored to tide window', dayText.includes('10:45') && dayText.toLowerCase().includes('ocean floor'));

  // Deep link boot
  await page.goto(base + '/index.html#checklist', { waitUntil: 'networkidle' });
  check('deep link #checklist boots to checklist', await page.locator('#checklist').isVisible());

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
