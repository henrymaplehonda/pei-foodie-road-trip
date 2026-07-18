'use strict';

// Fast pure-function unit tests (no browser). Two groups:
//  1. test/trip-utils.js — the shared geo/url/tile helpers, tested directly.
//  2. app.js's own pure string helpers (normalize, slug, escapeHtml,
//     categoryClass) — extracted from the real source and evaluated in a
//     sandbox, so the SHIPPING functions are covered without moving them out of
//     the browser IIFE (which the parallel Codex agent also edits).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const utils = require('./trip-utils.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Pull a top-level `  function name(...) {  ...  }` out of app.js. Inner closers
// are indented deeper than two spaces, so the first `^  }$` after the header is
// the function's own closing brace.
function extractFunction(name) {
  const re = new RegExp('^  function ' + name + '\\b[\\s\\S]*?^  \\}$', 'm');
  const match = re.exec(APP_SOURCE);
  assert.ok(match, 'could not find function ' + name + ' in app.js');
  return match[0];
}

// slug and categoryClass call normalize, so evaluate all four together.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  [extractFunction('normalize'), extractFunction('escapeHtml'),
    extractFunction('slug'), extractFunction('categoryClass'),
    'this.normalize = normalize; this.escapeHtml = escapeHtml;',
    'this.slug = slug; this.categoryClass = categoryClass;'].join('\n'),
  sandbox
);

// --- app.js pure helpers ----------------------------------------------------

test('normalize strips accents, quotes, and case', function () {
  assert.strictEqual(sandbox.normalize('Rivière-du-Loup'), 'riviere-du-loup');
  assert.strictEqual(sandbox.normalize("Peake's  Wharf"), 'peakes wharf');
  assert.strictEqual(sandbox.normalize('  MIXED   Case '), 'mixed case');
  assert.strictEqual(sandbox.normalize(null), '');
});

test('slug produces url-safe kebab identifiers', function () {
  assert.strictEqual(sandbox.slug('Blue Mussel Café'), 'blue-mussel-cafe');
  assert.strictEqual(sandbox.slug('Hopewell Rocks!!'), 'hopewell-rocks');
  assert.strictEqual(sandbox.slug('  --edge--  '), 'edge');
});

test('escapeHtml neutralizes markup characters', function () {
  assert.strictEqual(sandbox.escapeHtml('<b>"x" & \'y\'</b>'),
    '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.strictEqual(sandbox.escapeHtml(null), '');
});

test('categoryClass buckets stop labels', function () {
  assert.strictEqual(sandbox.categoryClass('Hotel check in'), 'category-hotel');
  assert.strictEqual(sandbox.categoryClass('Premium fuel'), 'category-fuel');
  assert.strictEqual(sandbox.categoryClass('Seaside lunch'), 'category-food');
  assert.strictEqual(sandbox.categoryClass('Scenic waterfront'), 'category-attraction');
  assert.strictEqual(sandbox.categoryClass('Depart Vaughan'), 'category-drive');
  assert.strictEqual(sandbox.categoryClass('Something else'), '');
});

// --- trip-utils: URLs & bounds ---------------------------------------------

test('isValidHttpUrl accepts http/https only', function () {
  assert.ok(utils.isValidHttpUrl('https://www.google.com/maps'));
  assert.ok(utils.isValidHttpUrl('http://example.com'));
  assert.ok(!utils.isValidHttpUrl('ftp://example.com'));
  assert.ok(!utils.isValidHttpUrl('javascript:alert(1)'));
  assert.ok(!utils.isValidHttpUrl('not a url'));
  assert.ok(!utils.isValidHttpUrl(''));
});

test('withinTripBounds accepts corridor points and rejects strays/swaps', function () {
  assert.ok(utils.withinTripBounds([46.2382, -63.1311])); // Charlottetown
  assert.ok(utils.withinTripBounds([43.83512, -79.53467])); // Vaughan
  assert.ok(!utils.withinTripBounds([-63.1311, 46.2382])); // swapped lat/lng
  assert.ok(!utils.withinTripBounds([51.5, -0.12])); // London, UK
  assert.ok(!utils.withinTripBounds([46.2, 'x']));
});

// --- trip-utils: geometry ---------------------------------------------------

test('haversineKm matches a known distance', function () {
  // Charlottetown -> Moncton is ~128 km as the crow flies.
  const d = utils.haversineKm([46.2382, -63.1311], [46.0878, -64.7782]);
  assert.ok(d > 120 && d < 135, 'expected ~128 km, got ' + d);
  assert.strictEqual(Math.round(utils.haversineKm([46, -63], [46, -63])), 0);
});

test('tile math places a point in the right XYZ tile', function () {
  const point = [46, -63]; // Charlottetown area
  // Zoom 0 is a single world tile; a NW-hemisphere point sits in the top-left as
  // the grid subdivides. These are hand-verifiable against the slippy-map formula.
  assert.deepStrictEqual([utils.lon2tileX(point[1], 0), utils.lat2tileY(point[0], 0)], [0, 0]);
  assert.deepStrictEqual([utils.lon2tileX(point[1], 1), utils.lat2tileY(point[0], 1)], [0, 0]);
  assert.deepStrictEqual([utils.lon2tileX(point[1], 2), utils.lat2tileY(point[0], 2)], [1, 1]);
  // X grows eastward; Y grows southward.
  assert.ok(utils.lon2tileX(-60, 8) > utils.lon2tileX(-70, 8));
  assert.ok(utils.lat2tileY(45, 8) > utils.lat2tileY(47, 8));
});

test('enumerateTiles covers a box and honours the cap', function () {
  const bounds = { minLat: 45, maxLat: 47, minLng: -65, maxLng: -63 };
  const tiles = utils.enumerateTiles(bounds, [8], 5000);
  assert.ok(tiles.length > 0);
  tiles.forEach(function (t) { assert.strictEqual(t.z, 8); });
  const capped = utils.enumerateTiles(bounds, [12], 10);
  assert.strictEqual(capped.length, 10);
});

test('boundsForCoords pads the extent and ignores bad points', function () {
  // [47, 'x'] is not a valid pair, so it is ignored: extent comes from the two
  // good points only (lat 45..46, lng -64..-63), then padded by 0.1.
  const b = utils.boundsForCoords([[46, -63], [45, -64], null, [47, 'x']], 0.1);
  assert.ok(Math.abs(b.minLat - 44.9) < 1e-9);
  assert.ok(Math.abs(b.maxLat - 46.1) < 1e-9);
  assert.ok(Math.abs(b.minLng - (-64.1)) < 1e-9);
  assert.ok(Math.abs(b.maxLng - (-62.9)) < 1e-9);
});

// --- trip-utils: time parsing ----------------------------------------------

test('parseTimePrefix reads a leading clock value', function () {
  assert.deepStrictEqual(utils.parseTimePrefix('07:00'), { hours: 7, minutes: 0, totalMinutes: 420 });
  assert.strictEqual(utils.parseTimePrefix('09:15 arrive · ~30 min').totalMinutes, 555);
  assert.strictEqual(utils.parseTimePrefix('Moved to Aug 17/18'), null);
  assert.strictEqual(utils.parseTimePrefix(''), null);
});

test('isHHMM validates 24-hour clock strings', function () {
  assert.ok(utils.isHHMM('00:00'));
  assert.ok(utils.isHHMM('23:59'));
  assert.ok(!utils.isHHMM('24:00'));
  assert.ok(!utils.isHHMM('7:00'));
  assert.ok(!utils.isHHMM('12:60'));
});
