'use strict';

// Small, dependency-free pure helpers shared by the trip-data validator
// (test/validate-trip.js) and the unit tests (test/unit.js). Kept as a plain
// CommonJS module so both can `require` it without a build step. The browser app
// (app.js) inlines the couple of formulas it needs (haversine, tile math) so it
// stays a single no-build IIFE and index.html loads no extra script.

// Generous bounding box covering the whole Vaughan -> PEI -> Vaughan corridor
// (southern Ontario through the Maritimes). A coordinate outside this box is
// almost certainly a typo or a swapped lat/lng pair.
const TRIP_BOUNDS = { minLat: 40, maxLat: 52, minLng: -90, maxLng: -60 };

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function isCoordPair(coords) {
  return Array.isArray(coords) && coords.length === 2
    && typeof coords[0] === 'number' && typeof coords[1] === 'number'
    && isFinite(coords[0]) && isFinite(coords[1]);
}

function withinTripBounds(coords, bounds) {
  const box = bounds || TRIP_BOUNDS;
  if (!isCoordPair(coords)) return false;
  const lat = coords[0];
  const lng = coords[1];
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

// Great-circle distance in kilometres between two [lat, lng] points.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = function (deg) { return (deg * Math.PI) / 180; };
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Web-Mercator (XYZ / "slippy map") tile coordinates for a lon/lat at zoom z.
function lon2tileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function lat2tileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z)
  );
}

// Enumerate every tile covering `bounds` across `zooms`, stopping at `cap` tiles
// so an over-wide zoom can never queue an unbounded download. Bounds are
// { minLat, maxLat, minLng, maxLng }.
function enumerateTiles(bounds, zooms, cap) {
  const limit = cap || 2000;
  const tiles = [];
  for (let i = 0; i < zooms.length; i += 1) {
    const z = zooms[i];
    const xMin = lon2tileX(bounds.minLng, z);
    const xMax = lon2tileX(bounds.maxLng, z);
    // Latitude grows downward in tile-Y, so maxLat maps to the smaller Y.
    const yMin = lat2tileY(bounds.maxLat, z);
    const yMax = lat2tileY(bounds.minLat, z);
    for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x += 1) {
      for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y += 1) {
        tiles.push({ z: z, x: x, y: y });
        if (tiles.length >= limit) return tiles;
      }
    }
  }
  return tiles;
}

function boundsForCoords(coordList, pad) {
  const margin = typeof pad === 'number' ? pad : 0.15;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  coordList.forEach(function (c) {
    if (!isCoordPair(c)) return;
    minLat = Math.min(minLat, c[0]);
    maxLat = Math.max(maxLat, c[0]);
    minLng = Math.min(minLng, c[1]);
    maxLng = Math.max(maxLng, c[1]);
  });
  if (!isFinite(minLat)) return null;
  return {
    minLat: minLat - margin, maxLat: maxLat + margin,
    minLng: minLng - margin, maxLng: maxLng + margin
  };
}

// A trip "Time" field may carry a suffix (e.g. "09:15 arrive · ~30 min"); pull
// the leading clock value if present.
function parseTimePrefix(value) {
  const match = /^\s*([0-2]?\d):([0-5]\d)/.exec(String(value || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23) return null;
  return { hours: h, minutes: m, totalMinutes: h * 60 + m };
}

function isHHMM(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

module.exports = {
  TRIP_BOUNDS: TRIP_BOUNDS,
  isValidHttpUrl: isValidHttpUrl,
  isCoordPair: isCoordPair,
  withinTripBounds: withinTripBounds,
  haversineKm: haversineKm,
  lon2tileX: lon2tileX,
  lat2tileY: lat2tileY,
  enumerateTiles: enumerateTiles,
  boundsForCoords: boundsForCoords,
  parseTimePrefix: parseTimePrefix,
  isHHMM: isHHMM
};
