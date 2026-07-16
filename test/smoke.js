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
  check('lands on Today', await page.locator('#live').isVisible());
  check('secondary planning catalogues are lazy on first load', (await page.locator('.countdown-card').count()) === 0 && (await page.locator('#food .sugg-card, #attractions .sugg-card, #hotels .data-card').count()) === 0);
  const headerText = await page.locator('header').innerText();
  const headerBox = await page.locator('header').boundingBox();
  const nextStopBox = await page.locator('#live .next-stop').boundingBox();
  check('header is concise and trip-specific', headerText.includes('PEI Road Trip') && headerText.includes('7 hotels booked') && !headerText.includes('family-safe premium-fuel'));
  check('mobile first action appears in the initial viewport', headerBox.height < 180 && nextStopBox.y < 500, 'header=' + Math.round(headerBox.height) + 'px, next=' + Math.round(nextStopBox.y) + 'px');

  const tabs = ['live', 'daybyday', 'checklist', 'offline'];
  for (const tab of tabs) {
    await page.click(`#nav [data-section=${tab}]`);
    await page.waitForTimeout(100);
    const visible = await page.locator('#' + tab).isVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('tab ' + tab + ' visible, no overflow', visible && overflow <= 0, 'overflow=' + overflow + 'px');
  }
  const navLabels = await page.locator('#nav [role=tab]').allTextContents();
  check('primary navigation is reduced to four clear tabs', navLabels.length === 4 && ['Today', 'Plan', 'Prep', 'Safety'].every((label) => navLabels.some((text) => text.includes(label))));
  check('secondary catalogues stay out of primary navigation', ['overview', 'food', 'attractions', 'hotels', 'sanity', 'fuel', 'sources'].every((id) => !navLabels.some((text) => text.toLowerCase().includes(id))) && (await page.locator('#nav #themeToggle').count()) === 0);
  check('tablist uses roving keyboard focus', (await page.locator('#nav [role=tab][tabindex="0"]').count()) === 1 && (await page.locator('#nav [role=tab][tabindex="-1"]').count()) === 3);

  await page.goto(base + '/index.html#overview', { waitUntil: 'networkidle' });
  check('legacy Overview direct link still renders on demand', await page.locator('#overview').isVisible() && (await page.locator('.countdown-card').count()) === 1 && (await page.locator('#tab-checklist').getAttribute('aria-selected')) === 'true');
  check('route map renders 7 stops', (await page.locator('.route-map .city-dot').count()) === 7);
  check('route map labels Hopewell as estimated and staff-controlled', (await page.locator('.route-map').textContent()).includes('Estimated 9 AM–2:45 PM · confirm with staff'));
  check('milestones render', (await page.locator('.milestone').count()) === 7);
  check('reservation call list has 4 relevant numbers', (await page.locator('.reservation-card .tel-link').count()) === 4);
  check('emergency card has route-critical numbers and all 7 hotels', (await page.locator('#offline .emergency-list .tel-link').count()) === 15);
  check('Safety prioritizes three immediate calls and removes photo-cache clutter', (await page.locator('#offline .safety-contacts .tel-link').count()) === 3 && (await page.locator('#offline').textContent()).includes('91 AKI') && (await page.locator('#offline #cachePhotos').count()) === 0);
  check('packing list has items', (await page.locator('[data-packing-id]').count()) >= 25);

  await page.goto(base + '/index.html#food', { waitUntil: 'networkidle' });
  const newGlasgowCard = page.locator('#food .sugg-card').filter({ hasText: 'New Glasgow Lobster Suppers' }).first();
  const newGlasgowText = await newGlasgowCard.textContent();
  check('New Glasgow card shows the walk-in rule', newGlasgowText.includes('Walk-in for a family of three') && !newGlasgowText.includes('Check/confirm ahead'));

  await page.goto(base + '/index.html#attractions', { waitUntil: 'networkidle' });
  check('attractions are grouped by trip day', (await page.locator('#attractions .day-group[data-day^="2026-08-"]').count()) >= 6);
  check('attraction day groups are visible', await page.locator('#attractions .day-group[data-day="2026-08-14"]').isVisible());
  check('Aug 16 offers multiple on-route attractions', (await page.locator('#attractions .day-group[data-day="2026-08-16"] .sugg-card').count()) >= 4);
  check('photo and scenic plan stops appear without a repeated Kamouraska detour', (await page.locator('#attractions .sugg-card').filter({ hasText: 'Hartland Covered Bridge' }).count()) >= 2 && (await page.locator('#attractions .sugg-card').filter({ hasText: 'Kamouraska' }).count()) === 1);
  const magneticCard = page.locator('#attractions .sugg-card:has(h3:text-is("Magnetic Hill Illusion"))').first();
  check('Magnetic Hill card uses the official address', (await magneticCard.textContent()).includes('2846 Mountain Road') && (await magneticCard.locator('a[href*="2846"]').count()) >= 1);
  const grandFallsCard = page.locator('#attractions .sugg-card').filter({ hasText: 'Grand Falls Gorge' }).first();
  check('Grand Falls is clearly a backup, not Plan A', (await grandFallsCard.textContent()).includes('Backup only') && !(await grandFallsCard.textContent()).includes('In plan'));

  await page.goto(base + '/index.html#hotels', { waitUntil: 'networkidle' });
  check('hotel nights are grouped day by day', (await page.locator('#hotels .day-group[data-day^="2026-08-"]').count()) === 7);
  check('hotel day groups are visible', await page.locator('#hotels .day-group[data-day="2026-08-14"]').isVisible());
  const bookedHotelNames = [
    'Montreal Marriott Chateau Champlain',
    'Hôtel Cofortel',
    'Delta Hotels by Marriott Fredericton',
    'Hampton Inn & Suites Charlottetown',
    'Canadas Best Value Inn & Suites Charlottetown',
    'Best Western Plus Moncton',
    'DoubleTree by Hilton Quebec Resort'
  ];
  const hotelText = await page.locator('#hotels').innerText();
  check('hotel ledger contains the 7 exact booked properties', bookedHotelNames.every((name) => hotelText.includes(name)));
  const confirmationHotels = await page.evaluate(() => JSON.parse(document.getElementById('trip-data').textContent).hotels);
  const expectedHotelConfirmations = [
    { Date: '2026-08-14', hotel: 'Montreal Marriott Chateau Champlain', in: 'Fri, Aug 14 · from 4:00 PM', out: 'Sat, Aug 15 · by 12:00 PM', room: 'Room · 2 double beds', guests: '2 adults + 1 child' },
    { Date: '2026-08-15', hotel: 'Hôtel Cofortel', in: 'Sat, Aug 15 · from 4:00 PM', out: 'Sun, Aug 16 · by 12:00 PM', room: 'Elite room · 1 king bed · 2nd floor', guests: 'Confirmation currently shows 2 adults' },
    { Date: '2026-08-16', hotel: 'Delta Hotels by Marriott Fredericton', in: 'Sun, Aug 16 · from 4:00 PM', out: 'Mon, Aug 17 · by 11:00 AM', room: 'Room · 1 king bed + sofa bed', guests: '2 adults + 1 child' },
    { Date: '2026-08-17', hotel: 'Hampton Inn & Suites Charlottetown', in: 'Mon, Aug 17 · from 4:00 PM', out: 'Tue, Aug 18 · by 11:00 AM', room: 'Standard room · 2 queen beds', guests: '2 adults + 1 child' },
    { Date: '2026-08-18', hotel: 'Canadas Best Value Inn & Suites Charlottetown', in: 'Tue, Aug 18 · from 3:00 PM', out: 'Wed, Aug 19 · by 11:00 AM', room: 'Suite · 1 king bed · non-smoking · jetted tub', guests: 'Confirmation currently shows 2 adults' },
    { Date: '2026-08-19', hotel: 'Best Western Plus Moncton', in: 'Wed, Aug 19 · from 4:00 PM', out: 'Thu, Aug 20 · by 11:00 AM', room: 'Room type/bed setup is not visible in the supplied screenshot', guests: 'Confirmation currently shows 2 adults' },
    { Date: '2026-08-20', hotel: 'DoubleTree by Hilton Quebec Resort', in: 'Thu, Aug 20 · from 4:00 PM', out: 'Fri, Aug 21 · by 12:00 PM', room: 'Suite · 1 bedroom', guests: '2 adults + 1 child' }
  ];
  check('hotel confirmation details match all 7 booking screenshots', expectedHotelConfirmations.every((expected) => {
    const actual = confirmationHotels.find((hotel) => hotel.Date === expected.Date);
    return actual
      && actual['Recommended hotel'] === expected.hotel
      && actual['Check-in'] === expected.in
      && actual['Check-out'] === expected.out
      && actual.Room === expected.room
      && actual.Guests === expected.guests;
  }));
  check('old recommended hotels are absent', ['Le Square Phillips Hôtel & Suites', 'Château Fredericton', 'Rodd Royalty', 'Fairfield by Marriott Inn & Suites Moncton'].every((name) => !hotelText.includes(name)));
  check('every hotel card is marked booked', (await page.locator('#hotels .tag.category-hotel').allTextContents()).filter((text) => text.includes('Hotel · booked')).length === 7);
  check('hotel cards expose confirmation fields', ['Check-in', 'Check-out', 'Room', 'Guests', 'Cancellation'].every((label) => hotelText.includes(label)));
  check('booking action flags are visible', (await page.locator('#hotels .data-card.warn').count()) === 4 && (await page.locator('#hotels .mode-note').count()) === 4);
  check('obsolete hotel alternatives are removed', (await page.locator('#hotels .hotel-backup, #hotels .hotel-backups').count()) === 0);
  check('private confirmation details are absent from the page source', !/\b\d{14}\b/.test(indexSource) && !/Reserved for/i.test(indexSource) && !/itinerary\s*#/i.test(indexSource));

  await page.click('#nav [data-section=checklist]');
  const checklistText = await page.locator('#checklist').innerText();
  check('Prep keeps all seven booked hotels in a compact disclosure', (await page.locator('#checklist .hotel-list .hotel-compact').count()) === 7 && checklistText.includes('Booked hotels'));
  check('checklist elevates the 3 child-count mismatches', ['Call Cofortel', 'Call Canadas Best Value Inn', 'Call Best Western Plus Moncton'].every((text) => checklistText.includes(text)));
  check('checklist includes the Charlottetown luggage handoff', checklistText.includes('Arrange the Aug 18 Charlottetown luggage handoff'));
  check('Aug 18 generic hotel reconfirm points to the new booked hotel', checklistText.includes('Reconfirm booked stay: Canadas Best Value Inn & Suites Charlottetown') && (checklistText.match(/Reconfirm booked stay: Hampton Inn & Suites Charlottetown/g) || []).length === 1);

  await page.goto(base + '/index.html#fuel', { waitUntil: 'networkidle' });
  const fuelText = await page.locator('#fuel').innerText();
  check('fuel plan uses family-safe quarter-tank trigger', fuelText.includes('25%') && fuelText.includes('91 AKI minimum') && fuelText.includes('120–150 km'));
  check('fuel plan removed old low-fuel rule', !fuelText.includes('10%') && !fuelText.includes('conservative 800'));

  async function dayText(date) {
    await page.click('#nav [data-section=daybyday]');
    await page.selectOption('#daySelectV2', date);
    await page.waitForTimeout(100);
    return page.locator('#dayResult').textContent();
  }

  async function dayRoute(date) {
    await page.click('#nav [data-section=daybyday]');
    await page.selectOption('#daySelectV2', date);
    const hrefs = await page.locator('#dayResult a.route-segment').evaluateAll((links) => links.map((link) => link.href));
    const urls = hrefs.map((href) => new URL(href));
    return {
      destination: urls.length ? (urls[urls.length - 1].searchParams.get('destination') || '') : '',
      waypoints: urls.map((url) => url.searchParams.get('waypoints') || '').join('|'),
      segmentCount: urls.length,
      maxWaypoints: Math.max(0, ...urls.map((url) => (url.searchParams.get('waypoints') || '').split('|').filter(Boolean).length))
    };
  }

  await page.click('#nav [data-section=daybyday]');
  await page.selectOption('#daySelectV2', '2026-08-14');
  await page.selectOption('#dayMode', 'late60');
  const lateAug14Text = await page.locator('#dayResult').textContent();
  check('60-minute delay mode removes optional Big Apple but protects the proper lunch', !lateAug14Text.includes('The Big Apple visitor parking') && lateAug14Text.includes('ONroute Odessa') && lateAug14Text.includes('Tata’s House of Pizza & Pasta'));
  await page.selectOption('#dayMode', 'on-time');
  const onTimeAug14Text = await page.locator('#dayResult').textContent();
  check('on-time mode restores the optional movement stop without the rejected attraction', onTimeAug14Text.includes('The Big Apple visitor parking') && !onTimeAug14Text.includes('Upper Canada Village') && !onTimeAug14Text.includes('Prehistoric World'));
  await page.click('#nav [data-section=live]');
  check('plan state stays synchronized between day and live views', (await page.locator('#liveMode').inputValue()) === 'on-time');
  await page.selectOption('#liveMode', 'preview');
  check('live schedule selector retains focus after rerender', await page.evaluate(() => document.activeElement && document.activeElement.id === 'liveMode'));

  const aug14Text = await dayText('2026-08-14');
  check('Aug 14 uses the eastbound plaza and a proper Brockville lunch', aug14Text.includes('ONroute Odessa') && aug14Text.includes('3745 Highway 401 Eastbound') && aug14Text.includes('Morning snack / washroom') && aug14Text.includes('Tata’s House of Pizza & Pasta') && aug14Text.includes('11 Windsor Drive') && aug14Text.includes('50-60 min'));

  const aug15Text = await dayText('2026-08-15');
  check('Aug 15 protects the Manoir lunch and the 4 PM Cofortel room', aug15Text.includes('Restaurant-terrasse du Manoir Montmorency') && aug15Text.includes('children’s menu') && aug15Text.includes('16:00 check-in') && !aug15Text.includes('packed or on-site lunch'));

  const aug16Text = await dayText('2026-08-16');
  check('Aug 16 includes the requested Quai Miller visit and Delta recovery', aug16Text.includes('Visit Kamouraska Quai Miller') && aug16Text.includes('09:10–09:35') && aug16Text.includes('Edmundston service + driver swap') && aug16Text.includes('About 125 km / 1 h 25 from Hartland') && aug16Text.includes('Delta Hotels by Marriott Fredericton') && aug16Text.includes('STMR.36') && !aug16Text.includes('Grand Falls Gorge'));

  const aug17Text = await dayText('2026-08-17');
  check('Aug 17 reaches the booked Hampton with corrected walk-in rules', aug17Text.includes('2846 Mountain Road') && aug17Text.includes('groups of 8+') && aug17Text.includes('Hampton Inn & Suites Charlottetown') && !aug17Text.includes('NB Military History Museum'));

  const aug18Text = await dayText('2026-08-18');
  check('Aug 18 handles the hotel switch and corrected north-shore clock', aug18Text.includes('07:15') && aug18Text.includes('only after the property confirms it directly') && aug18Text.includes('Canadas Best Value Inn & Suites Charlottetown') && aug18Text.includes('5033 Rustico Road') && aug18Text.includes('same-day waitlist') && aug18Text.includes('hard leave 15:45'));

  // Aug 19 tide plan is wired through
  const aug19Text = await dayText('2026-08-19');
  check('Aug 19 anchored to staff-controlled tide window', aug19Text.includes('10:15–10:30 entrance') && aug19Text.includes('10:45 stairs') && aug19Text.toLowerCase().includes('staff discretion'));
  check('Aug 19 removes the Sackville detour', !aug19Text.includes('Sackville Waterfowl'));
  check('Aug 19 respects Best Western 4 PM check-in', aug19Text.includes('Best Western Plus Moncton') && aug19Text.includes('16:00 guaranteed') && aug19Text.includes('2 adults'));

  const aug20Text = await dayText('2026-08-20');
  check('Aug 20 protects early departure, proper lunch, recovery and on-site dinner', aug20Text.includes('Wake 05:30') && aug20Text.includes('Frank’s Bar & Grill') && aug20Text.includes('100 Rice Street') && aug20Text.toLowerCase().includes('quarter tank') && aug20Text.includes('DoubleTree by Hilton Quebec Resort') && aug20Text.includes('16:30–17:15') && aug20Text.includes('Le Dijon'));

  const aug21Text = await dayText('2026-08-21');
  const aug21Requirements = ['06:30 wheels moving', 'DoubleTree hotel breakfast', 'Scores Restaurant Boucherville', '14:00 overnight checkpoint', 'About 190 km / 2 h', '20:00', 'fatigue'];
  const aug21Missing = aug21Requirements.filter((item) => !aug21Text.toLowerCase().includes(item.toLowerCase()));
  check('Aug 21 has a fatigue-based overnight checkpoint', aug21Missing.length === 0, 'missing=' + aug21Missing.join(', '));
  check('Aug 21 fallback stays westbound', aug21Text.includes('Mallorytown North') && aug21Text.includes('Hampton Inn Kingston') && !aug21Text.includes('Mallorytown South') && !aug21Text.includes('Cornwall'));
  const allDayTexts = [aug14Text, aug15Text, aug16Text, aug17Text, aug18Text, aug19Text, aug20Text, aug21Text];
  check('every day exposes one hotel anchor and a three-meal contract', allDayTexts.every((text) => {
    const normalized = text.toLowerCase();
    return normalized.includes('hotel anchor') && normalized.includes('breakfast, lunch & dinner') && normalized.includes('breakfast') && normalized.includes('lunch') && normalized.includes('dinner');
  }));
  check('the plan uses proper restaurant dinners instead of room service', allDayTexts.every((text) => !text.toLowerCase().includes('room service')) && aug16Text.includes('STMR.36 at Delta') && aug20Text.includes('Proper dinner: Le Dijon dining room'));
  check('the active itinerary contains no rejected attraction or self-catered lunch', allDayTexts.every((text) => {
    const normalized = text.toLowerCase();
    return !normalized.includes('upper canada village') && !normalized.includes('prehistoric world') && !normalized.includes('packed lunch') && !normalized.includes('cooler lunch') && !normalized.includes('packed picnic');
  }));
  check('attraction stops expose named visitor parking', aug15Text.includes('Montmorency Falls lower-site P1/P2 visitor parking') && aug18Text.includes('Green Gables Visitor Centre parking') && aug18Text.includes('Cavendish Main Beach visitor parking') && aug19Text.includes('Hopewell Rocks main visitor parking'));
  const route14 = await dayRoute('2026-08-14');
  const route15 = await dayRoute('2026-08-15');
  const route16 = await dayRoute('2026-08-16');
  const route17 = await dayRoute('2026-08-17');
  const route18 = await dayRoute('2026-08-18');
  const route19 = await dayRoute('2026-08-19');
  const route21 = await dayRoute('2026-08-21');
  check('external-evening routes return to the booked hotel',
    route14.destination.includes('Gauchetiere') &&
    route15.destination.includes('Wilfrid-Hamel') &&
    route17.destination.includes('300 Capital Drive') &&
    route18.destination.includes('20 Capital Drive') &&
    route19.destination.includes('300 Lewisville Road'));
  check('Aug 16 default route ends at Delta, not the conditional dinner branch', route16.destination.includes('225 Woodstock Road'));
  check('Aug 21 default route stays westbound and excludes backward or split-only stops', route21.destination === 'Vaughan, ON' && route21.waypoints.includes('678 Highway 401 Westbound') && !route21.waypoints.includes('Brockville') && !route21.waypoints.includes('209 King St W'));
  check('active-day routes respect the mobile Maps waypoint limit', [route14, route15, route16, route17, route18, route19, route21].every((route) => route.segmentCount >= 1 && route.maxWaypoints <= 3));
  check('day summary is compact and hotel/meal anchored', (await page.locator('#dayResult .day-fact').count()) === 4 && (await page.locator('#dayResult .hotel-anchor').count()) === 1 && (await page.locator('#dayResult .meal-contract-item').count()) === 3 && (await page.locator('#dayResult .meal-plan-card').count()) === 0);
  const visibleStopCount = await page.locator('#dayResult .timeline .stop').count();
  check('stop cards keep named destinations, directions and concise details', visibleStopCount > 0 && (await page.locator('#dayResult .stop-destination').count()) === visibleStopCount && (await page.locator('#dayResult details.stop-more').count()) === visibleStopCount && (await page.locator('#dayResult .stop-primary-actions a').count()) > 0 && (await page.locator('#dayResult .priority-badge').count()) > 0 && (await page.locator('#dayResult .kind-badge').count()) === 0);
  check('meal and attraction logistics stay available inside expandable details', (await page.locator('#dayResult .practical-grid').count()) >= 1);
  check('day navigation buttons render', (await page.locator('#previousDay').count()) === 1 && (await page.locator('#nextDay').count()) === 1);
  await page.click('#previousDay');
  check('previous-day control changes the selected day', (await page.locator('#daySelectV2').inputValue()) === '2026-08-20');

  await page.goto(base + '/index.html#sanity', { waitUntil: 'networkidle' });
  check('high-risk drive cards start expanded', (await page.locator('#sanity details.warn[open]').count()) >= 1);
  check('lower-risk drive cards start collapsed', (await page.locator('#sanity details:not(.warn):not([open])').count()) >= 1);

  // Deep link boot
  await page.goto(base + '/index.html#checklist', { waitUntil: 'networkidle' });
  check('deep link #checklist boots to checklist', await page.locator('#checklist').isVisible());
  await page.goto(base + '/index.html#attractions', { waitUntil: 'networkidle' });
  const attractionText = await page.locator('#attractions').textContent();
  check('deep link #attractions shows cards without the rejected attraction', await page.locator('#attractions .day-group[data-day="2026-08-14"]').isVisible() && (await page.locator('#attractions .sugg-card').count()) >= 30 && !attractionText.includes('Upper Canada Village'));
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
