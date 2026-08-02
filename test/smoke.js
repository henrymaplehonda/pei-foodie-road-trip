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
  '.css': 'text/css; charset=utf-8',
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
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check('obsolete itinerary renderer is removed', !indexSource.includes('initDayByDay()') && !indexSource.includes('renderLegacyFailureNotice'));
  check('page source contains no rejected stops or room-service plan', !/Upper Canada Village|Prehistoric World|room service/i.test(indexSource));
  check('route map uses licensed OpenStreetMap tiles, not the private Google endpoint', appSource.includes('tile.openstreetmap.org/{z}/{x}/{y}.png') && !appSource.includes('google.com/vt'));
  check('service worker caches map tiles and caps the opt-in caches', swSource.includes("TILE_CACHE = 'pei-foodie-road-trip-tiles") && /trimCache\(/.test(swSource));

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

  function v3State(activeDate, overrides = {}) {
    return Object.assign({
      version: 3,
      activeDate,
      modes: {},
      stops: {},
      tasks: {},
      routeChoices: {},
      mealChoices: {},
      calmByDay: {},
      offlineReadiness: {},
      offlineMode: false
    }, overrides);
  }

  async function openIsolatedStatePage(state, options = {}) {
    const context = await browser.newContext({ viewport: options.viewport || { width: 390, height: 844 } });
    await context.addInitScript(({ seed, fixedDate }) => {
      if (fixedDate) {
        const NativeDate = Date;
        class FixedDate extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [fixedDate])); }
          static now() { return new NativeDate(fixedDate).getTime(); }
        }
        FixedDate.parse = NativeDate.parse;
        FixedDate.UTC = NativeDate.UTC;
        globalThis.Date = FixedDate;
      }
      localStorage.setItem('pei-foodie-road-trip/state/v3', JSON.stringify(seed));
      localStorage.removeItem('pei-foodie-road-trip/state/v2');
    }, { seed: state, fixedDate: options.fixedDate || '' });
    const isolatedPage = await context.newPage();
    const label = options.label || 'isolated';
    isolatedPage.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
    isolatedPage.on('console', (m) => { if (m.type() === 'error') errors.push(label + ' console: ' + m.text()); });
    await isolatedPage.goto(base + '/index.html#' + (options.section || 'live'), { waitUntil: 'networkidle' });
    return { context, page: isolatedPage };
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });

  async function openPlanningDrawer(targetPage) {
    const drawer = targetPage.locator('#live .planning-drawer');
    if (!(await drawer.evaluate((element) => element.open))) await drawer.locator('summary').click();
  }

  check('trip data JSON parses', await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('trip-data').textContent).days.length === 8; } catch (e) { return false; }
  }));
  check('trip-control app booted', await page.evaluate(() => window.__tripControlBooted === true));
  const currentPhase = await page.evaluate(() => window.__tripControlTest.phase());
  const currentPrimaryLabel = currentPhase === 'pretrip' ? 'Ready' : currentPhase === 'complete' ? 'Recap' : 'Today';
  check('lands on the phase-aware trip home', await page.locator('#live').isVisible() && (await page.locator('#tab-live').innerText()).includes(currentPrimaryLabel));
  check('secondary planning catalogues are lazy on first load', (await page.locator('.countdown-card').count()) === 0 && (await page.locator('#food .sugg-card, #attractions .sugg-card, #hotels .data-card').count()) === 0);
  const headerText = await page.locator('header').innerText();
  const headerBox = await page.locator('header').boundingBox();
  const nextStopBox = await page.locator('#live .next-stop').boundingBox();
  check('header is concise and trip-specific', headerText.includes('PEI Road Trip') && headerText.includes('7 hotels booked') && !headerText.includes('family-safe premium-fuel'));
  check('mobile first action appears in the initial viewport', headerBox.height < 180 && nextStopBox.y < 500, 'header=' + Math.round(headerBox.height) + 'px, next=' + Math.round(nextStopBox.y) + 'px');
  check('Today shows all hotels booked and safe', (await page.locator('#live .hotel-safe-banner').innerText()).includes('7/7 hotels booked · safe'));
  check('calm home exposes the core recovery tools', (await page.locator('#live [data-testid="calm-bank"]').count()) === 1
    && (await page.locator('#live [data-testid="family-pulse"]').count()) === 1
    && (await page.locator('#live .success-card').count()) === 1);
  check('the day-start checkpoint never pretends the family is driving to its origin', (await page.locator('#live [data-calm-action="start-day"]').count()) === 1 && (await page.locator('#live [data-calm-action="skip"]').count()) === 0);
  await page.click('#live [data-calm-action="start-day"]');
  check('starting the day advances the origin checkpoint', (await page.locator('#live .trip-progress').innerText()).includes('1/'));
  check('the first real driving leg now has one safe action and no skip', (await page.locator('#live [data-calm-action="start-leg"]').count()) === 1 && (await page.locator('#live [data-calm-action="skip"]').count()) === 0);
  await page.click('#live [data-calm-action="start-leg"]');
  check('starting a leg opens Journey Beads', (await page.locator('#live [data-testid="journey-beads"]').count()) === 1 && (await page.locator('#live').innerText()).includes('No exact countdown'));
  await page.click('#live [data-calm-action="near"]');
  const finalApproach = page.locator('#live [data-testid="arrival-bubble"]');
  check('approaching a stop opens the manual Final Approach view', (await finalApproach.count()) === 1
    && (await finalApproach.getAttribute('data-arrival-state')) === 'final-approach'
    && (await finalApproach.getAttribute('data-arrival-mode')) === 'venue'
    && /Final approach/i.test(await finalApproach.innerText())
    && /Arrival target/i.test(await finalApproach.innerText())
    && (await finalApproach.innerText()).includes('no location tracking or distance claim')
    && (await page.locator('#live [data-calm-action="parked"]').count()) === 1);
  check('address-only arrivals stay useful without inventing an entrance', (await finalApproach.locator('[data-arrival-copy]').count()) === 1
    && (await finalApproach.locator('.arrival-details').textContent()).includes('No separate entrance detail is saved')
    && await finalApproach.locator('.arrival-target').isVisible()
    && await finalApproach.locator('[data-arrival-copy]').isVisible()
    && await finalApproach.locator('a').filter({ hasText: 'Open directions' }).isVisible());
  check('arrival heading receives focus inside the phone viewport', await page.evaluate(() => {
    const heading = document.getElementById('calmContextHeading');
    const card = heading && heading.closest('.calm-context');
    const actions = card && card.querySelector('.arrival-target-actions');
    const confirm = card && card.querySelector('[data-calm-action="parked"]');
    if (!heading || !card || !actions || !confirm || document.activeElement !== heading) return false;
    const headingBox = heading.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    const confirmBox = confirm.getBoundingClientRect();
    return headingBox.bottom > 0 && headingBox.top < window.innerHeight
      && cardBox.top >= 0 && cardBox.top < 40
      && actionsBox.bottom > 0 && actionsBox.top < window.innerHeight
      && confirmBox.bottom > 0 && confirmBox.top < window.innerHeight;
  }));
  await page.click('#live [data-calm-action="back-to-road"]');
  check('Back to road view safely restores Journey Beads', (await page.locator('#live [data-testid="journey-beads"]').count()) === 1
    && await page.evaluate(() => window.__tripControlTest.state().calmByDay['2026-08-14'].phase === 'driving'));
  await page.click('#live [data-calm-action="near"]');
  await page.click('#live [data-calm-action="parked"]');
  check('Done appears only after arrival is confirmed', (await page.locator('#live [data-testid="arrival-bubble"]').getAttribute('data-arrival-state')) === 'landed'
    && (await page.locator('#live [data-calm-action="done"]').count()) === 1
    && (await page.locator('#live [data-calm-action="skip"]').count()) === 0);
  await page.click('#live [data-calm-action="undo-arrival"]');
  check('Not here yet returns to the final approach without advancing', (await finalApproach.getAttribute('data-arrival-state')) === 'final-approach'
    && !(await page.evaluate(() => window.__tripControlTest.state().calmByDay['2026-08-14'].arrivedAt)));
  await page.click('#live [data-calm-action="parked"]');
  await page.click('#live [data-calm-action="done"]');
  check('Done advances progress and persists the stop state', (await page.locator('#live .trip-progress').innerText()).includes('2/'));
  await openPlanningDrawer(page);
  await page.selectOption('#liveDay', '2026-08-15');
  await page.selectOption('#liveMode', 'ahead60');
  check('ahead mode suggests one safe route-side option with named parking', (await page.locator('#live .decision-card').filter({ hasText: 'Trois-Rivieres Harbourfront Park' }).count()) === 1 && (await page.locator('#live').innerText()).includes('Parc portuaire / tourist information visitor parking'));
  await page.click('#live [data-route-choice="trois-rivieres-harbourfront-park"]');
  const routeChoiceState = await page.evaluate(() => ({
    stops: window.__tripControlTest.dayStops('2026-08-15'),
    bank: window.__tripControlTest.calmBank('2026-08-15')
  }));
  check('extra attraction choice changes the active route and Calm Bank', routeChoiceState.stops.some((stop) => stop.id.includes('trois-rivieres-harbourfront-park'))
    && !routeChoiceState.stops.some((stop) => stop.id === 'd2-old-quebec')
    && routeChoiceState.stops.some((stop) => stop.id === 'd2-hotel' && stop.hotel)
    && routeChoiceState.bank.minutes === 50);
  check('extra attraction choice is explicit and removable', (await page.locator('#live .decision-card.is-selected').filter({ hasText: 'active in route' }).count()) === 1 && (await page.locator('#live [data-route-choice="clear"]').count()) === 1);
  await page.click('#live [data-meal-choice="quick"]');
  const mealChoiceState = await page.evaluate(() => ({
    stops: window.__tripControlTest.dayStops('2026-08-15'),
    bank: window.__tripControlTest.calmBank('2026-08-15')
  }));
  check('meal pace switch replaces the meal and credits conservative time', (await page.locator('#live [data-meal-choice="quick"]').getAttribute('aria-pressed')) === 'true'
    && (await page.locator('#live').innerText()).includes('Time unlocked for:')
    && mealChoiceState.stops.some((stop) => stop.id === 'meal-quick-2026-08-15')
    && !mealChoiceState.stops.some((stop) => stop.id === 'd2-lunch')
    && mealChoiceState.stops.some((stop) => stop.id === 'd2-hotel' && stop.hotel)
    && mealChoiceState.bank.minutes === 75);
  await page.click('#live [data-protect-recovery]');
  const protectedState = await page.evaluate(() => ({
    stops: window.__tripControlTest.dayStops('2026-08-15'),
    state: window.__tripControlTest.state()
  }));
  check('Protect recovery removes optional choices but never the booked hotel', !protectedState.state.routeChoices['2026-08-15']
    && !protectedState.stops.some((stop) => stop.flexSource === 'route')
    && protectedState.stops.some((stop) => stop.id === 'd2-hotel' && stop.hotel));
  await page.evaluate(() => {
    const routeChoice = document.querySelector('#live [data-route-choice="trois-rivieres-harbourfront-park"]');
    if (routeChoice) routeChoice.click();
    const pairedExperience = document.querySelector('#live [data-meal-experience="add"]');
    if (pairedExperience) pairedExperience.click();
  });
  const protectedRetryState = await page.evaluate(() => ({
    stops: window.__tripControlTest.dayStops('2026-08-15'),
    state: window.__tripControlTest.state()
  }));
  check('Protect recovery rejects attempts to re-add optional route and paired experiences', !protectedRetryState.state.routeChoices['2026-08-15']
    && !protectedRetryState.state.calmByDay['2026-08-15'].mealExperience
    && !protectedRetryState.stops.some((stop) => stop.flexSource === 'route' || stop.flexSource === 'meal-experience'));
  await page.click('#live [data-protect-recovery]');
  await page.click('#live [data-meal-choice="proper"]');
  await page.check('#live [data-offline-ready="maps"]');
  check('offline readiness is actionable on Today', (await page.locator('#live .readiness-card').innerText()).includes('1/4'));
  check('Today displays plan freshness and live recheck timing', (await page.locator('#live .freshness-card').count()) === 1 && (await page.locator('#live .freshness-card').innerText()).includes('plan reviewed'));
  check('Today offers a location-based nearest-stop control', (await page.locator('#live #nearestStopBtn').count()) === 1);

  // Exercise resync and restaurant recovery in a separate phone session so its
  // deliberate progress changes cannot affect the itinerary-content checks.
  const flowContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await flowContext.addInitScript(() => {
    localStorage.setItem('pei-foodie-road-trip/state/v2', JSON.stringify({
      version: 2, activeDate: '2026-08-14', modes: {}, stops: { 'd1-hotel': 'skipped' }, tasks: {}, routeChoices: {}, mealChoices: {}, offlineReadiness: {}
    }));
  });
  const flowPage = await flowContext.newPage();
  flowPage.on('pageerror', (e) => errors.push('flow pageerror: ' + e.message));
  flowPage.on('console', (m) => { if (m.type() === 'error') errors.push('flow console: ' + m.text()); });
  await flowPage.goto(base + '/index.html#live', { waitUntil: 'networkidle' });
  check('v2 progress migrates once to the calm-copilot state', await flowPage.evaluate(() => {
    return Boolean(localStorage.getItem('pei-foodie-road-trip/state/v3'))
      && !localStorage.getItem('pei-foodie-road-trip/state/v2')
      && window.__tripControlTest.state().version === 3
      && window.__tripControlTest.state().stops['d1-hotel'] !== 'skipped';
  }));
  await flowPage.click('#live [data-pulse-need="washroom"]');
  await flowPage.click('#live [data-pulse-apply="washroom"]');
  const rescueStops = await flowPage.evaluate(() => window.__tripControlTest.dayStops('2026-08-14'));
  const rescueStop = rescueStops.find((stop) => stop.id.startsWith('rescue-'));
  check('washroom rescue moves a service stop forward but cannot clone or replace a hotel', rescueStops.some((stop) => stop.id.startsWith('rescue-'))
    && !rescueStops.some((stop) => stop.id === 'rescue-d1-hotel')
    && rescueStops.some((stop) => stop.id === 'd1-hotel' && stop.hotel));
  await flowPage.click('#live [data-calm-action="start-leg"]');
  await flowPage.click('#live [data-calm-action="near"]');
  await flowPage.click('#live [data-calm-action="parked"]');
  await flowPage.click('#live [data-calm-action="done"]');
  check('finishing a rescue consumes the original stop instead of repeating it later', Boolean(rescueStop) && await flowPage.evaluate((originalId) => {
    return window.__tripControlTest.state().stops[originalId] === 'done';
  }, rescueStop.id.replace(/^rescue-/, '')));
  check('manual resync offers pending stops only', await flowPage.evaluate(() => {
    const state = window.__tripControlTest.state();
    const values = [...document.querySelectorAll('#resyncStopSelect option')].map((option) => option.value);
    return values.length > 0 && values.every((stopId) => (state.stops[stopId] || 'pending') === 'pending');
  }));
  await flowPage.click('#live .resync-control > summary');
  await flowPage.selectOption('#resyncStopSelect', 'd1-lunch');
  await flowPage.click('#applyResync');
  check('manual resync resumes from the confirmed stop without touching hotels', (await flowPage.locator('#live .next-stop h3').innerText()).includes('Tata')
    && !(await flowPage.evaluate(() => window.__tripControlTest.state().stops['d1-hotel'] === 'skipped')));
  await flowPage.click('#live [data-calm-action="start-leg"]');
  await flowPage.click('#live [data-calm-action="near"]');
  await flowPage.click('#live [data-calm-action="parked"]');
  await flowPage.click('#live [data-calm-action="start-wait"]');
  await flowPage.click('#live [data-wait-minutes="30"]');
  check('Wait Pivot recommends the structured quick-meal replacement', (await flowPage.locator('#live [data-testid="wait-pivot"]').innerText()).includes('Switch to Boboli')
    && (await flowPage.locator('#live [data-testid="wait-pivot"]').innerText()).includes('booked hotel'));
  await flowPage.click('#live [data-wait-action="quick"]');
  const waitPivotState = await flowPage.evaluate(() => window.__tripControlTest.dayStops('2026-08-14'));
  check('using Wait Pivot rewrites Next while preserving the booked hotel anchor', waitPivotState.some((stop) => stop.id === 'meal-quick-2026-08-14')
    && !waitPivotState.some((stop) => stop.id === 'd1-lunch')
    && waitPivotState.some((stop) => stop.id === 'd1-hotel' && stop.hotel));
  await flowContext.close();

  // Exercise the richest arrival record at the narrowest supported phone size.
  // The hotel itself is fixed; this state only advances earlier checkpoints so
  // the existing D1 booking is the next destination.
  const hotelArrivalSession = await openIsolatedStatePage(v3State('2026-08-14', {
    stops: {
      'd1-depart': 'done',
      'd1-fuel': 'done',
      'd1-big-apple': 'skipped',
      'd1-odessa': 'done',
      'd1-lunch': 'done',
      'd1-prehistoric-world': 'skipped'
    },
    calmByDay: { '2026-08-14': { phase: 'driving', stopId: 'd1-hotel' } }
  }), { label: 'D1 hotel arrival', viewport: { width: 320, height: 568 } });
  const hotelPage = hotelArrivalSession.page;
  check('fixed D1 hotel is the single next hotel anchor', await hotelPage.evaluate(() => {
    const hotels = window.__tripControlTest.dayStops('2026-08-14').filter((stop) => stop.id === 'd1-hotel' && stop.hotel);
    return hotels.length === 1 && (window.__tripControlTest.state().stops['d1-hotel'] || 'pending') === 'pending';
  }));
  await hotelArrivalSession.context.setOffline(true);
  await hotelPage.click('#live [data-calm-action="near"]');
  const hotelArrival = hotelPage.locator('#live [data-testid="arrival-bubble"]');
  const hotelArrivalText = await hotelArrival.innerText();
  check('hotel arrival uses honest venue wording and the saved address', (await hotelArrival.getAttribute('data-arrival-mode')) === 'venue'
    && /Booked hotel · fixed/i.test(hotelArrivalText)
    && /Arrival target/i.test(hotelArrivalText)
    && hotelArrivalText.includes('1050 de la Gauchetiere West, Montreal, QC H3B 4C9')
    && hotelArrivalText.includes('this is tonight’s fixed stay')
    && hotelArrivalText.includes('Check in using the saved booking confirmation')
    && !hotelArrivalText.includes('Cuisine / order'));
  check('fixed hotel arrival keeps offline essentials visible', await hotelArrival.locator('.arrival-target').isVisible()
    && await hotelArrival.locator('a').filter({ hasText: 'Open directions' }).isVisible()
    && await hotelArrival.locator('[data-arrival-copy]').isVisible()
    && await hotelArrival.locator('.offline-arrival-note').isVisible()
    && await hotelArrival.locator('.arrival-entrance-note').isVisible()
    && (await hotelArrival.locator('.arrival-entrance-note').innerText()).includes('Stationnement / Self-Parking'));
  check('hotel arrival has no skip or hotel-change path', (await hotelArrival.locator('[data-calm-action="skip"]').count()) === 0
    && !/change hotel|hotel alternative/i.test(hotelArrivalText));
  check('narrow-screen hotel arrival heading is focused and visible', await hotelPage.evaluate(() => {
    const heading = document.getElementById('calmContextHeading');
    const card = heading && heading.closest('.calm-context');
    const actions = card && card.querySelector('.arrival-target-actions');
    const confirm = card && card.querySelector('[data-calm-action="parked"]');
    if (!heading || !card || !actions || !confirm || document.activeElement !== heading) return false;
    const headingBox = heading.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    const confirmBox = confirm.getBoundingClientRect();
    return headingBox.bottom > 0 && headingBox.top < window.innerHeight
      && cardBox.top >= 0 && cardBox.top < 40
      && actionsBox.bottom > 0 && actionsBox.top < window.innerHeight
      && confirmBox.bottom > 0 && confirmBox.top < window.innerHeight;
  }));
  const hotelDetails = hotelArrival.locator('.arrival-details');
  check('saved entrance views start collapsed while the entrance note stays visible', !(await hotelDetails.evaluate((element) => element.open)));
  await hotelDetails.locator('summary').click();
  check('only the saved D1 entrance views are exposed', await hotelDetails.locator('a').filter({ hasText: 'Street View of entrance' }).isVisible()
    && await hotelDetails.locator('a').filter({ hasText: 'Satellite view of entrance' }).isVisible());
  check('expanded hotel arrival fits 320px and keeps touch targets usable', await hotelPage.evaluate(() => {
    const card = document.querySelector('[data-testid="arrival-bubble"]');
    const controls = [...card.querySelectorAll('button, a.button, summary')];
    return document.documentElement.scrollWidth <= window.innerWidth
      && card.scrollWidth <= card.clientWidth
      && controls.every((control) => control.getBoundingClientRect().height >= 44);
  }));
  await hotelPage.click('#live [data-calm-action="parked"]');
  check('hotel completion waits for an explicit check-in confirmation', (await hotelPage.locator('#live [data-calm-action="done"]').innerText()) === 'Checked in · room secured');
  await hotelPage.click('#live [data-calm-action="undo-arrival"]');
  check('arrival confirmations cannot mutate the booked hotel or flexible choices', await hotelPage.evaluate(() => {
    const state = window.__tripControlTest.state();
    const hotels = window.__tripControlTest.dayStops('2026-08-14').filter((stop) => stop.id === 'd1-hotel' && stop.hotel);
    return hotels.length === 1
      && (state.stops['d1-hotel'] || 'pending') === 'pending'
      && Object.keys(state.routeChoices).length === 0
      && Object.keys(state.mealChoices).length === 0;
  }));
  await hotelArrivalSession.context.close();

  const onSiteQuickSession = await openIsolatedStatePage(v3State('2026-08-16', {
    stops: {
      'd3-depart': 'done',
      'd3-kamouraska': 'done',
      'd3-lunch': 'done',
      'd3-edmundston': 'done',
      'd3-hartland': 'done',
      'd3-hotel': 'done'
    },
    mealChoices: { '2026-08-16': 'quick' }
  }), { label: 'D3 on-site quick meal' });
  check('an on-site quick replacement never creates a fake driving leg', (await onSiteQuickSession.page.locator('#live .next-stop h3').innerText()).includes('Drift Pool + Patio')
    && (await onSiteQuickSession.page.locator('#live [data-calm-action="start-stop"]').count()) === 1
    && (await onSiteQuickSession.page.locator('#live [data-calm-action="start-leg"]').count()) === 0);
  await onSiteQuickSession.page.click('#live [data-calm-action="start-stop"]');
  check('on-site arrival mode suppresses duplicate directions and parking claims', (await onSiteQuickSession.page.locator('#live [data-testid="arrival-bubble"]').getAttribute('data-arrival-mode')) === 'on-site'
    && (await onSiteQuickSession.page.locator('#live .arrival-target a').count()) === 0
    && (await onSiteQuickSession.page.locator('#live [data-calm-action="done"]').count()) === 1);
  await onSiteQuickSession.context.close();

  // The real post-trip view is read-only. Freeze the browser one day after the
  // trip so this remains covered even when the test suite runs before departure.
  const recapSession = await openIsolatedStatePage(v3State('2026-08-21'), {
    fixedDate: '2026-08-22T12:00:00-04:00',
    label: 'recap'
  });
  const recapControlSelector = [
    '[data-calm-action]', '[data-pulse-need]', '[data-pulse-apply]', '[data-protect-recovery]',
    '[data-route-choice]', '[data-meal-choice]', '[data-meal-experience]', '[data-stop-action]',
    '#resyncStopSelect', '#liveMode'
  ].map((selector) => '#live ' + selector).join(', ');
  check('post-trip recap is read-only with no live driving or planning controls',
    (await recapSession.page.locator('#live-heading').innerText()) === 'Trip recap'
      && (await recapSession.page.locator('#live .recap-card').count()) === 1
      && (await recapSession.page.locator(recapControlSelector).count()) === 0);
  await recapSession.context.close();

  // A public/redacted handoff may include progress, but never the Calm
  // Copilot's exact current stop or movement timestamps.
  const privateCalm = {
    phase: 'driving',
    stopId: 'd1-lunch',
    legStartedAt: '2026-08-14T15:01:02.000Z',
    arrivedAt: '2026-08-14T16:03:04.000Z'
  };
  const redactedSession = await openIsolatedStatePage(v3State('2026-08-14', {
    stops: { 'd1-depart': 'done', 'd1-fuel': 'done', 'd1-big-apple': 'done', 'd1-odessa': 'done' },
    calmByDay: { '2026-08-14': privateCalm }
  }), { section: 'checklist', label: 'redacted export' });
  await redactedSession.page.click('#checklist .prep-tools > summary');
  const [redactedDownload] = await Promise.all([
    redactedSession.page.waitForEvent('download'),
    redactedSession.page.click('#exportRedacted')
  ]);
  const redactedPath = await redactedDownload.path();
  const redactedPayload = redactedPath ? JSON.parse(fs.readFileSync(redactedPath, 'utf8')) : null;
  const redactedCalm = redactedPayload && redactedPayload.calmByDay || {};
  const calmLocationLeak = Object.values(redactedCalm).some((entry) => entry && (
    entry.stopId || entry.legStartedAt || entry.arrivedAt
  ));
  check('redacted export omits Calm Copilot stop IDs and movement timestamps',
    Boolean(redactedPayload && redactedPayload.redacted) && !calmLocationLeak);
  await redactedSession.context.close();

  // Exercise all three structured paired-experience behaviors: a new inserted
  // stop (D1), activation of a gated stop (D6), and merge into an existing
  // hotel recovery checkpoint (D7). D1/D6/D7 also cover route + quick-meal
  // composition so neither independent replacement is lost.
  const d1Session = await openIsolatedStatePage(v3State('2026-08-14', {
    routeChoices: { '2026-08-14': 'lake-ontario-park' },
    mealChoices: { '2026-08-14': 'quick' }
  }), { label: 'D1 resolver' });
  await d1Session.page.click('#live [data-meal-experience="add"]');
  const d1Resolved = await d1Session.page.evaluate(() => window.__tripControlTest.dayStops('2026-08-14'));
  const d1Ids = d1Resolved.map((stop) => stop.id);
  const d1RouteIndex = d1Ids.indexOf('route-flex-2026-08-14-lake-ontario-park');
  const d1QuickIndex = d1Ids.indexOf('meal-quick-2026-08-14');
  const d1ExperienceIndex = d1Ids.indexOf('meal-experience-2026-08-14');
  check('D1 composes route + quick meal and inserts the paired experience after the meal',
    d1RouteIndex >= 0 && d1QuickIndex === d1RouteIndex + 1 && d1ExperienceIndex === d1QuickIndex + 1
      && !d1Ids.includes('d1-lunch') && !d1Ids.includes('d1-big-apple') && !d1Ids.includes('d1-prehistoric-world')
      && d1Resolved.filter((stop) => stop.id === 'd1-hotel' && stop.hotel).length === 1);
  await d1Session.context.close();

  const d6ActivationSession = await openIsolatedStatePage(v3State('2026-08-19', {
    stops: {
      'd6-morning-ready': 'done', 'd6-fuel': 'done', 'd6-bridge': 'done',
      'd6-sackville-rest': 'done', 'd6-hopewell': 'done',
      'meal-quick-2026-08-19': 'done', 'd6-hotel': 'done'
    },
    mealChoices: { '2026-08-19': 'quick' }
  }), { label: 'D6 experience activation' });
  await d6ActivationSession.page.click('#live [data-meal-experience="add"]');
  const d6Activated = await d6ActivationSession.page.evaluate(() => window.__tripControlTest.dayStops('2026-08-19'));
  check('D6 paired experience activates Magnetic Hill instead of creating a duplicate synthetic stop',
    (await d6ActivationSession.page.locator('#live .next-stop h3').innerText()).includes('Magnetic Hill')
      && d6Activated.filter((stop) => stop.id === 'd6-magnetic').length === 1
      && !d6Activated.some((stop) => stop.id === 'meal-experience-2026-08-19'));
  await d6ActivationSession.context.close();

  const d6CompositionSession = await openIsolatedStatePage(v3State('2026-08-19', {
    routeChoices: { '2026-08-19': 'albert-county-museum-rb-bennett-centre' },
    mealChoices: { '2026-08-19': 'quick' }
  }), { label: 'D6 resolver' });
  const d6Resolved = await d6CompositionSession.page.evaluate(() => window.__tripControlTest.dayStops('2026-08-19'));
  const d6Ids = d6Resolved.map((stop) => stop.id);
  const d6QuickIndex = d6Ids.indexOf('meal-quick-2026-08-19');
  const d6RouteIndex = d6Ids.indexOf('route-flex-2026-08-19-albert-county-museum-rb-bennett-centre');
  check('D6 composes route + quick meal without restoring replaced lunch or Magnetic Hill',
    d6QuickIndex >= 0 && d6RouteIndex === d6QuickIndex + 1
      && !d6Ids.includes('d6-lunch') && !d6Ids.includes('d6-magnetic')
      && d6Resolved.filter((stop) => stop.id === 'd6-hotel' && stop.hotel).length === 1);
  await d6CompositionSession.context.close();

  const d7Session = await openIsolatedStatePage(v3State('2026-08-20', {
    routeChoices: { '2026-08-20': 'republique-provincial-park-playground-riverside-trail' },
    mealChoices: { '2026-08-20': 'quick' }
  }), { label: 'D7 resolver' });
  await d7Session.page.click('#live [data-meal-experience="add"]');
  const d7Resolved = await d7Session.page.evaluate(() => window.__tripControlTest.dayStops('2026-08-20'));
  const d7Ids = d7Resolved.map((stop) => stop.id);
  const d7QuickIndex = d7Ids.indexOf('meal-quick-2026-08-20');
  const d7RouteIndex = d7Ids.indexOf('route-flex-2026-08-20-republique-provincial-park-playground-riverside-trail');
  const d7Hotel = d7Resolved.find((stop) => stop.id === 'd7-hotel');
  check('D7 composes route + quick meal and merges recovery into the single booked hotel checkpoint',
    d7QuickIndex >= 0 && d7RouteIndex === d7QuickIndex + 1
      && !d7Ids.includes('d7-edmundston') && !d7Ids.includes('d7-hartland')
      && !d7Ids.includes('meal-experience-2026-08-20')
      && d7Resolved.filter((stop) => stop.id === 'd7-hotel' && stop.hotel).length === 1
      && d7Hotel && d7Hotel.pairedExperience === true);
  await d7Session.context.close();

  const tabs = ['live', 'daybyday', 'checklist', 'offline'];
  for (const tab of tabs) {
    await page.click(`#nav [data-section=${tab}]`);
    await page.waitForTimeout(100);
    const visible = await page.locator('#' + tab).isVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('tab ' + tab + ' visible, no overflow', visible && overflow <= 0, 'overflow=' + overflow + 'px');
  }
  const navLabels = await page.locator('#nav [role=tab]').allTextContents();
  check('primary navigation is reduced to four clear tabs', navLabels.length === 4 && [currentPrimaryLabel, 'Plan', 'Prep', 'Safety'].every((label) => navLabels.some((text) => text.includes(label))));
  check('secondary catalogues stay out of primary navigation', ['overview', 'food', 'attractions', 'hotels', 'sanity', 'fuel', 'sources'].every((id) => !navLabels.some((text) => text.toLowerCase().includes(id))) && (await page.locator('#nav #themeToggle').count()) === 0);
  check('tablist uses roving keyboard focus', (await page.locator('#nav [role=tab][tabindex="0"]').count()) === 1 && (await page.locator('#nav [role=tab][tabindex="-1"]').count()) === 3);

  await page.goto(base + '/index.html#overview', { waitUntil: 'networkidle' });
  check('legacy Overview direct link still renders on demand', await page.locator('#overview').isVisible() && (await page.locator('.countdown-card').count()) === 1 && (await page.locator('#tab-checklist').getAttribute('aria-selected')) === 'true');
  check('route map renders 7 stops', (await page.locator('.route-map .city-dot').count()) === 7);
  check('route map marks the optional Kingston Penitentiary visit with its tour time', (await page.locator('.route-map .optional-dot').count()) === 1 && (await page.locator('.route-map').textContent()).includes('Kingston Penitentiary') && (await page.locator('.route-map').textContent()).includes('1.5 h tour'));
  check('route map labels Hopewell as estimated and staff-controlled', (await page.locator('.route-map').textContent()).includes('Estimated 9 AM–2:45 PM · confirm with staff'));
  check('milestones render', (await page.locator('.milestone').count()) === 7);
  check('reservation call list has 4 relevant numbers', (await page.locator('.reservation-card .tel-link').count()) === 4);
  check('emergency card has route-critical numbers and all 7 hotels', (await page.locator('#offline .emergency-list .tel-link').count()) === 15);
  check('Safety prioritizes three immediate calls and removes photo-cache clutter', (await page.locator('#offline .safety-contacts .tel-link').count()) === 3 && (await page.locator('#offline').textContent()).includes('91 AKI') && (await page.locator('#offline #cachePhotos').count()) === 0);
  check('Safety offers a one-tap offline map + photo pack', (await page.locator('#offline #saveOfflineAssets').count()) === 1 && (await page.locator('#offline #clearOfflineAssets').count()) === 1);
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
  check('hotel source data marks every stay booked and safe', confirmationHotels.every((hotel) => hotel.Status === 'Booked · safe' && !hotel.Attention));
  const expectedHotelConfirmations = [
    { Date: '2026-08-14', hotel: 'Montreal Marriott Chateau Champlain', in: 'Fri, Aug 14 · from 4:00 PM', out: 'Sat, Aug 15 · by 12:00 PM', room: 'Room · 2 double beds', guests: '2 adults + 1 child' },
    { Date: '2026-08-15', hotel: 'Hôtel Cofortel', in: 'Sat, Aug 15 · from 4:00 PM', out: 'Sun, Aug 16 · by 12:00 PM', room: 'Elite room · 1 king bed · 2nd floor', guests: 'Family stay · booked and safe' },
    { Date: '2026-08-16', hotel: 'Delta Hotels by Marriott Fredericton', in: 'Sun, Aug 16 · from 4:00 PM', out: 'Mon, Aug 17 · by 11:00 AM', room: 'Room · 1 king bed + sofa bed', guests: '2 adults + 1 child' },
    { Date: '2026-08-17', hotel: 'Hampton Inn & Suites Charlottetown', in: 'Mon, Aug 17 · from 4:00 PM', out: 'Tue, Aug 18 · by 11:00 AM', room: 'Standard room · 2 queen beds', guests: '2 adults + 1 child' },
    { Date: '2026-08-18', hotel: 'Canadas Best Value Inn & Suites Charlottetown', in: 'Tue, Aug 18 · from 3:00 PM', out: 'Wed, Aug 19 · by 11:00 AM', room: 'Suite · 1 king bed · non-smoking · jetted tub', guests: 'Family stay · booked and safe' },
    { Date: '2026-08-19', hotel: 'Best Western Plus Moncton', in: 'Wed, Aug 19 · from 4:00 PM', out: 'Thu, Aug 20 · by 11:00 AM', room: 'Room details kept in the private confirmation', guests: 'Family stay · booked and safe' },
    { Date: '2026-08-20', hotel: 'DoubleTree by Hilton Quebec Resort', in: 'Thu, Aug 20 · from 4:00 PM', out: 'Fri, Aug 21 · by 12:00 PM', room: 'Suite · 1 bedroom', guests: '2 adults + 1 child' }
  ];
  check('hotel ledger matches all 7 booked stays and safe public labels', expectedHotelConfirmations.every((expected) => {
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
  check('all hotel cards are booked-safe with no false action flags', (await page.locator('#hotels .data-card.ok').count()) === 7 && (await page.locator('#hotels .tag.category-ok').filter({ hasText: 'Booked · safe' }).count()) === 7 && (await page.locator('#hotels .category-alert, #hotels .mode-note').count()) === 0);
  check('obsolete hotel alternatives are removed', (await page.locator('#hotels .hotel-backup, #hotels .hotel-backups').count()) === 0);
  check('private confirmation details are absent from the page source', !/\b\d{14}\b/.test(indexSource) && !/Reserved for/i.test(indexSource) && !/itinerary\s*#/i.test(indexSource));

  await page.click('#nav [data-section=checklist]');
  const checklistText = await page.locator('#checklist').innerText();
  check('Prep keeps all seven booked hotels in a compact disclosure', (await page.locator('#checklist .hotel-list .hotel-compact').count()) === 7 && checklistText.includes('Booked hotels'));
  check('Prep contains no false hotel booking alarms or redundant reconfirm tasks', !/Call Cofortel|Call Canadas Best Value Inn|Call Best Western Plus Moncton|Reconfirm booked stay/.test(checklistText));
  check('Prep keeps the Charlottetown luggage handoff as optional convenience', checklistText.includes('Choose the Aug 18 luggage handoff') && checklistText.includes('Optional convenience only'));
  check('Prep mirrors offline readiness from Today', (await page.locator('#checklist [data-offline-ready="maps"]').isChecked()) && (await page.locator('#checklist .readiness-card').innerText()).includes('1/4'));

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
  check('60-minute delay mode removes the optional Big Apple and Prehistoric World but protects the proper lunch', !lateAug14Text.includes('The Big Apple visitor parking') && !lateAug14Text.includes('5446 Upper Canada Rd') && lateAug14Text.includes('ONroute Odessa') && lateAug14Text.includes('Tata’s House of Pizza & Pasta'));
  await page.selectOption('#dayMode', 'on-time');
  const onTimeAug14Text = await page.locator('#dayResult').textContent();
  check('on-time mode restores the optional movement stops without the rejected attraction', onTimeAug14Text.includes('The Big Apple visitor parking') && onTimeAug14Text.includes('Prehistoric World') && !onTimeAug14Text.includes('Upper Canada Village'));
  await page.click('#nav [data-section=live]');
  check('plan state stays synchronized between day and live views', (await page.locator('#liveMode').inputValue()) === 'on-time');
  await openPlanningDrawer(page);
  await page.selectOption('#liveMode', 'preview');
  check('live schedule selector retains focus after rerender', await page.evaluate(() => document.activeElement && document.activeElement.id === 'liveMode'));

  const aug14Text = await dayText('2026-08-14');
  check('Aug 14 uses the eastbound plaza and a proper Brockville lunch', aug14Text.includes('ONroute Odessa') && aug14Text.includes('3745 Highway 401 Eastbound') && aug14Text.includes('Morning snack / washroom') && aug14Text.includes('Tata’s House of Pizza & Pasta') && aug14Text.includes('11 Windsor Drive') && aug14Text.includes('50-60 min'));
  check('Aug 14 adds the optional Prehistoric World dinosaur-trail visit after the Brockville lunch', aug14Text.includes('Prehistoric World') && aug14Text.includes('5446 Upper Canada Rd') && aug14Text.includes('Morrisburg'));
  check('Aug 14 offers Kingston Penitentiary as an optional route-side visit with its tour time', aug14Text.includes('Kingston Penitentiary Tour') && aug14Text.includes('560 King Street West') && aug14Text.includes('1.5 h tour'));

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
  check('Aug 19 includes a tide-safe named rest before Hopewell', aug19Text.includes('Required rest: Sackville Waterfowl Park') && aug19Text.includes('Tantramar Visitor Information Centre parking') && aug19Text.includes('hard leave 09:20') && aug19Text.includes('34 Mallard Drive'));
  check('Aug 19 keeps the earlier attraction as an either-or fallback', aug19Text.includes('Fallback rest: Marine Rail Historical Park') && aug19Text.includes('only instead of Sackville') && aug19Text.includes('41 Borden Avenue'));
  check('Aug 19 respects the booked-safe Best Western 4 PM check-in', aug19Text.includes('Best Western Plus Moncton') && aug19Text.includes('16:00 guaranteed') && aug19Text.includes('booked and safe'));

  const aug20Text = await dayText('2026-08-20');
  check('Aug 20 protects early departure, proper lunch, recovery and on-site dinner', aug20Text.includes('Wake 05:30') && aug20Text.includes('Frank’s Bar & Grill') && aug20Text.includes('100 Rice Street') && aug20Text.toLowerCase().includes('quarter tank') && aug20Text.includes('DoubleTree by Hilton Quebec Resort') && aug20Text.includes('16:30–17:15') && aug20Text.includes('Le Dijon'));

  const aug21Text = await dayText('2026-08-21');
  const aug21Requirements = ['06:30 wheels moving', 'DoubleTree hotel breakfast', 'Scores Restaurant Boucherville', '14:00 fatigue checkpoint', 'About 190 km / 2 h', '20:00', 'fatigue'];
  const aug21Missing = aug21Requirements.filter((item) => !aug21Text.toLowerCase().includes(item.toLowerCase()));
  check('Aug 21 has a fatigue-based rest checkpoint', aug21Missing.length === 0, 'missing=' + aug21Missing.join(', '));
  check('Aug 21 stays westbound and suggests no overnight hotel', aug21Text.includes('Mallorytown North') && !aug21Text.includes('Hampton Inn Kingston') && !aug21Text.includes('Kingston safety') && !aug21Text.includes('Mallorytown South') && !aug21Text.includes('Cornwall'));
  const allDayTexts = [aug14Text, aug15Text, aug16Text, aug17Text, aug18Text, aug19Text, aug20Text, aug21Text];
  check('every day exposes one hotel anchor and a hotel-breakfast plus lunch/dinner contract', allDayTexts.every((text) => {
    const normalized = text.toLowerCase();
    return normalized.includes('hotel anchor') && normalized.includes('hotel breakfast + two balanced meals') && normalized.includes('breakfast') && normalized.includes('lunch') && normalized.includes('dinner') && !normalized.includes('brunch');
  }));
  check('every day offers route-side attractions with strict gates and named parking', allDayTexts.every((text) => text.includes('Along-the-way options') && text.includes('Go / no-go gate') && text.includes('Closest named parking')));
  check('optional route attractions cover child resets, weather flexibility and short history stops', aug14Text.includes('Lake Ontario Park') && aug17Text.includes('Bore Park tidal bore viewpoint') && aug18Text.includes('Gardens of Hope & Butterfly House') && aug18Text.includes('Cavendish Boardwalk') && aug19Text.includes('Albert County Museum & RB Bennett Centre') && aug19Text.includes('Steeves House Museum') && aug20Text.includes('Republique Provincial Park') && aug21Text.includes('Fort Chambly National Historic Site'));
  check('the plan uses proper restaurant dinners instead of room service', allDayTexts.every((text) => !text.toLowerCase().includes('room service')) && aug16Text.includes('STMR.36 at Delta') && aug20Text.includes('Proper dinner: Le Dijon dining room'));
  check('the active itinerary contains no rejected attraction or self-catered lunch', allDayTexts.every((text) => {
    const normalized = text.toLowerCase();
    return !normalized.includes('upper canada village') && !normalized.includes('packed lunch') && !normalized.includes('cooler lunch') && !normalized.includes('packed picnic');
  }));
  check('attraction stops expose named visitor parking', aug15Text.includes('Montmorency Falls lower-site P1/P2 visitor parking') && aug18Text.includes('Green Gables Visitor Centre parking') && aug18Text.includes('Cavendish Main Beach visitor parking') && aug19Text.includes('Tantramar Visitor Information Centre parking') && aug19Text.includes('Hopewell Rocks main visitor parking'));
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
  check('Aug 19 default route includes Sackville but excludes the either-or Marine Rail fallback', route19.waypoints.includes('34 Mallard Drive') && !route19.waypoints.includes('41 Borden Avenue'));
  check('Aug 16 default route ends at Delta, not the conditional dinner branch', route16.destination.includes('225 Woodstock Road'));
  check('Aug 21 default route stays westbound and excludes backward or split-only stops', route21.destination === 'Vaughan, ON' && route21.waypoints.includes('678 Highway 401 Westbound') && !route21.waypoints.includes('Brockville') && !route21.waypoints.includes('209 King St W'));
  check('active-day routes respect the mobile Maps waypoint limit', [route14, route15, route16, route17, route18, route19, route21].every((route) => route.segmentCount >= 1 && route.maxWaypoints <= 3));
  check('day summary is compact and hotel/meal anchored', (await page.locator('#dayResult .day-fact').count()) === 4 && (await page.locator('#dayResult .hotel-anchor').count()) === 1 && (await page.locator('#dayResult .meal-contract-item').count()) === 3 && (await page.locator('#dayResult .meal-plan-card').count()) === 0);
  const visibleStopCount = await page.locator('#dayResult .day-map .map-stop').count();
  check('the day plan is a route map whose stops reveal details on click', visibleStopCount > 0 && (await page.locator('#dayResult .day-map details.map-node').count()) === visibleStopCount && (await page.locator('#dayResult .map-node-title').count()) === visibleStopCount && (await page.locator('#dayResult .stop-destination').count()) === visibleStopCount && (await page.locator('#dayResult .stop-primary-actions a').count()) > 0 && (await page.locator('#dayResult .priority-badge').count()) > 0 && (await page.locator('#dayResult .kind-badge').count()) === 0);
  const firstStopNode = page.locator('#dayResult .day-map details.map-node').first();
  check('map stops start collapsed and expand when clicked', !(await firstStopNode.evaluate((el) => el.open)));
  await firstStopNode.locator('summary').click();
  check('clicking a stop opens its details', await firstStopNode.evaluate((el) => el.open) && await firstStopNode.locator('.map-detail .stop-primary-actions a').first().isVisible());
  check('meal and attraction logistics stay available inside expandable details', (await page.locator('#dayResult .practical-grid').count()) >= 1);
  check('day navigation buttons render', (await page.locator('#previousDay').count()) === 1 && (await page.locator('#nextDay').count()) === 1);
  await page.click('#previousDay');
  check('previous-day control changes the selected day', (await page.locator('#daySelectV2').inputValue()) === '2026-08-20');
  check('previous-day control moves the route map filter with the list', (await page.locator('#tripMapDay').inputValue()) === '2026-08-20');
  await page.click('#nav [data-section=live]');
  check('previous-day control carries the day into the Today tab', (await page.locator('#liveDay').inputValue()) === '2026-08-20');
  await page.goto(base + '/index.html#daybyday', { waitUntil: 'networkidle' });
  check('a day chosen by paging survives a reload', (await page.locator('#daySelectV2').inputValue()) === '2026-08-20');

  // The Today day selector is the same commit path, so it has to move the Plan
  // tab's list and its route map filter too.
  await page.click('#nav [data-section=live]');
  await openPlanningDrawer(page);
  await page.selectOption('#liveDay', '2026-08-17');
  await page.click('#nav [data-section=daybyday]');
  check('the Today day selector moves the Plan list and route map together', (await page.locator('#daySelectV2').inputValue()) === '2026-08-17' && (await page.locator('#tripMapDay').inputValue()) === '2026-08-17');
  check('the deferred fit redraws the map for the day picked off-screen', (await page.locator('#tripMapStatus').textContent()).trim().length > 0 && (await page.locator('#tripMap .leaflet-marker-icon').count()) > 0);

  // Rotating the phone on the Today tab makes Leaflet re-measure the hidden Plan
  // map as 0x0, so a fit run there clamps to maxZoom and frames nothing. Tile
  // URLs carry the zoom, so they show whether the day was actually framed.
  const tileZoom = () => page.evaluate(() => {
    const zooms = [...document.querySelectorAll('#tripMap img.leaflet-tile')]
      .map((i) => (i.src.match(/\/(\d+)\/\d+\/\d+\.png/) || [])[1]).filter(Boolean).map(Number);
    return zooms.length ? Math.max(...zooms) : null;
  });
  await page.click('#nav [data-section=live]');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(200);
  await openPlanningDrawer(page);
  await page.selectOption('#liveDay', '2026-08-18');
  await page.click('#nav [data-section=daybyday]');
  await page.waitForTimeout(1200);
  const rotatedZoom = await tileZoom();
  check('a day picked while rotated on Today still frames that day on the map', rotatedZoom !== null && rotatedZoom < 12, 'tile zoom=' + rotatedZoom);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.selectOption('#daySelectV2', '2026-08-14');

  await page.goto(base + '/index.html#live', { waitUntil: 'networkidle' });
  const liveMapStops = await page.locator('#live .day-map .map-stop').count();
  check('Today view echoes the day route map with a highlighted next stop', liveMapStops > 0 && (await page.locator('#live .day-map .day-map-head h3').textContent()).includes('route') && (await page.locator('#live .day-map .is-next .map-next-flag').count()) === 1 && (await page.locator('#live .day-map details.map-node[open]').count()) === 0 && (await page.locator('#live .day-map [data-stop-action]').count()) > 0);

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

  // Plan B carries its own independent interactive map (a second instance of the
  // consolidated route map) so alternates can be compared and switched in place.
  await page.goto(base + '/index.html#planb', { waitUntil: 'networkidle' });
  check('Plan B has its own interactive map card at the top', (await page.locator('#planb .trip-map-card').count()) === 1 && (await page.locator('#planb #planbMap.leaflet-container').count()) === 1);
  check('Plan B map renders both scheduled pins and route-side idea pins', (await page.locator('#planb #planbMap .trip-pin:not(.is-idea)').count()) > 0 && (await page.locator('#planb #planbMap .trip-pin.is-idea').count()) > 0);
  check('Plan B map exposes its own filter controls, separate from the Plan tab map', (await page.locator('#planbMapDay').count()) === 1 && (await page.locator('#planbMapReset').count()) === 1 && (await page.locator('#planbMapStatus').innerText()).includes('scheduled stop') && (await page.locator('#planb #tripMap').count()) === 0);
  const planbAllPins = await page.locator('#planb #planbMap .trip-pin:not(.is-idea)').count();
  await page.selectOption('#planbMapDay', '2026-08-18');
  check('Plan B map day filter narrows the pins', (await page.locator('#planb #planbMap .trip-pin:not(.is-idea)').count()) < planbAllPins);
  check('Plan B map day filter moves the Plan B list to the same date', (await page.locator('#planbDay').inputValue()) === '2026-08-18' && (await page.locator('#planbResult .day-group').count()) === 1 && (await page.locator('#planbResult .day-group[data-day="2026-08-18"]').count()) === 1);
  await page.click('#planbMapReset');
  check('Plan B map reset restores all pins', (await page.locator('#planb #planbMap .trip-pin:not(.is-idea)').count()) === planbAllPins && (await page.locator('#planbMapDay').inputValue()) === 'all');
  check('Plan B map reset also clears the list back to all days', (await page.locator('#planbDay').inputValue()) === '' && (await page.locator('#planbResult .day-group').count()) === 8);
  check('Plan B map adds no horizontal overflow at phone width', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('map shows OpenStreetMap attribution', (await page.locator('#planbMap .leaflet-control-attribution').innerText()).includes('OpenStreetMap'));

  // Theme toggle produces dark background and syncs the native color-scheme
  await page.click('#themeToggle');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark theme applies', bg === 'rgb(16, 22, 28)', bg);
  check('dark theme syncs native color-scheme', (await page.evaluate(() => document.documentElement.style.colorScheme)) === 'dark');

  // Meaningful status updates are mirrored to a visible toast (not just the
  // screen-reader live region), so confirmations and errors show on the road.
  const toast = page.locator('.app-toast');
  check('a user action surfaces a visible toast with its message', (await toast.count()) === 1
    && (await toast.evaluate((el) => el.classList.contains('is-visible')))
    && (await toast.textContent()).toLowerCase().includes('theme set to'));
  check('toast does not add horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

  check('no console/page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  if (failures.length) {
    console.error('\n' + failures.length + ' check(s) failed');
    process.exit(1);
  }
  console.log('\nAll smoke checks passed');
})();
