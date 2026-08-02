'use strict';

// Fast, dependency-free integrity check for the safety-critical trip data.
// Runs before the browser smoke test so gross data drift (a bad coordinate, a
// malformed map link, an out-of-order date, a missing stop time) fails loudly
// and instantly instead of surfacing as a wrong pin on the road. Exits non-zero
// on any error; warnings are printed but do not fail the build.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const utils = require('./trip-utils.js');

const ROOT = path.join(__dirname, '..');
const errors = [];
const warnings = [];

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// --- Trip-data JSON (index.html) -------------------------------------------

function extractTripData(html) {
  const match = /<script id="trip-data"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) { fail('index.html: no <script id="trip-data"> block found.'); return null; }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail('index.html: trip-data JSON does not parse — ' + error.message);
    return null;
  }
}

function validateTripData(data) {
  if (!data || !Array.isArray(data.days) || !data.days.length) {
    fail('trip-data: "days" must be a non-empty array.');
    return;
  }

  if (data.days.length !== 8) {
    warn('trip-data: expected 8 days (Aug 14-21), found ' + data.days.length + '.');
  }

  let previousDate = '';
  data.days.forEach(function (day, dayIndex) {
    const where = 'day ' + (dayIndex + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || isNaN(Date.parse(day.date))) {
      fail(where + ': invalid date "' + day.date + '".');
    } else {
      if (previousDate && day.date <= previousDate) {
        fail(where + ': date "' + day.date + '" is not after the previous day "' + previousDate + '".');
      }
      previousDate = day.date;
    }

    if (!Array.isArray(day.stops) || !day.stops.length) {
      fail(where + ' (' + day.date + '): "stops" must be a non-empty array.');
      return;
    }

    day.stops.forEach(function (stop, stopIndex) {
      const label = where + ' stop ' + (stopIndex + 1);
      const name = stop['Stop / Segment'];
      if (!name || !String(name).trim()) {
        fail(label + ': missing "Stop / Segment" name.');
      }
      // A stop's Time is normally a clock value ("07:00", "09:15 arrive · ~30 min").
      // Deactivated/branch stops legitimately reuse the field for a status note
      // ("Moved to Aug 17/18", "Bonus only—never Plan A"), so only an empty time
      // is a hard error; a non-clock marker is surfaced as a warning to review.
      if (!stop.Time || !String(stop.Time).trim()) {
        fail(label + ' (' + (name || '?') + '): missing "Time" value.');
      } else if (!utils.parseTimePrefix(stop.Time)) {
        warn(label + ' (' + (name || '?') + '): non-clock "Time" marker "' + stop.Time + '" (verify this stop is intentionally deactivated).');
      }
      ['Map URL', 'Source URL'].forEach(function (key) {
        const value = stop[key];
        if (value && !utils.isValidHttpUrl(value)) {
          fail(label + ' (' + (name || '?') + '): "' + key + '" is not a valid http(s) URL.');
        }
      });
      if (stop.Date && stop.Date !== day.date) {
        warn(label + ': stop.Date "' + stop.Date + '" differs from its day "' + day.date + '".');
      }
    });
  });
}

// --- Coordinate literals (app.js) ------------------------------------------

// Every lat/lng pair in app.js should sit inside the trip corridor. Requiring a
// decimal point in both numbers keeps this from matching integer arrays like
// autoPan padding [16, 18].
function validateCoordinates(label, source) {
  const pattern = /\[\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\]/;
  const lines = source.split(/\r?\n/);
  let checked = 0;
  lines.forEach(function (line, index) {
    let rest = line;
    let match;
    while ((match = pattern.exec(rest))) {
      const coords = [Number(match[1]), Number(match[2])];
      checked += 1;
      if (!utils.withinTripBounds(coords)) {
        fail(label + ':' + (index + 1) + ': coordinate [' + coords[0] + ', ' + coords[1]
          + '] is outside the trip bounds (check for a typo or swapped lat/lng).');
      }
      rest = rest.slice(match.index + match[0].length);
    }
  });
  return checked;
}

