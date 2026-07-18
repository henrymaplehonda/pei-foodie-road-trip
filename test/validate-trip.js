'use strict';

// Fast, dependency-free integrity check for the safety-critical trip data.
// Runs before the browser smoke test so gross data drift (a bad coordinate, a
// malformed map link, an out-of-order date, a missing stop time) fails loudly
// and instantly instead of surfacing as a wrong pin on the road. Exits non-zero
// on any error; warnings are printed but do not fail the build.

const fs = require('fs');
const path = require('path');
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
function validateCoordinates(source) {
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
        fail('app.js:' + (index + 1) + ': coordinate [' + coords[0] + ', ' + coords[1]
          + '] is outside the trip bounds (check for a typo or swapped lat/lng).');
      }
      rest = rest.slice(match.index + match[0].length);
    }
  });
  if (!checked) warn('app.js: no coordinate literals found to validate.');
  return checked;
}

// --- Run --------------------------------------------------------------------

function main() {
  const html = readFile('index.html');
  const appSource = readFile('app.js');

  const data = extractTripData(html);
  if (data) validateTripData(data);
  const coordCount = validateCoordinates(appSource);

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