// Coordinates live in the data/ files now; app.js still carries a few (map
// defaults, bounds), so both are scanned.
function validateAllCoordinates() {
  const sources = ['app.js'].concat(
    fs.readdirSync(path.join(ROOT, 'data'))
      .filter(function (name) { return name.endsWith('.js'); })
      .map(function (name) { return 'data/' + name; })
  );
  const checked = sources.reduce(function (sum, rel) {
    return sum + validateCoordinates(rel, readFile(rel));
  }, 0);
  if (!checked) warn('no coordinate literals found to validate.');
  return checked;
}

// --- Flexible-choice schema ------------------------------------------------

function loadTripFactory(rel, key) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(readFile(rel), context, { filename: rel });
  const factory = context.window.TripData && context.window.TripData[key];
  if (typeof factory !== 'function') {
    fail(rel + ': missing TripData.' + key + ' factory.');
    return {};
  }
  return factory({ mapSearchUrl: function (value) { return 'https://maps.example/?q=' + encodeURIComponent(value); } });
}

function validateFlexibleChoices(data) {
  const planSource = readFile('data/plan.js');
  const knownStopIds = new Set(Array.from(planSource.matchAll(/\bid:\s*'([^']+)'/g), function (match) { return match[1]; }));
  const hotelIds = new Set(Array.from(knownStopIds).filter(function (id) { return /-hotel$/.test(id); }));
  const replaceableRouteTargets = new Set();
  planSource.split(/\r?\n/).forEach(function (line) {
    const match = /\bid:\s*'([^']+)'/.exec(line);
    if (match && (/priority:\s*'optional'/.test(line) || /choiceGated:\s*true/.test(line) || /replaceable:\s*true/.test(line))) {
      replaceableRouteTargets.add(match[1]);
    }
  });
  const dayIds = new Set((data && data.days || []).map(function (day) { return day.date; }));
  const routes = loadTripFactory('data/route-options.js', 'routeOptionsByDay');
  const meals = loadTripFactory('data/meals.js', 'mealFlexByDay');

  function validateEffect(dayId, label, item, expectDebit) {
    if (!item.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) fail(label + ': missing or invalid stable id.');
    if (!item.effect || typeof item.effect !== 'object') { fail(label + ': missing effect metadata.'); return; }
    const anchors = [item.effect.insertBeforeStopId, item.effect.insertAfterStopId].filter(Boolean);
    anchors.forEach(function (id) {
      if (!knownStopIds.has(id)) fail(label + ': unknown insertion anchor "' + id + '".');
    });
    const replacements = item.effect.replaceStopIds;
    if (!Array.isArray(replacements)) fail(label + ': replaceStopIds must be an array.');
    else replacements.forEach(function (id) {
      if (!knownStopIds.has(id)) fail(label + ': unknown replacement stop "' + id + '".');
      if (hotelIds.has(id)) fail(label + ': booked hotel "' + id + '" may never be replaced.');
      if (expectDebit && !replaceableRouteTargets.has(id)) fail(label + ': route replacement "' + id + '" is not optional, choice-gated, or explicitly replaceable.');
    });
    if (!item.timing || !Number.isFinite(Number(item.timing.bankDeltaMin))) fail(label + ': missing numeric Calm Bank impact.');
    if (expectDebit && Number(item.timing.bankDeltaMin) >= 0) fail(label + ': route option must debit the Calm Bank.');
    if (!expectDebit && Number(item.timing.savedMin) < 0) fail(label + ': meal shortcut savings cannot be negative.');
    const dayPrefix = 'd' + (Array.from(dayIds).sort().indexOf(dayId) + 1) + '-';
    anchors.concat(Array.isArray(replacements) ? replacements : []).forEach(function (id) {
      if (dayPrefix !== 'd0-' && id.indexOf(dayPrefix) !== 0) fail(label + ': stop "' + id + '" belongs to another day.');
    });
  }

  Object.keys(routes).forEach(function (dayId) {
    if (!dayIds.has(dayId)) fail('route options: unknown day "' + dayId + '".');
    const seen = new Set();
    (routes[dayId].options || []).forEach(function (option, index) {
      const label = 'route option ' + dayId + ' #' + (index + 1);
      validateEffect(dayId, label, option, true);
      if (seen.has(option.id)) fail(label + ': duplicate id "' + option.id + '".');
      seen.add(option.id);
      if (!Number.isFinite(Number(option.timing && option.timing.totalImpactMin)) || Number(option.timing.totalImpactMin) < 0) fail(label + ': invalid totalImpactMin.');
    });
  });
  Object.keys(meals).forEach(function (dayId) {
    if (!dayIds.has(dayId)) fail('meal options: unknown day "' + dayId + '".');
    (meals[dayId].options || []).forEach(function (option, index) {
      const label = 'meal option ' + dayId + ' #' + (index + 1);
      validateEffect(dayId, label, option, false);
      if (!Number.isFinite(Number(option.triggerWaitMin)) || Number(option.triggerWaitMin) < 0) fail(label + ': invalid wait trigger.');
      if (!option.foodCity || !option.foodLeg) fail(label + ': quick meal needs explicit foodCity and foodLeg logistics.');
      const experience = option.experienceEffect;
      if (!experience || typeof experience !== 'object') {
        fail(label + ': missing explicit experienceEffect.');
      } else {
        const modes = ['activateStopId', 'mergeWithStopId', 'insertAfterStopId', 'insertBeforeStopId'].filter(function (key) { return Boolean(experience[key]); });
        if (modes.length !== 1) fail(label + ': experienceEffect must use exactly one activate, merge, or insert mode.');
        modes.forEach(function (key) {
          const id = experience[key];
          const syntheticQuickId = 'meal-quick-' + dayId;
          if (!knownStopIds.has(id) && id !== syntheticQuickId) fail(label + ': unknown paired-experience target "' + id + '".');
          if (key === 'activateStopId' && hotelIds.has(id)) fail(label + ': a hotel can only be merged with an on-site experience, never activated as a flexible stop.');
        });
        if (!Number.isFinite(Number(experience.totalImpactMin)) || Number(experience.totalImpactMin) < 0) fail(label + ': invalid paired-experience totalImpactMin.');
      }
    });
  });
  const expectedHotelIds = new Set(['d1-hotel', 'd2-hotel', 'd3-hotel', 'd4-hotel', 'd5-hotel', 'd6-hotel', 'd7-hotel']);
  const missingHotels = Array.from(expectedHotelIds).filter(function (id) { return !hotelIds.has(id); });
  const unexpectedHotels = Array.from(hotelIds).filter(function (id) { return !expectedHotelIds.has(id); });
  if (hotelIds.size !== 7 || missingHotels.length || unexpectedHotels.length) {
    fail('immutable hotel anchors must be exactly d1-hotel through d7-hotel; missing [' + missingHotels.join(', ') + '], unexpected [' + unexpectedHotels.join(', ') + '].');
  }
}

// --- Run --------------------------------------------------------------------

function main() {
  const html = readFile('index.html');

  const data = extractTripData(html);
  if (data) validateTripData(data);
  if (data) validateFlexibleChoices(data);
  const coordCount = validateAllCoordinates();

  const dayCount = data && Array.isArray(data.days) ? data.days.length : 0;
  const stopCount = data && Array.isArray(data.days)
    ? data.days.reduce(function (sum, day) { return sum + (Array.isArray(day.stops) ? day.stops.length : 0); }, 0)
    : 0;

  warnings.forEach(function (message) { console.warn('  warning: ' + message); });

  if (errors.length) {
    console.error('\nTrip data validation FAILED (' + errors.length + ' error' + (errors.length === 1 ? '' : 's') + '):');
    errors.forEach(function (message) { console.error('  - ' + message); });
    process.exit(1);
  }

  console.log('Trip data OK: ' + dayCount + ' days, ' + stopCount + ' stops, '
    + coordCount + ' coordinates checked'
    + (warnings.length ? ' (' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') + ')' : '') + '.');
}

main();
