(function () {
  'use strict';

  var STORE_KEY = 'pei-foodie-road-trip/state/v2';
  var rawData = JSON.parse(document.getElementById('trip-data').textContent);
  var buildErrors = [];
  var appStatus = null;
  var appToast = null;
  var appToastTimer = null;
  // The one status message that fires on nearly every interaction (Done/Skip,
  // packing, picks). It stays in the screen-reader live region but is kept out
  // of the visible toast so the toast is reserved for meaningful confirmations.
  var ROUTINE_SAVE_STATUS = 'Saved privately in this browser.';

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (match) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match];
    });
  }

  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function categoryClass(value) {
    var label = normalize(value);
    if (/hotel|check in|overnight/.test(label)) return 'category-hotel';
    if (/fuel|gas/.test(label)) return 'category-fuel';
    if (/breakfast|brunch|lunch|dinner|food|meal|snack|restaurant/.test(label)) return 'category-food';
    if (/attraction|park|beach|falls|gorge|scenic|photo|waterfront|tide/.test(label)) return 'category-attraction';
    if (/drive|depart|start|finish|arrive|crossing/.test(label)) return 'category-drive';
    if (/washroom|stretch|service|driver swap|movement/.test(label)) return 'category-break';
    if (/backup|fallback|conditional|optional/.test(label)) return 'category-backup';
    return '';
  }

  function sourceDay(dayId) {
    return rawData.days.find(function (day) { return day.date === dayId; });
  }

  function mapSearchUrl(address) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address || '');
  }

  function streetViewUrl(lat, lng, heading) {
    return 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng +
      (heading != null ? '&heading=' + heading : '');
  }

  function satelliteUrl(lat, lng, zoom) {
    return 'https://www.google.com/maps/@?api=1&map_action=map&center=' + lat + ',' + lng +
      '&zoom=' + (zoom || 19) + '&basemap=satellite';
  }

  // Great-circle distance (km) between two [lat, lng] points; used by the
  // "nearest stop" locator. (The trip-data validator/tests share the same
  // formula via test/trip-utils.js.)
  function tripDistanceKm(a, b) {
    if (!a || !b) return Infinity;
    var R = 6371;
    var toRad = function (deg) { return (deg * Math.PI) / 180; };
    var dLat = toRad(b[0] - a[0]);
    var dLng = toRad(b[1] - a[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(toRad(a[0])) * Math.cos(toRad(b[0]));
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Web-Mercator (XYZ / "slippy map") tile coordinates, for the offline-tile
  // pre-fetch. Mirrors test/trip-utils.js.
  function lonToTileX(lon, z) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
  function latToTileY(lat, z) {
    var r = (lat * Math.PI) / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }

  // Leading clock value (minutes past midnight) of a stop "Time" string, or null
  // for a status marker like "Bonus only—never Plan A".
  function clockMinutes(value) {
    var m = /^\s*([0-2]?\d):([0-5]\d)/.exec(String(value || ''));
    if (!m || Number(m[1]) > 23) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function safeExternalUrl(url) {
    try {
      var parsed = new URL(String(url || ''));
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function externalLink(url, label, className) {
    var safe = safeExternalUrl(url);
    if (!safe) return '';
    return '<a class="' + escapeHtml(className || 'button') + '" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="' + escapeHtml(label + ' (opens in a new tab)') + '">' + escapeHtml(label) + ' <span aria-hidden="true">↗</span></a>';
  }

  // Documented stop coordinates for the consolidated route map. Each key is a
  // stop id; the value is [latitude, longitude]. These were geocoded from the
  // stops' own addresses (OpenStreetMap Nominatim) so the map reuses the single
  // itinerary data source rather than a parallel list. A handful were set by
  // hand where the raw civic address did not resolve cleanly:
  //   - d1-hotel / d2-* Marriott: the coordinates already used by the hotel's
  //     street-view link (45.4975, -73.5672).
  //   - d1-odessa / d1-big-apple / d5-lunch: matched by place name; d5-lunch
  //     (Blue Mussel Café's new 5033 Rustico Road location) uses the café's
  //     known North Rustico-area coordinates, accurate to within ~2 km.
  //   - d2-old-quebec: co-located with the La Bûche dinner in Old Québec.
  //   - d3-kamouraska: Avenue LeBlanc / Quai Miller in Kamouraska village.
  // A stop without an entry here still renders in the itinerary; it is simply
  // listed under the map's "not shown" note instead of being silently dropped.
  var STOP_COORDS = {
    // 2026-08-14 — Vaughan → Colborne → Odessa → Brockville → Morrisburg → Montréal
    'd1-depart': [43.83512, -79.53467],
    'd1-fuel': [43.84984, -79.53776],
    'd1-big-apple': [44.02203, -77.90585],
    'd1-odessa': [44.28326, -76.65589],
    'd1-lunch': [44.6039, -75.70238],
    'd1-prehistoric-world': [44.94604, -75.10459],
    'd1-hotel': [45.4975, -73.5672],
    'd1-dinner': [45.48827, -73.58573],
    // 2026-08-15 — Montréal → Trois-Rivières → Montmorency → Old Québec
    'd2-breakfast-stop': [45.4975, -73.5672],
    'd2-depart': [45.4975, -73.5672],
    'd2-low-fuel': [46.35692, -72.6089],
    'd2-falls': [46.89075, -71.14774],
    'd2-lunch': [46.88692, -71.15221],
    'd2-hotel': [46.79038, -71.3538],
    'd2-old-quebec': [46.8114, -71.2065],
    'd2-dinner': [46.81127, -71.20801],
    'd2-return': [46.79038, -71.3538],
    // 2026-08-16 — Québec City → Rivière-du-Loup → Edmundston → Fredericton
    'd3-depart': [46.79038, -71.3538],
    'd3-kamouraska': [47.55697, -69.8784],
    'd3-lunch': [47.83259, -69.53644],
    'd3-edmundston': [47.3733, -68.30401],
    'd3-hartland': [46.29694, -67.52768],
    'd3-hotel': [45.96491, -66.66279],
    'd3-dinner': [45.97004, -66.63241],
    // 2026-08-17 — Fredericton → Moncton → Cape Jourimain → Charlottetown
    'd4-depart': [45.96491, -66.66279],
    'd4-magnetic': [46.13466, -64.88851],
    'd4-lunch': [46.10988, -64.77801],
    'd4-cape': [46.16164, -63.81519],
    'd4-hotel': [46.26187, -63.16567],
    'd4-dinner': [46.4103, -63.34585],
    'd4-victoria': [46.23385, -63.12644],
    'd4-return': [46.26187, -63.16567],
    // 2026-08-18 — Charlottetown hotel switch → Cavendish / North Rustico → Canadas Best Value Inn
    'd5-checkout': [46.26187, -63.16567],
    'd5-bag-drop': [46.26569, -63.15165],
    'd5-green-gables': [46.48874, -63.38211],
    'd5-lunch': [46.45653, -63.29398],
    'd5-beach': [46.49687, -63.35288],
    'd5-rain': [46.48764, -63.39695],
    'd5-hotel': [46.26569, -63.15165],
    'd5-dinner': [46.2361, -63.12984],
    'd5-return': [46.26569, -63.15165],
    // 2026-08-19 — PEI → Confederation Bridge → Hopewell Rocks → Moncton
    'd6-morning-ready': [46.26569, -63.15165],
    'd6-fuel': [46.25616, -63.19006],
    'd6-marine-rail': [46.25026, -63.70458],
    'd6-bridge': [46.23573, -63.72259],
    'd6-sackville-rest': [45.90783, -64.37094],
    'd6-hopewell': [45.81701, -64.5765],
    'd6-lunch': [45.81781, -64.57829],
    'd6-hotel': [46.10092, -64.7646],
    'd6-magnetic': [46.13466, -64.88851],
    'd6-dinner': [46.08872, -64.77583],
    'd6-return': [46.10092, -64.7646],
    // 2026-08-20 — Moncton → Fredericton → Edmundston → Québec City
    'd7-depart': [46.10092, -64.7646],
    'd7-fredericton': [45.93483, -66.66543],
    'd7-hartland': [46.29694, -67.52768],
    'd7-edmundston': [47.36387, -68.33122],
    'd7-rdl': [47.85107, -69.54159],
    'd7-hotel': [46.88505, -71.30772],
    'd7-dinner': [46.88505, -71.30772],
    // 2026-08-21 — Québec City → Centre-du-Québec → Boucherville → Mallorytown North → Vaughan
    'd8-depart': [46.88505, -71.30772],
    'd8-chambly': [45.44862, -73.27591],
    'd8-restaurant-lunch': [45.56878, -73.44477],
    'd8-mallory': [44.48987, -75.85694],
    'd8-big-apple': [44.02203, -77.90585],
    'd8-home': [43.83512, -79.53467]
  };

  // TripAdvisor/Google ratings for every hotel, food and attraction stop in the
  // operational plan, keyed by stop id. Reuses the same TripAdvisor snapshot as
  // PLAN_B_IDEA_COORDS/planBData (taken 2026-07-17) where a stop is the same
  // venue as a Plan B row or hotel cross-check entry; the remaining stops were
  // looked up fresh on 2026-07-17. Ratings are only attached to the primary
  // check-in stop for each hotel, not every checkout/return visit to the same
  // building, so the same score is not repeated on non-review logistics cards.
  // Two attractions (Ripley's Cavendish, Marine Rail Historical Park) have a
  // confirmed TripAdvisor listing but no numeric score could be verified, so
  // they keep source+url only (rating left null renders as "page linked").
  var STOP_RATINGS = {
    'd1-big-apple': { source: 'TripAdvisor', rating: 3.5, reviews: 951, url: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' },
    'd1-lunch': { source: 'TripAdvisor', rating: 3.7, reviews: 27, url: 'https://www.tripadvisor.com/Restaurant_Review-g181758-d4876488-Reviews-Tata_s_House_of_Pizza_Pasta-Brockville_Ontario.html' },
    'd1-prehistoric-world': { source: 'TripAdvisor', rating: 4.4, reviews: 99, url: 'https://www.tripadvisor.ca/Attraction_Review-g499277-d4600300-Reviews-Prehistoric_World-Morrisburg_Ontario.html' },
    'd1-hotel': { source: 'TripAdvisor', rating: 4.1, reviews: 2617, url: 'https://www.tripadvisor.ca/Hotel_Review-g155032-d185746-Reviews-Montreal_Marriott_Chateau_Champlain-Montreal_Quebec.html' },
    'd1-dinner': { source: 'TripAdvisor', rating: 3.9, reviews: 162, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155032-d19271060-Reviews-Time_Out_Market_Montreal-Montreal_Quebec.html' },
    'd2-breakfast-stop': { source: 'TripAdvisor', rating: 3.7, reviews: 23, url: 'https://www.tripadvisor.com/Restaurant_Review-g155032-d23479475-Reviews-Lloyd-Montreal_Quebec.html' },
    'd2-falls': { source: 'TripAdvisor', rating: 4.4, reviews: 10473, url: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155582-Reviews-Parc_de_la_Chute_Montmorency-Quebec_City_Quebec.html' },
    'd2-lunch': { source: 'TripAdvisor', rating: 3.7, reviews: 304, url: 'https://www.tripadvisor.com/Restaurant_Review-g155033-d706126-Reviews-Le_Manoir_Montmorency-Quebec_City_Quebec.html' },
    'd2-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 897, url: 'https://www.tripadvisor.ca/Hotel_Review-g10850433-d1309009-Reviews-Hotel_Cofortel-L_Ancienne_Lorette_Quebec.html' },
    'd2-old-quebec': { source: 'TripAdvisor', rating: 4.6, reviews: 3740, url: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155589-Reviews-Terrasse_Dufferin-Quebec_City_Quebec.html' },
    'd2-dinner': { source: 'TripAdvisor', rating: 4.3, reviews: 2383, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155033-d8330527-Reviews-La_Buche-Quebec_City_Quebec.html' },
    'd3-kamouraska': { source: 'TripAdvisor', rating: 4.4, reviews: 44, url: 'https://www.tripadvisor.ca/Attraction_Review-g1172165-d8536022-Reviews-Quais_de_Kamouraska-Kamouraska_Bas_Saint_Laurent_Quebec.html' },
    'd3-lunch': { source: 'TripAdvisor', rating: 4.2, reviews: 488, url: 'https://www.tripadvisor.ca/Restaurant_Review-g182149-d772494-Reviews-L_estaminet-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html' },
    'd3-hartland': { source: 'TripAdvisor', rating: 4.4, reviews: 290, url: 'https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html' },
    'd3-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 943, url: 'https://www.tripadvisor.ca/Hotel_Review-g154957-d182691-Reviews-Delta_Hotels_by_Marriott_Fredericton-Fredericton_New_Brunswick.html' },
    'd3-dinner': { source: 'TripAdvisor', rating: 4.6, reviews: 992, url: 'https://www.tripadvisor.com/Restaurant_Review-g154957-d3153443-Reviews-Wolastoq_Wharf-Fredericton_New_Brunswick.html' },
    'd4-magnetic': { source: 'TripAdvisor', rating: 3.7, reviews: 661, url: 'https://www.tripadvisor.ca/Attraction_Review-g154958-d183715-Reviews-Magnetic_Hill_Park-Moncton_New_Brunswick.html' },
    'd4-lunch': { source: 'TripAdvisor', rating: 4.6, reviews: 417, url: 'https://www.tripadvisor.com/Restaurant_Review-g154958-d1007362-Reviews-Tony_s_Bistro_Patisserie-Moncton_New_Brunswick.html' },
    'd4-cape': { source: 'TripAdvisor', rating: 4.3, reviews: 78, url: 'https://www.tripadvisor.ca/Attraction_Review-g4332393-d4431312-Reviews-Cape_Jourimain_Nature_Centre-Bayfield_New_Brunswick.html' },
    'd4-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 154, url: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d17675210-Reviews-Hampton_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
    'd4-dinner': { source: 'TripAdvisor', rating: 4.2, reviews: 1105, url: 'https://www.tripadvisor.ca/Restaurant_Review-g1800168-d770333-Reviews-New_Glasgow_Lobster_Supper-New_Glasgow_Prince_Edward_Island.html' },
    'd4-victoria': { source: 'TripAdvisor', rating: 4.2, reviews: 531, url: 'https://www.tripadvisor.com/Attraction_Review-g155023-d6949138-Reviews-Victoria_Row-Charlottetown_Prince_Edward_Island.html' },
    'd5-green-gables': { source: 'TripAdvisor', rating: 4.3, reviews: 1657, url: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186971-Reviews-Green_Gables-Cavendish_Prince_Edward_Island.html' },
    'd5-lunch': { source: 'TripAdvisor', rating: 4.6, reviews: 1747, url: 'https://www.tripadvisor.com/Restaurant_Review-g23064095-d1112725-Reviews-Blue_Mussel_Cafe-North_Rustico_Harbour_Prince_Edward_Island.html' },
    'd5-beach': { source: 'TripAdvisor', rating: 4.5, reviews: 955, url: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186975-Reviews-Cavendish_Beach-Cavendish_Prince_Edward_Island.html' },
    'd5-rain': { source: 'TripAdvisor', rating: null, reviews: null, url: 'https://www.tripadvisor.com/Attraction_Review-g499311-d3404275-Reviews-Ripley_s_Believe_it_or_Not-Cavendish_Prince_Edward_Island.html' },
    'd5-hotel': { source: 'TripAdvisor', rating: 3.6, reviews: 331, url: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d226269-Reviews-Canadas_Best_Value_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
    'd5-dinner': { source: 'TripAdvisor', rating: 4.5, reviews: 117, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155023-d19503722-Reviews-Slaymaker_Nichols_Gastro_House-Charlottetown_Prince_Edward_Island.html' },
    'd6-marine-rail': { source: 'TripAdvisor', rating: null, reviews: null, url: 'https://www.tripadvisor.com/Attraction_Review-g1507275-d4916327-Reviews-Marine_Rail_Historical_Park-Borden_Carleton_Prince_Edward_Island.html' },
    'd6-sackville-rest': { source: 'TripAdvisor', rating: 4.7, reviews: 172, url: 'https://www.tripadvisor.ca/Attractions-g154956-Activities-c57-New_Brunswick.html' },
    'd6-hopewell': { source: 'TripAdvisor', rating: 4.6, reviews: 322, url: 'https://www.tripadvisor.ca/AttractionProductReview-g499179-d11991515-Hopewell_Rocks_Admission-Hopewell_Cape_Albert_County_New_Brunswick.html' },
    'd6-lunch': { source: 'TripAdvisor', rating: 3.6, reviews: 126, url: 'https://www.tripadvisor.com/Restaurant_Review-g499179-d7144614-Reviews-High_Tide_Cafe-Hopewell_Cape_Albert_County_New_Brunswick.html' },
    'd6-hotel': { source: 'TripAdvisor', rating: 4.0, reviews: 656, url: 'https://www.tripadvisor.com/Hotel_Review-g154958-d281344-Reviews-Best_Western_Plus_Moncton-Moncton_New_Brunswick.html' },
    'd6-dinner': { source: 'TripAdvisor', rating: 4.1, reviews: 1041, url: 'https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html' },
    'd7-edmundston': { source: 'TripAdvisor', rating: 3.8, reviews: 264, url: 'https://www.tripadvisor.com/Restaurant_Review-g182168-d4586743-Reviews-Frank_s_Bar_Grill-Edmundston_New_Brunswick.html' },
    'd7-hotel': { source: 'TripAdvisor', rating: 4.0, reviews: 157, url: 'https://www.tripadvisor.com/Hotel_Review-g155033-d575089-Reviews-DoubleTree_by_Hilton_Quebec_Resort-Quebec_City_Quebec.html' },
    'd7-dinner': { source: 'TripAdvisor', rating: 4.0, reviews: 97, url: 'https://www.tripadvisor.com/Restaurant_Review-g155033-d3486867-Reviews-Le_Dijon-Quebec_City_Quebec.html' },
    'd8-chambly': { source: 'TripAdvisor', rating: 4.5, reviews: 219, url: 'https://www.tripadvisor.com/Attraction_Review-g183734-d183936-Reviews-Fort_Chambly_National_Historic_Site-Chambly_Quebec.html' },
    'd8-restaurant-lunch': { source: 'TripAdvisor', rating: 3.9, reviews: 55, url: 'https://www.tripadvisor.ca/Restaurant_Review-g182198-d770803-Reviews-Restaurant_Scores-Boucherville_Quebec.html' },
    'd8-big-apple': { source: 'TripAdvisor', rating: 3.5, reviews: 951, url: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' }
  };
  // d7-hartland and d6-magnetic are the same Hartland Bridge / Magnetic Hill
  // venues as d3-hartland / d4-magnetic above; point them at the same record.
  STOP_RATINGS['d7-hartland'] = STOP_RATINGS['d3-hartland'];
  STOP_RATINGS['d6-magnetic'] = STOP_RATINGS['d4-magnetic'];

  function customStop(details) {
    var stopId = details.id || slug(details.dayId + '-' + details.title);
    return {
      id: stopId,
      dayId: details.dayId,
      time: details.time || 'Flexible',
      zone: details.zone || '',
      title: details.title || 'Trip stop',
      locationName: details.locationName || details.title || 'Trip stop',
      kind: details.kind || 'Stop',
      priority: details.priority || 'required',
      skipAt: Number(details.skipAt || 0),
      saves: details.saves || '',
      address: details.address || '',
      parkingName: details.parkingName || '',
      parkingAddress: details.parkingAddress || '',
      city: details.city || '',
      leg: details.leg || '',
      timeBudget: details.timeBudget || '',
      notes: details.notes || '',
      food: details.food || '',
      kidPlan: details.kidPlan || '',
      mapUrl: details.mapUrl || mapSearchUrl(details.address || ''),
      sourceUrl: details.sourceUrl || '',
      reservation: details.reservation || '',
      parkingEntrance: details.parkingEntrance || null,
      ticket: details.ticket || null,
      attractionQuality: details.attractionQuality || attractionQualityForStop(details.kind || 'Stop', details.title || ''),
      conditional: Boolean(details.conditional),
      choiceGated: Boolean(details.choiceGated),
      routeEligible: details.routeEligible !== false,
      coords: details.coords || STOP_COORDS[stopId] || null,
      rating: details.rating || STOP_RATINGS[stopId] || null
    };
  }

  function sourceStop(dayId, phrase, patch) {
    patch = patch || {};
    var day = sourceDay(dayId);
    var original = day && day.stops.find(function (stop) {
      return normalize(stop['Stop / Segment']).indexOf(normalize(phrase)) !== -1;
    });
    if (!original) {
      buildErrors.push('Missing source stop "' + phrase + '" on ' + dayId);
      return customStop({
        id: patch.id || slug(dayId + '-' + phrase),
        dayId: dayId,
        title: patch.title || phrase,
        time: patch.time || 'Verify',
        zone: patch.zone || '',
        kind: patch.kind || 'Stop',
        priority: patch.priority || 'required',
        notes: patch.notes || 'Source stop needs review.'
      });
    }
    return customStop({
      id: patch.id || slug(dayId + '-' + (patch.title || original['Stop / Segment'])),
      dayId: dayId,
      time: patch.time != null ? patch.time : original.Time,
      zone: patch.zone || '',
      title: patch.title || original['Stop / Segment'],
      locationName: patch.locationName || patch.title || original['Stop / Segment'],
      kind: patch.kind || original.Type || 'Stop',
      priority: patch.priority || (normalize(original.Type).indexOf('optional') !== -1 ? 'optional' : 'required'),
      skipAt: patch.skipAt || 0,
      saves: patch.saves || '',
      address: patch.address || original.Address,
      parkingName: patch.parkingName || '',
      parkingAddress: patch.parkingAddress || '',
      city: patch.city || original['City / Province'],
      leg: patch.leg || original['Drive from previous'],
      timeBudget: patch.timeBudget || original['Time budget'],
      notes: patch.notes || original.Notes,
      food: patch.food || original['Food / Washroom'],
      kidPlan: patch.kidPlan || original['Kid plan'],
      mapUrl: patch.mapUrl || original['Map URL'],
      sourceUrl: patch.sourceUrl || original['Source URL'],
      reservation: patch.reservation || '',
      parkingEntrance: patch.parkingEntrance || null,
      ticket: patch.ticket || null,
      attractionQuality: patch.attractionQuality || attractionQualityForStop(patch.kind || original.Type || 'Stop', patch.title || original['Stop / Segment']),
      conditional: Boolean(patch.conditional),
      choiceGated: Boolean(patch.choiceGated),
      routeEligible: patch.routeEligible !== false
    });
  }

  function foodRecord(dayId, phrase) {
    return rawData.foodies.find(function (food) {
      return food.date === dayId && normalize(food.name).indexOf(normalize(phrase)) !== -1;
    });
  }

  function foodStop(dayId, phrase, patch) {
    patch = patch || {};
    var food = foodRecord(dayId, phrase);
    if (!food) {
      buildErrors.push('Missing foodie record "' + phrase + '" on ' + dayId);
      return customStop({
        id: patch.id || slug(dayId + '-' + phrase),
        dayId: dayId,
        title: patch.title || phrase,
        time: patch.time || 'Verify',
        kind: patch.kind || 'Meal',
        priority: patch.priority || 'required'
      });
    }
    return customStop({
      id: patch.id || slug(dayId + '-' + (patch.title || food.name)),
      dayId: dayId,
      time: patch.time || 'Flexible',
      zone: patch.zone || '',
      title: patch.title || food.name,
      locationName: patch.locationName || patch.title || food.name,
      kind: patch.kind || food.meal || 'Meal',
      priority: patch.priority || 'required',
      skipAt: patch.skipAt || 0,
      saves: patch.saves || '',
      address: patch.address || food.address,
      parkingName: patch.parkingName || '',
      parkingAddress: patch.parkingAddress || '',
      city: patch.city || food.city,
      leg: patch.leg || '',
      timeBudget: patch.timeBudget || '',
      notes: patch.notes || food.why,
      food: patch.food || food.order,
      kidPlan: patch.kidPlan || '',
      mapUrl: patch.mapUrl || food.mapUrl,
      sourceUrl: patch.sourceUrl || food.source,
      reservation: patch.reservation || food.reserve,
      attractionQuality: patch.attractionQuality || attractionQualityForStop(patch.kind || food.meal || 'Meal', patch.title || food.name),
      conditional: Boolean(patch.conditional),
      choiceGated: Boolean(patch.choiceGated),
      routeEligible: patch.routeEligible !== false
    });
  }

  function mealSlot(details) {
    return {
      id: details.id,
      meal: details.meal,
      title: details.title,
      style: details.style || '',
      selectedStopId: details.selectedStopId,
      backup: details.backup || '',
      reserve: details.reserve || '',
      reservationTaskId: details.reservationTaskId || '',
      conditional: Boolean(details.conditional)
    };
  }

  function makeDay(details) {
    details.wakeTime = details.wakeTime || '06:30';
    details.departTarget = details.departTarget || '07:00-ish';
    details.driverPlan = details.driverPlan || (Number(details.driveKm) >= 500 ? 'Two-driver day: swap every 90-120 minutes or at every major stop; the off-duty adult handles snacks, navigation, and kid mood.' : 'Two adults can drive; use the second driver for city traffic, fatigue, or parking pressure.');
    details.mainActivity = details.mainActivity || 'Travel and settle into the booked hotel';
    details.optionalActivity = details.optionalActivity || 'None — protect downtime';
    details.downtime = details.downtime || 'At least 45 minutes at the hotel before dinner';
    details.rainPlan = details.rainPlan || 'Keep the meal and hotel plan; skip the outdoor activity.';
    details.parentWarning = details.parentWarning || '';
    details.stops = details.stops.map(function (stop, index) {
      stop.order = index + 1;
      return stop;
    });
    return details;
  }

  rawData.foodies.forEach(function (food) {
    var name = normalize(food.name);
    if (name.indexOf('diannes fish') !== -1) food.source = 'https://dianneskingston.com/';
    if (name.indexOf('lestaminet') !== -1) food.source = 'https://www.restopubestaminet.com/';
    if (name.indexOf('wolastoq') !== -1) food.source = 'https://stmarysretail.com/wolastoq-wharf';
    if (name.indexOf('540 north') !== -1) food.source = 'https://picaroons.ca/experience-the-roundhouse/';
    if (name.indexOf('fromagerie lemaire') !== -1) food.source = 'https://www.fromagerie-lemaire.ca/';
    if (name.indexOf('noshery') !== -1) food.source = 'https://brockvilletourism.com/directory/the-noshery/';
  });

  var ticketGuidance = {
    montmorency: {
      label: 'Advance tickets recommended',
      cta: 'Buy daily access',
      url: 'https://www.sepaq.com/en/reservation/purchase/pcm-daily-access',
      secondaryCta: 'Cable car tickets',
      secondaryUrl: 'https://www.sepaq.com/en/reservation/purchase/pcm-cable-car',
      note: 'Buy the daily access online before Aug 15. Sépaq says online purchase guarantees access and makes arrival smoother; cable car tickets are separate if you want them.',
      required: true
    },
    hopewell: {
      label: 'Tide window set — admission can wait',
      cta: 'Buy Hopewell tickets',
      url: 'https://www.pxw1.snb.ca/SNB9000/product.aspx?ProductID=A001PHR0001&l=e',
      secondaryCta: 'Tide table',
      secondaryUrl: 'https://www.parcsnbparks.ca/en/parks/33/hopewell-rocks-provincial-park/26/tide-tables',
      note: 'CHS predicts low tide at 11:52 AM. Actual ocean-floor access is controlled by park staff and may vary; advance admission does not improve access, so recheck 24–48 hours before and follow staff direction.',
      required: true
    },
    greenGables: {
      label: 'No ticket to buy for this date',
      cta: 'Plan ahead',
      url: 'https://parks.canada.ca/lhn-nhs/pe/greengables/visit/pass-canada',
      note: 'Admission is free during Aug 18 under the Canada Strong Pass, but Parks Canada expects very high 2026 visitation. Go early and keep the visit flexible.',
      required: false
    },
    cavendish: {
      label: 'No park pass to buy for this date',
      cta: 'Check park updates',
      url: 'https://parks.canada.ca/pn-np/pe/pei-ipe',
      note: 'PEI National Park admission is free during Aug 18 under the Canada Strong Pass. Still check beach conditions, parking, and temporary closures before going.',
      required: false
    },
    magneticHill: {
      label: 'Pay on arrival',
      cta: 'Check hours and fees',
      url: 'https://www.moncton.ca/en/magnetic-hill-illusion',
      note: 'City of Moncton lists the illusion as $10/car during the summer operating period. No advance-purchase flow is needed for this quick optional stop.',
      required: false
    }
  };

  var ticketGuidanceList = [
    { name: 'Montmorency Falls tickets', fact: 'Sépaq strongly recommends buying daily access online before arrival.', url: ticketGuidance.montmorency.url },
    { name: 'Montmorency cable car tickets', fact: 'Cable car tickets are separate from daily access if you want the easier family route.', url: ticketGuidance.montmorency.secondaryUrl },
    { name: 'Hopewell Rocks tickets', fact: 'Advance admission does not improve ocean-floor access; park staff control the actual access window.', url: ticketGuidance.hopewell.url },
    { name: 'Green Gables Canada Strong Pass', fact: 'Admission is free June 19 to September 7, 2026, with very high visitation expected.', url: ticketGuidance.greenGables.url },
    { name: 'PEI National Park Canada Strong Pass', fact: 'Cavendish Beach / PEI National Park admission is free during the Aug 18 visit window.', url: ticketGuidance.cavendish.url }
  ];

  function ticketForAttraction(name) {
    var value = normalize(name);
    if (value.indexOf('montmorency') !== -1 || value.indexOf('chute-montmorency') !== -1) return ticketGuidance.montmorency;
    if (value.indexOf('hopewell') !== -1) return ticketGuidance.hopewell;
    if (value.indexOf('green gables') !== -1) return ticketGuidance.greenGables;
    if (value.indexOf('cavendish beach') !== -1 || value.indexOf('pei national park') !== -1) return ticketGuidance.cavendish;
    if (value.indexOf('magnetic hill') !== -1) return ticketGuidance.magneticHill;
    return null;
  }

  function renderTicketGuidance(ticket) {
    if (!ticket) return '';
    return [
      '<div class="ticket-alert ', ticket.required ? 'required' : '', '">',
      '<h4>', escapeHtml(ticket.label), '</h4>',
      '<p class="small">', escapeHtml(ticket.note), '</p>',
      '<div class="action-bar">', externalLink(ticket.url, ticket.cta || 'Open ticket link', 'button primary'), ticket.secondaryUrl ? externalLink(ticket.secondaryUrl, ticket.secondaryCta || 'More ticket info', 'button subtle') : '', '</div>',
      '</div>'
    ].join('');
  }

  function attractionQuality(details) {
    return {
      backupTitle: details.backupTitle || '',
      backupAddress: details.backupAddress || '',
      backupNote: details.backupNote || '',
      backupMapUrl: details.backupMapUrl || mapSearchUrl(details.backupAddress || details.backupTitle || '')
    };
  }

  var attractionQualityByKey = {
    bigApple: attractionQuality({ backupTitle: 'Colborne Victoria Square playground / short walk', backupAddress: 'Victoria Square, Colborne, ON', backupNote: 'If The Big Apple is too busy, use this as a quieter village leg stretch.' }),
    brockvilleTunnel: attractionQuality({ backupTitle: 'Hardy Park waterfront playground', backupAddress: 'Hardy Park, Brockville, ON', backupNote: 'Nearby kid-friendly waterfront fallback if the tunnel is crowded or closed.' }),
    montmorency: attractionQuality({ backupTitle: 'Domaine de Maizerets gardens and paths', backupAddress: 'Domaine de Maizerets, Quebec City, QC', backupNote: 'Easy kid-friendly green-space fallback if falls access, parking, or weather is poor.' }),
    oldQuebec: attractionQuality({ backupTitle: 'Place des Canotiers waterfront walk', backupAddress: 'Place des Canotiers, Quebec City, QC', backupNote: 'Lower-effort stroller-friendly waterfront option near Old Quebec.' }),
    kamouraska: attractionQuality({ backupTitle: 'Kamouraska wharf / quay walk', backupAddress: 'Quai de Kamouraska, Kamouraska, QC', backupNote: 'Same-area river-view fallback; keep it short and scenic.' }),
    grandFalls: attractionQuality({ backupTitle: 'Grand Falls visitor centre / playground area', backupAddress: '25 Madawaska Rd, Grand Falls, NB', backupNote: 'Use the easiest lookout or playground-style break instead of the full gorge walk.' }),
    hartland: attractionQuality({ backupTitle: 'Hartland visitor information / riverside walk', backupAddress: '365 Main St, Hartland, NB', backupNote: 'Quick riverside stretch if walking the bridge is not appealing.' }),
    oromoctoMuseum: attractionQuality({ backupTitle: 'Oromocto Gateway Wetland Trail', backupAddress: 'Oromocto Gateway Wetland Trail, Oromocto, NB', backupNote: 'Outdoor boardwalk-style fallback if the museum is closed or too serious for kid mood.' }),
    magneticHill: attractionQuality({ backupTitle: 'Magnetic Hill Zoo', backupAddress: '125 Magic Mountain Rd, Moncton, NB', backupNote: 'Bigger kid-friendly backup if you want animals instead of the quick illusion stop.' }),
    capeJourimain: attractionQuality({ backupTitle: 'Port Borden Front Range Lighthouse / Marine Rail Park', backupAddress: 'Port Borden Front Range Lighthouse, Borden-Carleton, PE', backupNote: 'Post-bridge lighthouse and open-space fallback if Cape Jourimain timing slips.' }),
    greenGables: attractionQuality({ backupTitle: 'Avonlea Village', backupAddress: 'Avonlea Village, Cavendish, PE', backupNote: 'Kid-friendly shops, treats, and Anne-themed atmosphere if Green Gables is too busy.' }),
    cavendishBeach: attractionQuality({ backupTitle: 'Ripley’s Believe It or Not! Cavendish', backupAddress: '8863 Cavendish Rd, Cavendish, PE', backupNote: 'Genuine indoor rain/thunder backup; verify seasonal hours. Shining Waters remains an outdoor surf/no-swim alternative, not a severe-weather plan.' }),
    victoriaRow: attractionQuality({ backupTitle: 'Confederation Landing Park / Peake’s Wharf', backupAddress: 'Confederation Landing Park, Charlottetown, PE', backupNote: 'Waterfront walk, boats, and easy kid movement if Victoria Row is crowded.' }),
    sackville: attractionQuality({ backupTitle: 'Bill Johnstone Memorial Park', backupAddress: 'Bill Johnstone Memorial Park, Sackville, NB', backupNote: 'Nearby park fallback if the boardwalk is buggy, wet, or too slow.' }),
    hopewell: attractionQuality({ backupTitle: 'Albert County Museum', backupAddress: 'Albert County Museum, Hopewell Cape, NB', backupNote: 'Nearby indoor/history backup if tide timing or weather blocks the ocean-floor visit.' }),
    shediacLobster: attractionQuality({ backupTitle: 'Parlee Beach Provincial Park', backupAddress: 'Parlee Beach Provincial Park, Pointe-du-Chene, NB', backupNote: 'Beach/play fallback near Shediac if the lobster photo stop is too short.' }),
    confederationBridge: attractionQuality({ backupTitle: 'Marine Rail Park', backupAddress: 'Marine Rail Park, Borden-Carleton, PE', backupNote: 'Bridge-view and lighthouse-style fallback on the PEI side.' }),
    southShorePark: attractionQuality({ backupTitle: 'Parc Michel-Chartrand', backupAddress: 'Parc Michel-Chartrand, Longueuil, QC', backupNote: 'Larger green-space fallback on the South Shore if lunch timing allows.' }),
    brockvilleWaterfront: attractionQuality({ backupTitle: 'Brockville Railway Tunnel', backupAddress: 'Brockville Railway Tunnel, Brockville, ON', backupNote: 'Switch to the tunnel if waterfront weather is poor or everyone wants a more memorable stop.' }),
    prehistoricWorld: attractionQuality({ backupTitle: 'Crysler Park Marina waterfront', backupAddress: 'Crysler Park Marina, 13480 County Rd 2, Morrisburg, ON', backupNote: 'Nearby St. Lawrence waterfront and open lawn if Prehistoric World is closed, the cash-only gate is a problem, or the child just needs a run-around break.' })
  };

  function qualityForAttractionName(name) {
    var value = normalize(name);
    if (value.indexOf('big apple') !== -1) return attractionQualityByKey.bigApple;
    if (value.indexOf('brockville railway') !== -1) return attractionQualityByKey.brockvilleTunnel;
    if (value.indexOf('montmorency') !== -1 || value.indexOf('chute-montmorency') !== -1) return attractionQualityByKey.montmorency;
    if (value.indexOf('dufferin') !== -1 || value.indexOf('old quebec') !== -1) return attractionQualityByKey.oldQuebec;
    if (value.indexOf('kamouraska') !== -1) return attractionQualityByKey.kamouraska;
    if (value.indexOf('grand falls') !== -1) return attractionQualityByKey.grandFalls;
    if (value.indexOf('hartland') !== -1) return attractionQualityByKey.hartland;
    if (value.indexOf('military history') !== -1 || value.indexOf('oromocto') !== -1) return attractionQualityByKey.oromoctoMuseum;
    if (value.indexOf('magnetic hill') !== -1) return attractionQualityByKey.magneticHill;
    if (value.indexOf('cape jourimain') !== -1) return attractionQualityByKey.capeJourimain;
    if (value.indexOf('green gables') !== -1) return attractionQualityByKey.greenGables;
    if (value.indexOf('cavendish beach') !== -1) return attractionQualityByKey.cavendishBeach;
    if (value.indexOf('victoria row') !== -1) return attractionQualityByKey.victoriaRow;
    if (value.indexOf('sackville waterfowl') !== -1) return attractionQualityByKey.sackville;
    if (value.indexOf('hopewell') !== -1) return attractionQualityByKey.hopewell;
    if (value.indexOf('shediac') !== -1 || value.indexOf('giant lobster') !== -1) return attractionQualityByKey.shediacLobster;
    if (value.indexOf('confederation bridge') !== -1) return attractionQualityByKey.confederationBridge;
    if (value.indexOf('south shore') !== -1 || value.indexOf('marie-victorin') !== -1) return attractionQualityByKey.southShorePark;
    if (value.indexOf('brockville waterfront') !== -1 || value.indexOf('st. lawrence park') !== -1) return attractionQualityByKey.brockvilleWaterfront;
    if (value.indexOf('prehistoric world') !== -1) return attractionQualityByKey.prehistoricWorld;
    return null;
  }

  function renderAttractionQuality(quality) {
    if (!quality) return '';
    return [
      '<div class="attraction-quality">',
      '<h4>Nearby child-friendly backup</h4>',
      '<p class="small"><strong>', escapeHtml(quality.backupTitle), '</strong>', quality.backupAddress ? ' · ' + escapeHtml(quality.backupAddress) : '', '</p>',
      quality.backupNote ? '<p class="small">' + escapeHtml(quality.backupNote) + '</p>' : '',
      '<div class="action-bar">', externalLink(quality.backupMapUrl, 'Kid backup map', 'button subtle'), '</div>',
      '</div>'
    ].join('');
  }

  function renderParkingEntrance(entrance) {
    if (!entrance) return '';
    return [
      '<div class="parking-entrance">',
      '<h4>Underground parking entrance</h4>',
      entrance.note ? '<p class="small">' + escapeHtml(entrance.note) + '</p>' : '',
      '<div class="action-bar">',
      externalLink(entrance.streetViewUrl, 'Street View of entrance', 'button subtle'),
      externalLink(entrance.satelliteUrl, 'Satellite view of entrance', 'button subtle'),
      '</div>',
      '</div>'
    ].join('');
  }

  function isAttractionStop(stop) {
    var value = normalize([stop.kind, stop.title].join(' '));
    return /(attraction|park|beach|scenic|photo|museum|boardwalk|waterfront|gorge|falls|gables|tunnel|lobster|apple|bridge|nature|wharf|quay|magnetic hill|covered bridge|prehistoric|waterfowl)/.test(value);
  }

  function stopEligibleForAttractionQuality(kind, title) {
    var normalizedKind = normalize(kind);
    if (/(fuel|hotel|start)/.test(normalizedKind)) return false;
    if (/(food|meal|lunch|dinner)/.test(normalizedKind) && !/(attraction|park|beach|scenic|photo|museum|boardwalk|waterfront|gorge|falls|gables|tunnel|nature|covered bridge|prehistoric|waterfowl)/.test(normalizedKind)) return false;
    return isAttractionStop({ kind: kind, title: title });
  }

  function attractionQualityForStop(kind, title) {
    return stopEligibleForAttractionQuality(kind, title) ? qualityForAttractionName(title) : null;
  }

  var operationalPlan = {
    schemaVersion: 2,
    generatedOn: '2026-07-17',
    roughTotalKm: 3855,
    tidePlan: {
      date: '2026-08-19',
      timeZone: 'America/Moncton',
      status: 'CHS prediction confirmed; actual floor access remains at park staff discretion',
      verifyAfter: '2026-08-17',
      parkHours: '08:00–20:00 Atlantic',
      tides: 'Aug 19 (ADT): high 5:23 AM (11.33 m) · low 11:52 AM (2.48 m) · high 5:45 PM (11.32 m)',
      accessWindow: 'Target park entrance 10:15–10:30 and beach stairs by 10:45; never rely on the estimated 2:45 PM cutoff without staff confirmation',
      sourceUrl: 'https://www.parcsnbparks.ca/en/parks/33/hopewell-rocks-provincial-park/26/tide-tables',
      chsUrl: 'https://www.tides.gc.ca/en/stations/00170',
      arrivalBufferMin: 45,
      minimumVisitMin: 150
    },
    days: [
      makeDay({
        id: '2026-08-14',
        label: 'Fri, Aug 14, 2026',
        mainActivity: 'A calm eastbound travel day and early Marriott room reset',
        optionalActivity: 'Pick one: The Big Apple (20–25 min, smooth morning) or Prehistoric World near Morrisburg (45–60 min dinosaur trail after lunch)',
        downtime: '60–90 minutes at the Marriott before the dinner walk',
        rainPlan: 'Skip The Big Apple and Prehistoric World outdoor areas; keep Tata’s lunch and the indoor Time Out Market dinner.',
        parentWarning: 'Medium-long first day. Protect the proper lunch and hotel reset; add at most one optional attraction — The Big Apple or Prehistoric World, never both.',
        routeFocus: 'Vaughan → Colborne → Odessa → Brockville → Morrisburg → Montréal',
        driveKm: 577,
        pureDriveTime: 'About 6.5–7 h before stops; Friday Montréal traffic can add more',
        risk: 'Medium',
        lateThresholdMin: 30,
        wakeTime: '06:00',
        departTarget: '06:45 wheels moving',
        driverPlan: 'Two-driver day: start with the fresher adult for GTA/401 traffic, then swap at Odessa or after lunch in Brockville. The off-duty adult owns navigation, snacks and the Montréal traffic check.',
        timeZoneNote: 'All times are Eastern Time (America/Toronto).',
        contingency: 'If The Big Apple arrival slips past 08:50, skip it. Keep the Brockville restaurant lunch; if Tata’s cannot seat you promptly, use the named Boston Pizza Brockville fallback and continue to Montréal. Skip Prehistoric World if you cannot reach it by about 14:00 or the live Montréal ETA passes 16:45.',
        emergency: 'Keep the required Odessa safety break and a proper Brockville lunch. If Montréal ETA moves past 17:15, shorten lunch to 45 minutes and sit down at Lloyd after hotel check-in.',
        stops: [
          sourceStop('2026-08-14', 'Depart Vaughan', { id: 'd1-depart', time: '06:45', zone: 'ET', title: 'Depart Vaughan from Maple Honda', locationName: 'Maple Honda', leg: '0 km', priority: 'required', notes: 'Wake 06:00. Load the car the night before; only final medications, breakfast items and bathroom remain this morning.' }),
          sourceStop('2026-08-14', 'Esso Circle K Maple', { id: 'd1-fuel', time: '06:55', zone: 'ET', priority: 'required', notes: 'Start full with 91 AKI minimum and reset the trip odometer. Refuel by a quarter tank remaining, sooner if the live range approaches 120–150 km or the next reliable station is uncertain.' }),
          sourceStop('2026-08-14', 'The Big Apple', { id: 'd1-big-apple', time: '08:30–08:55', zone: 'ET', locationName: 'The Big Apple', parkingName: 'The Big Apple visitor parking', parkingAddress: '262 Orchard Rd, Colborne, ON K0K 1S0', leg: 'About 145 km / 1 h 30–1 h 45', priority: 'optional', skipAt: 30, saves: '25 min', timeBudget: '20-25 min', notes: 'Short reward/washroom stop only. Skip if arrival is after 08:50; the required Odessa break and proper Brockville lunch remain protected.', mapUrl: mapSearchUrl('The Big Apple visitor parking, 262 Orchard Rd, Colborne, ON K0K 1S0') }),
          sourceStop('2026-08-14', 'ONroute Napanee', { id: 'd1-odessa', time: '10:10–10:25', zone: 'ET', title: 'ONroute Odessa — eastbound', locationName: 'ONroute Odessa — eastbound service centre', address: '3745 Highway 401 Eastbound, Odessa, ON K0H 2H0', city: 'Odessa, ON', kind: 'Morning snack / washroom / driver swap', leg: 'About 115 km / 1 h 10–1 h 20 from Colborne', priority: 'required', timeBudget: '15 min', notes: 'This is the correct eastbound plaza. Quick snack, washroom, walk and driver swap—not lunch. The proper restaurant lunch is in Brockville.', mapUrl: mapSearchUrl('ONroute Odessa, 3745 Highway 401 Eastbound, Odessa, ON K0H 2H0'), sourceUrl: 'https://www.onroute.ca/locations/odessa' }),
          customStop({ id: 'd1-lunch', dayId: '2026-08-14', time: '11:40–12:35 · depart by 12:45', zone: 'ET', title: 'Proper lunch: Tata’s House of Pizza & Pasta', locationName: 'Tata’s House of Pizza & Pasta — Brockville', kind: 'Lunch / seated restaurant', priority: 'required', address: '11 Windsor Drive, Brockville, ON K6V 3H5', city: 'Brockville, ON', leg: 'About 105 km / 1 h 05–1 h 15 from Odessa; about 210 km / 2 h 15 to Montréal before city traffic', timeBudget: '50-60 min', notes: 'A proper seated lunch replaces the old Morrisburg attraction and self-catered lunch plan. Friday service starts at 11:00. If the wait would push departure past 12:45, use Boston Pizza Brockville at 2000 Parkedale Avenue as the named sit-down fallback.', food: 'Pizza, pasta, burgers, fish and chips, souvlaki, and vegetarian options.', kidPlan: 'Bathroom and a calm seated meal before the Montréal leg.', mapUrl: mapSearchUrl('Tata’s House of Pizza & Pasta, 11 Windsor Drive, Brockville, ON K6V 3H5'), sourceUrl: 'https://www.tatasbrockville.ca/' }),
          customStop({ id: 'd1-prehistoric-world', dayId: '2026-08-14', time: '13:25–14:20 · depart by 14:25', zone: 'ET', title: 'Prehistoric World', locationName: 'Prehistoric World — Morrisburg', kind: 'Attraction / outdoor dinosaur trail walk', priority: 'optional', skipAt: 30, saves: '55 min', address: '5446 Upper Canada Rd, Morrisburg, ON K0C 1X0', parkingName: 'Prehistoric World visitor parking', parkingAddress: '5446 Upper Canada Rd, Morrisburg, ON K0C 1X0', city: 'Morrisburg, ON', leg: 'About 65 km / 45 min from Brockville; about 150 km / 1 h 40 to Montréal before city traffic', timeBudget: '45-60 min', notes: 'Optional afternoon dinosaur-trail walk on the way to Montréal, added after the proper Brockville lunch—it does not replace it. Open daily 10:00–16:00, May 17–Sept 7, and cash only, so bring small bills ($10 adult, $8 senior, $6 child 4+, under 3 free). Pick this or The Big Apple, never both, to keep the first day calm. Skip if you cannot reach the gate by about 14:00 or if the live Montréal ETA would slip past 16:45; the Marriott check-in and Time Out Market dinner stay protected.', food: 'Washrooms on site; no full food service—rely on the Brockville lunch and packed snacks.', kidPlan: 'Flat, hand-laid stone loop through the woods past life-size concrete dinosaurs with English and French plaques; an easy 45–60 minute walk, doable in 20–30 if energy is low.', mapUrl: mapSearchUrl('Prehistoric World visitor parking, 5446 Upper Canada Rd, Morrisburg, ON K0C 1X0'), sourceUrl: 'https://prehistoricworld.ca/' }),
          sourceStop('2026-08-14', 'Check in: Montreal Marriott Chateau Champlain', { id: 'd1-hotel', time: '15:30–16:30 realistic · check-in from 16:00', zone: 'ET', title: 'Check in: Montreal Marriott Chateau Champlain', locationName: 'Montreal Marriott Chateau Champlain', address: '1050 de la Gauchetiere West, Montreal, QC H3B 4C9', city: 'Montréal, QC', leg: 'About 210 km / 2 h 15 plus Friday city traffic from Brockville', priority: 'required', notes: 'Confirmed 2-double-bed room for 2 adults + 1 child. Official self-parking is currently C$36/day with no in/out privileges; recheck rate, entrance and clearance, park once, and leave the car. This hotel does not advertise a pool.', food: 'Lloyd is on site; Time Out Market is about a 15-minute walk.', kidPlan: 'Room reset, then a short dinner walk only if everyone has energy.', parkingEntrance: { note: 'Downtown high-rise with underground self-parking only—there is no surface lot. The garage is beneath the hotel; approach on De la Gauchetiere West, follow the signed "Stationnement / Self-Parking" ramp down, and reconfirm the height clearance and C$36/day rate at the desk. Park once—there are no in/out privileges.', streetViewUrl: streetViewUrl(45.4975, -73.5672, 200), satelliteUrl: satelliteUrl(45.4975, -73.5672, 19) }, mapUrl: mapSearchUrl('Montreal Marriott Chateau Champlain, 1050 de la Gauchetiere West, Montreal, QC H3B 4C9'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yulcc-montreal-marriott-chateau-champlain/overview/' }),
          sourceStop('2026-08-14', 'Easy dinner: Time Out Market', { id: 'd1-dinner', time: '17:45–18:15 flexible', zone: 'ET', kind: 'Dinner / walking outing', priority: 'required', routeEligible: false, leg: 'About 1 km / 15 min on foot each way from the Marriott', notes: 'Walk—do not move the parked car. Time Out Market is open until 22:00 Friday. Lloyd at the hotel is the zero-walk fallback if hotel arrival is after 17:15 or the child is done.', mapUrl: 'https://www.google.com/maps/dir/?api=1&origin=1050+de+la+Gauchetiere+West%2C+Montreal%2C+QC+H3B+4C9&destination=705+Saint-Catherine+St+W%2C+Montreal%2C+QC+H3B+4G5&travelmode=walking', sourceUrl: 'https://www.timeoutmarket.com/montreal/' })
        ],
        meals: [
          mealSlot({ id: 'd1-breakfast', meal: 'Breakfast', title: 'Departure breakfast before leaving Vaughan', selectedStopId: 'd1-depart', backup: 'Leave 15 minutes later rather than skipping breakfast.' }),
          mealSlot({ id: 'd1-snack', meal: 'Morning snack', title: 'ONroute Odessa — eastbound quick stop', selectedStopId: 'd1-odessa', backup: 'Packed snack in the car.' }),
          mealSlot({ id: 'd1-lunch', meal: 'Lunch', title: 'Tata’s House of Pizza & Pasta', selectedStopId: 'd1-lunch', backup: 'Boston Pizza Brockville, 2000 Parkedale Avenue — proper sit-down fallback.' }),
          mealSlot({ id: 'd1-dinner', meal: 'Dinner', title: 'Time Out Market Montréal', selectedStopId: 'd1-dinner', backup: 'Lloyd at the hotel for zero extra travel; Ma Poule Mouillée only if you arrive early.' })
        ]
      }),
      makeDay({
        id: '2026-08-15',
        label: 'Sat, Aug 15, 2026',
        mainActivity: 'Montmorency Falls with the easier cable-car route and Manoir lunch',
        optionalActivity: 'Short Dufferin Terrace walk before dinner',
        downtime: '45–60 minutes at Hôtel Cofortel before Old Québec',
        rainPlan: 'Use the Manoir lunch and viewpoints; skip Dufferin if rain or fatigue persists.',
        parentWarning: 'Parking construction at Montmorency and Old Québec can add friction; park once at each location.',
        routeFocus: 'Montréal → Trois-Rivières → Montmorency → Old Québec',
        driveKm: 310,
        pureDriveTime: 'About 3.5–4 h with city driving',
        risk: 'Medium',
        lateThresholdMin: 30,
        wakeTime: '06:00',
        departTarget: '07:30',
        driverPlan: 'Two adults can drive; use the second driver for Montréal exit / Québec City parking stress, but this is not a heavy driver-rotation day.',
        timeZoneNote: 'All times are Eastern Time (America/Toronto).',
        contingency: 'Cofortel room access is guaranteed only from 16:00. If late, secure the room first, shorten Old Québec, and protect the 18:15 dinner reservation.',
        emergency: 'Skip Old Québec, check in at 16:00, and use airport-area food if parking or energy becomes the constraint.',
        stops: [
          customStop({ id: 'd2-breakfast-stop', dayId: '2026-08-15', time: '06:30–07:10', zone: 'ET', title: 'Breakfast at the hotel: Lloyd (Marriott)', locationName: 'Lloyd — Montreal Marriott Chateau Champlain', kind: 'Breakfast / hotel restaurant', priority: 'required', routeEligible: false, address: '1050 de la Gauchetiere West, Montreal, QC H3B 4C9', city: 'Montréal, QC', leg: 'On-site at the Marriott', timeBudget: '30-40 min', notes: 'Eat breakfast at the hotel before checking out. Be seated at Lloyd when it opens at 06:30 and finish by 07:10 so 07:30 stays the wheels-moving time. There is no mid-morning break before Montmorency, so start fed and keep a packed snack in the car.', food: 'Lloyd hotel breakfast 06:30–07:10 (fee); grab-and-go only if table service would delay departure.', kidPlan: 'Calm seated breakfast and a bathroom stop before the long morning drive.', mapUrl: mapSearchUrl('Montreal Marriott Chateau Champlain, 1050 de la Gauchetiere West, Montreal, QC H3B 4C9'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yulcc-montreal-marriott-chateau-champlain/dining/' }),
          sourceStop('2026-08-15', 'Depart Montréal', { id: 'd2-depart', time: '07:30', zone: 'ET', title: 'Depart Montreal Marriott Chateau Champlain', priority: 'required', address: '1050 de la Gauchetiere West, Montreal, QC H3B 4C9', city: 'Montréal, QC', notes: 'Wake 06:00 and eat the Lloyd hotel breakfast first (see the breakfast stop). Check out and make 07:30 the actual wheels-moving time; there is no mid-morning break before Montmorency this year.', food: 'Breakfast handled at the hotel; keep a packed snack in the car for the drive to Montmorency.', mapUrl: mapSearchUrl('1050 de la Gauchetiere West, Montreal, QC H3B 4C9'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yulcc-montreal-marriott-chateau-champlain/dining/' }),
          customStop({ id: 'd2-low-fuel', dayId: '2026-08-15', time: '10:15 only if at trigger', zone: 'ET', title: 'Verified 91-AKI option: Shell Trois-Rivières', kind: 'Fuel decision', priority: 'conditional', conditional: true, routeEligible: false, address: '6455 Boulevard des Chenaux, Trois-Rivières, QC G8Y 5A9', city: 'Trois-Rivières, QC', timeBudget: '0-15 min', notes: 'Official Shell listing shows V-Power 91 and Saturday forecourt hours of 07:00–22:00. Use only at/below a quarter tank or when displayed range approaches 120–150 km; otherwise continue.', food: 'Convenience shop; use the earlier Trois-Rivières stop for the proper snack/washroom break.', kidPlan: 'Quick conditional fill only.', mapUrl: mapSearchUrl('6455 Boulevard des Chenaux, Trois-Rivières, QC G8Y 5A9'), sourceUrl: 'https://find.shell.com/ca/fuel/12303255-blvd-des-chenaux-troisriviere/en_CA' }),
          sourceStop('2026-08-15', 'Montmorency Falls', { id: 'd2-falls', time: '11:30', zone: 'ET', locationName: 'Parc de la Chute-Montmorency', parkingName: 'Montmorency Falls lower-site P1/P2 visitor parking', parkingAddress: '5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1', priority: 'required', notes: '2026 Saturday access hours are 09:00–18:30. Use the lower-site P1/P2 entrance while the upper sector is being redeveloped; allow 20–30 minutes for construction/parking. Take the cable car or approved route to the Manoir for the seated lunch.', food: 'Washrooms and water; the proper lunch is reserved separately at the Manoir restaurant.', mapUrl: mapSearchUrl('Montmorency Falls lower parking P1 P2, 5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1'), ticket: ticketGuidance.montmorency }),
          customStop({ id: 'd2-lunch', dayId: '2026-08-15', time: '12:45–13:45', zone: 'ET', title: 'Proper lunch: Restaurant-terrasse du Manoir', locationName: 'Restaurant-terrasse du Manoir Montmorency', kind: 'Lunch / seated restaurant', priority: 'required', routeEligible: false, address: '2490 Avenue Royale, Québec, QC G1C 1S1', city: 'Québec City, QC', leg: 'Inside Parc de la Chute-Montmorency at the upper Manoir', timeBudget: '60 min', notes: 'Reserve a table. The official 2026 summer schedule is 11:30–15:00 daily, with a varied lunch menu and children’s menu. This is the proper lunch—no picnic or packed meal.', food: 'Full seated lunch with a children’s menu on a covered, heated terrace.', kidPlan: 'Bathroom and seated reset before finishing the falls visit.', mapUrl: mapSearchUrl('Restaurant-terrasse du Manoir Montmorency, 2490 Avenue Royale, Québec, QC G1C 1S1'), sourceUrl: 'https://www.sepaq.com/destinations/parc-chute-montmorency/quoi-faire/restaurants-repas.dot?language_id=1', reservation: 'Reserve for about 12:45; summer service ends at 15:00.' }),
          sourceStop('2026-08-15', 'Check in: Hôtel Cofortel', { id: 'd2-hotel', time: '15:30 arrival · 16:00 check-in', zone: 'ET', priority: 'required', notes: 'Do not rely on room access before 16:00. If early, use a quiet hotel/lobby buffer, then secure the luggage before returning to Old Québec. The booked Elite room is on the 2nd floor with one king bed; the stay is booked and safe.' }),
          sourceStop('2026-08-15', 'Old Québec / Dufferin', { id: 'd2-old-quebec', time: '16:45 hotel departure · 17:10–17:50 walk', zone: 'ET', title: 'Dufferin Terrace walk in Old Québec', locationName: 'Dufferin Terrace, Old Québec', parkingName: 'Stationnement De Beaucours garage', parkingAddress: '39 Rue Saint-Louis, Québec, QC G1R 3Z2', address: '39 Rue Saint-Louis, Québec, QC G1R 3Z2', city: 'Old Québec, QC', priority: 'optional', skipAt: 30, saves: '60 min', timeBudget: '35-40 min', notes: 'Leave Cofortel at 16:45 after the room and luggage are secure. Park once at De Beaucours; Hôtel-de-Ville garage, 2 Rue des Jardins, is the backup. Walk to Dufferin and then La Bûche—do not move the car between them.', mapUrl: mapSearchUrl('Stationnement De Beaucours, 39 Rue Saint-Louis, Québec, QC G1R 3Z2'), sourceUrl: 'https://www.ville.quebec.qc.ca/en/citoyens/stationnement/liste_stationnements.aspx' }),
          foodStop('2026-08-15', 'La Bûche', { id: 'd2-dinner', time: '18:15', zone: 'ET', kind: 'Dinner / walking outing', priority: 'required', routeEligible: false, notes: 'Canonical Old Québec dinner. Saturday hours are 08:00–22:00. Reserve in advance; Cochon Dingue is the fallback. Walk from the garage/Dufferin area.', mapUrl: 'https://www.google.com/maps/dir/?api=1&origin=39+Rue+Saint-Louis%2C+Quebec%2C+QC+G1R+3Z2&destination=49+Rue+Saint-Louis%2C+Quebec%2C+QC+G1R+3Z2&travelmode=walking', sourceUrl: 'https://www.quebec-cite.com/en/businesses/la-buche' }),
          customStop({ id: 'd2-return', dayId: '2026-08-15', time: '19:45–20:00', zone: 'ET', title: 'Collect car and return to Hôtel Cofortel', kind: 'Hotel return / sleep', priority: 'required', address: "6500 Boul. Wilfrid-Hamel, L'Ancienne-Lorette, QC G2E 2J1", city: "L'Ancienne-Lorette, QC", leg: 'Walk back to De Beaucours, then about 15 km / 20-25 min to Cofortel', notes: 'Walk back to the parked car, return directly to Cofortel, and stage the bags for the 07:00 departure.', food: 'No additional stop.', kidPlan: 'Bathroom and early bedtime after the city outing.', mapUrl: mapSearchUrl("6500 Boul. Wilfrid-Hamel, L'Ancienne-Lorette, QC G2E 2J1"), sourceUrl: 'https://cofortel.com/en/' })
        ],
        meals: [
          mealSlot({ id: 'd2-breakfast', meal: 'Breakfast', title: 'Breakfast at the hotel (Lloyd)', selectedStopId: 'd2-breakfast-stop', backup: 'Hotel grab-and-go only if table service would delay departure.' }),
          mealSlot({ id: 'd2-lunch', meal: 'Lunch', title: 'Restaurant-terrasse du Manoir Montmorency', selectedStopId: 'd2-lunch', backup: 'Cochon Dingue Beauport — named sit-down fallback if the Manoir cannot honour the reservation.' }),
          mealSlot({ id: 'd2-dinner', meal: 'Dinner', title: 'La Bûche', selectedStopId: 'd2-dinner', backup: 'Cochon Dingue Champlain.', reserve: 'High priority', reservationTaskId: 'reserve-d2-la-buche' })
        ]
      }),
      makeDay({
        id: '2026-08-16',
        label: 'Sun, Aug 16, 2026',
        mainActivity: 'Kamouraska Quai Miller waterfront reset',
        optionalActivity: 'Hartland Covered Bridge photo stop',
        downtime: 'Hotel check-in, pool and no off-site evening outing',
        rainPlan: 'Shorten Quai Miller to photos from the parking area and go directly to L’Estaminet, then Delta.',
        parentWarning: 'High-load 620 km day with a time-zone change. Two drivers and the seated lunch are essential.',
        routeFocus: 'Québec City → Rivière-du-Loup → Edmundston → Fredericton',
        driveKm: 620,
        pureDriveTime: 'About 7.5–8.5 h before meal and movement stops',
        risk: 'High',
        lateThresholdMin: 30,
        wakeTime: '06:00',
        departTarget: '07:00',
        driverPlan: 'Two-driver day: first driver handles Québec City to Rivière-du-Loup, swap before the New Brunswick stretch, and swap again at Edmundston or Hartland if needed.',
        timeZoneNote: 'Start in America/Toronto (ET). New Brunswick stops use America/Moncton (AT), one hour ahead.',
        contingency: 'Grand Falls is not in Plan A. Keep the Edmundston service break and shorten Hartland to a drive-through if the hotel arrival slips.',
        emergency: 'Go straight to Delta and have a seated dinner at STMR.36. The Diplomat is the nearby restaurant fallback. Wolastoq Wharf is optional only after Sunday hours and arrival time are confirmed.',
        stops: [
          sourceStop('2026-08-16', 'Depart Québec City', { id: 'd3-depart', time: '07:00', zone: 'ET', title: 'Depart Hôtel Cofortel', address: "6500 Boul. Wilfrid-Hamel, L'Ancienne-Lorette, QC G2E 2J1", city: "L'Ancienne-Lorette, QC", priority: 'required', notes: 'Wake 06:00, use the included hotel breakfast from 06:15–06:40, and make 07:00 the actual wheels-moving time.', food: 'Complimentary hotel continental breakfast; service starts at 05:00.', mapUrl: mapSearchUrl("6500 Boul. Wilfrid-Hamel, L'Ancienne-Lorette, QC G2E 2J1"), sourceUrl: 'https://cofortel.com/en/' }),
          customStop({ id: 'd3-kamouraska', dayId: '2026-08-16', time: '09:10–09:35', zone: 'ET', title: 'Visit Kamouraska Quai Miller', locationName: 'Kamouraska Quai Miller', parkingName: 'Quai de Kamouraska public parking — Avenue LeBlanc', parkingAddress: 'Avenue LeBlanc, Kamouraska, QC G0L 1M0', kind: 'Scenic heritage wharf / movement break', priority: 'required', address: 'Avenue LeBlanc, Kamouraska, QC G0L 1M0', city: 'Kamouraska, QC', leg: 'About 185 km / 2 h 10 from Québec City; about 55 km / 40 min to Rivière-du-Loup', timeBudget: '20-25 min', notes: 'This is the requested St. Lawrence stop. Use the named public day-parking area on Avenue LeBlanc, walk the restored heritage wharf and interpretation panels, take photos, and leave by 09:35 to protect the proper lunch in Rivière-du-Loup.', food: 'No meal here; hotel breakfast is already complete and lunch remains at L’Estaminet.', kidPlan: 'Short waterfront walk with close supervision around the wharf edge.', mapUrl: mapSearchUrl('Quai de Kamouraska public parking, Avenue LeBlanc, Kamouraska, QC G0L 1M0'), sourceUrl: 'https://www.tourismekamouraska.com/tourisme-responsable/' }),
          foodStop('2026-08-16', 'L’Estaminet', { id: 'd3-lunch', time: '10:15', zone: 'ET', kind: 'Lunch / seated restaurant', priority: 'required', timeBudget: '45-60 min', notes: 'Early proper lunch after the hotel breakfast. Allow the meal time before calculating the New Brunswick arrival.' }),
          customStop({ id: 'd3-edmundston', dayId: '2026-08-16', time: '14:30', zone: 'AT', title: 'Edmundston service + driver swap', kind: 'Fuel / washroom / driver swap', priority: 'required', address: '100 Grey Rock Road, Edmundston, NB E7C 0B6', city: 'Edmundston, NB', leg: 'About 120 km / 1 h 45–1 h 50 from Rivière-du-Loup; Atlantic Time is one hour ahead', timeBudget: '20 min', notes: 'Required movement and driver-swap break. Official Shell listing shows 24-hour V-Power 91. Fill if at/below a quarter tank or displayed range approaches 120–150 km.', food: 'Shop, washroom, water and road snack.', kidPlan: 'Walk for 10 minutes before the next driving block.', mapUrl: mapSearchUrl('100 Grey Rock Road, Edmundston, NB E7C 0B6'), sourceUrl: 'https://find.shell.com/ca/fuel/10071398-grey-rock-road-edmundston/en_CA' }),
          customStop({ id: 'd3-hartland', dayId: '2026-08-16', time: '16:20', zone: 'AT', title: 'Hartland Covered Bridge photo stop', locationName: 'Hartland Covered Bridge', parkingName: 'Hartland Covered Bridge east-side riverside parking', parkingAddress: '365 Main St, Hartland, NB E7P 2N1', kind: 'Photo stop / stretch', priority: 'required', address: '365 Main St, Hartland, NB E7P 2N1', city: 'Hartland, NB', leg: 'About 170 km / 1 h 45 from Edmundston; about 120 km / 1 h 20 to Fredericton', timeBudget: '15-20 min', notes: 'Use the east-side riverside arrival point. Keep this short; it is the second movement break, not another full attraction visit.', food: 'No meal plan.', kidPlan: 'Drive through or take a short riverside walk.', mapUrl: mapSearchUrl('Hartland Covered Bridge east side, 365 Main St, Hartland, NB E7P 2N1'), sourceUrl: 'https://tourismnewbrunswick.ca/listing/hartland-covered-bridge' }),
          sourceStop('2026-08-16', 'Check in: Delta Hotels by Marriott Fredericton', { id: 'd3-hotel', time: '17:50–18:15', zone: 'AT', title: 'Check in: Delta Hotels by Marriott Fredericton', address: '225 Woodstock Road, Fredericton, NB E3B 2H8', city: 'Fredericton, NB', priority: 'required', leg: 'About 125 km / 1 h 25 from Hartland', notes: 'Confirmed king + sofa-bed room for 2 adults + 1 child. Register the vehicle; official self-parking is paid. This arrival already includes the proper lunch and movement breaks, so check in and sit down at STMR.36—no downtown add-on.', food: 'STMR.36 is the proper seated dinner; The Diplomat is the nearby fallback.', kidPlan: 'King + sofa-bed room and indoor-pool reset if energy remains.', mapUrl: mapSearchUrl('225 Woodstock Road, Fredericton, NB E3B 2H8'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/overview/' }),
          foodStop('2026-08-16', 'Wolastoq Wharf', { id: 'd3-dinner', time: '18:45 only if separately confirmed', zone: 'AT', kind: 'Dinner branch', priority: 'conditional', conditional: true, choiceGated: true, routeEligible: false, saves: '90 min', notes: 'Choice-gated branch, not a lateness rule and not part of the full-day route. Use only after confirming Sunday hours by phone (506-449-0100) and only if the family reaches the hotel with energy. Delta on-site food is Plan A.' })
        ],
        meals: [
          mealSlot({ id: 'd3-breakfast', meal: 'Breakfast', title: 'Hôtel Cofortel included breakfast', selectedStopId: 'd3-depart', backup: 'Packed breakfast only if hotel service unexpectedly fails.' }),
          mealSlot({ id: 'd3-lunch', meal: 'Lunch', title: 'Resto-Pub L’Estaminet', selectedStopId: 'd3-lunch', backup: 'A quick Rivière-du-Loup lunch stop if timing changes.' }),
          mealSlot({ id: 'd3-dinner', meal: 'Dinner', title: 'STMR.36 seated dinner at Delta', selectedStopId: 'd3-hotel', backup: 'The Diplomat is the nearby sit-down fallback; Wolastoq Wharf only after Sunday hours and arrival timing are confirmed.', conditional: false })
        ]
      }),
      makeDay({
        id: '2026-08-17',
        label: 'Mon, Aug 17, 2026',
        mainActivity: 'Cape Jourimain bridge viewpoint and short nature-centre break',
        optionalActivity: 'Magnetic Hill Illusion · easy to skip',
        downtime: 'At least 60 minutes at Hampton before the early lobster supper',
        rainPlan: 'Skip Magnetic Hill; keep Cape Jourimain to the visitor centre or continue to the hotel pool.',
        parentWarning: 'Do not combine Magnetic Hill with extra Charlottetown sightseeing after supper.',
        routeFocus: 'Fredericton → Moncton → Cape Jourimain → Charlottetown',
        driveKm: 340,
        pureDriveTime: 'About 4–5 h with bridge and local stops',
        risk: 'Medium',
        lateThresholdMin: 30,
        wakeTime: '06:15',
        departTarget: '08:00 wheels moving',
        driverPlan: 'Two adults can drive; use one adult for Fredericton-Moncton and the other for the bridge/PEI arrival if either person feels tired.',
        timeZoneNote: 'All times are Atlantic Time (America/Moncton).',
        contingency: 'At 30 minutes late—or if staffed access is not confirmed—skip Magnetic Hill. At 45 minutes late, make Cape Jourimain a 20-minute washroom/bridge-view stop. Victoria Row is never part of Plan A.',
        emergency: 'Capital Drive takeout or delivery to Hampton is the late-arrival fallback. Protect hotel access, the early walk-in supper and bedtime rather than adding downtown driving during Old Home Week.',
        stops: [
          sourceStop('2026-08-17', 'Depart Fredericton', { id: 'd4-depart', time: '08:00', zone: 'AT', title: 'Depart Delta Hotels by Marriott Fredericton', address: '225 Woodstock Road, Fredericton, NB E3B 2H8', city: 'Fredericton, NB', priority: 'required', notes: 'Wake 06:15, finish packing before the 06:30 on-site breakfast, check out by 07:40 and make 08:00 the actual wheels-moving time. Use a packed breakfast if service runs slowly.', food: 'Grove Café or STMR.36 breakfast; packed backup and road snack.', mapUrl: mapSearchUrl('225 Woodstock Road, Fredericton, NB E3B 2H8'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/dining/' }),
          sourceStop('2026-08-17', 'Magnetic Hill', { id: 'd4-magnetic', time: '09:50–10:20 only if staffed', zone: 'AT', locationName: 'Magnetic Hill Illusion', parkingName: 'Magnetic Hill Illusion entrance / visitor parking', parkingAddress: '2846 Mountain Road, Moncton, NB E1G 2W7', priority: 'optional', skipAt: 30, saves: '30 min', address: '2846 Mountain Road, Moncton, NB E1G 2W7', city: 'Moncton, NB', leg: 'About 170 km / 1 h 50 from Fredericton', timeBudget: '20-30 min', notes: 'Short on-time kid novelty. The City confirms the summer season but does not publish a daily clock; call shortly before travel and continue to Tony’s if the gate is not operating.', mapUrl: mapSearchUrl('Magnetic Hill Illusion entrance, 2846 Mountain Road, Moncton, NB E1G 2W7'), sourceUrl: 'https://www.moncton.ca/en/magnetic-hill-illusion', ticket: ticketGuidance.magneticHill }),
          foodStop('2026-08-17', 'Tony’s Bistro', { id: 'd4-lunch', time: '10:40–11:40', zone: 'AT', kind: 'Lunch / seated restaurant', priority: 'required', timeBudget: '45-60 min', notes: 'Official Monday hours are 08:00–15:00. This early proper lunch removes the old idle gap and protects the bridge, hotel and dinner; leave by 11:40.' }),
          sourceStop('2026-08-17', 'Cape Jourimain', { id: 'd4-cape', time: '12:45–13:25', zone: 'AT', locationName: 'Cape Jourimain Nature Centre', parkingName: 'Cape Jourimain Nature Centre visitor parking', parkingAddress: '5039 Route 16, Bayfield, NB E4M 3Z8', priority: 'required', timeBudget: '30-40 min', notes: 'This is the day’s one priority experience and a useful washroom/movement break. Official Monday hours are 10:00–17:00. Use the signed visitor-centre parking, bridge viewpoint and shortest family trail; shorten to 25 minutes if the hotel ETA moves past 15:30.', mapUrl: mapSearchUrl('Cape Jourimain Nature Centre visitor parking, 5039 Route 16, Bayfield, NB E4M 3Z8') }),
          sourceStop('2026-08-17', 'Check in: Hampton Inn & Suites Charlottetown', { id: 'd4-hotel', time: '15:15 arrival request · 16:00 guaranteed · leave 16:20', zone: 'AT', title: 'Check in: Hampton Inn & Suites Charlottetown', address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE', priority: 'required', leg: 'About 60 km / 50-60 min from Cape Jourimain including bridge traffic', notes: 'Confirmed two-queen room for 2 adults + 1 child, with free parking and hot breakfast. Treat 15:15 as an early-room request; check-in is guaranteed at 16:00. Unload only what is needed, use the washroom and leave at 16:20. Reconfirm tomorrow’s luggage-hold fallback before leaving.', food: 'Capital Drive services nearby; free hot breakfast tomorrow.', kidPlan: 'Quick room and bathroom reset only; pool is after dinner only if energy and posted hours fit.', mapUrl: mapSearchUrl('300 Capital Drive, Charlottetown, PE C1E 1E8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/' }),
          foodStop('2026-08-17', 'New Glasgow Lobster Suppers', { id: 'd4-dinner', time: '16:50–17:00 walk-in target', zone: 'AT', kind: 'Dinner', priority: 'required', timeBudget: '90-120 min including queue', notes: '2026 service is 16:00–19:30. A family of three is walk-in; reservations are limited to groups of 8+. Arriving before 17:00 gives the best chance of a family-friendly finish. Use Capital Drive takeout if the quoted wait threatens bedtime.', reservation: 'No family reservation; groups of 8+ only.' }),
          customStop({ id: 'd4-victoria', dayId: '2026-08-17', time: 'Bonus only—never Plan A', zone: 'AT', title: 'Victoria Row evening stroll (bonus only)', locationName: 'Victoria Row', parkingName: 'Queen Street Parkade', parkingAddress: '222 Queen Street, Charlottetown, PE', kind: 'Optional attraction', priority: 'optional', conditional: true, choiceGated: true, routeEligible: false, saves: '45 min', address: 'Richmond St (Victoria Row), Charlottetown, PE', city: 'Charlottetown, PE', leg: 'Separate branch after supper', timeBudget: '20-30 min', notes: 'Do this only if supper ends by 19:15, the child asks to continue and Old Home Week traffic/parking is calm. Use Queen Street Parkade because Pownal Parkade construction may restrict public access. Otherwise return directly to Hampton with no guilt.', food: 'Dessert only after supper.', kidPlan: 'Buskers and a short walk only if the child still has energy.', mapUrl: mapSearchUrl('Queen Street Parkade, 222 Queen Street, Charlottetown, PE'), sourceUrl: 'https://www.charlottetown.ca/resident_services/transportation_infrastructure/parking' }),
          customStop({ id: 'd4-return', dayId: '2026-08-17', time: '19:00–20:00 depending on queue', zone: 'AT', title: 'Return directly to Hampton Inn & Suites Charlottetown', kind: 'Hotel return / sleep', priority: 'required', address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE', leg: 'About 30 km / 30 min direct from New Glasgow', notes: 'Plan A goes directly back to Hampton. Set out the beach/day bag and luggage-transfer items before bed.', food: 'No additional stop.', kidPlan: 'Pool only if supper was quick and posted hours still fit; otherwise bedtime.', mapUrl: mapSearchUrl('300 Capital Drive, Charlottetown, PE C1E 1E8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/' })
        ],
        meals: [
          mealSlot({ id: 'd4-breakfast', meal: 'Breakfast', title: 'Delta hotel breakfast', selectedStopId: 'd4-depart', backup: 'Packed breakfast only if hotel service runs too slowly.' }),
          mealSlot({ id: 'd4-lunch', meal: 'Lunch', title: 'Tony’s Bistro & Pâtisserie', selectedStopId: 'd4-lunch', backup: 'Quick Moncton food only if Tony’s timing fails.' }),
          mealSlot({ id: 'd4-dinner', meal: 'Dinner', title: 'New Glasgow Lobster Suppers', selectedStopId: 'd4-dinner', backup: 'Lobster on the Wharf is the Charlottetown sit-down fallback.', reserve: 'Walk-in for a family of three; reservations only for groups of 8+. Arrive early and expect a queue.' })
        ]
      }),
      makeDay({
        id: '2026-08-18',
        label: 'Tue, Aug 18, 2026',
        mainActivity: 'Green Gables Heritage Place at opening time',
        optionalActivity: 'Cavendish Main Beach · 60–90 minutes if weather and energy are good',
        downtime: '35–60 minute room reset before the Slaymaker dinner',
        rainPlan: 'Use Ripley’s Cavendish instead of the beach, then check in early.',
        parentWarning: 'The hotel switch adds mental load; use the optional luggage handoff only if it makes the day easier.',
        routeFocus: 'Hampton checkout / hotel switch → Cavendish / North Rustico → Canadas Best Value Inn',
        driveKm: 101,
        pureDriveTime: 'Local driving only',
        risk: 'Medium',
        lateThresholdMin: 30,
        wakeTime: '06:00',
        departTarget: '07:15 checkout · 07:25 luggage drop · 08:10 Green Gables parking',
        driverPlan: 'Local-driving day: both adults can drive, but use the non-driving adult as the beach/parking/kid-gear captain.',
        timeZoneNote: 'All times are Atlantic Time (America/Moncton).',
        contingency: 'Protect the confirmed luggage handoff, Green Gables opening, Blue Mussel opening and the 18:30 dinner. If the Blue Mussel quote exceeds 45 minutes, use a quick Rustico/Cavendish lunch. Beach time is the flexible block.',
        emergency: 'If neither hotel will hold the bags, keep all luggage concealed in the locked trunk and park only in busy official lots. For thunder, heavy rain or beach closure, use the indoor Ripley’s branch and check in early.',
        stops: [
          sourceStop('2026-08-18', 'Check out Hampton / begin hotel-switch day', { id: 'd5-checkout', time: '07:15', zone: 'AT', title: 'Check out Hampton / begin hotel-switch day', kind: 'Hotel transfer / start', address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE', priority: 'required', timeBudget: '10 min', notes: 'Wake at 06:00, use the included breakfast only if service fits, and check out by 07:15 with the beach/day bag separated. Use the early bag drop at Canadas Best Value Inn only after the property confirms it directly; otherwise use the confirmed same-day Hampton hold. Never leave bags visible in the vehicle.', food: 'Included Hampton breakfast if timing fits; packed breakfast is the no-delay backup.', kidPlan: 'Bathroom and beach bag separated from the stored luggage.', mapUrl: mapSearchUrl('300 Capital Drive, Charlottetown, PE C1E 1E8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/' }),
          customStop({ id: 'd5-bag-drop', dayId: '2026-08-18', time: '07:25–07:35 if confirmed', zone: 'AT', title: 'Pending confirmation: early bag drop at Canadas Best Value Inn', kind: 'Hotel transfer / luggage', priority: 'conditional', conditional: true, address: '20 Capital Drive, Charlottetown, PE C1E 1E7', city: 'Charlottetown, PE', leg: 'About 3 km / 5 min from Hampton; about 35 km / 35-40 min to Green Gables', timeBudget: '10 min', notes: 'This is not confirmed until the checklist call is completed. If declined, mark this stop skipped, use the confirmed same-day Hampton hold, and follow the 15:15 beach cutoff for return pickup. Never leave luggage visible in the car.', food: 'No food stop.', kidPlan: 'Keep the day bag, beach gear and medications with the family.', mapUrl: mapSearchUrl('20 Capital Drive, Charlottetown, PE C1E 1E7'), sourceUrl: 'https://cbvipei.ca/' }),
          sourceStop('2026-08-18', 'Green Gables', { id: 'd5-green-gables', time: '08:10 parking · 08:45 queue · 09:00–10:40 visit', zone: 'AT', locationName: 'Green Gables Heritage Place', parkingName: 'Green Gables Visitor Centre parking', parkingAddress: '8619 Route 6, Cavendish, PE C0A 1N0', priority: 'required', notes: 'Official hours are 09:00–17:00; Parks Canada says the busiest period is 11:00–15:00 and visitor parking is free near the visitor centre. The early parking/bathroom buffer avoids the peak. Leave by 10:40 for the new Blue Mussel location.', mapUrl: mapSearchUrl('Green Gables Visitor Centre parking, 8619 Route 6, Cavendish, PE C0A 1N0'), sourceUrl: 'https://parks.canada.ca/lhn-nhs/pe/greengables/visit/services', ticket: ticketGuidance.greenGables }),
          foodStop('2026-08-18', 'Blue Mussel', { id: 'd5-lunch', time: '11:10 parking · 11:30 opening', zone: 'AT', title: 'Blue Mussel Café — new Rustico location', address: '5033 Rustico Road, Rustico, PE C0A 1N0', city: 'Rustico, PE', kind: 'Lunch', priority: 'required', timeBudget: '75-90 min including wait', notes: 'Summer hours are 11:30–21:00. Arrive before opening. The live same-day waitlist is only for the current service: check it when nearby/on the way, not at 10:45 and not as an advance booking. Cap the quoted wait at 45 minutes to protect the afternoon.', mapUrl: mapSearchUrl('5033 Rustico Road, Rustico, PE C0A 1N0'), sourceUrl: 'https://bluemusselcafe.com/waitlist/' }),
          sourceStop('2026-08-18', 'Cavendish Beach', { id: 'd5-beach', time: '13:30–15:30 · hard leave 15:45', zone: 'AT', locationName: 'Cavendish Main Beach — PEI National Park', parkingName: 'Cavendish Main Beach visitor parking', parkingAddress: '1416 Gulf Shore Parkway, Cavendish, PE', address: '1416 Gulf Shore Parkway, Cavendish, PE', priority: 'optional', skipAt: 30, saves: '90 min', timeBudget: '60-120 min', notes: 'Use the named main-beach visitor parking. Plan A with bags at the new hotel: leave by 15:45 for a real hotel reset. Hampton-hold fallback: leave by 15:15, retrieve bags at 300 Capital Drive, then continue 3 km to the new hotel. Surfguards operate 10:00–18:00 in this 2026 window; check PEI Now around 11:00. Swim only in the supervised area and between flags. Red flag, thunder, severe-weather warning or no supervision means no swimming.', mapUrl: mapSearchUrl('Cavendish Main Beach visitor parking, 1416 Gulf Shore Parkway, Cavendish, PE'), sourceUrl: 'https://parks.canada.ca/pn-np/pe/pei-ipe/activ/natation-swim/plages-beaches', ticket: ticketGuidance.cavendish }),
          customStop({ id: 'd5-rain', dayId: '2026-08-18', time: '13:15 only for rain/closure', zone: 'AT', title: 'Indoor Plan B: Ripley’s Believe It or Not! Cavendish', locationName: 'Ripley’s Believe It or Not! Cavendish', parkingName: 'Ripley’s Cavendish on-site visitor parking', parkingAddress: '8863 Cavendish Road, Cavendish, PE', kind: 'Indoor weather backup', priority: 'conditional', conditional: true, choiceGated: true, routeEligible: false, address: '8863 Cavendish Road, Cavendish, PE', city: 'Cavendish, PE', timeBudget: '45-60 min', notes: 'Use instead of the beach for sustained rain, thunder or a beach closure. It is indoors and the official FAQ says the self-guided visit takes about 45 minutes; verify seasonal hours before driving over.', food: 'Nearby Cavendish Boardwalk services.', kidPlan: 'Indoor oddities and exhibits for a six-year-old; leave by 15:15–15:30 for the hotel reset.', mapUrl: mapSearchUrl('Ripley’s Cavendish visitor parking, 8863 Cavendish Road, Cavendish, PE'), sourceUrl: 'https://www.ripleys.com/attractions/ripleys-believe-it-or-not-cavendish-beach/faq' }),
          sourceStop('2026-08-18', 'Check in: Canadas Best Value Inn & Suites Charlottetown', { id: 'd5-hotel', time: '16:25–17:00 target', zone: 'AT', title: 'Check in: Canadas Best Value Inn & Suites Charlottetown', address: '20 Capital Drive, Charlottetown, PE C1E 1E7', city: 'Charlottetown, PE', priority: 'required', leg: 'About 40 km / 40 min from Cavendish Beach', notes: 'Booked non-smoking king suite with jetted tub; official check-in begins at 15:00. The stay is booked and safe. Retrieve Hampton-held bags first only if that optional luggage plan was used, register the vehicle and protect at least 35 minutes for the room reset.', food: 'Free hot breakfast tomorrow; Capital Drive services nearby.', kidPlan: 'Unpack, reset and keep the evening calm.', mapUrl: mapSearchUrl('20 Capital Drive, Charlottetown, PE C1E 1E7'), sourceUrl: 'https://cbvipei.ca/' }),
          foodStop('2026-08-18', 'Slaymaker', { id: 'd5-dinner', time: '17:50 hotel departure · 18:30 reservation', zone: 'AT', kind: 'Dinner', priority: 'required', notes: 'Official Tuesday hours are 11:30–21:00. Book early. Old Home Week runs Aug 14–22, so preselect a downtown garage and allow 30–40 minutes for the short drive, parking and walk.' }),
          customStop({ id: 'd5-return', dayId: '2026-08-18', time: '19:45–20:00', zone: 'AT', title: 'Return to Canadas Best Value Inn & Suites Charlottetown', kind: 'Hotel return / sleep', priority: 'required', address: '20 Capital Drive, Charlottetown, PE C1E 1E7', city: 'Charlottetown, PE', leg: 'About 6 km / 10-15 min from Slaymaker & Nichols', notes: 'Return directly after dinner and stage the Hopewell clothes, breakfast and car supplies before bed.', food: 'No additional stop.', kidPlan: 'Early bedtime before the tide-anchored drive.', mapUrl: mapSearchUrl('20 Capital Drive, Charlottetown, PE C1E 1E7'), sourceUrl: 'https://cbvipei.ca/' })
        ],
        meals: [
          mealSlot({ id: 'd5-breakfast', meal: 'Breakfast', title: 'Hampton included hot breakfast', selectedStopId: 'd5-checkout', backup: 'Request takeaway or use packed breakfast if confirmed service hours miss checkout.' }),
          mealSlot({ id: 'd5-lunch', meal: 'Lunch', title: 'Blue Mussel Café — Rustico', selectedStopId: 'd5-lunch', backup: 'Quick Rustico/Cavendish takeout or Fisherman’s Wharf; do not detour east to Covehead.' }),
          mealSlot({ id: 'd5-dinner', meal: 'Dinner', title: 'Slaymaker & Nichols', selectedStopId: 'd5-dinner', backup: 'Lobster on the Wharf.', reserve: 'Very high priority', reservationTaskId: 'reserve-d5-slaymaker' })
        ]
      }),
      makeDay({
        id: '2026-08-19',
        label: 'Wed, Aug 19, 2026',
        mainActivity: 'Hopewell Rocks ocean floor around the 11:52 low tide',
        optionalActivity: 'Marine Rail Park only as the pre-bridge fallback; Magnetic Hill only instead of the hotel pool',
        downtime: 'Pool or quiet room time from check-in until the 18:00 dinner',
        rainPlan: 'Light rain: use grippy footwear and follow staff. Thunder, heavy rain or closure: skip the floor and use the hotel pool.',
        parentWarning: 'The tide clock, not sightseeing volume, controls the day. Leave Charlottetown by 07:15 and keep the Sackville reset short.',
        routeFocus: 'PEI → Hopewell Rocks (midday tide window) → Moncton',
        driveKm: 317,
        pureDriveTime: 'About 3 h 15 before parking and tide buffer',
        risk: 'High',
        lateThresholdMin: 30,
        wakeTime: '06:15',
        departTarget: '07:15 from Charlottetown (tide-anchored)',
        driverPlan: 'Two adults can drive; assign one adult to the tide/route clock and the other to parking, snacks, and kid reset so Hopewell stays protected.',
        timeZoneNote: 'All times are Atlantic Time (America/Moncton). Tide window confirmed from CHS predictions: low tide 11:52 AM, ocean floor roughly 9:00 AM–2:45 PM. Re-verify 24–48h before.',
        contingency: 'Plan A includes one controlled 20-minute rest at Sackville Waterfowl Park / Tantramar Visitor Information Centre. Target the Hopewell entrance by 10:15–10:30 and the beach stairs by 10:45; follow park staff if actual access changes.',
        emergency: 'Fuel the evening before or before departure if at/below a quarter tank. If more than 10 minutes late at Sackville, use the visitor-centre washroom and leave within 10 minutes—skip the boardwalk, not the family rest.',
        stops: [
          customStop({ id: 'd6-morning-ready', dayId: '2026-08-19', time: '06:15', zone: 'AT', title: 'Wake, tide re-check and quarter-tank check', kind: 'Start / tide / fuel check', priority: 'required', address: '20 Capital Drive, Charlottetown, PE C1E 1E7', city: 'Charlottetown, PE', timeBudget: '60 min', notes: 'Re-check the official tide table and park notice. Wheels rolling by 07:15. Prefer filling the evening before; if at/below a quarter tank this morning, use the 24-hour Shell at 630 Capital Drive on the westbound exit route.', food: 'Prefer the included hot hotel breakfast. Confirm its opening time the night before; use the quickest hotel option if table service would delay the 07:15 departure.', kidPlan: 'Bathroom, snacks, dry clothes and car toys ready the night before.', mapUrl: mapSearchUrl('20 Capital Drive, Charlottetown, PE C1E 1E7'), sourceUrl: 'https://cbvipei.ca/' }),
          customStop({ id: 'd6-fuel', dayId: '2026-08-19', time: '07:20 only if at fuel trigger', zone: 'AT', title: 'Verified tide-day 91: Shell North River', kind: 'Conditional fuel', priority: 'conditional', conditional: true, routeEligible: false, address: '630 Capital Drive, Cornwall, PE C0A 1H0', city: 'Cornwall, PE', timeBudget: '10 min', notes: 'Official Shell listing shows 24-hour V-Power 91. This is the morning fallback, not a routine stop; depart it no later than 07:30 and keep the Hopewell clock protected.', food: 'Shop only; breakfast should already be handled.', kidPlan: 'Stay in departure mode.', mapUrl: mapSearchUrl('630 Capital Drive, Cornwall, PE C0A 1H0'), sourceUrl: 'https://find.shell.com/ca/fuel/10053264-trans-canada-hwy-north-river/en_CA' }),
          customStop({ id: 'd6-marine-rail', dayId: '2026-08-19', time: '08:00–08:10 only instead of Sackville', zone: 'AT', title: 'Fallback rest: Marine Rail Historical Park', locationName: 'Marine Rail Historical Park', parkingName: 'Marine Rail Park waterfront visitor parking', parkingAddress: '41 Borden Avenue, Borden-Carleton, PE C0B 1X0', kind: 'Optional bridge-view stretch', priority: 'conditional', conditional: true, choiceGated: true, routeEligible: false, address: '41 Borden Avenue, Borden-Carleton, PE C0B 1X0', city: 'Borden-Carleton, PE', timeBudget: '10 min', notes: 'Use only if the child needs an earlier stop or the family reaches Borden-Carleton ahead of schedule. Quick bridge/lighthouse photo and stretch, then skip Sackville entirely. Do not combine both pre-Hopewell attractions.', food: 'No meal stop; keep the tide clock moving.', kidPlan: 'Ten minutes of open-air movement with close waterfront supervision.', mapUrl: mapSearchUrl('Marine Rail Park waterfront visitor parking, 41 Borden Avenue, Borden-Carleton, PE C0B 1X0'), sourceUrl: 'https://www.borden-carleton.ca/copy-of-borden-carleton-regional-library' }),
          customStop({ id: 'd6-bridge', dayId: '2026-08-19', time: '08:10', zone: 'AT', title: 'Confederation Bridge crossing', kind: 'Drive', priority: 'required', address: 'Confederation Bridge, Borden-Carleton, PE', city: 'Borden-Carleton, PE', leg: 'About 60 km / 50 min from Charlottetown', notes: 'The current two-axle toll is C$20, collected while leaving PEI; cash, major cards and Interac are accepted. Check live bridge status, then continue to the one planned family rest in Sackville.', mapUrl: mapSearchUrl('Confederation Bridge, Borden-Carleton, PE'), sourceUrl: 'https://www.confederationbridge.com/tolls-fees/' }),
          customStop({ id: 'd6-sackville-rest', dayId: '2026-08-19', time: '09:00–09:20 · hard leave 09:20', zone: 'AT', title: 'Required rest: Sackville Waterfowl Park', locationName: 'Sackville Waterfowl Park & Tantramar Visitor Information Centre', parkingName: 'Tantramar Visitor Information Centre parking', parkingAddress: '34 Mallard Drive, Sackville, NB E4L 4C3', kind: 'Washroom / boardwalk / child stretch', priority: 'required', address: '34 Mallard Drive, Sackville, NB E4L 4C3', city: 'Sackville, NB', leg: 'Planning estimate: about 45 km / 35–40 min after the bridge; verify in live Maps', timeBudget: '20 min', notes: 'Park at the named Visitor Information Centre, use the washrooms and take only the shortest boardwalk out-and-back. The park is open year-round and the visitor centre is listed 09:00–18:00 in July/August; verify 2026 hours during the Aug 17 tide check. Hard leave 09:20. If arrival is after 09:10, make this a 10-minute washroom/stretch stop and skip the boardwalk.', food: 'Water and a small car snack only; the proper lunch remains at Hopewell Rocks.', kidPlan: 'Flat, accessible boardwalk and bird spotting. Stay beside the Visitor Centre so the stop cannot expand into the 3.5 km trail network.', mapUrl: mapSearchUrl('Tantramar Visitor Information Centre parking, 34 Mallard Drive, Sackville, NB E4L 4C3'), sourceUrl: 'https://tourismnewbrunswick.ca/listing/sackville-waterfowl-park', attractionQuality: attractionQuality.sackville }),
          sourceStop('2026-08-19', 'Hopewell Rocks', { id: 'd6-hopewell', time: '10:15–10:30 entrance · 10:45 stairs', zone: 'AT', locationName: 'Hopewell Rocks Provincial Park', parkingName: 'Hopewell Rocks main visitor parking', parkingAddress: '131 Discovery Rd, Hopewell Cape, NB E4H 4Z5', kind: 'Tide-dependent attraction', priority: 'required', leg: 'Planning estimate: about 70 km / 55–65 min from Sackville; verify in live Maps', timeBudget: '2.5-3 h', notes: 'CHS predicts low tide at 11:52 AM ADT. Target the main visitor parking and entrance by 10:15–10:30 and the beach stairs by 10:45. Estimated access is roughly 9:00 AM–2:45 PM, but actual ocean-floor access is always at park staff discretion. Use closed-toe grippy footwear and recheck 24–48 hours before.', kidPlan: 'Use the shuttle if energy is marginal; 60–90 minutes on the floor is enough. Expect about 99 stairs down and 101 back up on the main route.', mapUrl: mapSearchUrl('Hopewell Rocks main visitor parking, 131 Discovery Rd, Hopewell Cape, NB E4H 4Z5'), sourceUrl: 'https://www.parcsnbparks.ca/en/parks/33/hopewell-rocks-provincial-park/26/tide-tables', ticket: ticketGuidance.hopewell }),
          customStop({ id: 'd6-lunch', dayId: '2026-08-19', time: '13:30–14:20', zone: 'AT', title: 'Proper lunch: High Tide Restaurant', locationName: 'High Tide Restaurant — Hopewell Rocks', kind: 'Lunch / full-service restaurant', priority: 'required', address: '131 Discovery Rd, Hopewell Cape, NB E4H 4Z5', city: 'Hopewell Cape, NB', timeBudget: '45-50 min', notes: 'Change out of muddy footwear first, then sit down after the ocean-floor walk. The official 2026 schedule is 09:00–19:30 on Aug 19. This is a full-service restaurant with local New Brunswick food, not the snack café and not a picnic.', food: 'Full-service casual lunch with fresh local flavours and a tidal-flat view.', kidPlan: 'Wipes, dry shoes and a change of clothes before sitting down.', mapUrl: mapSearchUrl('High Tide Restaurant, Hopewell Rocks, 131 Discovery Rd, Hopewell Cape, NB E4H 4Z5'), sourceUrl: 'https://www.thehopewellrocks.ca/en/parks/33/hopewell-rocks-provincial-park/entities' }),
          sourceStop('2026-08-19', 'Check in: Best Western Plus Moncton', { id: 'd6-hotel', time: '15:30 arrival buffer · 16:00 guaranteed', zone: 'AT', title: 'Check in: Best Western Plus Moncton', address: '300 Lewisville Road (Highway 15, Ramp 10), Moncton, NB E1A 5Y4', city: 'Moncton, NB', priority: 'required', leg: 'About 40 km / 35 min from Hopewell Rocks', notes: 'The booked room is guaranteed from 16:00; treat 15:30 as an early-check-in request or pool/lobby buffer. The stay is booked and safe. Free parking, full breakfast and an indoor pool make this the recovery stop.', food: 'Full breakfast tomorrow; Tide & Boar remains the relaxed dinner.', kidPlan: 'Indoor-pool reset after the room is ready.', mapUrl: mapSearchUrl('300 Lewisville Road, Moncton, NB E1A 5Y4'), sourceUrl: 'https://www.bestwestern.com/en_US/book/hotels-in-moncton/best-western-plus-moncton/propertyCode.64007.html' }),
          customStop({ id: 'd6-magnetic', dayId: '2026-08-19', time: '16:45 only if chosen instead of the pool', zone: 'AT', title: 'Magnetic Hill illusion', locationName: 'Magnetic Hill Illusion', parkingName: 'Magnetic Hill Illusion entrance / visitor parking', parkingAddress: '2846 Mountain Road, Moncton, NB E1G 2W7', kind: 'Optional attraction branch', priority: 'optional', conditional: true, choiceGated: true, routeEligible: false, saves: '45 min', address: '2846 Mountain Road, Moncton, NB E1G 2W7', city: 'Moncton, NB', leg: 'About 15 min from the hotel', timeBudget: '30-40 min', notes: 'Choice-gated branch, not a lateness rule and not part of the default route. Choose either the indoor-pool recovery block or Magnetic Hill—not both—and confirm staffed access before the 18:00 dinner.', food: 'Nearby services; keep it light before dinner.', kidPlan: 'Novelty backwards-rolling car moment, only if everyone prefers it to the pool.', mapUrl: mapSearchUrl('Magnetic Hill Illusion entrance, 2846 Mountain Road, Moncton, NB E1G 2W7'), sourceUrl: 'https://www.moncton.ca/en/magnetic-hill-illusion', ticket: ticketGuidance.magneticHill }),
          foodStop('2026-08-19', 'Tide & Boar', { id: 'd6-dinner', time: '18:00', zone: 'AT', kind: 'Dinner', priority: 'required', skipAt: 60, saves: '90 min', notes: 'Relaxed dinner after either the hotel pool or the separate Magnetic Hill branch. Fall back to hotel/quick food only if the afternoon ran long.' }),
          customStop({ id: 'd6-return', dayId: '2026-08-19', time: '19:30–19:45', zone: 'AT', title: 'Return to Best Western Plus Moncton', kind: 'Hotel return / sleep', priority: 'required', address: '300 Lewisville Road (Highway 15, Ramp 10), Moncton, NB E1A 5Y4', city: 'Moncton, NB', leg: 'About 4 km / 10 min from Tide & Boar', notes: 'Return directly after dinner, preload the car and prepare a packed breakfast backup for the 06:45 departure.', food: 'No additional stop.', kidPlan: 'Pool only if it was not already used and posted hours still fit; otherwise bedtime.', mapUrl: mapSearchUrl('300 Lewisville Road, Moncton, NB E1A 5Y4'), sourceUrl: 'https://www.bestwestern.com/en_US/book/hotels-in-moncton/best-western-plus-moncton/propertyCode.64007.html' })
        ],
        meals: [
          mealSlot({ id: 'd6-breakfast', meal: 'Breakfast', title: 'Canadas Best Value Inn included hot breakfast', selectedStopId: 'd6-morning-ready', backup: 'Packed breakfast is the tide-protection exception.' }),
          mealSlot({ id: 'd6-lunch', meal: 'Lunch', title: 'High Tide Restaurant at Hopewell Rocks', selectedStopId: 'd6-lunch', backup: 'Gusto Italian Grill & Bar in Moncton — named sit-down fallback if High Tide unexpectedly closes.' }),
          mealSlot({ id: 'd6-dinner', meal: 'Dinner', title: 'Tide & Boar — 6:00 PM, relaxed', selectedStopId: 'd6-dinner', backup: 'Gusto Italian Grill & Bar is the sit-down fallback.', reserve: 'Book for ~6:00 PM — the midday tide window frees the evening', reservationTaskId: 'reserve-d6-tide-boar' })
        ]
      }),
      makeDay({
        id: '2026-08-20',
        label: 'Thu, Aug 20, 2026',
        mainActivity: 'Travel and recovery day with Frank’s seated lunch',
        optionalActivity: 'Hartland Covered Bridge · 10-minute photo only',
        downtime: 'Arrive at DoubleTree early enough for a suite reset before Le Dijon',
        rainPlan: 'Skip Hartland; keep the Regent Mall break and Frank’s lunch indoors.',
        parentWarning: 'Hardest scheduled drive at about 770 km. Skip every optional stop at the first sign of fatigue.',
        routeFocus: 'Moncton → Fredericton → Edmundston → Québec City',
        driveKm: 770,
        pureDriveTime: 'About 8–9 h with essential breaks',
        risk: 'High',
        lateThresholdMin: 30,
        wakeTime: '05:30',
        departTarget: '06:45-07:00',
        driverPlan: 'Two-driver day: leave with one adult fresh for Moncton-Fredericton, swap near Fredericton/Hartland, then swap again before the Québec City push if needed.',
        timeZoneNote: 'Start in America/Moncton (AT); Québec stops use America/Toronto (ET), one hour behind.',
        contingency: '06:45 means wheels moving after breakfast and checkout. Keep the Edmundston lunch/driver swap; shorten Hartland or Kamouraska before cutting a fatigue break.',
        emergency: 'Go straight to DoubleTree and sit down at Le Dijon. If it cannot seat the family, use Normandin Charlesbourg; do not add a downtown detour.',
        stops: [
          sourceStop('2026-08-20', 'Depart Moncton', { id: 'd7-depart', time: '06:45', zone: 'AT', title: 'Depart Best Western Plus Moncton', address: '300 Lewisville Road (Highway 15, Ramp 10), Moncton, NB E1A 5Y4', city: 'Moncton, NB', priority: 'required', notes: 'Wake 05:30–05:45, preload most luggage the night before and make 06:45 the actual wheels-moving time. Confirm breakfast hours with the hotel; if service does not fit, use the packed breakfast.', food: 'Included full breakfast only if timing fits; packed breakfast is the no-delay backup.', mapUrl: mapSearchUrl('300 Lewisville Road, Moncton, NB E1A 5Y4'), sourceUrl: 'https://www.bestwestern.com/en_US/book/hotels-in-moncton/best-western-plus-moncton/propertyCode.64007.html' }),
          sourceStop('2026-08-20', 'Fredericton service', { id: 'd7-fredericton', time: '08:45', zone: 'AT', title: 'Regent Mall — washroom and stretch', locationName: 'Regent Mall', address: '1381 Regent Street, Fredericton, NB E3C 1A2', city: 'Fredericton, NB', kind: 'Washroom / stretch', priority: 'required', leg: 'About 180 km / 2 h from Moncton', notes: 'Use the mall’s complimentary customer parking for a quick washroom, coffee and movement break; do not leave the property.', mapUrl: mapSearchUrl('Regent Mall, 1381 Regent Street, Fredericton, NB E3C 1A2'), sourceUrl: 'https://www.regentmall.ca/pages/directions-parking' }),
          customStop({ id: 'd7-hartland', dayId: '2026-08-20', time: '10:30', zone: 'AT', title: 'Hartland Covered Bridge photo stop', locationName: 'Hartland Covered Bridge', parkingName: 'Hartland Covered Bridge east-side riverside parking', parkingAddress: '365 Main St, Hartland, NB E7P 2N1', kind: 'Photo stop / stretch', priority: 'optional', skipAt: 30, saves: '15 min', address: '365 Main St, Hartland, NB E7P 2N1', city: 'Hartland, NB', leg: 'About 120 km / 1 h 15 from Fredericton; about 150 km / 1 h 35 to Edmundston', timeBudget: '10-15 min', notes: 'Use the east-side riverside arrival point. Keep this to a short photo/stretch; the required longer break and lunch are in Edmundston.', food: 'No meal plan.', kidPlan: 'Quick bridge photo.', mapUrl: mapSearchUrl('Hartland Covered Bridge east side, 365 Main St, Hartland, NB E7P 2N1'), sourceUrl: 'https://tourismnewbrunswick.ca/listing/hartland-covered-bridge' }),
          customStop({ id: 'd7-edmundston', dayId: '2026-08-20', time: '12:15–13:10', zone: 'AT', title: 'Proper lunch: Frank’s Bar & Grill', locationName: 'Frank’s Bar & Grill — Four Points Edmundston', kind: 'Lunch / seated restaurant / driver swap', priority: 'required', address: '100 Rice Street, Edmundston, NB E3V 1T4', city: 'Edmundston, NB', leg: 'About 150 km / 1 h 35 from Hartland', timeBudget: '50-55 min', notes: 'Required real break before the Québec stretch. Sit down for lunch, walk and swap drivers. Frank’s serves lunch until 14:00 Thursday. If fuel is at/below a quarter tank or range approaches 120–150 km, use Shell Grey Rock after lunch; do not replace lunch with convenience-store food.', food: 'Full lunch menu with salads, pasta, mixed grills and regional food.', kidPlan: 'At least 35 minutes seated and out of the booster.', mapUrl: mapSearchUrl('Frank’s Bar & Grill, 100 Rice Street, Edmundston, NB E3V 1T4'), sourceUrl: 'https://www.marriott.com/en-us/hotels/yqbep-four-points-edmundston-hotel-and-conference-center/dining/franks-bar-and-grill/' }),
          customStop({ id: 'd7-rdl', dayId: '2026-08-20', time: '13:45', zone: 'ET', title: 'Rivière-du-Loup washroom + final fuel decision', kind: 'Fuel / washroom check', priority: 'required', address: '80 Boulevard Cartier, Rivière-du-Loup, QC G5R 2M9', city: 'Rivière-du-Loup, QC', timeBudget: '10-15 min', notes: 'Québec time begins after the border. This single card replaces the duplicate fuel checks. Official Shell listing shows V-Power 91 and 06:00–23:00 forecourt hours. Fill only if still needed after Edmundston; the proper lunch already happened.', food: 'Convenience store and washroom; no second lunch.', kidPlan: 'Quick reset, then continue.', mapUrl: mapSearchUrl('80 Boulevard Cartier, Rivière-du-Loup, QC G5R 2M9'), sourceUrl: 'https://find.shell.com/ca/fuel/10060859-boul-cartier-rue-du-quai/en_CA' }),
          sourceStop('2026-08-20', 'Check in: DoubleTree by Hilton Quebec Resort', { id: 'd7-hotel', time: '16:30–17:15', zone: 'ET', title: 'Check in: DoubleTree by Hilton Quebec Resort', address: '7900 Rue du Marigot, Québec City, QC G1G 6T8', city: 'Québec City, QC', priority: 'required', leg: 'About 225 km / 2 h 20–2 h 35 from Rivière-du-Loup', notes: 'Confirmed one-bedroom suite for 2 adults + 1 child; the stay is booked and safe. The return route protects a real recovery window. Register for free parking, settle in, stay on site tonight and use the direct Highway 73 approach tomorrow.', food: 'Le Dijon is the on-site seated dinner; breakfast is available for a fee.', kidPlan: 'One-bedroom suite and outdoor pool if open and energy remains.', mapUrl: mapSearchUrl('7900 Rue du Marigot, Québec City, QC G1G 6T8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqbqcdt-doubletree-quebec-resort/' }),
          customStop({ id: 'd7-dinner', dayId: '2026-08-20', time: '18:45–19:00 · after settling', zone: 'ET', title: 'Proper dinner: Le Dijon dining room', kind: 'Dinner / seated restaurant', priority: 'required', address: '7900 Rue du Marigot, Québec City, QC G1G 6T8', city: 'Québec City, QC', timeBudget: '60-75 min', notes: 'Reserve a dining-room table and sit down after parking, registration and unloading. If arrival is near 18:15, make 19:00 the target. Normandin Charlesbourg is the named sit-down fallback; no downtown detour after the 770 km driving day.', food: 'Le Dijon dining room; Normandin Charlesbourg fallback.', kidPlan: 'Le Dijon has a children’s menu; eat, then protect the early bedtime.', mapUrl: mapSearchUrl('7900 Rue du Marigot, Québec City, QC G1G 6T8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqbqcdt-doubletree-quebec-resort/dining/' })
        ],
        meals: [
          mealSlot({ id: 'd7-breakfast', meal: 'Breakfast', title: 'Best Western included full breakfast', selectedStopId: 'd7-depart', backup: 'Request breakfast-to-go or use the packed safety backup if service opens too late.' }),
          mealSlot({ id: 'd7-lunch', meal: 'Lunch', title: 'Frank’s Bar & Grill in Edmundston', selectedStopId: 'd7-edmundston', backup: 'Boston Pizza Edmundston — named sit-down fallback.' }),
          mealSlot({ id: 'd7-dinner', meal: 'Dinner', title: 'Le Dijon dining room at DoubleTree', selectedStopId: 'd7-dinner', backup: 'Normandin Charlesbourg dining room, open until 21:00.' })
        ]
      }),
      makeDay({
        id: '2026-08-21',
        label: 'Fri, Aug 21, 2026',
        mainActivity: 'Safe westbound travel with a real Mallorytown go/stop decision',
        optionalActivity: 'The Big Apple only as a short movement break if continuing safely',
        downtime: 'Pull off to rest and swap drivers whenever either adult or the child is depleted — do not push through fatigue',
        rainPlan: 'Stay on Highway 401, skip outdoor stops and add rest/driver-swap breaks earlier.',
        parentWarning: 'An 820 km same-day return is not relaxing. Build in generous rest and driver-swap breaks, and only continue when both drivers are genuinely fit to drive.',
        routeFocus: 'Québec City → Centre-du-Québec → Boucherville → Mallorytown North → Vaughan',
        driveKm: 820,
        pureDriveTime: 'About 8.5–9.5 h with essential breaks',
        risk: 'High',
        lateThresholdMin: 30,
        wakeTime: '05:15',
        departTarget: '06:30 wheels moving',
        driverPlan: 'Two-driver day: one adult handles Québec-to-Montréal/South Shore, then swap for the Ontario 401/GTA push. Use the off-duty adult to watch fatigue and call the rest/driver-swap decisions.',
        timeZoneNote: 'All times are Eastern Time (America/Toronto).',
        contingency: 'At westbound Mallorytown North around 14:00, make an honest go/rest decision using driver fatigue, child condition, weather and traffic—not lateness. If continuing, keep the final Colborne movement break.',
        emergency: 'If neither driver can safely cover the remaining distance, stop at the nearest ONroute or safe pull-off, switch drivers, rest and do not move until safe. Never drive tired to keep to the clock.',
        stops: [
          sourceStop('2026-08-21', 'Depart Québec City', { id: 'd8-depart', time: '06:30 wheels moving', zone: 'ET', title: 'Depart DoubleTree by Hilton Quebec Resort', address: '7900 Rue du Marigot, Québec City, QC G1G 6T8', city: 'Québec City, QC', priority: 'required', notes: 'Wake 05:15 and preload the car the night before. Ask Le Dijon to confirm whether a full hotel breakfast can be finished before the 06:30 departure; if not, request takeaway and use the packed breakfast safety exception. Use Highway 73 south and swap drivers every 90–120 minutes or sooner for fatigue.', food: 'Prefer Le Dijon hotel breakfast if the confirmed service time protects the 06:30 departure; otherwise takeaway or packed breakfast.', mapUrl: mapSearchUrl('7900 Rue du Marigot, Québec City, QC G1G 6T8'), sourceUrl: 'https://www.hilton.com/en/hotels/yqbqcdt-doubletree-quebec-resort/' }),
          customStop({ id: 'd8-chambly', dayId: '2026-08-21', time: '09:15 arrive · ~30–40 min grounds', zone: 'ET', title: 'Fort Chambly National Historic Site', locationName: 'Fort Chambly National Historic Site', parkingName: 'Fort Chambly visitor parking (P1/P2, off Avenue Bourgogne)', parkingAddress: '2 Richelieu Street, Chambly, QC J3L 2B9', address: '2 Richelieu Street, Chambly, QC J3L 2B9', city: 'Chambly, QC', kind: 'Morning attraction / stretch', priority: 'required', leg: 'About 245 km / 2 h 30–2 h 45 from the DoubleTree', timeBudget: '30-40 min', notes: 'Replaces the former Fromagerie Lemaire stop. A compact riverside stone fort with washrooms, open lawn and picnic space beside the Richelieu River. The grounds, riverside walk and washrooms are the plan and cost nothing; the fort interior/exhibits typically open at 10:00 (verify 2026 hours that morning) and are worth adding only if you are comfortably ahead — otherwise the interior would push the whole afternoon late. Leave by about 09:55 to reach Scores for the 11:00 opening.', food: 'Washrooms and picnic tables on site; pack light snacks. The proper lunch is Scores Boucherville at 11:00.', kidPlan: 'Open ramparts, cannons and riverside lawn to run before the long afternoon drive.', mapUrl: mapSearchUrl('Fort Chambly National Historic Site, 2 Richelieu Street, Chambly, QC J3L 2B9'), sourceUrl: 'https://parks.canada.ca/lhn-nhs/qc/fortchambly/visit/directions', coords: [45.44862, -73.27591] }),
          customStop({ id: 'd8-restaurant-lunch', dayId: '2026-08-21', time: '11:00–11:50', zone: 'ET', title: 'Proper lunch: Scores Restaurant Boucherville', locationName: 'Scores Restaurant Boucherville', kind: 'Lunch / seated restaurant', priority: 'required', address: '1200 Rue Volta, Boucherville, QC J4B 7A2', city: 'Boucherville, QC', leg: 'About 25 km / 25–30 min from Fort Chambly', timeBudget: '45-50 min', notes: 'The dining room opens at 11:00 Friday and is just off the South Shore route. Sit down for a real lunch and leave by 11:50 before the Ontario push. This replaces the park/cooler plan entirely.', food: 'Rotisserie chicken, ribs, lunch menu and salad bar in the dining room.', kidPlan: 'Bathroom and a seated reset before the longest afternoon block.', mapUrl: mapSearchUrl('Scores Restaurant Boucherville, 1200 Rue Volta, Boucherville, QC J4B 7A2'), sourceUrl: 'https://www.scores.ca/en/restaurants/boucherville/' }),
          sourceStop('2026-08-21', 'ONroute Mallorytown', { id: 'd8-mallory', time: '14:00 fatigue checkpoint', zone: 'ET', title: 'ONroute Mallorytown North — westbound fatigue checkpoint', locationName: 'ONroute Mallorytown North — westbound service centre', address: '678 Highway 401 Westbound, Mallorytown, ON K0E 1R0', city: 'Mallorytown, ON', kind: 'Rest / fuel / fatigue decision', priority: 'required', leg: 'About 190 km / 2 h plus Montréal-area traffic from Boucherville', timeBudget: '35-45 min', notes: 'This is the correct westbound plaza, open 24/7. Walk, snack and honestly assess both drivers and the child. Use Canadian Tire Gas+ if 91 is available and the car is at the trigger; verify premium availability before travel. If anyone is struggling, take a longer rest and swap drivers here before continuing.', food: 'Snack/coffee only—the proper lunch was at Scores in Boucherville.', kidPlan: 'Pet area/seasonal picnic tables and a real out-of-car reset.', mapUrl: mapSearchUrl('ONroute Mallorytown North, 678 Highway 401 Westbound, Mallorytown, ON K0E 1R0'), sourceUrl: 'https://www.onroute.ca/locations/mallorytown-north' }),
          customStop({ id: 'd8-big-apple', dayId: '2026-08-21', time: '17:15–17:40 if continuing', zone: 'ET', title: 'The Big Apple final movement stop', locationName: 'The Big Apple', parkingName: 'The Big Apple visitor parking', parkingAddress: '262 Orchard Rd, Colborne, ON K0K 1S0', kind: 'Attraction / snack', priority: 'optional', skipAt: 30, saves: '20 min', address: '262 Orchard Rd, Colborne, ON K0K 1S0', city: 'Colborne, ON', leg: 'About 250 km / 2 h 30 from Mallorytown North; about 130 km / 1 h 25 plus GTA traffic to Vaughan', timeBudget: '20-25 min', notes: 'Use this as the final movement/washroom break only if continuing safely. If it is closed or everyone wants the shortest safe route, use the next westbound service instead.', food: 'Pie/snack/washroom stop.', kidPlan: 'One last stretch before the GTA.', mapUrl: mapSearchUrl('The Big Apple visitor parking, 262 Orchard Rd, Colborne, ON K0K 1S0'), sourceUrl: 'https://thebigapple.ca/' }),
          customStop({ id: 'd8-home', dayId: '2026-08-21', time: '20:00–21:00+ realistic', zone: 'ET', title: 'Arrive Vaughan', kind: 'Finish', priority: 'required', address: 'Vaughan, ON', city: 'Vaughan, ON', notes: 'Friday Montréal/GTA traffic can push this later. Stopping to rest when tired is a successful safety decision, not a failed schedule.', mapUrl: mapSearchUrl('Vaughan, ON') })
        ],
        meals: [
          mealSlot({ id: 'd8-breakfast', meal: 'Breakfast', title: 'DoubleTree hotel breakfast if confirmed early enough', selectedStopId: 'd8-depart', backup: 'Hotel takeaway or packed breakfast is the long-drive safety exception.' }),
          mealSlot({ id: 'd8-morning', meal: 'Morning food', title: 'Packed snacks at Fort Chambly', selectedStopId: 'd8-chambly', backup: 'Grab-and-go near the fort, or Fromagerie Lemaire curds if you stop there.' }),
          mealSlot({ id: 'd8-lunch', meal: 'Lunch', title: 'Scores Restaurant Boucherville', selectedStopId: 'd8-restaurant-lunch', backup: 'La Cage Boucherville — named sit-down fallback, open from 11:00 Friday.' }),
          mealSlot({ id: 'd8-dinner', meal: 'Dinner', title: 'Light dinner at home after the final drive', selectedStopId: 'd8-home', backup: 'Simple delivery or a quick stop en route if arriving very late.', conditional: true })
        ]
      })
    ]
  };

  var hotelPlanRules = {
    '2026-08-14': { arrival: '15:30–16:30 · room from 16:00', rule: 'Reach the Marriott after the proper Brockville lunch, park once, and walk to dinner.' },
    '2026-08-15': { arrival: '15:30 buffer · room from 16:00', rule: 'Secure the Cofortel room before the Old Québec outing; return here after dinner.' },
    '2026-08-16': { arrival: '17:50–18:15', rule: 'Finish at Delta, register the car, and have a seated dinner at STMR.36.' },
    '2026-08-17': { arrival: '15:15 request · room from 16:00', rule: 'Check in at Hampton before New Glasgow dinner, then return directly for sleep.' },
    '2026-08-18': { arrival: '16:25–17:00 · room from 15:00', rule: 'This is the hotel-switch day: confirm the luggage handoff before leaving Charlottetown.' },
    '2026-08-19': { arrival: '15:30 buffer · room from 16:00', rule: 'The Hopewell tide controls the day; Best Western is the recovery stop before dinner.' },
    '2026-08-20': { arrival: '16:30–17:15', rule: 'The repeated Kamouraska stop is removed, creating a recovery buffer before the seated Le Dijon dinner.' },
    '2026-08-21': { arrival: '20:00–21:00+ (later if you add rest breaks)', rule: 'At Mallorytown, make an honest go/rest call based on fatigue—not the clock. Rest and swap drivers rather than pushing through.' }
  };

  var hotelShortNames = {
    '2026-08-14': 'Marriott Montréal',
    '2026-08-15': 'Hôtel Cofortel',
    '2026-08-16': 'Delta Fredericton',
    '2026-08-17': 'Hampton Charlottetown',
    '2026-08-18': 'Canadas Best Value Inn',
    '2026-08-19': 'Best Western Moncton',
    '2026-08-20': 'DoubleTree Québec',
    '2026-08-21': 'Home'
  };

  var mealContracts = {
    '2026-08-14': {
      breakfast: { style: 'Departure breakfast', title: 'Breakfast before leaving Vaughan', detail: 'Aug 14 starts from home before the first hotel night; all following breakfasts are at the hotel.', backup: 'Leave 15 minutes later rather than skipping breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Tata’s House of Pizza & Pasta', detail: '11:40–12:35 · the day’s full seated restaurant meal.', backup: 'Boston Pizza Brockville.' },
      dinner: { style: 'Light meal', title: 'Time Out Market Montréal', detail: '17:45–18:15 · one simple vendor meal, then walk back.', backup: 'One light plate at Lloyd inside the Marriott.' }
    },
    '2026-08-15': {
      breakfast: { style: 'Hotel breakfast', title: 'Lloyd at the Marriott', detail: '06:30–07:10 · eat at the hotel before checkout.', backup: 'Use the hotel’s quickest breakfast option and shift departure if needed.' },
      lunch: { style: 'Substantial dine', title: 'Restaurant-terrasse du Manoir', detail: '12:45 · the day’s full seated restaurant meal at Montmorency.', backup: 'Cochon Dingue Beauport.' },
      dinner: { style: 'Light meal', title: 'La Bûche', detail: '18:15 · share a starter and one main; keep the Old Québec dinner intentionally small.', backup: 'A light order at Cochon Dingue Champlain.' }
    },
    '2026-08-16': {
      breakfast: { style: 'Hotel breakfast', title: 'Hôtel Cofortel breakfast', detail: '06:15–06:40 · included hotel breakfast before departure.', backup: 'If service is disrupted, ask the hotel for its available breakfast option.' },
      lunch: { style: 'Substantial dine', title: 'L’Estaminet', detail: '10:15–11:00 · early proper lunch and the day’s full restaurant meal.', backup: 'A full lunch at St-Hubert Rivière-du-Loup.' },
      dinner: { style: 'Light meal', title: 'STMR.36 at Delta', detail: '18:45 · one small BBQ plate or shareable bites on site.', backup: 'A light order at the Delta lobby bar or Drift if open.' }
    },
    '2026-08-17': {
      breakfast: { style: 'Hotel breakfast', title: 'Delta hotel breakfast', detail: '06:30–07:20 at STMR.36 or Grove before checkout.', backup: 'Use Grove’s quickest hotel breakfast and shift departure if needed.' },
      lunch: { style: 'Light meal', title: 'Tony’s Bistro', detail: '10:40–11:25 · soup, sandwich or one savoury bakery plate.', backup: 'A simple Moncton café lunch.' },
      dinner: { style: 'Substantial dine', title: 'New Glasgow Lobster Suppers', detail: '16:50 walk-in · the day’s full restaurant experience.', backup: 'Lobster on the Wharf in Charlottetown.' }
    },
    '2026-08-18': {
      breakfast: { style: 'Hotel breakfast', title: 'Hampton hot breakfast', detail: 'Eat the included hotel breakfast before checkout.', backup: 'Shift the morning departure to the confirmed breakfast opening.' },
      lunch: { style: 'Light meal', title: 'Blue Mussel Café', detail: '11:30 · chowder or shared mussels plus a simple child plate.', backup: 'A light order at Fisherman’s Wharf.' },
      dinner: { style: 'Substantial dine', title: 'Slaymaker & Nichols', detail: '18:30 reservation · the day’s full restaurant meal.', backup: 'Lobster on the Wharf.' }
    },
    '2026-08-19': {
      breakfast: { style: 'Hotel breakfast', title: 'Canadas Best Value Inn breakfast', detail: 'Use the included hot hotel breakfast before the tide drive.', backup: 'Confirm an early service time with the hotel; keep the meal concise.' },
      lunch: { style: 'Substantial dine', title: 'High Tide Restaurant', detail: '13:30 · the day’s full restaurant meal after the ocean-floor walk.', backup: 'Gusto Italian Grill & Bar in Moncton.' },
      dinner: { style: 'Light meal', title: 'Tide & Boar', detail: '18:00 · soup, salad or one shared appetizer with a child plate.', backup: 'A light order at Gusto Italian Grill & Bar.' }
    },
    '2026-08-20': {
      breakfast: { style: 'Hotel breakfast', title: 'Best Western full breakfast', detail: 'Eat the included hotel breakfast, then leave around 07:15.', backup: 'Confirm opening at check-in and shift departure to finish breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Frank’s Bar & Grill', detail: '12:45–13:40 · the day’s full restaurant meal and driver reset.', backup: 'Boston Pizza Edmundston.' },
      dinner: { style: 'Light meal', title: 'Le Dijon at DoubleTree', detail: '19:00 · soup, salad or the lightest current plate on site.', backup: 'A light plate at Normandin Charlesbourg.' }
    },
    '2026-08-21': {
      breakfast: { style: 'Hotel breakfast', title: 'DoubleTree hotel breakfast', detail: 'Eat at Le Dijon, then target a 07:15 departure.', backup: 'Confirm opening the night before and shift departure to finish breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Scores Restaurant Boucherville', detail: '11:30–12:20 · the day’s full seated restaurant meal.', backup: 'La Cage Boucherville.' },
      dinner: { style: 'Light meal', title: 'Light dinner after the final drive', detail: 'A simple meal at home, or a light order en route if arriving very late.', backup: 'Grab a quick bite at a westbound service stop if needed.' }
    }
  };

  var mealFlexByDay = {
    '2026-08-14': {
      rule: 'Call ahead and use this only if Boboli can have the order ready within 30 minutes. It replaces Tata’s lunch; the seated lunch remains Plan A.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Boboli',
        foodAddress: '32 King Street West, Brockville, ON K6V 3P6',
        order: 'Fresh sandwich or soup, prepared and eaten at the café.',
        window: '25–35 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Boboli, 32 King Street West, Brockville, ON K6V 3P6'),
        foodSource: 'https://brockvilletourism.com/directory/boboli/',
        experience: 'Brockville Railway Tunnel — south portal',
        experienceDetail: 'Walk 20–30 minutes inside the free, stroller-friendly tunnel. Public washrooms are on nearby Blockhouse Island, not inside the tunnel.',
        parking: 'Blockhouse Island / Water Street public parking, 1 Water Street, Brockville, ON',
        experienceMap: mapSearchUrl('Brockville Railway Tunnel south portal parking, 1 Water Street, Brockville, ON'),
        experienceSource: 'https://brockvilletourism.com/things-to-do/brockville-railway-tunnel/'
      }]
    },
    '2026-08-15': {
      rule: 'Use the shortcut at Montmorency, then add the funicular only after the Cofortel room and luggage are secure.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Station Sandwicherie at La Manufacture',
        foodAddress: '5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1',
        order: 'Fresh sandwich, bakery item and drink at the falls; eat on site.',
        window: '25–35 min',
        saved: 'Estimated 25–35 min saved',
        foodMap: mapSearchUrl('Station Sandwicherie La Manufacture, 5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1'),
        foodSource: 'https://www.sepaq.com/destinations/parc-chute-montmorency/quoi-faire/restaurants-repas.dot?language_id=1',
        experience: 'Old Québec Funicular + Petit-Champlain',
        experienceDetail: 'Add one funicular ride and a short lower-town look, about 25–35 minutes total. Verify the posted fare and operating status that day.',
        parking: 'Stationnement De Beaucours garage, 39 Rue Saint-Louis, Québec, QC G1R 3Z2',
        experienceMap: mapSearchUrl('Stationnement De Beaucours, 39 Rue Saint-Louis, Québec, QC G1R 3Z2'),
        experienceSource: 'https://www.funiculaire.ca/'
      }]
    },
    '2026-08-16': {
      rule: 'This is a high-driving day. A simpler dinner protects recovery; the separate on-route garden option is allowed only when its strict ETA gate passes.',
      options: [{
        meal: 'Dinner shortcut',
        foodName: 'Drift Pool + Patio at Delta Fredericton',
        foodAddress: '225 Woodstock Road, Fredericton, NB E3B 2H8',
        order: 'Choose a simple poolside plate; if the patio is weather-closed, make a quick light order in STMR.36.',
        window: '35–45 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Delta Hotels Fredericton, 225 Woodstock Road, Fredericton, NB E3B 2H8'),
        foodSource: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/dining/',
        experience: 'Delta indoor pool + early bedtime',
        experienceDetail: 'Use the saved time for a short swim or immediate sleep. Do not add any off-site sightseeing.',
        parking: 'Delta Hotels Fredericton registered guest parking, 225 Woodstock Road, Fredericton, NB E3B 2H8',
        experienceMap: mapSearchUrl('Delta Hotels Fredericton, 225 Woodstock Road, Fredericton, NB E3B 2H8'),
        experienceSource: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/overview/'
      }]
    },
    '2026-08-17': {
      rule: 'Choose this instead of New Glasgow Lobster Suppers, not in addition to it. Keep the food-hall arrival before its 19:00 close.',
      options: [{
        meal: 'Dinner shortcut',
        foodName: 'Founders Food Hall & Market',
        foodAddress: '6 Prince Street, Charlottetown, PE C1A 4P5',
        order: 'Let each person choose one simple vendor meal; sit inside and leave dessert for later.',
        window: '35–45 min',
        saved: 'Estimated 45–70 min plus less rural driving',
        foodMap: mapSearchUrl('Founders Food Hall & Market, 6 Prince Street, Charlottetown, PE C1A 4P5'),
        foodSource: 'https://foundersfoodhall.com/visit-us/hours/',
        experience: 'Victoria Park playground + harbour boardwalk',
        experienceDetail: 'Use 30–40 minutes for the accessible playground and a short waterfront walk, then return to Hampton.',
        parking: 'Victoria Park playground / pool parking, 51 Victoria Park Roadway, Charlottetown, PE',
        experienceMap: mapSearchUrl('Victoria Park playground parking, 51 Victoria Park Roadway, Charlottetown, PE'),
        experienceSource: 'https://www.charlottetown.ca/leisure___recreation/parks_and_trails/parks_and_playgrounds'
      }]
    },
    '2026-08-18': {
      rule: 'This replaces Blue Mussel lunch. Use the saved time inside Avonlea or at the beach; do not add another distant PEI stop.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Avonlea Village eateries',
        foodAddress: '8779 Route 6, Cavendish, PE C0A 1N0',
        order: 'Choose one quick-service lunch from the on-site eateries; everyone can choose separately.',
        window: '30–40 min',
        saved: 'Estimated 35–50 min saved',
        foodMap: mapSearchUrl('Avonlea Village, 8779 Route 6, Cavendish, PE C0A 1N0'),
        foodSource: 'https://avonlea.ca/info/',
        experience: 'Avonlea Village historic buildings and shops',
        experienceDetail: 'Admission is free. Spend 30–40 minutes exploring the village after lunch, or transfer that time to Cavendish Beach.',
        parking: 'Avonlea Village on-site visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0',
        experienceMap: mapSearchUrl('Avonlea Village visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0'),
        experienceSource: 'https://avonlea.ca/'
      }]
    },
    '2026-08-19': {
      rule: 'Use this only after the ocean-floor walk. The saved time makes Magnetic Hill possible, but it replaces the hotel pool block.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Low Tide Café at Hopewell Rocks',
        foodAddress: '131 Discovery Road, Hopewell Cape, NB E4H 4Z5',
        order: 'Use the staffed barbecue for a simple hot lunch; if the weather-dependent barbecue is closed, keep High Tide Restaurant. Snacks and ice cream alone are not lunch.',
        window: '25–35 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Low Tide Cafe, Hopewell Rocks, 131 Discovery Road, Hopewell Cape, NB E4H 4Z5'),
        foodSource: 'https://www.thehopewellrocks.ca/en/parks/33/hopewell-rocks-provincial-park/entities',
        experience: 'Magnetic Hill Illusion',
        experienceDetail: 'Allow 30–40 minutes and confirm staffed access. Choose Magnetic Hill or the Best Western pool—never both before dinner.',
        parking: 'Magnetic Hill Illusion entrance / visitor parking, 2846 Mountain Road, Moncton, NB E1G 2W7',
        experienceMap: mapSearchUrl('Magnetic Hill Illusion entrance, 2846 Mountain Road, Moncton, NB E1G 2W7'),
        experienceSource: 'https://www.moncton.ca/en/magnetic-hill-illusion'
      }]
    },
    '2026-08-20': {
      rule: 'This is the longest drive. The shortcut protects the DoubleTree recovery block; use the separate park option only as a short movement-break swap when its strict ETA gate passes.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'St-Hubert Express Edmundston',
        foodAddress: '10 Mahsus Court, Edmundston, NB E7C 0B6',
        order: 'Counter-service rotisserie chicken, wrap, sandwich or child meal; eat inside and use the washroom.',
        window: '30–35 min',
        saved: 'Estimated 20–25 min saved',
        foodMap: mapSearchUrl('St-Hubert Express, 10 Mahsus Court, Edmundston, NB E7C 0B6'),
        foodSource: 'https://www.st-hubert.com/en/restaurants/nb/edmundston/10-mahsus-court',
        experience: 'DoubleTree pool / quiet room recovery',
        experienceDetail: 'Default to the planned 16:30–17:15 recovery period. The separate République park option replaces a movement break; do not add Grand Falls or Old Québec.',
        parking: 'DoubleTree guest parking, 7900 Rue du Marigot, Québec City, QC G1G 6T8',
        experienceMap: mapSearchUrl('DoubleTree Quebec Resort, 7900 Rue du Marigot, Québec City, QC G1G 6T8'),
        experienceSource: 'https://www.hilton.com/en/hotels/yqbqcdt-doubletree-quebec-resort/'
      }]
    },
    '2026-08-21': {
      rule: 'Use this only if everyone is comfortable with an early substantial meal. The saved time supports the safety plan and final movement stop.',
      options: [{
        meal: 'Early lunch shortcut',
        foodName: 'Fromagerie Lemaire — Saint-Cyrille',
        foodAddress: '2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9',
        order: 'Share a poutine and add a chicken sandwich or children’s plate; eat inside, then skip Scores Boucherville.',
        window: '30–35 min at about 09:15',
        saved: 'Estimated 35–50 min saved',
        foodMap: mapSearchUrl('Fromagerie Lemaire, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9'),
        foodSource: 'https://www.fromagerie-lemaire.ca/menu-restaurant-fromagerie-lemaire/',
        experience: 'The Big Apple final movement stop',
        experienceDetail: 'Keep the existing 20–25 minute play-and-washroom stop only if both drivers remain safe and rested.',
        parking: 'The Big Apple visitor parking, 262 Orchard Road, Colborne, ON K0K 1S0',
        experienceMap: mapSearchUrl('The Big Apple visitor parking, 262 Orchard Road, Colborne, ON K0K 1S0'),
        experienceSource: 'https://thebigapple.ca/'
      }]
    }
  };

  var routeOptionsByDay = {
    '2026-08-14': {
      rule: 'Several ideas along the 401, but choose at most one. Check live traffic first; the booked Montreal hotel and proper meals stay protected.',
      options: [{
        name: 'Lake Ontario Park',
        routePoint: 'Between ONroute Odessa and Brockville lunch',
        why: 'A high-quality child reset with an accessible waterfront walk, playground, splash pad and seasonal public washrooms.',
        visit: '35-45 min',
        routeImpact: 'Planning estimate: +20-30 min driving; verify in live Maps.',
        gate: 'Go only if the live Montreal hotel ETA remains 16:45 or earlier. Replace another stretch break; do not stack stops.',
        parking: 'Lake Ontario Park visitor parking, 920 King Street West, Kingston, ON',
        map: mapSearchUrl('Lake Ontario Park visitor parking, 920 King Street West, Kingston, ON'),
        source: 'https://www.cityofkingston.ca/activities-and-recreation/parks-trails-and-sports-fields-and-courts/parks/',
        coords: [44.22011, -76.53036]
      }, {
        name: 'Fort Henry National Historic Site',
        routePoint: 'At Kingston, near the Odessa service break',
        why: 'A restored 19th-century British fortress above the St. Lawrence with open ramparts and summer living-history demonstrations kids enjoy.',
        visit: '60-90 min',
        routeImpact: 'Planning estimate: +20-30 min off the 401 at Kingston plus the visit; paid admission. Verify live Maps.',
        gate: 'Use only as the single optional stop of the day, when both drivers are fresh and the Montreal ETA stays 16:30 or earlier. Then skip The Big Apple.',
        parking: 'Fort Henry visitor parking, 1 Fort Henry Drive, Kingston, ON K7K 5G8',
        map: mapSearchUrl('Fort Henry, 1 Fort Henry Drive, Kingston, ON K7K 5G8'),
        source: 'https://www.forthenry.com/',
        coords: [44.23088, -76.45902]
      }, {
        name: 'Kingston Penitentiary Tour',
        routePoint: 'At Kingston, near the Odessa service break',
        why: 'Guided tour of the former maximum-security prison (1835–2013): cell ranges, the main dome, the segregation wing and the yard—a major Kingston attraction right on the Highway 401 corridor.',
        visit: '1.5 h tour',
        routeImpact: 'Planning estimate: +20-30 min off the 401 at Kingston plus the timed 90-minute tour; paid admission, book ahead. Verify live Maps.',
        gate: 'A long, timed stop: use only as the single optional stop of the day, when both drivers are fresh, tickets are pre-booked and the Montreal ETA still holds. It likely pushes the Marriott arrival into the evening, so skip The Big Apple and Prehistoric World if you choose it.',
        parking: 'Kingston Penitentiary, 560 King Street West, Kingston, ON K7L 4V7 · free onsite parking',
        map: mapSearchUrl('Kingston Penitentiary, 560 King Street West, Kingston, ON K7L 4V7'),
        source: 'https://www.kingstonpentours.com/',
        coords: [44.2194, -76.5136]
      }, {
        name: 'Brockville Railway Tunnel',
        routePoint: 'At the Brockville lunch stop, on the St. Lawrence waterfront',
        why: 'Canada’s first railway tunnel, now a free, flat, lit walk under downtown Brockville with a light-and-sound display—an easy, memorable leg-stretch beside lunch.',
        visit: '30-45 min',
        routeImpact: 'Negligible—it is beside the Brockville lunch; verify parking in live Maps.',
        gate: 'Use instead of a longer lunch or another stretch break, only if the live Montreal ETA stays 16:45 or earlier.',
        parking: 'Blockhouse Island / railway tunnel south portal parking, Blockhouse Island Parkway, Brockville, ON',
        map: mapSearchUrl('Brockville Railway Tunnel, Blockhouse Island Parkway, Brockville, ON'),
        source: 'https://brockvilletourism.com/',
        coords: [44.59141, -75.68403]
      }, {
        name: 'Mount Royal — Kondiaronk Belvedere',
        routePoint: 'In Montréal, an optional evening add-on after hotel check-in',
        why: 'The classic downtown-skyline lookout above the city — an easy, free evening view if there is energy left after the Montréal check-in.',
        visit: '20-30 min',
        routeImpact: 'Evening city driving only; free chalet lookout with parking off Chemin Remembrance.',
        gate: 'Use only as a short after-check-in outing when the child is not overtired; skip it and rest if the day ran long.',
        parking: 'Maison Smith / Mount Royal lot, 1260 Chemin Remembrance, Montréal, QC H3H 1A2',
        map: mapSearchUrl('Belvedere Kondiaronk Mount Royal, 1260 Chemin Remembrance, Montreal, QC'),
        source: 'https://www.lemontroyal.qc.ca/en',
        coords: [45.50442, -73.58730]
      }]
    },
    '2026-08-15': {
      rule: 'A few easy ideas around Québec City—pick at most one. Keep Montmorency Falls, the La Bûche dinner and the 16:00 hotel access protected.',
      options: [{
        name: 'Trois-Rivieres Harbourfront Park',
        routePoint: 'At the Trois-Rivieres break, before Montmorency Falls',
        why: 'A short three-level St. Lawrence waterfront walk with harbour and Laviolette Bridge views; better than waiting beside the highway.',
        visit: '25-35 min',
        routeImpact: 'Planning estimate: +15-25 min city driving; verify in live Maps.',
        gate: 'Leave the harbourfront by 10:30. Skip immediately if Montreal traffic has already used the timing buffer.',
        parking: 'Parc portuaire / tourist information visitor parking, 1400 Rue du Fleuve, Trois-Rivieres, QC',
        map: mapSearchUrl('Parc portuaire tourist information parking, 1400 Rue du Fleuve, Trois-Rivieres, QC'),
        source: 'https://www.tourismetroisrivieres.com/en/what-to-do/harbourfront-park',
        coords: [46.34251, -72.53632]
      }, {
        name: 'Plains of Abraham (Battlefields Park)',
        routePoint: 'In Québec City, beside Old Québec',
        why: 'A large, free clifftop parkland with wide lawns, walking paths and river views—an easy, low-cost alternative to a crowded Old Québec walk.',
        visit: '30-60 min',
        routeImpact: 'Minimal within Québec City; free grounds, the museum is optional and paid.',
        gate: 'Use instead of, or right after, the Dufferin Terrace walk. Keep the La Bûche dinner and the 16:00 Cofortel access protected.',
        parking: 'Plains of Abraham / Discovery Pavilion parking, 835 Avenue Wilfrid-Laurier, Québec, QC G1R 2L3',
        map: mapSearchUrl('Plains of Abraham Discovery Pavilion, 835 Avenue Wilfrid-Laurier, Quebec, QC'),
        source: 'https://www.theplainsofabraham.ca/',
        coords: [46.79766, -71.22883]
      }, {
        name: 'Basilica of Sainte-Anne-de-Beaupré',
        routePoint: 'Just past Montmorency Falls on Boulevard Sainte-Anne',
        why: 'A grand, free-to-enter basilica with striking mosaics and stained glass, a short drive beyond Montmorency along the same shoreline road.',
        visit: '30-45 min',
        routeImpact: 'Planning estimate: +30-40 min return past Montmorency (it is a short backtrack); verify live Maps.',
        gate: 'Use only if Montmorency and lunch finish early and everyone has energy. Turn back if it would squeeze the Old Québec afternoon or the 18:15 dinner.',
        parking: 'Sanctuaire Sainte-Anne-de-Beaupré visitor parking, 10018 Avenue Royale, Sainte-Anne-de-Beaupré, QC G0A 3C0',
        map: mapSearchUrl('Sanctuaire Sainte-Anne-de-Beaupre, 10018 Avenue Royale, Sainte-Anne-de-Beaupre, QC'),
        source: 'https://sanctuairesainteanne.org/',
        coords: [47.02408, -70.92832]
      }, {
        name: 'Québec bridges riverside viewpoint (Anse au Foulon)',
        routePoint: 'On the Sillery riverfront in Québec City, below the cliffs',
        why: 'A quiet St. Lawrence riverside spot with views of the Québec and Pierre-Laporte bridges — an easy leg-stretch and photo stop.',
        visit: '15-25 min',
        routeImpact: 'Planning estimate: +15-20 min from Old Québec; verify parking in live Maps.',
        gate: 'Use only if Montmorency, Old Québec and dinner timing all hold; skip it to protect the 16:00 Cofortel access if the day is tight.',
        parking: 'Anse au Foulon riverside parking, 2793 Chemin du Foulon, Québec, QC G1W 2G6',
        map: mapSearchUrl('2793 Chemin du Foulon, Quebec City, QC G1W 2G6'),
        coords: [46.76661, -71.28460]
      }]
    },
    '2026-08-16': {
      rule: 'High-driving day: choose at most one, and only as a deliberate swap for Hartland and every other optional stop. Never an add-on.',
      options: [{
        name: 'New Brunswick Botanical Garden',
        routePoint: 'At Edmundston, before the Hartland corridor',
        why: 'A peaceful, family-friendly garden break with themed landscapes; the August 2026 schedule lists daily hours through 20:00.',
        visit: '60-75 min',
        routeImpact: 'Near the route; allow the full visit time plus parking. Paid admission.',
        gate: 'Use only if Kamouraska ran on time, both drivers feel fresh and live Fredericton hotel ETA remains 18:00 or earlier. Then skip Hartland.',
        parking: 'New Brunswick Botanical Garden main visitor parking, 15 Isidore-Boucher Boulevard, Edmundston, NB E7B 1V6',
        map: mapSearchUrl('New Brunswick Botanical Garden main parking, 15 Isidore-Boucher Boulevard, Edmundston, NB E7B 1V6'),
        source: 'https://jardinnbgarden.com/en/opening-hours/',
        coords: [47.43951, -68.39269]
      }, {
        name: 'Parc des Chutes de Rivière-du-Loup',
        routePoint: 'In Rivière-du-Loup, beside the lunch stop',
        why: 'A 33 m waterfall with a footbridge, shaded trails and lookouts right in town—an easy, free leg-stretch beside the Rivière-du-Loup lunch.',
        visit: '30-45 min',
        routeImpact: 'Negligible—it is in Rivière-du-Loup at the lunch stop; verify parking in live Maps.',
        gate: 'Use as a short walk after lunch, only if Kamouraska ran on time and the live Fredericton hotel ETA stays 18:00 or earlier. Then skip Hartland.',
        parking: 'Parc des Chutes visitor parking, Rue Frontenac, Rivière-du-Loup, QC',
        map: mapSearchUrl('Parc des Chutes, Rue Frontenac, Riviere-du-Loup, QC'),
        coords: [47.83344, -69.52898]
      }, {
        name: 'World’s Largest Axe',
        routePoint: 'At Nackawic, NB, a short detour off the TransCanada',
        why: 'A giant riverside roadside monument with a small park and washrooms — a fun, free child stretch and photo.',
        visit: '15 min',
        routeImpact: 'Planning estimate: +10-15 min off the route into Nackawic; verify live Maps.',
        gate: 'Use only as the day’s single quick stretch if on time; otherwise keep driving toward Fredericton.',
        parking: 'World’s Largest Axe parking, 152 Otis Drive, Nackawic, NB E6G 1H2',
        map: mapSearchUrl('Worlds Largest Axe, 152 Otis Drive, Nackawic, NB E6G 1H2'),
        coords: [45.99619, -67.24160]
      }, {
        name: 'New Brunswick Military History Museum',
        routePoint: 'At Oromocto (Base Gagetown), just before Fredericton',
        why: 'A large military-history collection with vehicles and exhibits near the end of the drive — a good indoor option for a rainy or hot afternoon.',
        visit: '45-60 min',
        routeImpact: 'Planning estimate: +15-20 min off the route at Oromocto; verify 2026 hours and base-access rules.',
        gate: 'Use instead of every other option, only if the drive is on time and the child wants an indoor stop. Confirm hours before detouring.',
        parking: 'NB Military History Museum parking, 119 Walnut Street, Oromocto, NB E2V 4J5',
        map: mapSearchUrl('New Brunswick Military History Museum, 119 Walnut Street, Oromocto, NB E2V 4J5'),
        source: 'https://www.nbmilitaryhistorymuseum.ca/',
        coords: [45.83843, -66.44290]
      }]
    },
    '2026-08-17': {
      rule: 'A few Moncton ideas, but pick at most one—Bore Park, Magnetic Hill or the Zoo, never a stack. The tide and hotel clock, not spare time, decide.',
      options: [{
        name: 'Bore Park tidal bore viewpoint',
        routePoint: 'In Moncton, before Cape Jourimain and PEI',
        why: 'A quick view of the Petitcodiac tidal wave; summer interpretive presentations are timed to the predicted bore.',
        visit: '25-35 min',
        routeImpact: 'Planning estimate: +15-25 min downtown driving; verify in live Maps.',
        gate: 'Go only when the official predicted wave is within 20 minutes of arrival. Replace Magnetic Hill and leave immediately after the wave.',
        parking: 'Treitz Haus / Bore Park visitor parking, 10 Bendview Court, Moncton, NB',
        map: mapSearchUrl('Treitz Haus Bore Park visitor parking, 10 Bendview Court, Moncton, NB'),
        source: 'https://www.resurgo.ca/learn-discover/tidal-bore-presentations',
        coords: [46.08969, -64.77066]
      }, {
        name: 'Magnetic Hill Zoo',
        routePoint: 'In Moncton, beside the Magnetic Hill area',
        why: 'The Maritimes’ largest zoo—a genuine kid highlight with shaded paths, if you want more than the quick Magnetic Hill illusion stop.',
        visit: '90-120 min',
        routeImpact: 'Planning estimate: +10-15 min from Magnetic Hill plus a longer visit; paid admission. Verify live Maps.',
        gate: 'Use instead of Cape Jourimain and every other optional stop, only if lunch was quick and the Charlottetown hotel ETA stays 17:00 or earlier.',
        parking: 'Magnetic Hill Zoo visitor parking, 125 Magic Mountain Road, Moncton, NB E1G 2W7',
        map: mapSearchUrl('Magnetic Hill Zoo, 125 Magic Mountain Road, Moncton, NB E1G 2W7'),
        source: 'https://magnetichillzoo.ca/',
        coords: [46.13808, -64.88466]
      }, {
        name: 'Giant Lobster (Shediac)',
        routePoint: 'At Shediac, NB, just off Route 15 before the bridge',
        why: 'The famous “World’s Largest Lobster” monument with a small park — a fun, free two-minute photo stop for the kids.',
        visit: '10-15 min',
        routeImpact: 'Planning estimate: +10-15 min into Shediac; verify live Maps.',
        gate: 'Use as a fast photo stretch only; keep the Confederation Bridge crossing and 15:15 Hampton ETA protected.',
        parking: 'Rotary Park / Giant Lobster parking, 229 Main Street, Shediac, NB E4P 2A5',
        map: mapSearchUrl('Giant Lobster, 229 Main Street, Shediac, NB E4P 2A5'),
        coords: [46.21930, -64.54030]
      }, {
        name: 'Port Borden Range Rear Lighthouse',
        routePoint: 'At Borden-Carleton, just after the bridge onto PEI',
        why: 'A tall red-and-white range lighthouse beside Gateway Village — an easy first-photo-on-the-island stop.',
        visit: '10-15 min',
        routeImpact: 'Negligible — right beside the bridge exit at Gateway Village; verify parking in live Maps.',
        gate: 'Use as a quick photo/washroom stretch at Gateway Village only if the Hampton ETA holds.',
        parking: 'Gateway Village visitor parking, Borden-Carleton, PE C0B 1X0',
        map: mapSearchUrl('Port Borden Range Rear Lighthouse, Borden-Carleton, PE'),
        coords: [46.24970, -63.70530]
      }, {
        name: 'Victoria Seaport Lighthouse Museum',
        routePoint: 'At Victoria-by-the-Sea, a short detour off Route 1',
        why: 'A tiny historic fishing village with a small lighthouse museum, chocolate shop and wharf — a charming, low-key seaside stretch.',
        visit: '30-45 min',
        routeImpact: 'Planning estimate: +15-20 min off Route 1 to Victoria; verify 2026 hours and live Maps.',
        gate: 'Use instead of another stop, only if the drive is on time for the 15:15 Hampton ETA.',
        parking: 'Victoria-by-the-Sea wharf parking, Victoria, PE C0A 2G0',
        map: mapSearchUrl('Victoria Seaport Lighthouse Museum, Victoria, PE'),
        coords: [46.21580, -63.48970]
      }, {
        name: 'Prince Edward Battery (Victoria Park)',
        routePoint: 'In Charlottetown, an optional evening add-on near the hotel',
        why: 'Historic cannons and harbour views along Victoria Park’s waterfront boardwalk — a free, easy evening walk after Charlottetown check-in.',
        visit: '30-45 min',
        routeImpact: 'Minimal within Charlottetown; free parking. Verify live Maps.',
        gate: 'Use only as a short evening outing if there is energy after check-in; the New Glasgow dinner stays the plan.',
        parking: 'Victoria Park / Prince Edward Battery parking, 45 Victoria Park Roadway, Charlottetown, PE C1A 8T6',
        map: mapSearchUrl('Prince Edward Battery, 45 Victoria Park Roadway, Charlottetown, PE C1A 8T6'),
        coords: [46.22480, -63.13600]
      }, {
        name: 'Peake’s Wharf & Confederation Landing (Charlottetown)',
        routePoint: 'On the Charlottetown waterfront, an optional evening add-on',
        why: 'A lively boardwalk with boats, buskers, shops and treats at the harbour — an easy family evening stroll.',
        visit: '30-60 min',
        routeImpact: 'Minimal within Charlottetown; paid downtown parking at Confederation Landing.',
        gate: 'Use as a relaxed evening walk only if energy remains after the New Glasgow dinner.',
        parking: 'Confederation Landing parking, 2 Great George Street, Charlottetown, PE C1A 4K7',
        map: mapSearchUrl('Peakes Wharf Confederation Landing, 2 Great George Street, Charlottetown, PE'),
        coords: [46.23200, -63.12650]
      }]
    },
    '2026-08-18': {
      rule: 'Choose one only. These are low-stress substitutes when the beach, weather or energy level changes—not extra mileage to collect.',
      options: [{
        name: 'Gardens of Hope & Butterfly House',
        routePoint: 'Between Cavendish / North Rustico and Charlottetown',
        why: 'A compact garden and tropical butterfly experience that genuinely works for a six-year-old; the Butterfly House is listed 10:00-17:00 in season.',
        visit: '45-60 min',
        routeImpact: 'Small New Glasgow route adjustment; verify live Maps.',
        gate: 'Use when the beach is shortened by at least 45 minutes. Arrive by 16:00 and protect the hotel switch and dinner.',
        parking: 'Prince Edward Island Preserve Company main visitor parking, 2841 New Glasgow Road, New Glasgow, PE C0A 1N0',
        map: mapSearchUrl('Prince Edward Island Preserve Company visitor parking, 2841 New Glasgow Road, New Glasgow, PE C0A 1N0'),
        source: 'https://preservecompany.com/pages/hours-of-operation',
        coords: [46.40913, -63.34818]
      }, {
        name: 'Cavendish Boardwalk',
        routePoint: 'In Cavendish, beside the day\'s main activity area',
        why: 'A very easy weather-flex stop with COWS ice cream, simple shops, clean facilities, a lawn and free parking.',
        visit: '30-45 min',
        routeImpact: 'Negligible within Cavendish; no separate scenic detour.',
        gate: 'Use instead of beach time or a longer Avonlea browse. Do not combine it with the Butterfly House option.',
        parking: 'Cavendish Boardwalk free visitor parking, 9139 Cavendish Road, Cavendish, PE C0A 1N0',
        map: mapSearchUrl('Cavendish Boardwalk free parking, 9139 Cavendish Road, Cavendish, PE C0A 1N0'),
        source: 'https://cavendishboardwalk.com/',
        coords: [46.48129, -63.41107]
      }, {
        name: 'Avonlea Village',
        routePoint: 'In Cavendish, near Green Gables',
        why: 'An Anne-of-Green-Gables-themed village of shops, treats and open lawn—an easy, low-key backup if Green Gables is busy or the beach is cut short.',
        visit: '45-60 min',
        routeImpact: 'Negligible within Cavendish; free to walk the grounds.',
        gate: 'Use instead of beach time or the Butterfly House option, arriving by 16:00 so the hotel switch and Slaymaker dinner stay protected.',
        parking: 'Avonlea Village visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0',
        map: mapSearchUrl('Avonlea Village, 8779 Route 6, Cavendish, PE C0A 1N0'),
        coords: [46.48908, -63.39025]
      }, {
        name: 'Cavendish Dunelands Trail (PEI National Park)',
        routePoint: 'In Cavendish, beside the beach/park area',
        why: 'A short boardwalk-and-dune loop through the coastal dunes — an easy, scenic nature walk that pairs with beach time.',
        visit: '30-45 min',
        routeImpact: 'Negligible within the Cavendish park area; free with park access.',
        gate: 'Use as a short scenic walk in place of extra beach time; keep the hotel switch and Slaymaker dinner protected.',
        parking: 'Cavendish Dunelands Trail parking, Gulf Shore Parkway West, Cavendish, PE',
        map: mapSearchUrl('Cavendish Dunelands Trail, Gulf Shore Parkway West, Cavendish, PE'),
        source: 'https://parks.canada.ca/pn-np/pe/pei-ipe',
        coords: [46.49860, -63.40980]
      }]
    },
    '2026-08-19': {
      rule: 'Ideas along Route 114 after Hopewell, but choose at most one—only after the ocean floor and lunch are done. All are easy to skip.',
      options: [{
        name: 'Albert County Museum & RB Bennett Centre',
        routePoint: 'Immediately after Hopewell Rocks, before Hillsborough',
        why: 'Twenty-four exhibits across historic buildings make a useful family history stop without leaving the Hopewell route.',
        visit: '45-60 min',
        routeImpact: 'Very small Route 114 detour; paid admission.',
        gate: 'Leave by 15:00 and confirm live Best Western ETA no later than 16:15. Otherwise protect hotel pool time.',
        parking: 'Albert County Museum on-site visitor parking, 3940 Route 114, Hopewell Cape, NB E4H 3J8',
        map: mapSearchUrl('Albert County Museum visitor parking, 3940 Route 114, Hopewell Cape, NB E4H 3J8'),
        source: 'https://www.albertcountymuseum.com/hours-admissions-index',
        coords: [45.84892, -64.5782]
      }, {
        name: 'Steeves House Museum',
        routePoint: 'On Route 114 in Hillsborough, before Moncton',
        why: 'A smaller historic-house visit suited to a short stop; the 2026 schedule is Wednesday-Monday, 10:00-17:00.',
        visit: '30-40 min self-guided',
        routeImpact: 'Minimal route change; self-guided admission is listed for age six and up.',
        gate: 'Choose this instead of Albert County Museum and leave by 15:20. Skip if anyone prefers the hotel reset.',
        parking: 'Steeves House Museum visitor parking, 40 Mill Street, Hillsborough, NB E4H 2Z8',
        map: mapSearchUrl('Steeves House Museum visitor parking, 40 Mill Street, Hillsborough, NB E4H 2Z8'),
        source: 'https://www.steeveshousemuseum.ca/visit',
        coords: [45.92527, -64.64388]
      }, {
        name: 'Cape Enrage',
        routePoint: 'A signed detour off Route 915, south of Hopewell Rocks',
        why: 'A dramatic clifftop lighthouse with Bay of Fundy views, a beach and optional zipline—a big-payoff scenic stop for a good-weather, on-time day.',
        visit: '45-75 min',
        routeImpact: 'Planning estimate: +40-55 min round trip off Route 915; verify live Maps and 2026 hours.',
        gate: 'Only replace both museums and every other stop, when the ocean floor finished early, weather is clear and the Best Western ETA stays 16:15 or earlier.',
        parking: 'Cape Enrage visitor parking, 650 Cape Enrage Road, Waterside, NB E4H 4Z5',
        map: mapSearchUrl('Cape Enrage, 650 Cape Enrage Road, Waterside, NB E4H 4Z5'),
        source: 'https://www.capenrage.ca/',
        coords: [45.59465, -64.78084]
      }]
    },
    '2026-08-20': {
      rule: 'Longest drive: at most one, and only as a child movement swap—never an added sightseeing stop. Kings Landing is a bigger commitment; use it only with a big time cushion.',
      options: [{
        name: 'Republique Provincial Park playground & riverside trail',
        routePoint: 'At Edmundston lunch, before the Quebec-bound drive',
        why: 'A fully equipped outdoor playground and an easy 1 km Petit-Temis riverside trail give the child a real reset close to the route.',
        visit: '25-35 min',
        routeImpact: 'Near the lunch corridor; verify day-use access and live Maps.',
        gate: 'Use only if lunch finishes early, both drivers are alert and live DoubleTree ETA remains 16:45 or earlier. Skip every other optional stop.',
        parking: 'Republique Provincial Park day-use parking, 31 Isidore-Boucher Boulevard, Edmundston, NB',
        map: mapSearchUrl('Republique Provincial Park day-use parking, 31 Isidore-Boucher Boulevard, Edmundston, NB'),
        source: 'https://www.parcsnb.ca/en/parks/8/republique-provincial-park',
        coords: [47.44127, -68.39394]
      }, {
        name: 'Kings Landing Historical Settlement',
        routePoint: 'Just west of Fredericton on the TransCanada, early in the day',
        why: 'A large riverside living-history village with costumed interpreters and animals—a genuine highlight, but a real time commitment on the longest driving day.',
        visit: '2-3 hours',
        routeImpact: 'Right off the TransCanada; paid admission and a long visit. Verify 2026 hours in live Maps.',
        gate: 'Only if you deliberately shorten the day by leaving Moncton very early and both drivers accept a late DoubleTree arrival. Skip if in any doubt—this is the day to just drive.',
        parking: 'Kings Landing visitor parking, 5804 Route 102, Prince William, NB E6K 0A5',
        map: mapSearchUrl('Kings Landing, 5804 Route 102, Prince William, NB E6K 0A5'),
        source: 'https://www.kingslanding.nb.ca/',
        coords: [45.87703, -66.97803]
      }]
    },
    '2026-08-21': {
      rule: 'One quick idea on the A-20—choose it only if it does not delay the fatigue-managed drive home. Fort Chambly is already the planned morning stop.',
      options: [{
        name: 'Fromagerie Lemaire',
        routePoint: 'At Saint-Cyrille-de-Wendover near Drummondville, right on the A-20',
        why: 'The classic Québec road-trip cheese stop: fresh curds and quick poutine directly beside the highway—an easy curds-to-go grab before Fort Chambly.',
        visit: '20-30 min',
        routeImpact: 'Negligible—it is right on the A-20 westbound; verify parking in live Maps.',
        gate: 'Use as a fast curds/washroom grab only if you are on time; skip it if the morning is already tight before Fort Chambly and the 11:00 Scores lunch.',
        parking: 'Fromagerie Lemaire on-site parking, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9',
        map: mapSearchUrl('Fromagerie Lemaire, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9'),
        source: 'https://www.fromagerie-lemaire.ca/menu-restaurant-fromagerie-lemaire/',
        coords: [45.91066, -72.45168]
      }, {
        name: 'Thousand Islands Parkway lookout',
        routePoint: 'Just west of Mallorytown, a short loop off Highway 401',
        why: 'A quiet St. Lawrence scenic drive with river-and-islands lookouts — a calm alternative stretch to a plain service stop.',
        visit: '20-30 min',
        routeImpact: 'Planning estimate: +10-20 min via the parkway loop; verify live Maps.',
        gate: 'Use in place of a service-stop stretch only if both drivers are fresh and you are on time to reach Vaughan safely.',
        parking: 'Thousand Islands Parkway lookout pull-off, Mallorytown, ON',
        map: mapSearchUrl('Thousand Islands Parkway lookout, Mallorytown, ON'),
        coords: [44.39080, -75.87600]
      }, {
        name: 'Brockville Waterfront (Blockhouse Island)',
        routePoint: 'At Brockville, a short detour off Highway 401',
        why: 'A flat riverfront park with benches, boats and the railway-tunnel portal nearby — an easy final leg-stretch on the drive home.',
        visit: '20-30 min',
        routeImpact: 'Planning estimate: +10-15 min into downtown Brockville; verify live Maps.',
        gate: 'Use as a single quick stretch only if on time and both drivers are alert; otherwise keep driving.',
        parking: 'Blockhouse Island parking, Blockhouse Island Parkway, Brockville, ON',
        map: mapSearchUrl('Blockhouse Island, Blockhouse Island Parkway, Brockville, ON'),
        coords: [44.59050, -75.68470]
      }]
    }
  };

  var PLAN_REVIEWED_ON = '2026-07-17';
  var dayVerificationByDay = {
    '2026-08-14': { due: '2026-08-12', summary: 'Check Friday 401/A-20 traffic, construction and Tata’s current service.', roadUrl: 'https://511on.ca/roadconditions' },
    '2026-08-15': { due: '2026-08-13', summary: 'Check Montmorency access, Old Québec parking and the La Bûche reservation.', roadUrl: 'https://www.quebec511.info/en/' },
    '2026-08-16': { due: '2026-08-14', summary: 'Check Kamouraska weather, Québec/NB roads and the saved premium-fuel corridors.', roadUrl: 'https://www.quebec511.info/en/' },
    '2026-08-17': { due: '2026-08-15', summary: 'Confirm Magnetic Hill access and Confederation Bridge conditions.', roadUrl: 'https://511.gnb.ca/' },
    '2026-08-18': { due: '2026-08-16', summary: 'Check Cavendish beach conditions, North Shore weather and restaurant service.', roadUrl: 'https://511.gov.pe.ca/' },
    '2026-08-19': { due: '2026-08-17', summary: 'Critical: recheck Hopewell tide/access, weather and bridge conditions 24–48 hours before.', roadUrl: 'https://511.gnb.ca/' },
    '2026-08-20': { due: '2026-08-18', summary: 'Check NB/Québec roads, smoke/weather and the Rivière-du-Loup fuel decision.', roadUrl: 'https://511.gnb.ca/' },
    '2026-08-21': { due: '2026-08-19', summary: 'Check A-20/401 traffic, weather and driver fatigue before the final push.', roadUrl: 'https://511on.ca/roadconditions' }
  };
  var offlineReadinessItems = [
    { id: 'maps', label: 'Offline map areas saved for Ontario, Québec, New Brunswick and PEI' },
    { id: 'emergency', label: 'Emergency contacts and medical text pack saved' },
    { id: 'hotels', label: 'All seven hotel confirmations available offline' },
    { id: 'tickets', label: 'Reservation and ticket screenshots available offline' }
  ];

  var stopPractical = {
    'd1-lunch': {
      'Cuisine / order': 'Family Italian-Canadian · pizza, pasta, fish and chips or souvlaki.',
      'Planning allowance': 'About C$20–35 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Child-friendly, seated and wheelchair accessible; on-site parking. At opening, budget 0–20 minutes for seating.',
      'Backup': 'Boston Pizza Brockville, 2000 Parkedale Avenue.'
    },
    'd2-falls': {
      'Why / duration': 'The strongest Québec City nature stop · allow about 2 hours including lunch transfer.',
      'Admission': '2026 daily access: C$13.90 per non-Québec adult; children free. Optional family cable-car fare C$43.06; tax extra.',
      'Crowd / arrival': 'High on summer Saturdays. Reach lower P1/P2 around 11:30 and expect a construction/parking buffer.',
      'Walking / weather': 'Moderate; stairs are optional. Stroller works on main paved areas. Outdoor and mist-exposed; use viewpoints and the Manoir in rain.'
    },
    'd2-lunch': {
      'Cuisine / order': 'Seasonal Québec lunch at the Manoir; choose the children’s menu for the six-year-old.',
      'Planning allowance': 'About C$30–50 per adult before tax/tip; confirm the current menu.',
      'Reservation / wait': 'Reserve 12:45. A reservation is the best defence against the short 11:30–15:00 service window.',
      'Backup': 'Cochon Dingue Beauport for a proper seated meal.'
    },
    'd2-old-quebec': {
      'Why / duration': 'A short iconic boardwalk and Château Frontenac view · 35–40 minutes is enough.',
      'Admission / crowd': 'Free attraction; garage fees vary. Summer crowd is high, but the late-afternoon visit is intentionally brief.',
      'Walking / child': 'Easy-to-moderate cobbles and slopes; stroller possible but uneven. Washrooms are not guaranteed on the terrace.',
      'Weather / parking': 'Easy to skip in hard rain or fatigue. Park once at De Beaucours and walk to dinner.'
    },
    'd3-kamouraska': {
      'Why / duration': 'Requested St. Lawrence wharf and a low-stress movement break · 20–25 minutes.',
      'Admission / crowd': 'No admission price is listed; obey local signage. Usually lower friction than a formal attraction.',
      'Walking / child': 'Short, flat waterfront walk; not stroller-dependent. Public washroom availability should not be assumed.',
      'Weather / safety': 'Exposed to wind and rain. Supervise closely at the wharf edge; shorten to photos if conditions are poor.'
    },
    'd4-cape': {
      'Why / duration': 'Bridge viewpoint, washrooms and a short nature reset before PEI · 30–40 minutes.',
      'Admission': 'Verify the current official admission before travel; no price is assumed in this plan.',
      'Walking / child': 'Use the shortest family trail. Easy walking, visitor facilities and stroller-friendly main areas.',
      'Weather / crowd': 'Mostly outdoors and generally calmer than major PEI sights; use the visitor centre and shorten the trail in rain.'
    },
    'd4-magnetic': {
      'Why / duration': 'A quick car-based novelty a six-year-old will understand · 20–30 minutes.',
      'Admission': 'Official 2026 price: C$10 per vehicle.',
      'Crowd / reservation': 'No reservation. Summer operation is weather/road dependent; confirm the gate is staffed before detouring.',
      'Walking / weather': 'Almost no walking. Skip first if late, raining hard or the entrance is not operating.'
    },
    'd5-green-gables': {
      'Why / duration': 'PEI’s signature literary site, presented at opening before the busiest period · about 100 minutes.',
      'Admission': 'Free for everyone under the 2026 Canada Strong Pass, June 19–September 7. Optional guided tour: C$6.50 per person.',
      'Crowd / arrival': 'Very high 11:00–15:00. Park by 08:10, use the washroom, and queue before the 09:00 opening.',
      'Walking / weather': 'Easy-to-moderate; visitor centre and house are suitable for families, while trails are optional. Indoor exhibits protect part of a rainy visit.'
    },
    'd5-beach': {
      'Why / duration': 'Unstructured sand and supervised-water time after lunch · 60–120 flexible minutes.',
      'Admission / parking': 'Free under the 2026 Canada Strong Pass. Use Cavendish Main Beach visitor parking.',
      'Child / facilities': 'Family beach with washrooms and seasonal surfguards; sand is not stroller-friendly.',
      'Weather': 'Fully weather dependent. No swimming for red flag, thunder, severe warning or no supervision; use Ripley’s instead.'
    },
    'd6-hopewell': {
      'Why / duration': 'The trip’s most distinctive natural experience · allow 2.5–3 hours including the ocean floor.',
      'Admission': '2026: adult C$18.15, child age 5–18 C$10.37, or family C$45.37; 15% tax extra. Ticket is valid for two consecutive days.',
      'Crowd / arrival': 'High near low tide. Enter 10:15–10:30 for the staff-controlled 11:52 low-tide window; no reservation advantage.',
      'Walking / weather': 'Moderate, muddy and about 99 stairs down/101 up on the main route; shuttle is extra. Not stroller-suitable on the ocean floor.'
    },
    'd6-sackville-rest': {
      'Why / duration': 'A genuine child-and-driver reset before Hopewell · cap the visit at 20 minutes.',
      'Admission / facilities': 'Waterfowl Park admission is free. The adjacent Visitor Information Centre provides the dependable parking and washroom target; verify 2026 hours before travel.',
      'Crowd / arrival': 'Usually low friction at 09:00. Park at 34 Mallard Drive and hard-leave at 09:20.',
      'Walking / weather': 'Flat accessible boardwalk. In rain, fatigue or delay, use the visitor centre and skip the boardwalk.'
    },
    'd6-lunch': {
      'Cuisine / order': 'Full-service New Brunswick lunch after the tide walk; choose a hot entrée, not the snack café.',
      'Planning allowance': 'About C$20–35 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'On-site, child-friendly and no extra drive. Change muddy shoes first; allow up to 20 minutes for seating at peak tide traffic.',
      'Backup': 'Gusto Italian Grill & Bar, Moncton.'
    },
    'd7-edmundston': {
      'Cuisine / order': 'Classic grill lunch · salads, pasta, stir-fries or mixed grill.',
      'Planning allowance': 'About C$22–38 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Hotel restaurant with parking and washrooms; child-friendly. Reserve only if the hotel recommends it; allow 0–20 minutes.',
      'Backup': 'Boston Pizza Edmundston.'
    },
    'd8-restaurant-lunch': {
      'Cuisine / order': 'Québec rotisserie · chicken, ribs, lunch menu and salad bar.',
      'Planning allowance': 'About C$20–35 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Very child-friendly, seated and just off the route with on-site parking. Arrive at the 11:00 opening to avoid a wait.',
      'Backup': 'La Cage Boucherville.'
    },
    'd1-dinner': {
      'Cuisine / order': 'Multi-vendor Montréal food hall; each person can choose independently.',
      'Planning allowance': 'About C$25–45 per adult before tax/tip; confirm vendor menus.',
      'Family logistics': 'Child-friendly but lively. No reservation; walk from the parked hotel and expect 10–25 minutes at Friday dinner peak.',
      'Backup': 'Lloyd dining room inside the Marriott.'
    },
    'd2-dinner': {
      'Cuisine / order': 'Traditional Québec · meat-pie croquettes, beer-glazed ham or shepherd’s pie; ask for a simple child option.',
      'Planning allowance': 'About C$30–55 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Reserve 18:15. Walk from De Beaucours parking; allow 0–15 minutes after the reservation time.',
      'Backup': 'Cochon Dingue Champlain.'
    },
    'd3-lunch': {
      'Cuisine / order': 'Québec bistro lunch; choose one substantial hot plate before the long drive.',
      'Planning allowance': 'About C$20–35 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Child-friendly seated reset with nearby parking. Sunday demand can add 10–25 minutes; leave by the planned cutoff.',
      'Backup': 'St-Hubert Rivière-du-Loup for a reliable seated meal.'
    },
    'd3-hotel': {
      'Cuisine / order': 'STMR.36 barbecue · smoked meats and shareable sides.',
      'Planning allowance': 'About C$30–55 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'On-site, paid hotel parking already handled and no extra drive. Reserve an early table if the hotel recommends it.',
      'Backup': 'The Diplomat, 253 Woodstock Road.'
    },
    'd4-lunch': {
      'Cuisine / order': 'Bistro lunch; choose a substantial savoury plate plus a pastry to share if wanted.',
      'Planning allowance': 'About C$20–35 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Child-friendly; use nearby street or lot parking. Budget 10–25 minutes for a Monday table and leave by 11:40.',
      'Backup': 'Cora Moncton for a seated breakfast/lunch.'
    },
    'd4-dinner': {
      'Cuisine / order': 'Traditional PEI lobster supper; lobster is the memorable meal, with non-seafood choices for the child.',
      'Planning allowance': 'About C$45–75 per adult before tax/tip; confirm the 2026 menu.',
      'Family logistics': 'Family-focused with on-site parking. A family of three is walk-in; arrive before 17:00 and plan for a 0–30 minute queue.',
      'Backup': 'Lobster on the Wharf, Charlottetown.'
    },
    'd5-lunch': {
      'Cuisine / order': 'PEI seafood · mussels, chowder or fish; request a simple child plate.',
      'Planning allowance': 'About C$30–55 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'On-site parking at the Rustico Road location. No advance reservation; arrive before 11:30 and reject waits over 45 minutes.',
      'Backup': 'Fisherman’s Wharf Lobster Suppers, North Rustico.'
    },
    'd5-dinner': {
      'Cuisine / order': 'Seasonal Canadian dining; choose a main course and one shared dessert.',
      'Planning allowance': 'About C$35–65 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Reserve 18:30 and note the six-year-old. Use Queen Street Parkade during Old Home Week; allow 30–40 minutes for parking/walk.',
      'Backup': 'Lobster on the Wharf.'
    },
    'd6-dinner': {
      'Cuisine / order': 'Gastropub · local comfort food and shareable plates.',
      'Planning allowance': 'About C$30–55 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Reserve 18:00, note the child and use nearby downtown parking. Allow 0–15 minutes with the reservation.',
      'Backup': 'Gusto Italian Grill & Bar.'
    },
    'd7-dinner': {
      'Cuisine / order': 'Hotel dining room with Québec favourites and a children’s menu.',
      'Planning allowance': 'About C$30–55 per adult before tax/tip; confirm the current menu.',
      'Family logistics': 'Free hotel parking is already handled. Reserve 18:45–19:00; no extra driving after the long day.',
      'Backup': 'Normandin Charlesbourg dining room.'
    }
  };

  function practicalForStop(stop) {
    if (stop.id === 'd6-magnetic') return stopPractical['d4-magnetic'];
    return stopPractical[stop.id] || null;
  }

  function renderPractical(stop) {
    var practical = practicalForStop(stop);
    if (!practical) return '';
    return '<dl class="practical-grid">' + Object.keys(practical).map(function (label) {
      return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(practical[label]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function hotelForNight(dayId) {
    return rawData.hotels.find(function (hotel) { return hotel.Date === dayId; }) || null;
  }

  function previousHotel(dayId) {
    var index = operationalPlan.days.findIndex(function (day) { return day.id === dayId; });
    return index > 0 ? hotelForNight(operationalPlan.days[index - 1].id) : null;
  }

  function dayOptionLabel(day) {
    var match = String(day.label || '').match(/^([A-Z][a-z]{2}), ([A-Z][a-z]{2} \d+)/);
    var date = match ? match[1] + ' ' + match[2] : day.label;
    return date + ' · ' + (hotelShortNames[day.id] || 'Trip day');
  }

  function renderHotelAnchor(day) {
    var from = previousHotel(day.id);
    var tonight = hotelForNight(day.id);
    var rule = hotelPlanRules[day.id] || {};
    var leaveName = from ? from['Recommended hotel'] : 'Home in Vaughan';
    var leaveDetail = from ? 'Checkout by ' + from['Check-out'] : 'Start from home';
    var sleepName = tonight ? tonight['Recommended hotel'] : 'Home';
    var sleepDetail = tonight ? 'Check-in ' + tonight['Check-in'] : 'Final decision at Mallorytown';
    return [
      '<section class="hotel-anchor" aria-label="Hotel-anchored day plan">',
      '<div class="hotel-anchor-head"><h3>Hotel anchor</h3><span class="tag category-hotel">Booked route</span></div>',
      '<div class="hotel-anchor-grid">',
      '<div class="hotel-anchor-item"><span>Leave from</span><strong>', escapeHtml(leaveName), '</strong><small>', escapeHtml(leaveDetail), '</small></div>',
      '<div class="hotel-anchor-item"><span>Sleep at</span><strong>', escapeHtml(sleepName), '</strong><small>', escapeHtml(sleepDetail), ' · target ', escapeHtml(rule.arrival || 'confirm'), '</small></div>',
      '</div><p class="hotel-rule"><strong>Hotel rule:</strong> ', escapeHtml(rule.rule || 'Protect the confirmed room and arrival window.'), '</p></section>'
    ].join('');
  }

  function renderMealContract(day) {
    var contract = mealContracts[day.id];
    if (!contract) return '';
    return '<section class="meal-contract" aria-label="Daily meal plan"><h3>Hotel breakfast + two balanced meals</h3><p class="small muted">One substantial restaurant meal per day. The other meal stays light.</p><div class="meal-contract-grid">' +
      ['breakfast', 'lunch', 'dinner'].map(function (meal) {
        var item = contract[meal];
        return '<div class="meal-contract-item"><span>' + escapeHtml(meal) + ' · ' + escapeHtml(item.style) + '</span><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.detail) + '</p><small><strong>Backup:</strong> ' + escapeHtml(item.backup) + '</small></div>';
      }).join('') + '</div></section>';
  }

  function renderMealFlex(day) {
    var plan = mealFlexByDay[day.id];
    if (!plan || !plan.options || !plan.options.length) return '';
    return [
      '<details class="meal-flex"><summary><strong>Simple food + extra time</strong><span>Best optional switch</span></summary><div class="meal-flex-body">',
      '<p class="meal-flex-rule"><strong>Senior-planner rule:</strong> ', escapeHtml(plan.rule), '</p>',
      '<div class="meal-flex-grid">', plan.options.map(function (option) {
        return [
          '<article class="meal-flex-card"><span class="tag category-food">', escapeHtml(option.meal), '</span>',
          '<h4>', escapeHtml(option.foodName), '</h4><p>', escapeHtml(option.foodAddress), '</p>',
          '<p>', escapeHtml(option.order), '</p><p><strong>', escapeHtml(option.window), '</strong> · <span class="time-gain">', escapeHtml(option.saved), '</span></p>',
          '<div class="extra-experience"><strong>Use the time for: ', escapeHtml(option.experience), '</strong>',
          '<p>', escapeHtml(option.experienceDetail), '</p><p><strong>Arrival / parking:</strong> ', escapeHtml(option.parking), '</p></div>',
          '<div class="action-bar">', externalLink(option.foodMap, 'Quick food map', 'button subtle'), externalLink(option.foodSource, 'Food source', 'button subtle'), externalLink(option.experienceMap, 'Extra stop map', 'button subtle'), externalLink(option.experienceSource, 'Attraction source', 'button subtle'), '</div></article>'
        ].join('');
      }).join(''), '</div></div></details>'
    ].join('');
  }

  function renderRouteOptions(day) {
    var plan = routeOptionsByDay[day.id];
    if (!plan || !plan.options || !plan.options.length) return '';
    var countLabel = plan.options.length + (plan.options.length === 1 ? ' option' : ' options') + ' - choose max 1';
    return [
      '<details class="route-options"><summary><strong>Along-the-way options</strong><span>', escapeHtml(countLabel), '</span></summary><div class="route-options-body">',
      '<p class="route-options-rule"><strong>Decision rule:</strong> ', escapeHtml(plan.rule), '</p>',
      '<div class="route-options-grid">', plan.options.map(function (option) {
        return [
          '<article class="route-option-card"><span class="tag category-attraction">Optional - easy to skip</span>',
          '<h4>', escapeHtml(option.name), '</h4><p class="route-option-leg">', escapeHtml(option.routePoint), '</p>',
          '<p>', escapeHtml(option.why), '</p>',
          '<div class="route-option-meta"><div><span>Visit</span>', escapeHtml(option.visit), '</div><div><span>Route impact</span>', escapeHtml(option.routeImpact), '</div></div>',
          '<p><strong>Go / no-go gate:</strong> ', escapeHtml(option.gate), '</p>',
          '<p><strong>Closest named parking:</strong> ', escapeHtml(option.parking), '</p>',
          '<div class="action-bar">', externalLink(option.map, 'Parking map', 'button primary'), externalLink(option.source, 'Official info', 'button subtle'), '</div></article>'
        ].join('');
      }).join(''), '</div></div></details>'
    ].join('');
  }

  function renderDayPacing(day) {
    return [
      '<section class="day-pacing" aria-label="Day pacing and fallback plan"><div class="day-pacing-grid">',
      '<div class="day-pacing-item"><span>Priority</span><strong>', escapeHtml(day.mainActivity), '</strong></div>',
      '<div class="day-pacing-item"><span>Optional · easy to skip</span><strong>', escapeHtml(day.optionalActivity), '</strong></div>',
      '<div class="day-pacing-item"><span>Recovery time</span><strong>', escapeHtml(day.downtime), '</strong></div>',
      '<div class="day-pacing-item"><span>Rain / mood backup</span><strong>', escapeHtml(day.rainPlan), '</strong></div>',
      '</div>', day.parentWarning ? '<p class="parent-warning">Parent fatigue: ' + escapeHtml(day.parentWarning) + '</p>' : '', '</section>'
    ].join('');
  }

  // A concrete, per-mode plan that updates the moment the Schedule selector
  // changes: when ahead, the specific route-side stop(s) to add and the earlier
  // arrival; when late, exactly which optional stops drop out (the same ones the
  // map/timeline hide), what stays protected, and the day's contingency.
  function renderScenarioPlan(day) {
    var ahead = aheadMinutes(day);
    var late = modeMinutes(day);
    var planStops = day.stops.filter(function (stop) { return !stop.choiceGated; });

    if (ahead) {
      var options = (routeOptionsByDay[day.id] && routeOptionsByDay[day.id].options) || [];
      var adds = options.slice(0, ahead >= 60 ? 2 : 1);
      var addHtml = adds.length
        ? '<p><strong>Best ' + (adds.length > 1 ? 'adds' : 'add') + ' for this margin:</strong></p><ul class="scenario-list">' +
          adds.map(function (option) {
            return '<li><strong>' + escapeHtml(option.name) + '</strong> · ' + escapeHtml(option.visit) +
              '<br><span class="scenario-note">' + escapeHtml(option.why) + '</span>' +
              '<br><span class="scenario-gate">Go / no-go: ' + escapeHtml(option.gate) + '</span></li>';
          }).join('') + '</ul>'
        : '<p>No safe route-side add fits today — bank the time instead.</p>';
      return '<section class="scenario-plan scenario-ahead" aria-label="Ahead scenario plan">' +
        '<div class="scenario-head"><span class="scenario-tag">~' + ahead + ' min ahead</span>' +
        '<h3>Spend the buffer or arrive earlier</h3></div>' + addHtml +
        '<p><strong>Or bank it:</strong> ' + escapeHtml(day.downtime) + '. Choose <strong>at most one</strong> add and keep the hotel ETA protected.</p>' +
        '</section>';
    }

    if (late) {
      var cuts = planStops.filter(function (stop) { return stop.skipAt && late >= stop.skipAt; });
      var cutHtml = cuts.length
        ? '<p><strong>Drop now (' + cuts.length + '):</strong></p><ul class="scenario-list">' +
          cuts.map(function (stop) {
            return '<li><strong>' + escapeHtml(stop.title || stop.locationName || 'Optional stop') + '</strong>' +
              (stop.saves ? ' — saves ~' + escapeHtml(stop.saves) : '') + '</li>';
          }).join('') + '</ul>'
        : '<p>No optional stops remain to cut at this margin — the day is already lean, so protect the essentials and drive.</p>';
      return '<section class="scenario-plan scenario-late" aria-label="Late scenario plan">' +
        '<div class="scenario-head"><span class="scenario-tag">~' + late + ' min behind</span>' +
        '<h3>Tighten up — cut optional stops, protect the essentials</h3></div>' + cutHtml +
        '<p><strong>Protect:</strong> the proper lunch and dinner and the hotel arrival. Do <strong>not</strong> add any optional idea.</p>' +
        '<p><strong>Contingency:</strong> ' + escapeHtml(day.contingency) + '</p>' +
        '</section>';
    }

    var optionalCount = planStops.filter(function (stop) { return stop.skipAt; }).length;
    return '<section class="scenario-plan scenario-neutral" aria-label="On-plan scenario">' +
      '<div class="scenario-head"><span class="scenario-tag">On plan</span>' +
      '<h3>Follow the planned timeline</h3></div>' +
      '<p>Priority: <strong>' + escapeHtml(day.mainActivity) + '</strong>. Leave ' + escapeHtml(day.departTarget) + '. ' +
      'This day carries <strong>' + optionalCount + '</strong> optional stop' + (optionalCount === 1 ? '' : 's') +
      ' that drop automatically if you fall behind. Pick <strong>30/60 min ahead</strong> or <strong>late</strong> above to see exactly what to add or cut.</p>' +
      '</section>';
  }

  var fuelMath = {
    tankLitres: 71,
    triggerPercent: 25,
    triggerRemainingKm: 150
  };

  var minimalFuelPlan = [
    {
      dateLabel: 'Fri, Aug 14',
      stop: 'Start full: Esso Circle K Maple',
      address: '3100 Major Mackenzie Dr W, Maple, ON L6A 1S1',
      tank: 'Start-full exception',
      action: 'Fill full with 91 AKI minimum and reset the trip odometer.',
      reason: 'After this, refuel by a quarter tank remaining—or sooner when the live range approaches 120–150 km or the next reliable station is uncertain.',
      mapUrl: mapSearchUrl('3100 Major Mackenzie Dr W, Maple, ON L6A 1S1'),
      sourceUrl: 'https://www.esso.ca/en-ca/find-station/maple-on-esso-200302605'
    },
    {
      dateLabel: 'Sat, Aug 15',
      stop: 'Primary 91 option: Shell Trois-Rivières',
      address: '6455 Boulevard des Chenaux, Trois-Rivières, QC G8Y 5A9',
      tank: 'Refuel by 25%',
      action: 'Fill with 91 AKI if at/below a quarter tank or the live range is approaching 120–150 km.',
      reason: 'Official listing shows V-Power 91; Saturday forecourt hours are 07:00–22:00. Use as a conditional stop before Québec City.',
      mapUrl: mapSearchUrl('6455 Boulevard des Chenaux, Trois-Rivières, QC G8Y 5A9'),
      sourceUrl: 'https://find.shell.com/ca/fuel/12303255-blvd-des-chenaux-troisriviere/en_CA'
    },
    {
      dateLabel: 'Sun, Aug 16',
      stop: 'Primary 91 option: Shell Grey Rock Edmundston',
      address: '100 Grey Rock Road, Edmundston, NB E7C 0B6',
      tank: 'Refuel by 25%',
      action: 'Fill with 91 AKI at the Edmundston driver-swap stop when needed.',
      reason: 'Official listing shows 24-hour V-Power 91; combines fuel with the required movement break.',
      mapUrl: mapSearchUrl('100 Grey Rock Road, Edmundston, NB E7C 0B6'),
      sourceUrl: 'https://find.shell.com/ca/fuel/10071398-grey-rock-road-edmundston/en_CA'
    },
    {
      dateLabel: 'Tue, Aug 18 / Wed, Aug 19',
      stop: 'Tide-day 91 fallback: Shell North River',
      address: '630 Capital Drive, Cornwall, PE C0A 1H0',
      tank: 'Start Aug 19 above 25%',
      action: 'Check fuel the evening of Aug 18; fill then or before the 07:15 departure if at/below a quarter tank.',
      reason: 'Official listing shows 24-hour V-Power 91 on the westbound exit route. Keep any morning fill to 10 minutes so the Sackville rest and Hopewell tide window remain protected.',
      mapUrl: mapSearchUrl('630 Capital Drive, Cornwall, PE C0A 1H0'),
      sourceUrl: 'https://find.shell.com/ca/fuel/10053264-trans-canada-hwy-north-river/en_CA'
    },
    {
      dateLabel: 'Thu, Aug 20',
      stop: 'Primary + backup: Edmundston / Rivière-du-Loup',
      address: '100 Grey Rock Rd, Edmundston; backup 80 Boul Cartier, Rivière-du-Loup',
      tank: 'Refuel by 25%',
      action: 'Prefer the Edmundston lunch/driver-swap stop; use Rivière-du-Loup if still needed.',
      reason: 'Both official Shell listings show V-Power 91; Grey Rock is 24 hours and Rivière-du-Loup is 06:00–23:00.',
      mapUrl: mapSearchUrl('100 Grey Rock Road, Edmundston, NB E7C 0B6'),
      sourceUrl: 'https://find.shell.com/ca/fuel/10071398-grey-rock-road-edmundston/en_CA'
    },
    {
      dateLabel: 'Fri, Aug 21',
      stop: 'Final decision: ONroute Mallorytown North — westbound',
      address: '678 Highway 401 Westbound, Mallorytown, ON K0E 1R0',
      tank: 'Refuel by 25%',
      action: 'Use Canadian Tire Gas+ at the safety checkpoint when at trigger; verify 91 availability before travel.',
      reason: 'The official westbound plaza is open 24/7. Fuel and the fatigue/rest decision share one required stop.',
      mapUrl: mapSearchUrl('ONroute Mallorytown North, 678 Highway 401 Westbound, Mallorytown, ON K0E 1R0'),
      sourceUrl: 'https://www.onroute.ca/locations/mallorytown-north'
    }
  ];

  var roadLinks = [
    { title: 'Ontario 511', detail: 'Road conditions, closures, and cameras', url: 'https://511on.ca/roadconditions' },
    { title: 'Québec 511', detail: 'Road network, cameras, and service areas', url: 'https://www.quebec511.info/en/' },
    { title: 'New Brunswick 511', detail: 'Road conditions, incidents, cameras, and weather', url: 'https://511.gnb.ca/' },
    { title: 'PEI 511', detail: 'Official PEI road information', url: 'https://511.gov.pe.ca/' },
    { title: 'Environment Canada', detail: 'Forecasts and weather alerts', url: 'https://weather.gc.ca/' }
  ];

  var weatherLinks = [
    { title: 'Toronto / Vaughan forecast', detail: 'Departure and return days (Aug 14, Aug 21)', url: 'https://weather.gc.ca/city/pages/on-143_metric_e.html' },
    { title: 'Montréal forecast', detail: 'Night of Aug 14', url: 'https://weather.gc.ca/city/pages/qc-147_metric_e.html' },
    { title: 'Québec City forecast', detail: 'Nights of Aug 15 and Aug 20', url: 'https://weather.gc.ca/city/pages/qc-133_metric_e.html' },
    { title: 'Fredericton forecast', detail: 'Night of Aug 16', url: 'https://weather.gc.ca/city/pages/nb-29_metric_e.html' },
    { title: 'Charlottetown forecast', detail: 'Nights of Aug 17-18, beach days', url: 'https://weather.gc.ca/city/pages/pe-5_metric_e.html' },
    { title: 'Hopewell Cape forecast', detail: 'Local weather for the Aug 19 tide visit', url: 'https://weather.gc.ca/en/location/index.html?coords=45.850%2C-64.583' },
    { title: 'Moncton forecast', detail: 'Night of Aug 19', url: 'https://weather.gc.ca/city/pages/nb-36_metric_e.html' },
    { title: 'Hurricane & tropical outlook', detail: 'August is Maritimes hurricane-remnant season', url: 'https://weather.gc.ca/hurricane/index_e.html' },
    { title: 'All weather alerts', detail: 'Active watches and warnings across Canada', url: 'https://weather.gc.ca/warnings/index_e.html' },
    { title: 'Air quality & wildfire smoke', detail: 'Move activities indoors when smoke or AQHI is high', url: 'https://www.canada.ca/en/environment-climate-change/services/air-quality-health-index/wildfire-smoke.html' }
  ];

  var dayWeatherUrls = {
    '2026-08-14': 'https://weather.gc.ca/city/pages/qc-147_metric_e.html',
    '2026-08-15': 'https://weather.gc.ca/city/pages/qc-133_metric_e.html',
    '2026-08-16': 'https://weather.gc.ca/city/pages/nb-29_metric_e.html',
    '2026-08-17': 'https://weather.gc.ca/city/pages/pe-5_metric_e.html',
    '2026-08-18': 'https://weather.gc.ca/city/pages/pe-5_metric_e.html',
    '2026-08-19': 'https://weather.gc.ca/en/location/index.html?coords=45.850%2C-64.583',
    '2026-08-20': 'https://weather.gc.ca/city/pages/qc-133_metric_e.html',
    '2026-08-21': 'https://weather.gc.ca/city/pages/on-143_metric_e.html'
  };

  function dayWeatherLink(dayId, className) {
    var url = dayWeatherUrls[dayId];
    return url ? externalLink(url, 'Weather forecast', className || 'button subtle') : '';
  }

  var emergencyContacts = [
    { name: 'Emergency (police / fire / ambulance)', phone: '911', detail: 'Works in ON, QC, NB, and PEI.' },
    { name: 'Health advice line', phone: '811', detail: 'Free 24/7 nurse line in all four provinces on the route.' },
    { name: 'Poison Centre (outside Québec)', phone: '1-844-764-7669', detail: 'National POISON-X line for Ontario, New Brunswick and PEI.' },
    { name: 'Québec Poison Control Centre', phone: '1-800-463-5060', detail: 'Use while in Québec.' },
    { name: 'Parks Canada emergency dispatch', phone: '1-877-852-3100', detail: 'For emergencies in Parks Canada places.' },
    { name: 'Hopewell Rocks park', phone: '877-734-3429', detail: 'Call for current ocean-floor access direction.' },
    { name: 'Confederation Bridge conditions', phone: '902-437-7300', detail: 'Check restrictions before both crossings.' },
    { name: 'CAA / AAA roadside assistance', phone: '1-800-222-4357', detail: 'Or dial *222 from a mobile phone.' },
    { name: 'Montreal Marriott Chateau Champlain (Aug 14)', phone: '514-878-9000', detail: '1050 de la Gauchetiere West, Montréal' },
    { name: 'Hôtel Cofortel (Aug 15)', phone: '418-877-4777', detail: '6500 Boul. Wilfrid-Hamel, L’Ancienne-Lorette' },
    { name: 'Delta Hotels by Marriott Fredericton (Aug 16)', phone: '506-457-7000', detail: '225 Woodstock Road, Fredericton' },
    { name: 'Hampton Inn & Suites Charlottetown (Aug 17)', phone: '902-368-3551', detail: '300 Capital Drive, Charlottetown' },
    { name: 'Canadas Best Value Inn & Suites Charlottetown (Aug 18)', phone: '902-892-2481', detail: '20 Capital Drive, Charlottetown' },
    { name: 'Best Western Plus Moncton (Aug 19)', phone: '506-388-0888', detail: '300 Lewisville Road, Moncton' },
    { name: 'DoubleTree by Hilton Quebec Resort (Aug 20)', phone: '418-627-8008', detail: '7900 Rue du Marigot, Québec City' }
  ];

  var reservationContacts = [
    { name: 'La Bûche (Québec City — dinner Aug 15)', phone: '418-694-7272', note: 'Book for the Aug 15 evening; very busy in Old Québec in August.' },
    { name: 'New Glasgow Lobster Suppers (PEI — supper Aug 17)', phone: '902-964-2870', note: 'Official 2026 service is daily 4-7:30 PM. Reservations are only for groups of 8+; a family of three should arrive before 5 PM.' },
    { name: 'Slaymaker & Nichols (Charlottetown — dinner Aug 18)', phone: '902-629-3411', note: 'Very high priority per the meal plan; book as soon as possible.' },
    { name: 'Tide & Boar (Moncton — dinner Aug 19)', phone: '506-857-9118', note: 'Book ~6:00 PM — the midday tide window has you at the Moncton hotel by mid-afternoon.' }
  ];

  function renderReservationCallList() {
    return [
      '<details class="card full reservation-card"><summary><strong>Restaurant calls</strong> · 4 numbers</summary>',
      '<p class="small muted">Call, confirm, then mark the matching task complete.</p>',
      '<ul class="offline-list emergency-list">',
      reservationContacts.map(function (contact) {
        return '<li><a class="tel-link" href="tel:' + escapeHtml(contact.phone.replace(/[^\d+]/g, '')) + '"><strong>' + escapeHtml(contact.name) + '</strong><span>' + escapeHtml(contact.phone) + ' · ' + escapeHtml(contact.note) + '</span></a></li>';
      }).join(''),
      '</ul></details>'
    ].join('');
  }

  var packingGroups = [
    { name: 'Documents & money', items: ['Driver licences (both adults)', 'Health cards', 'Vehicle registration & insurance slip', 'Hotel confirmation numbers (also in checklist)', 'Credit/debit cards + some cash for tolls & seasonal stands', 'CAA membership card', 'Non-travelling contact has the itinerary and hotel details'] },
    { name: 'Kid comfort (6-year-old)', items: ['Booster limits, expiry, recalls & belt fit checked; secure it when empty', 'Car snacks restocked daily', 'Water bottles', 'Car toys / activity bag', 'Tablet + headphones, charged', 'Comfort item for hotels', 'Motion sickness plan (bags, wipes, meds if used)'] },
    { name: 'Cooler & road food', items: ['Insulated cooler sized for packed breakfasts/lunches', 'Frozen ice packs plus a daily ice-replenishment plan', 'Keep perishable food at 4°C or colder; discard it if temperature safety is uncertain', 'Leakproof sealed food containers', 'Reusable cutlery, napkins, cups and garbage bags', 'Shelf-stable backup breakfast and kid-safe snacks'] },
    { name: 'Beach & tide days', items: ['Swimsuits & towels', 'Closed-toe grippy shoes, dry socks & mud bag for Hopewell', 'Sunscreen & hats', 'Bug spray for wooded and dusk stops', 'Change of clothes reachable in the car'] },
    { name: 'Car & tech', items: ['Phone chargers + car adapter', 'Offline maps downloaded (see checklist)', 'Dashcam / phone mounts', 'First-aid kit', 'Flashlight', 'Jumper cables or booster pack', 'Windshield washer fluid topped up', 'Cold tire pressure & tread checked', 'Wheel-lock key packed', 'Spare or mobility kit present; sealant not expired'] },
    { name: 'Health & weather', items: ['Medications in original containers + kid pain/fever meds', 'Allergy/medical card and prescribed rescue medication if applicable', 'Fine-point tweezers or tick remover; nightly tick checks', 'Rain jackets (Fundy fog & showers)', 'Light sweaters for evening coastal wind', 'Hand sanitizer & wipes'] }
  ];

  var PACKING_KEY = 'pei-foodie-road-trip/packing/v1';

  function readPacking() {
    try {
      var parsed = JSON.parse(localStorage.getItem(PACKING_KEY) || 'null');
      if (!parsed || parsed.version !== 1) return { version: 1, items: {} };
      return { version: 1, items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {} };
    } catch (error) {
      return { version: 1, items: {} };
    }
  }

  var packingState = readPacking();

  function persistPacking() {
    try { localStorage.setItem(PACKING_KEY, JSON.stringify(packingState)); } catch (error) {}
  }

  function packingItemId(groupName, item) {
    return slug(groupName) + '/' + slug(item);
  }

  function packingProgress() {
    var total = 0, done = 0;
    packingGroups.forEach(function (group) {
      group.items.forEach(function (item) {
        total += 1;
        if (packingState.items[packingItemId(group.name, item)]) done += 1;
      });
    });
    return { total: total, done: done };
  }

  var EXPENSES_KEY = 'pei-foodie-road-trip/expenses/v1';
  var EXPENSE_CATEGORIES = ['Food', 'Fuel', 'Attractions', 'Hotel', 'Other'];

  function readExpenses() {
    try {
      var parsed = JSON.parse(localStorage.getItem(EXPENSES_KEY) || 'null');
      if (!parsed || parsed.version !== 1) return { version: 1, budget: 0, items: [] };
      return {
        version: 1,
        budget: Number(parsed.budget) > 0 ? Number(parsed.budget) : 0,
        items: Array.isArray(parsed.items) ? parsed.items.filter(function (item) {
          return item && Number(item.amount) > 0;
        }).map(sanitizeExpense) : []
      };
    } catch (error) {
      return { version: 1, budget: 0, items: [] };
    }
  }

  function sanitizeExpense(item) {
    return {
      id: String(item.id || 'x' + Math.random().toString(36).slice(2, 10)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) ? String(item.date) : localIsoDate(),
      category: EXPENSE_CATEGORIES.indexOf(item.category) !== -1 ? item.category : 'Other',
      label: String(item.label || '').slice(0, 80),
      amount: Math.round(Number(item.amount) * 100) / 100
    };
  }

  var expenseState = readExpenses();

  function persistExpenses() {
    try { localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenseState)); } catch (error) {}
  }

  function expenseTotals() {
    var byCategory = {};
    var total = 0;
    expenseState.items.forEach(function (item) {
      total += item.amount;
      byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
    });
    return { total: Math.round(total * 100) / 100, byCategory: byCategory };
  }

  function formatMoney(value) {
    return '$' + Number(value || 0).toFixed(2).replace(/\.00$/, '');
  }

  function task(details) {
    return {
      id: details.id,
      category: details.category || 'Prep',
      title: details.title,
      description: details.description || '',
      dueDate: details.dueDate || '',
      url: details.url || '',
      priority: details.priority || 'Normal',
      private: Boolean(details.private)
    };
  }

  var checklistTasks = [
    task({ id: 'hopewell-window', category: 'Tide', title: 'Re-verify Hopewell access and Sackville hours 24-48h before', description: 'CHS predicts Aug 19 low tide at 11:52 AM. Depart Charlottetown 07:15, cap the Sackville rest at 20 minutes, target the entrance 10:15-10:30 and stairs 10:45; actual floor access remains at park staff discretion.', dueDate: '2026-08-17', url: operationalPlan.tidePlan.sourceUrl, priority: 'Critical' }),
    task({ id: 'ticket-montmorency', category: 'Tickets', title: 'Buy Montmorency Falls daily access online', description: 'Buy official Sépaq daily access before Aug 15. Decide separately whether the family wants cable car tickets.', dueDate: '2026-07-31', url: ticketGuidance.montmorency.url, priority: 'Critical' }),
    task({ id: 'ticket-hopewell', category: 'Tickets', title: 'Save the Hopewell admission and tide links', description: 'Advance purchase does not improve access and attendance is not capped. Buy when convenient, then recheck the official access notice 24-48 hours before.', dueDate: '2026-07-22', url: ticketGuidance.hopewell.url, priority: 'Normal' }),
    task({ id: 'green-gables-plan-ahead', category: 'Admission', title: 'Plan Green Gables arrival for Canada Strong Pass crowds', description: 'No ticket purchase is needed for Aug 18, but Parks Canada expects very high visitation in 2026. Keep the visit early and flexible.', dueDate: '2026-08-13', url: ticketGuidance.greenGables.url, priority: 'High' }),
    task({ id: 'road-checks', category: 'Roads', title: 'Save provincial 511 links and check them every drive morning', description: 'Check construction, closures, cameras, weather alerts, and traffic before leaving.', dueDate: '2026-08-13', url: 'https://511on.ca/roadconditions', priority: 'High' }),
    task({ id: 'hotel-transfer-charlottetown', category: 'Convenience', title: 'Choose the Aug 18 luggage handoff', description: 'Optional convenience only: ask Canadas Best Value Inn for early bag drop or Hampton for a same-day hold. If neither is useful, keep luggage covered in the locked trunk and avoid leaving valuables in the car.', dueDate: '2026-08-13', url: 'https://cbvipei.ca/', priority: 'Normal' }),
    task({ id: 'morning-driver-rhythm', category: 'Daily rhythm', title: 'Set wake times and two-driver rotation', description: 'Wake 06:00 on Aug 14, 06:15 on Aug 17 and Aug 19, 05:30-05:45 on Aug 20, and 05:15-05:30 on Aug 21. Make each listed departure a true wheels-moving time and agree on driver swaps before leaving.', dueDate: '2026-08-13', priority: 'High' }),
    task({ id: 'offline-maps', category: 'Offline', title: 'Download offline map areas and save this trip pack', description: 'Maps and restaurant pages require connectivity; keep an offline copy and route downloads ready.', dueDate: '2026-08-13', priority: 'High' }),
    task({ id: 'fuel-readiness', category: 'Fuel', title: 'Recheck the saved 91-AKI stations', description: 'Primary stations are saved in the Fuel tab: Shell Trois-Rivières, Grey Rock Edmundston, Shell North River, Shell Rivière-du-Loup and westbound Mallorytown North Gas+. Recheck hours and 91 availability; refuel by 25%, sooner near 120-150 km displayed range.', dueDate: '2026-08-13', url: 'https://find.shell.com/ca/fuel/10071398-grey-rock-road-edmundston/en_CA', priority: 'High' }),
    task({ id: 'old-home-week', category: 'PEI traffic', title: 'Prepare for Charlottetown Old Home Week, Aug 14-22', description: 'Save the event schedule and preselect a downtown garage for the Aug 18 Slaymaker dinner. Allow 30-40 minutes for the short drive, parking and walk; keep Victoria Row out of Plan A.', dueDate: '2026-08-13', url: 'https://www.discovercharlottetown.com/events/old-home-week/', priority: 'High' }),
    task({ id: 'magnetic-hill-hours', category: 'Hours', title: 'Confirm the Aug 17 Magnetic Hill operating clock', description: 'The City confirms the summer operating season but does not publish a daily clock. Call shortly before travel; skip the stop if staffed access at 9:50 AM is not confirmed.', dueDate: '2026-08-13', url: 'https://www.moncton.ca/en/magnetic-hill-illusion', priority: 'Normal' }),
    task({ id: 'return-safety', category: 'Safety', title: 'Plan the Aug 21 fatigue and rest strategy', description: 'The 820 km same-day return is long. Agree on a two-driver rotation, plan generous rest and driver-swap breaks, and set the honest go/rest checkpoint at westbound Mallorytown North around 14:00. If either driver is unfit to continue, stop and rest until safe rather than driving to the clock.', dueDate: '2026-08-08', url: 'https://511on.ca/', priority: 'High' })
  ];

  operationalPlan.days.forEach(function (day) {
    day.meals.forEach(function (slot) {
      if (!slot.reservationTaskId || checklistTasks.some(function (item) { return item.id === slot.reservationTaskId; })) return;
      var stop = day.stops.find(function (item) { return item.id === slot.selectedStopId; });
      checklistTasks.push(task({
        id: slot.reservationTaskId,
        category: 'Reservation',
        title: 'Confirm ' + slot.title,
        description: slot.reserve || 'Confirm hours, reservation, party size, cancellation policy, and arrival plan.',
        dueDate: '2026-07-31',
        url: stop && stop.sourceUrl,
        priority: 'High'
      }));
    });
  });

  function localIsoDate(value) {
    var date = value || new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function defaultDate() {
    var dates = operationalPlan.days.map(function (day) { return day.id; });
    var today = localIsoDate();
    return dates.find(function (date) { return date >= today; }) || dates[0];
  }

  function emptyState() {
    return { version: 2, activeDate: defaultDate(), modes: {}, stops: {}, tasks: {}, routeChoices: {}, mealChoices: {}, offlineReadiness: {}, offlineMode: false };
  }

  function readState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!parsed || parsed.version !== 2) return emptyState();
      var base = emptyState();
      base.activeDate = operationalPlan.days.some(function (day) { return day.id === parsed.activeDate; }) ? parsed.activeDate : base.activeDate;
      base.modes = parsed.modes && typeof parsed.modes === 'object' ? parsed.modes : {};
      base.stops = parsed.stops && typeof parsed.stops === 'object' ? parsed.stops : {};
      base.tasks = parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {};
      base.routeChoices = parsed.routeChoices && typeof parsed.routeChoices === 'object' ? parsed.routeChoices : {};
      base.mealChoices = parsed.mealChoices && typeof parsed.mealChoices === 'object' ? parsed.mealChoices : {};
      base.offlineReadiness = parsed.offlineReadiness && typeof parsed.offlineReadiness === 'object' ? parsed.offlineReadiness : {};
      base.offlineMode = Boolean(parsed.offlineMode);
      return base;
    } catch (error) {
      return emptyState();
    }
  }

  var tripState = readState();

  var PICKS_KEY = 'pei-foodie-road-trip/picks/v1';

  function readPicks() {
    try {
      var parsed = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null');
      if (!parsed || parsed.version !== 1) return { version: 1, items: {} };
      return { version: 1, items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {} };
    } catch (error) {
      return { version: 1, items: {} };
    }
  }

  var pickState = readPicks();

  function persistPicks() {
    try { localStorage.setItem(PICKS_KEY, JSON.stringify(pickState)); } catch (error) {}
  }

  function itemMark(id) {
    return pickState.items[id] || '';
  }

  function setItemMark(id, mark) {
    if (mark) pickState.items[id] = mark; else delete pickState.items[id];
    persistPicks();
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(tripState));
      setStatus('Saved privately in this browser.');
    } catch (error) {
      setStatus('This browser could not save private progress. Use an export before closing the page.');
    }
  }

  function setStatus(message) {
    if (appStatus) appStatus.textContent = message || '';
    if (message && message !== ROUTINE_SAVE_STATUS) showToast(message);
  }

  // Mirror meaningful status updates as a brief, visible toast. The sr-only
  // live region above still announces every message for assistive tech; this
  // just makes confirmations and errors (copied address, export done, "could
  // not save progress") visible to sighted users on the road.
  function showToast(message) {
    if (!appToast || !message) return;
    appToast.textContent = message;
    appToast.classList.add('is-visible');
    if (appToastTimer) clearTimeout(appToastTimer);
    appToastTimer = setTimeout(function () {
      appToast.classList.remove('is-visible');
    }, 3400);
  }

  function mountToast() {
    if (appToast) return;
    if (!document.getElementById('app-toast-styles')) {
      var style = document.createElement('style');
      style.id = 'app-toast-styles';
      style.textContent = '.app-toast{position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));margin:0 auto;max-width:420px;z-index:200;padding:12px 16px;border-radius:14px;background:#20242a;color:#fff;font-size:14px;font-weight:700;line-height:1.35;text-align:center;box-shadow:0 12px 34px -10px rgba(0,0,0,.55);opacity:0;transform:translateY(14px);transition:opacity .22s ease,transform .22s ease;pointer-events:none}'
        + '.app-toast.is-visible{opacity:1;transform:translateY(0)}'
        + ':root[data-theme="dark"] .app-toast{background:#e8edf2;color:#12171d;box-shadow:0 12px 34px -10px rgba(0,0,0,.7)}'
        + '@media(prefers-reduced-motion:reduce){.app-toast{transition-duration:.01s}}';
      document.head.appendChild(style);
    }
    appToast = document.createElement('div');
    appToast.className = 'app-toast';
    appToast.setAttribute('aria-hidden', 'true');
    document.body.appendChild(appToast);
  }

  function dayById(dayId) {
    return operationalPlan.days.find(function (day) { return day.id === dayId; }) || operationalPlan.days[0];
  }

  function stopById(day, stopId) {
    return day.stops.find(function (stop) { return stop.id === stopId; });
  }

  function modeMinutes(day) {
    var mode = tripState.modes[day.id] || 'preview';
    return mode === 'late60' ? 60 : mode === 'late30' ? 30 : 0;
  }

  function aheadMinutes(day) {
    var mode = tripState.modes[day.id] || 'preview';
    return mode === 'ahead60' ? 60 : mode === 'ahead30' ? 30 : 0;
  }

  function hiddenInMode(day, stop) {
    var minutes = modeMinutes(day);
    return Boolean(stop.skipAt && minutes >= stop.skipAt);
  }

  function stopStatus(stopId) {
    return tripState.stops[stopId] || 'pending';
  }

  function visibleStops(day) {
    return day.stops.filter(function (stop) {
      return stopStatus(stop.id) !== 'skipped' && !hiddenInMode(day, stop);
    });
  }

  function nextStop(day) {
    var list = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    return list.find(function (stop) {
      return stopStatus(stop.id) === 'pending' && (stop.priority === 'required' || stop.priority === 'conditional');
    }) || list.find(function (stop) { return stopStatus(stop.id) === 'pending'; }) || null;
  }

  function routeStops(stops) {
    var usable = [];
    stops.forEach(function (stop) {
      var routeAddress = stop.parkingAddress || stop.address;
      if (!routeAddress || stop.routeEligible === false) return;
      var previous = usable[usable.length - 1];
      var previousAddress = previous ? (previous.parkingAddress || previous.address) : '';
      if (!previous || normalize(previousAddress) !== normalize(routeAddress)) usable.push(stop);
    });
    return usable;
  }

  function routeUrl(stops) {
    var usable = routeStops(stops);
    if (!usable.length) return '';
    if (usable.length === 1) return usable[0].mapUrl || mapSearchUrl(usable[0].parkingAddress || usable[0].address);
    var params = new URLSearchParams();
    params.set('api', '1');
    params.set('origin', usable[0].parkingAddress || usable[0].address);
    params.set('destination', usable[usable.length - 1].parkingAddress || usable[usable.length - 1].address);
    if (usable.length > 2) params.set('waypoints', usable.slice(1, -1).map(function (stop) { return stop.parkingAddress || stop.address; }).join('|'));
    params.set('travelmode', 'driving');
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  function dayRouteUrls(day) {
    var usable = routeStops(visibleStops(day));
    if (usable.length <= 5) return [routeUrl(usable)].filter(Boolean);
    var urls = [];
    for (var start = 0; start < usable.length - 1; start += 4) {
      var segment = usable.slice(start, start + 5);
      if (segment.length < 2) break;
      urls.push(routeUrl(segment));
      if (start + 5 >= usable.length) break;
    }
    return urls;
  }

  function dayRouteUrl(day) {
    return dayRouteUrls(day)[0] || '';
  }

  function dayRouteLinks(day, className) {
    var urls = dayRouteUrls(day);
    return urls.map(function (url, index) {
      var label = urls.length === 1
        ? 'Open active-day route'
        : (index === 0 ? 'Open active-day route' : 'Continue active-day route') + ' · segment ' + (index + 1) + '/' + urls.length;
      return externalLink(url, label, (className || 'button') + ' route-segment');
    }).join('');
  }

  function validateOperationalPlan() {
    var errors = buildErrors.slice();
    var ids = new Set();
    operationalPlan.days.forEach(function (day) {
      if (!day.id || !day.stops.length) errors.push('Day ' + day.id + ' is missing operational stops.');
      day.stops.forEach(function (stop) {
        if (!stop.id || ids.has(stop.id)) errors.push('Duplicate or missing stop id: ' + stop.id);
        ids.add(stop.id);
        if (!stop.address) errors.push('Missing address for ' + stop.id);
        if (stopEligibleForAttractionQuality(stop.kind, stop.title)) {
          if (!stop.attractionQuality) {
            errors.push('Missing kid-friendly backup for attraction stop: ' + stop.id);
          } else {
            if (!stop.attractionQuality.backupTitle || !stop.attractionQuality.backupMapUrl) errors.push('Missing nearby kid backup for attraction stop: ' + stop.id);
          }
        }
      });
      day.meals.forEach(function (slot) {
        if (!stopById(day, slot.selectedStopId)) errors.push('Meal ' + slot.id + ' points to a missing stop.');
      });
    });
    return errors;
  }

  var planValidationErrors = validateOperationalPlan();
  if (planValidationErrors.length) console.warn('Trip plan validation:', planValidationErrors);

  var uiFilters = {
    dayId: tripState.activeDate,
    dayType: '',
    daySearch: '',
    foodDay: '',
    foodMeal: '',
    foodSearch: '',
    foodShowRemoved: false,
    attractionSearch: '',
    attractionShowRemoved: false,
    planbDay: '',
    planbType: '',
    planbSearch: ''
  };
  var secondaryMounted = {};

  function ensureSecondarySection(sectionId) {
    if (secondaryMounted[sectionId]) return;
    if (sectionId === 'overview') renderOverview();
    else if (sectionId === 'food') mountFoodSection();
    else if (sectionId === 'attractions') mountAttractionsSection();
    else if (sectionId === 'hotels') renderHotels();
    else if (sectionId === 'planb') mountPlanBSection();
    else if (sectionId === 'sanity') renderSanity();
    else if (sectionId === 'fuel') renderFuel();
    else if (sectionId === 'sources') renderSources();
    else return;
    secondaryMounted[sectionId] = true;
  }

  function buildNavigation() {
    var tabs = [
      ['live', 'Today'],
      ['daybyday', 'Plan'],
      ['checklist', 'Prep'],
      ['offline', 'Safety']
    ];
    var nav = document.getElementById('nav');
    nav.innerHTML = tabs.map(function (tab, index) {
      return '<button type="button" class="navbtn" role="tab" tabindex="' + (index === 0 ? '0' : '-1') + '" id="tab-' + tab[0] + '" aria-controls="' + tab[0] + '" aria-selected="' + (index === 0 ? 'true' : 'false') + '" data-section="' + tab[0] + '">' + escapeHtml(tab[1]) + '</button>';
    }).join('');
    nav.addEventListener('click', function (event) {
      var button = event.target.closest('[data-section]');
      if (button) activateSection(button.dataset.section, true);
    });
    document.getElementById('themeToggle').addEventListener('click', cycleTheme);
    nav.addEventListener('keydown', function (event) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
      var buttons = Array.from(nav.querySelectorAll('[role="tab"]'));
      var index = buttons.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') index = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = buttons.length - 1;
      buttons[index].focus();
      activateSection(buttons[index].dataset.section, false);
    });
  }

  function validSectionId(value) {
    var id = String(value || '').replace(/^#/, '');
    var known = ['live', 'daybyday', 'checklist', 'offline', 'overview', 'food', 'attractions', 'hotels', 'planb', 'sanity', 'fuel', 'sources'];
    return /^[a-z]+$/.test(id) && known.indexOf(id) !== -1 ? id : '';
  }

  function primarySectionId(sectionId) {
    if (sectionId === 'live' || sectionId === 'daybyday' || sectionId === 'checklist' || sectionId === 'offline') return sectionId;
    if (sectionId === 'overview' || sectionId === 'hotels') return 'checklist';
    if (sectionId === 'food' || sectionId === 'attractions' || sectionId === 'planb') return 'daybyday';
    return 'offline';
  }

  function activateSection(sectionId, moveFocus, fromHistory) {
    ensureSecondarySection(sectionId);
    if (!fromHistory) {
      try { history.pushState({ section: sectionId }, '', '#' + sectionId); } catch (error) {}
    }
    var sections = Array.from(document.querySelectorAll('main > section'));
    var tabSection = primarySectionId(sectionId);
    sections.forEach(function (section) {
      var active = section.id === sectionId;
      section.classList.toggle('active', active);
      section.hidden = !active;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', 'tab-' + tabSection);
    });
    Array.from(document.querySelectorAll('#nav [role="tab"]')).forEach(function (button) {
      var selected = button.dataset.section === tabSection;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('tabindex', selected ? '0' : '-1');
    });
    var activeTab = document.querySelector('#nav [data-section="' + tabSection + '"]');
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    // Build (or resize) the consolidated route map only when the Plan section is
    // actually shown, so its tiles stay off the initial page load.
    if (sectionId === 'daybyday') ensureMap(tripMap);
    if (sectionId === 'planb') ensureMap(planBMap);
    if (moveFocus) {
      var target = document.getElementById(sectionId);
      var heading = target && target.querySelector('.section-heading, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function riskClass(risk) {
    return normalize(risk) === 'high' ? 'warn' : normalize(risk) === 'low' ? 'ok' : '';
  }

  function statusLabel(status) {
    return status === 'done' ? 'Completed' : status === 'skipped' ? 'Skipped' : 'Pending';
  }

  var prepMilestones = [
    { date: '2026-07-22', title: 'Save Hopewell admission + tide links', detail: 'Low tide is predicted for 11:52 AM on Aug 19. Advance admission has no access advantage; park staff control actual ocean-floor access.' },
    { date: '2026-07-31', title: 'Buy Montmorency daily access + book restaurants', detail: 'Sépaq online daily access before Aug 15, then reserve La Bûche, Slaymaker & Nichols and Tide & Boar. New Glasgow is walk-in, and Aug 16 dinner is on site at Delta.' },
    { date: '2026-08-07', title: 'Save all seven booked-hotel confirmations offline', detail: 'The stays are booked and safe. Keep the private confirmation emails or screenshots on both phones; choose the Aug 18 luggage handoff only if it improves convenience.' },
    { date: '2026-08-08', title: 'Agree the Aug 21 fatigue and rest plan', detail: 'All hotels are booked, so no extra overnight is suggested. Set the two-driver rotation, plan generous rest and driver-swap breaks, and agree the honest go/rest checkpoint at westbound Mallorytown North around 14:00.' },
    { date: '2026-08-11', title: 'Week-before verification sweep', detail: 'Plan A restaurant/attraction hours, Magnetic Hill clock, saved 91-AKI stations, Confederation Bridge status, Old Home Week parking and the family packing checklist.' },
    { date: '2026-08-13', title: 'Offline prep day', detail: 'Download map areas, cache photos, export a sync code to the second phone, and save the emergency text pack (Offline pack tab).' },
    { date: '2026-08-17', title: 'Re-verify Hopewell tides + trip weather', detail: 'Official tide table 24–48h out, plus Environment Canada forecasts and the hurricane outlook for every overnight city.' }
  ];

  function daysBetween(fromIso, toIso) {
    return Math.round((new Date(toIso + 'T12:00:00') - new Date(fromIso + 'T12:00:00')) / 86400000);
  }

  function renderCountdown() {
    var today = localIsoDate();
    var toGo = daysBetween(today, '2026-08-14');
    var countdownCard;
    if (toGo > 0) countdownCard = '<div class="card kpi countdown-card"><div class="num">' + toGo + '</div><div class="label">Day' + (toGo === 1 ? '' : 's') + ' until departure (Aug 14)</div></div>';
    else if (toGo <= 0 && daysBetween(today, '2026-08-21') >= 0) countdownCard = '<div class="card kpi countdown-card"><div class="num">Day ' + (1 - toGo) + ' of 8</div><div class="label">Trip in progress — open Trip control</div></div>';
    else countdownCard = '<div class="card kpi countdown-card"><div class="num">Done</div><div class="label">Trip completed Aug 21, 2026</div></div>';
    var rows = prepMilestones.map(function (item) {
      var delta = daysBetween(today, item.date);
      var state = delta < 0 ? 'overdue' : delta === 0 ? 'today' : 'upcoming';
      var when = delta < 0 ? Math.abs(delta) + ' day' + (delta === -1 ? '' : 's') + ' overdue' : delta === 0 ? 'Today' : 'in ' + delta + ' day' + (delta === 1 ? '' : 's');
      return '<li class="milestone ' + state + '"><span class="milestone-date">' + escapeHtml(item.date.slice(5).replace('-', '/')) + '<em>' + escapeHtml(when) + '</em></span><div><strong>' + escapeHtml(item.title) + '</strong><p class="small">' + escapeHtml(item.detail) + '</p></div></li>';
    }).join('');
    return { kpi: countdownCard, schedule: '<div class="card full"><h3>Countdown schedule — what to confirm when</h3><p class="small muted">Matches the checklist tab; check items off there as they get done.</p><ol class="milestone-list">' + rows + '</ol></div>' };
  }

  function renderRouteMap() {
    var dot = function (x, y, label, lx, ly, anchor, sub) {
      return '<circle cx="' + x + '" cy="' + y + '" r="7" class="city-dot"/>' +
        '<text x="' + lx + '" y="' + ly + '" text-anchor="' + (anchor || 'middle') + '">' + label + '</text>' +
        (sub ? '<text class="sub" x="' + lx + '" y="' + (ly + 14) + '" text-anchor="' + (anchor || 'middle') + '">' + sub + '</text>' : '');
    };
    return [
      '<div class="card full route-map"><h3>Route at a glance</h3>',
      '<p class="small muted">Stylized, not to scale — works offline. Out Aug 14–17, back Aug 19–21 along the same corridor via Hopewell Rocks.</p>',
      '<svg viewBox="0 0 720 300" role="img" aria-label="Stylized route map: Vaughan to Montréal, Québec City, Fredericton, Charlottetown, then back through Hopewell Rocks, Moncton, and Québec City, with an optional 1.5-hour Kingston Penitentiary tour on the Ontario corridor">',
      '<path class="route-line" d="M55,165 C130,190 190,175 255,125 C295,95 320,88 355,82 C400,74 430,80 448,102 C470,130 480,165 500,195 C540,210 560,200 588,186 C620,170 650,150 668,132"/>',
      '<path class="route-spur" d="M588,186 C583,200 578,210 576,224"/>',
      dot(55, 165, 'Vaughan', 14, 195, 'start', 'Start Aug 14 · home Aug 21'),
      '<circle cx="168" cy="171" r="6" class="optional-dot"/>',
      '<text x="168" y="146" text-anchor="middle">Kingston Penitentiary</text>',
      '<text class="sub" x="168" y="160" text-anchor="middle">Optional visit · 1.5 h tour</text>',
      dot(255, 125, 'Montréal', 248, 94, 'middle', 'Aug 14'),
      dot(355, 82, 'Québec City', 355, 62, 'middle', 'Aug 15 &amp; Aug 20'),
      dot(500, 195, 'Fredericton', 500, 225, 'middle', 'Night of Aug 16'),
      dot(668, 132, 'Charlottetown', 660, 112, 'end', 'Aug 17–18 · PEI'),
      dot(588, 186, 'Moncton', 612, 175, 'start', 'Night of Aug 19'),
      '<circle cx="576" cy="228" r="5" class="city-dot spur-dot"/>',
      '<text x="576" y="252" text-anchor="middle">Hopewell Rocks</text>',
      '<text class="sub" x="576" y="266" text-anchor="middle">Estimated 9 AM–2:45 PM · confirm with staff</text>',
      '</svg></div>'
    ].join('');
  }

  function renderOverview() {
    var section = document.getElementById('overview');
    var countdown = renderCountdown();
    section.innerHTML = [
      '<h2 class="section-heading">Trip overview</h2>',
      '<div class="grid">',
      countdown.kpi,
      '<div class="card kpi"><div class="num">8</div><div class="label">Calendar days</div></div>',
      '<div class="card kpi"><div class="num">7</div><div class="label">Hotel nights</div></div>',
      '<div class="card kpi"><div class="num">~3,900</div><div class="label">Validated planning km, approximate</div></div>',
      renderRouteMap(),
      countdown.schedule,
      '<div class="card full ok"><h3>Recommended travel pace</h3><p>One priority experience per day, one proper seated lunch, one proper dinner and a protected hotel reset. Optional means genuinely easy to skip. Aug 16 and Aug 20 are the tiring transfer days; both use short movement breaks, two-driver swaps and no major activity after arrival.</p></div>',
      '<div class="card half"><h3>Planning budget</h3><p><strong>C$2,700–3,600 excluding the seven hotels already booked.</strong> Working range: fuel C$650–800, meals C$1,400–1,900, admissions/parking/tolls C$250–400 and contingency C$400–500. These are planning allowances, not quoted prices; enter confirmed hotel totals in Trip spend.</p></div>',
      '<div class="card half"><h3>Important reservations</h3><p>Reserve the Montmorency Manoir lunch, La Bûche, Slaymaker &amp; Nichols and Tide &amp; Boar. Buy Montmorency access online. Green Gables is free under the 2026 pass; Hopewell access still depends on park staff and the tide.</p></div>',
      '<div class="card half"><h3>Seasonal conditions</h3><p>Mid-August can bring heat, humidity, thunderstorms, coastal wind, heavy rain and wildfire smoke. A reliable day-specific forecast is not available this far ahead: use the linked Environment Canada forecast 72 hours out and again each morning. Thunder or red flags cancel swimming; smoke or poor air quality moves the family indoors.</p></div>',
      '<div class="card half"><h3>Fastest way to use it</h3><p>Open <strong>Trip plan</strong>, choose the day and follow the stops in order. Every stop shows a recognizable destination name; attractions route to the closest practical parking. Ahead mode suggests one safe extra; late mode removes optional stops before meals or hotel recovery.</p></div>',
      '<div class="card full warn"><h3>Final audit note</h3><p>The route avoids backtracking, includes a break about every 1.5–2.5 hours, protects all meal periods and respects every booked hotel access time. Recheck traffic, construction, hours, tides, air quality and reservations shortly before travel; Old Home Week can increase Charlottetown traffic and parking pressure.</p></div>',
      '</div>'
    ].join('');
  }

  // ---------------------------------------------------------------------------
  // Consolidated route map. One interactive Leaflet + Google Maps tile view of
  // the whole Vaughan → PEI → Vaughan trip, built from the same operationalPlan
  // stop data used everywhere else (no parallel stop list). Leaflet is vendored
  // under vendor/leaflet, so only the map tiles need a connection — inherent to any
  // web map. Everything degrades to a clear message if the library or tiles are
  // unavailable, and the day plans below always list every stop.
  // ---------------------------------------------------------------------------
  var MAP_CATEGORIES = {
    start: { label: 'Start / Finish', color: '#111827' },
    hotel: { label: 'Hotel', color: '#0b6b72' },
    food: { label: 'Food stop', color: '#c1442c' },
    attraction: { label: 'Attraction', color: '#1f8f6e' },
    fuel: { label: 'Fuel', color: '#b5721f' },
    safety: { label: 'Rest / service', color: '#5c6470' },
    other: { label: 'Other stop', color: '#8a94a3' }
  };

  // Map each stop to one legend category from its kind/title. Order matters:
  // more specific matches (start/finish, fuel, food) are tested before the
  // broader hotel/attraction buckets.
  function mapCategoryKey(stop) {
    var text = normalize([stop.kind, stop.title, stop.locationName].join(' '));
    if (/finish|arrive vaughan|maple honda|depart vaughan/.test(text)) return 'start';
    if (/fuel|\besso\b|shell|gas station/.test(text)) return 'fuel';
    if (/breakfast|brunch|lunch|dinner|restaurant|bistro|\bcafe\b|\bpub\b|market|suppers|fromagerie|pizza|grill|resto|gastropub|dining/.test(text)) return 'food';
    if (/hotel|check in|check-in|check out|checkout|bag drop|return to|overnight|marriott|delta|hampton|best western|doubletree|cofortel|value inn|quarter-tank/.test(text)) return 'hotel';
    if (/\brest\b|washroom|stretch|driver swap|\bservice\b|onroute|checkpoint|\bmall\b|movement/.test(text)) return 'safety';
    if (/falls|\bpark\b|beach|bridge|museum|gables|rocks|hill|quai|terrace|gorge|nature|covered|prehistoric|big apple|victoria|illusion|garden|ripley|stroll|\bwalk\b/.test(text)) return 'attraction';
    return 'other';
  }

  function stopIsOptional(stop) {
    return stop.priority === 'optional' || stop.priority === 'conditional' || Boolean(stop.choiceGated);
  }

  // The consolidated route map is an instance rather than a singleton so it can
  // appear in more than one place: the Plan tab and the Plan B tab each get their
  // own independent Leaflet map, both driven from the one shared model built
  // below. Each state carries the element ids of its own DOM host and controls.
  var TRIP_MAP_IDS = { host: 'tripMap', fallback: 'tripMapFallback', status: 'tripMapStatus', day: 'tripMapDay', type: 'tripMapType', optional: 'tripMapOptional', ideas: 'tripMapIdeas', route: 'tripMapRoute', fit: 'tripMapFit', reset: 'tripMapReset', locate: 'tripMapLocate', locateStatus: 'tripMapLocateStatus' };
  var PLANB_MAP_IDS = { host: 'planbMap', fallback: 'planbMapFallback', status: 'planbMapStatus', day: 'planbMapDay', type: 'planbMapType', optional: 'planbMapOptional', ideas: 'planbMapIdeas', route: 'planbMapRoute', fit: 'planbMapFit', reset: 'planbMapReset', locate: 'planbMapLocate', locateStatus: 'planbMapLocateStatus' };

  function createMapState(ids) {
    return {
      map: null, tiles: null, routeLayer: null, markerLayer: null,
      built: false, unavailable: false, markers: [], ids: ids,
      filters: { day: 'all', type: 'all', optional: true, ideas: true, route: true },
      locating: false, locateWatchId: null, locateMarker: null, locateAccuracy: null
    };
  }
  var tripMap = createMapState(TRIP_MAP_IDS);
  var planBMap = createMapState(PLANB_MAP_IDS);
  var sharedMapModel = null;

  function buildTripMapModel() {
    if (sharedMapModel) return sharedMapModel;
    var dayMeta = {};
    operationalPlan.days.forEach(function (day, index) {
      dayMeta[day.id] = { index: index + 1, label: day.label, routeFocus: day.routeFocus };
    });
    var ordered = [];
    var missing = [];
    operationalPlan.days.forEach(function (day) {
      day.stops.forEach(function (stop) {
        var info = {
          id: stop.id, dayId: stop.dayId, day: dayMeta[stop.dayId],
          title: stop.title, locationName: stop.locationName,
          kind: stop.kind, time: stop.time, zone: stop.zone,
          address: stop.parkingAddress || stop.address || '',
          city: stop.city || '', mapUrl: stop.mapUrl || '',
          category: mapCategoryKey(stop), optional: stopIsOptional(stop),
          routeEligible: stop.routeEligible !== false && !stop.conditional,
          coords: stop.coords, rating: stop.rating
        };
        if (!stop.coords) { missing.push(info); return; }
        ordered.push(info);
      });
    });
    // Collapse stops that share a location (rounded to ~11 m) into one pin, so a
    // hotel used across several days is a single clickable marker rather than a
    // stack. The route line still visits every stop position in order below.
    var locations = [];
    var byKey = {};
    ordered.forEach(function (info) {
      var key = info.coords[0].toFixed(4) + ',' + info.coords[1].toFixed(4);
      var loc = byKey[key];
      if (!loc) {
        loc = { key: key, coords: info.coords, seq: locations.length + 1, stops: [], days: {} };
        byKey[key] = loc;
        locations.push(loc);
      }
      loc.stops.push(info);
      loc.days[info.dayId] = true;
    });
    locations.forEach(function (loc) {
      var lead = loc.stops.filter(function (s) { return !s.optional; })[0] || loc.stops[0];
      loc.category = lead.category;
      loc.allOptional = loc.stops.every(function (s) { return s.optional; });
      loc.title = lead.locationName || lead.title;
    });
    // Append the per-day "Along-the-way options" as separate, un-numbered idea
    // pins (★) so the plan can be changed anywhere. They reuse routeOptionsByDay
    // — the same data the itinerary's option panels render — and never join the
    // numbered driving sequence or the route line.
    var ideaCount = 0;
    Object.keys(routeOptionsByDay).forEach(function (dayId) {
      var plan = routeOptionsByDay[dayId];
      (plan.options || []).forEach(function (option) {
        if (!option.coords) return;
        ideaCount += 1;
        var info = {
          id: 'idea-' + slug(dayId + '-' + option.name),
          dayId: dayId, day: dayMeta[dayId], title: option.name, locationName: option.name,
          kind: 'Optional idea', time: option.visit || 'Flexible', zone: '',
          address: option.parking || '', city: '', mapUrl: option.map || '',
          category: 'attraction', optional: true, routeEligible: false, isIdea: true,
          note: option.why || '', gate: option.gate || '', routePoint: option.routePoint || '',
          source: option.source || '', coords: option.coords
        };
        var days = {};
        days[dayId] = true;
        locations.push({
          key: 'idea-' + info.id, coords: option.coords, seq: null, isIdea: true,
          allOptional: true, category: 'attraction', title: option.name, stops: [info], days: days
        });
      });
    });
    // Append TripAdvisor "Plan B" rows that aren't already the same physical
    // stop as an existing numbered/idea pin (see PLAN_B_IDEA_COORDS) as further
    // ★ idea pins, so the map surfaces genuine alternates rather than doubling
    // up markers on stops Plan A already uses. Two Plan B rows sharing a
    // location (e.g. Parc des Chutes on both the outbound and return legs)
    // collapse into one shared pin, same as hotel stops do above.
    var planBByKey = {};
    planBData.stops.forEach(function (stop) {
      var coords = PLAN_B_IDEA_COORDS[stop.name];
      if (!coords) return;
      var dayId = stop.date;
      ideaCount += 1;
      var ratingNote = stop.rating
        ? '★ ' + Number(stop.rating).toFixed(1) + ' TripAdvisor (' + stop.reviews + ' reviews) — '
        : 'TripAdvisor — ';
      var info = {
        id: 'planb-' + slug(dayId + '-' + stop.name),
        dayId: dayId, day: dayMeta[dayId], title: stop.name, locationName: stop.name,
        kind: 'Plan B idea', time: stop.duration || 'Flexible', zone: '',
        address: stop.parking || '', city: '', mapUrl: stop.mapsUrl || '',
        category: planBTypeBucket(stop.type) === 'Food' ? 'food' : 'attraction',
        optional: true, routeEligible: false, isIdea: true,
        note: ratingNote + stop.why, gate: stop.skipIf || '', routePoint: stop.segment || '',
        source: stop.taUrl || '', sourceLabel: 'TripAdvisor', coords: coords
      };
      var key = coords[0].toFixed(4) + ',' + coords[1].toFixed(4);
      var loc = planBByKey[key];
      if (!loc) {
        loc = {
          key: 'planb-' + key, coords: coords, seq: null, isIdea: true,
          allOptional: true, category: info.category, title: stop.name, stops: [], days: {}
        };
        planBByKey[key] = loc;
        locations.push(loc);
      }
      loc.stops.push(info);
      loc.days[dayId] = true;
    });
    sharedMapModel = { ordered: ordered, locations: locations, missing: missing, ideaCount: ideaCount };
    return sharedMapModel;
  }

  function tripMarkerIcon(loc) {
    var cat = MAP_CATEGORIES[loc.category] || MAP_CATEGORIES.other;
    if (loc.isIdea) {
      // Un-numbered star marks a route-side "swap-in" idea, distinct from the
      // numbered scheduled stops.
      return L.divIcon({
        className: 'trip-pin-wrap',
        html: '<span class="trip-pin is-idea" style="--pin:' + cat.color + '">★</span>',
        iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12]
      });
    }
    var cls = 'trip-pin' + (loc.allOptional ? ' is-optional' : '');
    return L.divIcon({
      className: 'trip-pin-wrap',
      html: '<span class="' + cls + '" style="--pin:' + cat.color + '">' + loc.seq + '</span>',
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
  }

  function tripPopupHtml(loc) {
    var rows = loc.stops.map(function (s) {
      var cat = MAP_CATEGORIES[s.category] || MAP_CATEGORIES.other;
      var dirUrl = safeExternalUrl(s.mapUrl);
      var sourceUrl = s.isIdea ? safeExternalUrl(s.source) : '';
      var links = [];
      if (dirUrl) links.push('<a class="trip-pop-dir" href="' + escapeHtml(dirUrl) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Get directions ↗</a>');
      if (sourceUrl) links.push('<a class="trip-pop-dir" href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + escapeHtml(s.sourceLabel || 'Official info') + ' ↗</a>');
      var linkHtml = links.length ? links.join(' · ') : '<span class="muted small">No map link available</span>';
      return [
        '<li class="trip-pop-stop">',
        '<span class="trip-pop-dot" style="background:', cat.color, '"></span>',
        '<div class="trip-pop-body">',
        '<p class="trip-pop-title">', escapeHtml(s.title), s.optional ? ' <span class="trip-pop-flag">' + (s.isIdea ? 'Idea' : 'Optional') + '</span>' : '', '</p>',
        '<p class="trip-pop-meta">Day ', String(s.day ? s.day.index : '?'), ' · ', escapeHtml(cat.label), ' · ', escapeHtml(s.time || 'Flexible'), s.zone ? ' ' + escapeHtml(s.zone) : '', '</p>',
        s.isIdea && s.routePoint ? '<p class="trip-pop-meta">' + escapeHtml(s.routePoint) + '</p>' : '',
        s.isIdea && s.note ? '<p class="trip-pop-note">' + escapeHtml(s.note) + '</p>' : '',
        !s.isIdea && s.rating ? '<p class="trip-pop-meta">' + stopRatingChip(s.rating) + '</p>' : '',
        s.address ? '<p class="trip-pop-addr">' + escapeHtml(s.address) + '</p>' : '',
        s.isIdea && s.gate ? '<p class="trip-pop-gate"><strong>Go / no-go:</strong> ' + escapeHtml(s.gate) + '</p>' : '',
        '<p class="trip-pop-links">', linkHtml, '</p>',
        '</div></li>'
      ].join('');
    }).join('');
    var head = loc.isIdea
      ? 'Optional idea'
      : 'Stop ' + loc.seq + (loc.stops.length > 1 ? ' · ' + loc.stops.length + ' visits' : '');
    return '<div class="trip-pop"><p class="trip-pop-head">' + head + '</p><ul class="trip-pop-list">' + rows + '</ul></div>';
  }

  // Route line: route-eligible stops in chronological order, dropping repeated
  // points so a hotel visited on consecutive legs does not create a zero-length
  // segment. Optionally clipped to a single day.
  function tripRouteLatLngs(filterDay) {
    var pts = [];
    if (!sharedMapModel) return pts;
    sharedMapModel.ordered.forEach(function (info) {
      if (!info.routeEligible) return;
      if (filterDay !== 'all' && info.dayId !== filterDay) return;
      var last = pts[pts.length - 1];
      if (last && last[0] === info.coords[0] && last[1] === info.coords[1]) return;
      pts.push(info.coords);
    });
    return pts;
  }

  function showMapFallback(state, message) {
    var host = document.getElementById(state.ids.host);
    var fallback = document.getElementById(state.ids.fallback);
    if (host) host.setAttribute('hidden', 'hidden');
    if (fallback) { fallback.textContent = message; fallback.removeAttribute('hidden'); }
  }

  function updateMapStatus(state, shownStops, shownIdeas) {
    var status = document.getElementById(state.ids.status);
    if (!status) return;
    var missing = sharedMapModel ? sharedMapModel.missing.length : 0;
    var text = 'Showing ' + shownStops + ' scheduled stop' + (shownStops === 1 ? '' : 's') +
      ' and ' + shownIdeas + ' optional idea' + (shownIdeas === 1 ? '' : 's') + '.';
    if (missing) text += ' ' + missing + ' stop' + (missing === 1 ? '' : 's') + ' without coordinates are listed in the day plans below.';
    status.textContent = text;
  }

  function fitMap(state, coords) {
    if (!state.map || !coords || !coords.length) return;
    try {
      state.map.fitBounds(L.latLngBounds(coords), { padding: [26, 26], maxZoom: 12 });
    } catch (error) { /* bounds can be empty while a filter matches nothing */ }
  }

  function refreshMap(state, fit) {
    if (!state.built) return;
    var filters = state.filters;
    var fitCoords = [];
    var shownStops = 0;
    var shownIdeas = 0;
    state.markerLayer.clearLayers();
    state.markers.forEach(function (entry) {
      var loc = entry.loc;
      var dayOk = filters.day === 'all' || loc.days[filters.day];
      var typeOk = filters.type === 'all' || loc.stops.some(function (s) { return s.category === filters.type; });
      var optionalOk = loc.isIdea ? filters.ideas : (filters.optional || !loc.allOptional);
      if (dayOk && typeOk && optionalOk) {
        state.markerLayer.addLayer(entry.marker);
        fitCoords.push(loc.coords);
        if (loc.isIdea) {
          shownIdeas += 1;
        } else {
          shownStops += loc.stops.filter(function (s) {
            if (filters.day !== 'all' && s.dayId !== filters.day) return false;
            if (filters.type !== 'all' && s.category !== filters.type) return false;
            if (!filters.optional && s.optional) return false;
            return true;
          }).length;
        }
      }
    });
    state.routeLayer.clearLayers();
    if (filters.route) {
      var pts = tripRouteLatLngs(filters.day);
      if (pts.length > 1) {
        L.polyline(pts, { color: '#c1442c', weight: 3, opacity: 0.78, lineJoin: 'round' }).addTo(state.routeLayer);
        pts.forEach(function (p) { fitCoords.push(p); });
      }
    }
    updateMapStatus(state, shownStops, shownIdeas);
    if (fit) fitMap(state, fitCoords);
  }

  function buildMapMarkers(state) {
    state.markers = sharedMapModel.locations.map(function (loc) {
      var marker = L.marker(loc.coords, {
        icon: tripMarkerIcon(loc), riseOnHover: true,
        zIndexOffset: loc.allOptional ? 0 : 250, keyboard: true,
        title: loc.seq + '. ' + loc.title
      });
      // Keep popups small enough that autoPan can hold them fully inside a
      // ~320x340 px mobile map: a capped width, and a maxHeight so a multi-visit
      // hotel popup scrolls internally instead of overflowing the map/viewport.
      marker.bindPopup(tripPopupHtml(loc), { maxWidth: 236, minWidth: 180, maxHeight: 232, autoPanPadding: [16, 18] });
      return { loc: loc, marker: marker };
    });
  }

  // Built lazily the first time its tab is opened: a Leaflet map needs a sized,
  // visible container, and this keeps map tiles off the initial page load. Both
  // the Plan and Plan B maps share this one builder via their state object.
  function ensureMap(state) {
    if (state.unavailable) return;
    if (state.built) {
      if (state.map) { try { state.map.invalidateSize(); } catch (error) {} }
      return;
    }
    var host = document.getElementById(state.ids.host);
    if (!host) return;
    var model = buildTripMapModel();
    if (typeof L === 'undefined' || !model.locations.length) {
      state.unavailable = true;
      showMapFallback(state, typeof L === 'undefined'
        ? 'The interactive map could not load (it needs a connection the first time). Every stop is still listed in the day plans below.'
        : 'No mapped stops are available yet. The day plans below list every stop.');
      return;
    }
    try {
      var map = L.map(host, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      state.map = map;
      // OpenStreetMap standard raster tiles. Unlike Google's private vt endpoint
      // (which required no key but sat outside Google's Maps terms and could not
      // legally be cached), these are served under the ODbL and may be displayed
      // and cached for offline use by a low-traffic personal site as long as the
      // attribution below is shown. The service worker caches viewed tiles, and
      // the Safety tab's "Save map + photos" button pre-fetches the route
      // corridor. The tileerror handler keeps offline gaps from surfacing as
      // errors.
      state.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      });
      // Keep offline/blocked tile gaps from surfacing as errors.
      state.tiles.on('tileerror', function () {});
      state.tiles.addTo(map);
      state.routeLayer = L.layerGroup().addTo(map);
      state.markerLayer = L.layerGroup().addTo(map);
      // Only grab wheel-zoom once the map has focus, so the page still scrolls
      // past it on desktop and mobile.
      map.on('focus', function () { map.scrollWheelZoom.enable(); });
      map.on('blur', function () { map.scrollWheelZoom.disable(); });
      buildMapMarkers(state);
      state.built = true;
      refreshMap(state, true);
    } catch (error) {
      state.unavailable = true;
      showMapFallback(state, 'The route map could not be drawn in this browser. The day plans below list every stop.');
    }
  }

  function tripMapLegendHtml() {
    var items = Object.keys(MAP_CATEGORIES).map(function (key) {
      var cat = MAP_CATEGORIES[key];
      return '<span class="trip-legend-item"><span class="trip-legend-dot" style="background:' + cat.color + '"></span>' + escapeHtml(cat.label) + '</span>';
    });
    items.push('<span class="trip-legend-item"><span class="trip-legend-dot trip-legend-optional"></span>Optional stop (hollow pin)</span>');
    items.push('<span class="trip-legend-item"><span class="trip-legend-dot trip-legend-idea">★</span>Route-side idea</span>');
    return items.join('');
  }

  function mapMarkup(state, opts) {
    var ids = state.ids;
    var dayOptions = operationalPlan.days.map(function (day, index) {
      return '<option value="' + escapeHtml(day.id) + '">Day ' + (index + 1) + ' · ' + escapeHtml(day.label) + '</option>';
    }).join('');
    var typeOptions = Object.keys(MAP_CATEGORIES).map(function (key) {
      return '<option value="' + key + '">' + escapeHtml(MAP_CATEGORIES[key].label) + '</option>';
    }).join('');
    return [
      '<div class="card full trip-map-card" role="group" aria-label="', escapeHtml(opts.cardAria), '">',
      '<div class="trip-map-head"><h3>', escapeHtml(opts.title), '</h3>',
      '<p class="small muted">', opts.intro, '</p></div>',
      '<div class="trip-map-controls">',
      '<label class="trip-map-field">Day<select id="' + ids.day + '"><option value="all">Show entire trip</option>', dayOptions, '</select></label>',
      '<label class="trip-map-field">Stop type<select id="' + ids.type + '"><option value="all">All stop types</option>', typeOptions, '</select></label>',
      '<label class="trip-map-check"><input type="checkbox" id="' + ids.optional + '" checked> Optional stops</label>',
      '<label class="trip-map-check"><input type="checkbox" id="' + ids.ideas + '" checked> Route-side ideas</label>',
      '<label class="trip-map-check"><input type="checkbox" id="' + ids.route + '" checked> Route line</label>',
      '<button type="button" class="button subtle" id="' + ids.fit + '">Fit route to screen</button>',
      '<button type="button" class="button subtle" id="' + ids.reset + '">Show entire trip</button>',
      '<button type="button" class="button subtle" id="' + ids.locate + '">Show my location</button>',
      '</div>',
      '<div id="' + ids.host + '" class="trip-map" role="application" aria-label="', escapeHtml(opts.mapAria), '"></div>',
      '<p id="' + ids.fallback + '" class="trip-map-fallback" hidden></p>',
      '<p id="' + ids.locateStatus + '" class="small muted" role="status" aria-live="polite"></p>',
      '<div class="trip-map-foot"><div class="trip-legend" aria-label="Map legend">', tripMapLegendHtml(), '</div>',
      '<p id="' + ids.status + '" class="small muted" role="status" aria-live="polite"></p></div>',
      '</div>'
    ].join('');
  }

  // Opt-in live location for a route map: toggled on/off by its "Show my
  // location" button. Uses watchPosition so the dot tracks movement while the
  // tab stays open; like findNearestStop above, the position is only ever used
  // in-page to place the marker and is never stored or transmitted.
  function liveLocationIcon() {
    return L.divIcon({
      className: 'trip-you-wrap',
      html: '<span class="trip-you-dot"></span>',
      iconSize: [16, 16], iconAnchor: [8, 8]
    });
  }

  function stopLiveLocation(state) {
    if (state.locateWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(state.locateWatchId);
    state.locateWatchId = null;
    state.locating = false;
    if (state.locateMarker) { state.map.removeLayer(state.locateMarker); state.locateMarker = null; }
    if (state.locateAccuracy) { state.map.removeLayer(state.locateAccuracy); state.locateAccuracy = null; }
    var button = document.getElementById(state.ids.locate);
    if (button) button.textContent = 'Show my location';
  }

  function toggleLiveLocation(state) {
    var status = document.getElementById(state.ids.locateStatus);
    if (state.locating) { stopLiveLocation(state); if (status) status.textContent = ''; return; }
    if (!state.map) {
      if (status) status.textContent = 'The map is unavailable, so live location can’t be shown here.';
      return;
    }
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location is not available on this device.';
      return;
    }
    state.locating = true;
    var button = document.getElementById(state.ids.locate);
    if (button) button.textContent = 'Stop live location';
    if (status) status.textContent = 'Getting your location…';
    var firstFix = true;
    state.locateWatchId = navigator.geolocation.watchPosition(function (position) {
      var here = [position.coords.latitude, position.coords.longitude];
      var accuracy = position.coords.accuracy || 0;
      if (!state.locateMarker) {
        state.locateMarker = L.marker(here, { icon: liveLocationIcon(), zIndexOffset: 1000, keyboard: false, interactive: false }).addTo(state.map);
        state.locateAccuracy = L.circle(here, { radius: accuracy, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.08, interactive: false }).addTo(state.map);
      } else {
        state.locateMarker.setLatLng(here);
        state.locateAccuracy.setLatLng(here).setRadius(accuracy);
      }
      if (status) status.textContent = 'Live location on · accurate to about ' + Math.round(accuracy) + ' m.';
      if (firstFix) { state.map.setView(here, Math.max(state.map.getZoom(), 13)); firstFix = false; }
    }, function (error) {
      if (status) {
        status.textContent = error && error.code === 1
          ? 'Location permission was declined.'
          : 'Could not get your location. Check that GPS/location is on and try again.';
      }
      stopLiveLocation(state);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function wireMapControls(state) {
    var ids = state.ids;
    var dayField = document.getElementById(ids.day);
    var typeField = document.getElementById(ids.type);
    var optionalField = document.getElementById(ids.optional);
    var ideasField = document.getElementById(ids.ideas);
    var routeField = document.getElementById(ids.route);
    var fitButton = document.getElementById(ids.fit);
    var resetButton = document.getElementById(ids.reset);
    var locateButton = document.getElementById(ids.locate);
    if (dayField) dayField.addEventListener('change', function () {
      state.filters.day = dayField.value;
      refreshMap(state, true);
      // The Plan-tab route map shares its Day filter with the itinerary dropdown
      // just below it, so changing one changes both (skip the "entire trip" value,
      // which the itinerary has no equivalent for).
      if (state === tripMap && dayField.value !== 'all') syncItineraryDayFromMap(dayField.value);
    });
    if (typeField) typeField.addEventListener('change', function () { state.filters.type = typeField.value; refreshMap(state, true); });
    if (optionalField) optionalField.addEventListener('change', function () { state.filters.optional = optionalField.checked; refreshMap(state, false); });
    if (ideasField) ideasField.addEventListener('change', function () { state.filters.ideas = ideasField.checked; refreshMap(state, false); });
    if (routeField) routeField.addEventListener('change', function () { state.filters.route = routeField.checked; refreshMap(state, false); });
    if (fitButton) fitButton.addEventListener('click', function () { refreshMap(state, true); });
    if (locateButton) locateButton.addEventListener('click', function () { toggleLiveLocation(state); });
    if (resetButton) resetButton.addEventListener('click', function () {
      state.filters = { day: 'all', type: 'all', optional: true, ideas: true, route: true };
      if (dayField) dayField.value = 'all';
      if (typeField) typeField.value = 'all';
      if (optionalField) optionalField.checked = true;
      if (ideasField) ideasField.checked = true;
      if (routeField) routeField.checked = true;
      refreshMap(state, true);
    });
  }

  // Select a day in the itinerary: update state, persist and re-render. Shared by
  // the itinerary Day dropdown and by the route map's Day filter, which sync.
  function applyItineraryDay(dayId) {
    uiFilters.dayId = dayId;
    tripState.activeDate = dayId;
    persist();
    renderDayContent();
    renderLive();
  }

  // Map Day filter changed -> move the itinerary dropdown to match. Setting
  // .value programmatically does not fire a 'change' event, so no feedback loop.
  function syncItineraryDayFromMap(dayId) {
    var select = document.getElementById('daySelectV2');
    if (!select || select.value === dayId) return;
    select.value = dayId;
    applyItineraryDay(dayId);
  }

  // Itinerary dropdown changed -> move the Plan-tab route map's Day filter to
  // match and refocus the map on that day.
  function syncMapDayFromItinerary(dayId) {
    var dayField = document.getElementById(tripMap.ids.day);
    if (!dayField || tripMap.filters.day === dayId) return;
    dayField.value = dayId;
    tripMap.filters.day = dayId;
    refreshMap(tripMap, true);
  }

  function mountDaySection() {
    var section = document.getElementById('daybyday');
    var typeOptions = unique(operationalPlan.days.flatMap(function (day) {
      return day.stops.map(function (stop) { return stop.kind; });
    })).sort();
    section.innerHTML = [
      '<h2 id="daybyday-heading" class="section-heading">Trip plan</h2>',
      '<p class="section-intro">One clear timeline for each day.</p>',
      '<p class="section-cta"><button type="button" class="button" id="planBEntry">TripAdvisor Plan B — rated alternates &amp; upgrades ↗</button></p>',
      mapMarkup(tripMap, {
        title: 'Complete route · Vaughan → PEI → Vaughan',
        intro: 'One interactive map of every stop across all 8 days, in driving order. Numbered pins are scheduled stops (hollow = optional); ★ stars are extra route-side ideas you can swap in any day. Tap any pin for the day, timing, address, go/no-go rule and directions.',
        cardAria: 'Complete trip route map',
        mapAria: 'Interactive route map of the trip'
      }),
      '<div class="control-grid primary-controls" aria-label="Day itinerary settings">',
      '<label for="daySelectV2">Day<select id="daySelectV2"></select></label>',
      '<label for="dayMode">Schedule<select id="dayMode"><option value="preview">Planning</option><option value="on-time">On schedule</option><option value="ahead30">30 min ahead</option><option value="ahead60">60+ min ahead</option><option value="late30">30+ min late</option><option value="late60">60+ min late</option></select></label>',
      '</div>',
      '<details class="advanced-filters"><summary>Filter stops</summary><div class="control-grid">',
      '<label for="typeFilterV2">Stop type<select id="typeFilterV2"><option value="">All stop types</option>', typeOptions.map(function (type) { return '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>'; }).join(''), '</select></label>',
      '<label for="stopSearchV2">Search<input id="stopSearchV2" type="search" placeholder="Place or city" autocomplete="off"></label>',
      '</div></details>',
      '<div id="dayResultStatus" class="status-line" role="status" aria-live="polite"></div>',
      '<div id="dayResult"></div>'
    ].join('');
    wireMapControls(tripMap);
    document.getElementById('planBEntry').addEventListener('click', function () { activateSection('planb', true); });
    var select = document.getElementById('daySelectV2');
    select.innerHTML = operationalPlan.days.map(function (day) {
      return '<option value="' + escapeHtml(day.id) + '">' + escapeHtml(dayOptionLabel(day)) + '</option>';
    }).join('');
    select.value = uiFilters.dayId;
    select.addEventListener('change', function () {
      applyItineraryDay(select.value);
      syncMapDayFromItinerary(select.value);
    });
    document.getElementById('dayMode').addEventListener('change', function (event) {
      tripState.modes[uiFilters.dayId] = event.target.value;
      persist();
      renderDayContent();
      renderLive();
    });
    document.getElementById('typeFilterV2').addEventListener('change', function (event) {
      uiFilters.dayType = event.target.value;
      renderDayContent();
    });
    document.getElementById('stopSearchV2').addEventListener('input', function (event) {
      uiFilters.daySearch = event.target.value;
      renderDayContent();
    });
    document.getElementById('dayResult').addEventListener('click', function (event) {
      var button = event.target.closest('[data-stop-action]');
      if (!button) return;
      var stopId = button.dataset.stopId;
      if (button.dataset.stopAction === 'toggle') {
        tripState.stops[stopId] = stopStatus(stopId) === 'done' ? 'pending' : 'done';
        persist();
        renderDayContent();
        renderLive();
      }
      if (button.dataset.stopAction === 'skip') {
        tripState.stops[stopId] = stopStatus(stopId) === 'skipped' ? 'pending' : 'skipped';
        persist();
        renderDayContent();
        renderLive();
      }
      if (button.dataset.stopAction === 'copy') {
        copyText(button.dataset.address || '').then(function () { setStatus('Address copied to the clipboard.'); });
      }
    });
    renderDayContent();
  }

  function renderMealPlan(day) {
    var backups = day.meals.map(function (meal) {
      var stop = stopById(day, meal.selectedStopId);
      var state = stop ? stopStatus(stop.id) : 'pending';
      var hiddenByDelay = Boolean(stop && hiddenInMode(day, stop));
      var backupActive = Boolean(stop && (state === 'skipped' || hiddenByDelay));
      if (!backupActive) return null;
      return { meal: meal.meal, backup: meal.backup || 'Use a safe nearby alternative.' };
    }).filter(Boolean);
    if (!backups.length) return '';
    return '<div class="active-meal-backups"><strong>Meal backup active</strong>' + backups.map(function (item) {
      return '<p><span class="tag ' + categoryClass(item.meal) + '">' + escapeHtml(item.meal) + '</span> ' + escapeHtml(item.backup) + '</p>';
    }).join('') + '</div>';
  }

  function stopPriorityLabel(stop) {
    return stop.choiceGated ? 'Choice branch' : stop.priority === 'optional' ? 'Optional' : stop.priority === 'conditional' ? 'Fallback' : 'Plan A';
  }

  function stopDetailBody(day, stop) {
    var currentStatus = stopStatus(stop.id);
    var arrivalName = stop.parkingName || stop.locationName || stop.title;
    var arrivalAddress = stop.parkingAddress || stop.address;
    var arrivalLabel = stop.parkingName ? 'Park at' : 'Go to';
    var directionsLabel = stop.parkingName ? 'Parking directions' : 'Directions';
    return [
      '<p class="stop-destination"><strong>', arrivalLabel, ':</strong> ', escapeHtml(arrivalName), '</p>',
      '<p class="stop-leg">', escapeHtml(stop.leg || 'Start here'), stop.timeBudget ? ' · <strong>' + escapeHtml(stop.timeBudget) + '</strong>' : '', '</p>',
      stop.skipAt ? '<p class="small"><strong>Late rule:</strong> Skip at ' + escapeHtml(stop.skipAt) + '+ minutes late' + (stop.saves ? ' to save about ' + escapeHtml(stop.saves) : '') + '.</p>' : '',
      renderTicketGuidance(stop.ticket),
      '<div class="stop-primary-actions">', externalLink(stop.mapUrl, directionsLabel, 'button primary'),
      '<button type="button" class="button subtle" data-stop-action="toggle" data-stop-id="', escapeHtml(stop.id), '" aria-pressed="', currentStatus === 'done' ? 'true' : 'false', '">', currentStatus === 'done' ? 'Undo' : 'Done', '</button></div>',
      stop.locationName ? '<p><strong>Location:</strong> ' + escapeHtml(stop.locationName) + '</p>' : '',
      arrivalAddress ? '<p><strong>' + (stop.parkingName ? 'Parking / arrival address:' : 'Address:') + '</strong> ' + escapeHtml(arrivalAddress) + '</p>' : '',
      stop.rating ? '<p>' + stopRatingChip(stop.rating) + '</p>' : '',
      renderParkingEntrance(stop.parkingEntrance),
      '<p>', escapeHtml(stop.notes), '</p>',
      stop.reservation ? '<p class="small"><strong>Reservation:</strong> ' + escapeHtml(stop.reservation) + '</p>' : '',
      renderAttractionQuality(stop.attractionQuality),
      renderPractical(stop),
      '<p class="small"><strong>Food / washroom:</strong> ', escapeHtml(stop.food || '—'), '<br><strong>Kid plan:</strong> ', escapeHtml(stop.kidPlan || '—'), '</p>',
      '<div class="stop-details-actions">', externalLink(stop.sourceUrl, 'Source', 'button subtle'),
      '<button type="button" class="button subtle" data-stop-action="skip" data-stop-id="', escapeHtml(stop.id), '" aria-pressed="', currentStatus === 'skipped' ? 'true' : 'false', '">Skip stop</button>',
      arrivalAddress ? '<button type="button" class="copy-address" data-stop-action="copy" data-address="' + escapeHtml(arrivalAddress) + '">Copy address</button>' : '',
      '</div>'
    ].join('');
  }

  function renderDayMapNode(day, stop, index, nextId) {
    var currentStatus = stopStatus(stop.id);
    var priorityLabel = stopPriorityLabel(stop);
    var badge = stop.priority === 'required' && !stop.choiceGated ? '' : '<span class="priority-badge ' + escapeHtml(stop.priority) + '">' + escapeHtml(priorityLabel) + '</span>';
    var isNext = stop.id === nextId && currentStatus === 'pending';
    var statusClass = currentStatus === 'done' ? ' is-complete' : currentStatus === 'skipped' ? ' is-skipped' : '';
    var dotGlyph = currentStatus === 'done' ? '✓' : currentStatus === 'skipped' ? '✕' : String(index + 1);
    var statusTag = currentStatus === 'done' ? ' · Done' : currentStatus === 'skipped' ? ' · Skipped' : '';
    var subText = [stop.city, stop.kind].filter(Boolean).map(escapeHtml).join(' · ') + statusTag;
    return [
      '<li class="map-stop priority-', escapeHtml(stop.priority), statusClass, isNext ? ' is-next' : '', '">',
      '<span class="map-dot" aria-hidden="true">', dotGlyph, '</span>',
      '<details class="map-node" data-stop-id="', escapeHtml(stop.id), '">',
      '<summary class="map-summary">',
      index > 0 && stop.leg ? '<span class="map-leg">' + escapeHtml(stop.leg) + '</span>' : '',
      '<span class="map-node-head"><span class="map-time">', escapeHtml(stop.time), stop.zone ? ' ' + escapeHtml(stop.zone) : '', '</span>', badge, isNext ? '<span class="map-next-flag">Up next</span>' : '', '</span>',
      '<span class="map-node-title">', escapeHtml(stop.title), '</span>',
      '<span class="map-node-sub">', subText, '</span>',
      '</summary>',
      '<div class="map-detail">', stopDetailBody(day, stop), '</div>',
      '</details>',
      '</li>'
    ].join('');
  }

  function renderDayRouteMap(day, stops, heading) {
    if (!stops.length) return '<div class="empty-state">No stops match. Try clearing the stop type or search field.</div>';
    var nextId = (nextStop(day) || {}).id;
    return [
      '<div class="card full day-map">',
      '<div class="day-map-head"><h3>', escapeHtml(heading || 'Route map'), '</h3><p class="small muted">Every stop in order, optional stops included. Tap a stop for directions and details.</p></div>',
      '<ol class="map-list">',
      stops.map(function (stop, index) { return renderDayMapNode(day, stop, index, nextId); }).join(''),
      '</ol></div>'
    ].join('');
  }

  function renderDayContent() {
    var day = dayById(uiFilters.dayId);
    var type = uiFilters.dayType;
    var query = normalize(uiFilters.daySearch);
    var filtered = visibleStops(day).filter(function (stop) {
      var searchText = normalize([stop.title, stop.locationName, stop.parkingName, stop.parkingAddress, stop.kind, stop.address, stop.city, stop.notes, stop.food, stop.kidPlan].join(' '));
      return (!type || stop.kind === type) && (!query || searchText.indexOf(query) !== -1);
    });
    document.getElementById('daySelectV2').value = day.id;
    document.getElementById('dayMode').value = tripState.modes[day.id] || 'preview';
    document.getElementById('typeFilterV2').value = type;
    document.getElementById('stopSearchV2').value = uiFilters.daySearch;
    document.getElementById('dayResultStatus').textContent = filtered.length ? filtered.length + ' active stops.' : 'No stops match. Clear the filters.';
    var mode = tripState.modes[day.id] || 'preview';
    var modeText = scheduleModeLabel(mode);
    var timeZoneChanges = day.id === '2026-08-16' || day.id === '2026-08-20';
    var body = [
      '<div class="card full ', riskClass(day.risk), '">',
      '<div class="day-summary"><p class="route-label">', escapeHtml(modeText), '</p><h2>', escapeHtml(day.label), '</h2><p class="day-route"><strong>', escapeHtml(day.routeFocus), '</strong></p>',
      '<div class="day-facts"><div class="day-fact"><span>Leave</span><strong>', escapeHtml(day.departTarget), '</strong></div><div class="day-fact"><span>Drive</span><strong>', escapeHtml(day.pureDriveTime), '</strong></div><div class="day-fact"><span>Distance</span><strong>', escapeHtml(day.driveKm), ' km</strong></div><div class="day-fact"><span>Risk</span><strong><span class="risk-chip ', riskClass(day.risk), '">', escapeHtml(day.risk), '</span></strong></div></div>',
      '<div class="day-summary-actions">', dayRouteLinks(day, 'button primary'), dayWeatherLink(day.id), '</div>',
      renderScenarioPlan(day), renderHotelAnchor(day), renderMealContract(day), renderMealFlex(day), renderRouteOptions(day), renderDayPacing(day), '</div>',
      '<div class="key-rule"><strong>If delayed:</strong> ', escapeHtml(day.contingency), '</div>',
      renderMealPlan(day),
      '<details class="day-detail-panel"', normalize(day.risk) === 'high' ? ' open' : '', '><summary>Driving & safety notes</summary><div><p><strong>Wake:</strong> ', escapeHtml(day.wakeTime), ' · <strong>Driver plan:</strong> ', escapeHtml(day.driverPlan), '</p><p><strong>Safety fallback:</strong> ', escapeHtml(day.emergency), '</p>', timeZoneChanges ? '<p><strong>Time change:</strong> ' + escapeHtml(day.timeZoneNote) + '</p>' : '', '</div></details>',
      '</div>',
      renderDayRouteMap(day, filtered),
      '<div class="day-nav-actions"><button type="button" class="button subtle" id="previousDay"', operationalPlan.days[0].id === day.id ? ' disabled' : '', '>← Previous day</button><button type="button" class="button subtle" id="nextDay"', operationalPlan.days[operationalPlan.days.length - 1].id === day.id ? ' disabled' : '', '>Next day →</button></div>'
    ].join('');
    document.getElementById('dayResult').innerHTML = body;
    var dayIndex = operationalPlan.days.findIndex(function (item) { return item.id === day.id; });
    document.getElementById('previousDay').addEventListener('click', function () {
      if (dayIndex <= 0) return;
      uiFilters.dayId = operationalPlan.days[dayIndex - 1].id;
      renderDayContent();
      document.getElementById('daybyday-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('nextDay').addEventListener('click', function () {
      if (dayIndex >= operationalPlan.days.length - 1) return;
      uiFilters.dayId = operationalPlan.days[dayIndex + 1].id;
      renderDayContent();
      document.getElementById('daybyday-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function shortDay(label) {
    var match = String(label || '').match(/[A-Z][a-z]{2} \d+/);
    return match ? match[0] : '';
  }

  function foodSuggestionList() {
    var planned = rawData.foodies.map(function (food) {
      var day = sourceDay(food.date);
      var label = day ? day.dateLabel : food.date;
      var isNewGlasgow = normalize(food.name).indexOf('new glasgow lobster suppers') !== -1;
      return {
        id: 'food-' + slug(food.date + '-' + food.name),
        name: food.name, meal: food.meal || 'Meal', city: food.city || '',
        rating: Number(food.rating || 0),
        photo: food.photo || '', photoNote: food.photoNote || '',
        dayId: food.date, dayLabel: label, dayShort: shortDay(label),
        planned: true, region: '',
        menuRank: Array.isArray(food.menuRank) ? food.menuRank : [],
        summary: food.why || '', order: food.order || '', tip: isNewGlasgow ? 'Arrive near the 17:15 target and expect a 90–120 minute visit including the queue.' : (food.friction || ''),
        backup: food.backup || '', reserve: isNewGlasgow ? 'Walk-in for a family of three; reservations are limited to groups of 8+.' : (food.reserve || ''),
        address: food.address || '',
        mapUrl: food.mapUrl || mapSearchUrl(food.address || food.name),
        source: food.source || '',
        icon: '🍽️'
      };
    });
    var extras = (rawData.foodExtras || []).map(function (food) {
      var day = sourceDay(food.fitsDay);
      return {
        id: food.id, name: food.name, meal: food.meal || 'Meal', city: food.city || '',
        rating: Number(food.rating || 0),
        photo: food.photo || '', photoNote: food.photoNote || '',
        dayId: food.fitsDay || '', dayLabel: day ? 'Fits ' + day.dateLabel : (food.region || 'Flexible'), dayShort: '',
        planned: false, region: food.region || '',
        menuRank: Array.isArray(food.menuRank) ? food.menuRank : [],
        summary: food.why || '', order: food.order || '', tip: food.tip || '',
        backup: '', reserve: '',
        address: food.address || '',
        mapUrl: food.mapUrl || mapSearchUrl(food.address || food.name),
        source: food.source || '',
        icon: '🍽️'
      };
    });
    return planned.concat(extras);
  }

  function sortSuggestions(list) {
    return list.slice().sort(function (a, b) {
      var pickedA = itemMark(a.id) === 'picked' ? 1 : 0;
      var pickedB = itemMark(b.id) === 'picked' ? 1 : 0;
      if (pickedA !== pickedB) return pickedB - pickedA;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return a.name.localeCompare(b.name);
    });
  }

  function suggestionCard(item, detailsHtml) {
    var mark = itemMark(item.id);
    var picked = mark === 'picked';
    var removed = mark === 'removed';
    var photoOk = !tripState.offlineMode && safeExternalUrl(item.photo);
    return [
      '<article class="sugg-card', picked ? ' is-picked' : '', removed ? ' is-removed' : '', '">',
      '<div class="sugg-photo">',
      photoOk ? '<img src="' + escapeHtml(item.photo) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' : '<div class="photo-fallback" aria-hidden="true">' + (item.icon || '📍') + '</div>',
      picked ? '<span class="picked-badge">Picked</span>' : '',
      item.planned ? '<span class="plan-flag">In plan' + (item.dayShort ? ' · ' + escapeHtml(item.dayShort) : '') + '</span>' : '<span class="plan-flag new">' + escapeHtml(item.planLabel || 'New idea') + '</span>',
      photoOk && item.photoNote ? '<span class="photo-note">' + escapeHtml(item.photoNote) + '</span>' : '',
      '</div>',
      '<div class="sugg-body">',
      '<h3>' + escapeHtml(item.name) + '</h3>',
      '<div class="sugg-meta">' + item.tags.map(function (tag) { return '<span class="tag ' + categoryClass(tag) + '">' + escapeHtml(tag) + '</span>'; }).join('') + '</div>',
      '<p>' + escapeHtml(item.summary) + '</p>',
      detailsHtml || '',
      '</div>',
      '<div class="sugg-actions">',
      removed
        ? '<button type="button" class="button subtle" data-sugg-action="restore" data-sugg-id="' + escapeHtml(item.id) + '">↩ Restore</button>'
        : '<button type="button" class="button subtle pick-btn" data-sugg-action="pick" data-sugg-id="' + escapeHtml(item.id) + '" aria-pressed="' + (picked ? 'true' : 'false') + '">' + (picked ? '★ Picked' : '☆ Pick') + '</button>' +
          '<button type="button" class="button subtle remove-btn" data-sugg-action="remove" data-sugg-id="' + escapeHtml(item.id) + '">✕ Remove</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function wirePhotoFallbacks(container) {
    Array.from(container.querySelectorAll('.sugg-photo img')).forEach(function (image) {
      image.addEventListener('error', function () {
        var fallback = document.createElement('div');
        fallback.className = 'photo-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = '🧭';
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function suggestionClickHandler(kind, rerender) {
    return function (event) {
      var button = event.target.closest('button[data-sugg-action]');
      if (!button) return;
      var action = button.dataset.suggAction;
      var id = button.dataset.suggId || '';
      if (action === 'pick') setItemMark(id, itemMark(id) === 'picked' ? '' : 'picked');
      if (action === 'remove') setItemMark(id, 'removed');
      if (action === 'restore') setItemMark(id, '');
      if (action === 'restore-all') {
        var list = kind === 'food' ? foodSuggestionList() : attractionSuggestionList();
        list.forEach(function (item) { if (itemMark(item.id) === 'removed') delete pickState.items[item.id]; });
        persistPicks();
      }
      if (action === 'toggle-removed') {
        if (kind === 'food') uiFilters.foodShowRemoved = !uiFilters.foodShowRemoved;
        else uiFilters.attractionShowRemoved = !uiFilters.attractionShowRemoved;
      }
      rerender();
    };
  }

  function removedControlsHtml(removedCount, showRemoved) {
    return [
      removedCount ? '<button type="button" class="button subtle" data-sugg-action="toggle-removed">' + (showRemoved ? '← Back to suggestions' : 'View removed (' + removedCount + ')') + '</button>' : '',
      showRemoved && removedCount ? '<button type="button" class="button subtle" data-sugg-action="restore-all">↩ Restore all</button>' : ''
    ].join('');
  }

  function mealPlanRows() {
    return operationalPlan.days.flatMap(function (day) {
      return day.meals.map(function (meal) {
        var stop = stopById(day, meal.selectedStopId);
        return [
          '<article class="food-card">',
          '<div class="meal">', escapeHtml(meal.meal), '</div>',
          '<div><h3>', escapeHtml(meal.title), '</h3>',
          '<div><span class="tag">', escapeHtml(day.label), '</span>', meal.conditional ? '<span class="tag">Conditional</span>' : '', stop && stop.city ? '<span class="tag">' + escapeHtml(stop.city) + '</span>' : '', '</div>',
          stop && stop.food ? '<p><strong>Order / food:</strong> ' + escapeHtml(stop.food) + '</p>' : '',
          meal.backup ? '<p><strong>Backup:</strong> ' + escapeHtml(meal.backup) + '</p>' : '',
          meal.reserve ? '<p><strong>Reservation:</strong> ' + escapeHtml(meal.reserve) + '</p>' : '',
          stop ? '<div class="links">' + externalLink(stop.mapUrl, 'Map') + externalLink(stop.sourceUrl, 'Restaurant / source') + '</div>' : '',
          '</div></article>'
        ].join('');
      });
    }).join('');
  }

  // TripAdvisor "Plan B" — a rated alternates/upgrades shortlist for the same
  // booked-hotel route, sourced from a TripAdvisor snapshot taken 2026-07-17.
  // Reference only: it does not change the operational plan above.
  var planBData = {
    rules: [
      { rule: 'Hotel anchors', note: 'All seven hotels are already booked and fixed. Plan B changes stops and meals only.' },
      { rule: 'Food rhythm', note: 'Hotel breakfast when in a hotel. No brunch. Pick one proper dine per day; keep the other meal light/simple.' },
      { rule: 'TripAdvisor use', note: 'Ratings and review counts are included where current TripAdvisor snippets exposed them. Every Plan B stop links to TripAdvisor.' },
      { rule: 'How to choose', note: 'Use only one or two Plan B upgrades per day. If delayed, keep the hotel, meal rhythm and child energy first.' },
      { rule: 'Ratings', note: 'Green = 4.5+ standout, yellow = 4.0-4.4 solid, red = below 4.0 strategic only.' },
      { rule: 'Audit note', note: 'Rows are arranged in route order. Low-rated service stops are kept only when they are useful for fuel/washroom safety.' }
    ],
    dailyFocus: [
      { date: '2026-08-14', overnight: 'Montreal Marriott Chateau Champlain', focus: 'Better Brockville lunch; optional tunnel', upgrade: 'Brockville Railway Tunnel', skip: 'The Big Apple / tunnel if traffic slips' },
      { date: '2026-08-15', overnight: 'Hotel Cofortel', focus: 'Montmorency + Old Quebec, but lighter food if needed', upgrade: 'Les Cafes de Julie instead of slow Manoir lunch', skip: 'Old Quebec evening walk' },
      { date: '2026-08-16', overnight: 'Delta Fredericton', focus: 'Kamouraska + real lunch + efficient scenic breaks', upgrade: 'Parc des Chutes or Hartland, not both', skip: 'Grand Falls Gorge' },
      { date: '2026-08-17', overnight: 'Hampton Charlottetown', focus: 'Bridge-side rest + lobster supper', upgrade: 'Cape Jourimain', skip: 'Victoria Park evening add-on' },
      { date: '2026-08-18', overnight: 'Canadas Best Value Inn Charlottetown', focus: 'Green Gables / beach / strong Charlottetown dinner', upgrade: 'Cavendish Beach', skip: 'Beach time if weather poor' },
      { date: '2026-08-19', overnight: 'Best Western Plus Moncton', focus: 'Sackville rest before Hopewell, then Moncton', upgrade: 'Albert County Museum only after Hopewell', skip: 'Any post-Hopewell museum' },
      { date: '2026-08-20', overnight: 'DoubleTree Quebec Resort', focus: 'Long return drive; keep stops short', upgrade: 'Hartland if skipped earlier', skip: 'Parc des Chutes' },
      { date: '2026-08-21', overnight: 'Home', focus: 'Safe return day, no weak food stops', upgrade: 'Fromagerie Victoria snack if on time', skip: 'The Big Apple return stop' }
    ],
    stops: [
      { date: '2026-08-14', time: '08:30', segment: 'Vaughan to Montreal', name: 'The Big Apple', type: 'Attraction / child break', priority: 'Strategic only', rating: 3.5, reviews: 951, why: 'Useful washroom and kid stretch just off 401, but not a top-rated destination.', useIf: 'Use if the child needs an early reward stop.', skipIf: 'Skip if GTA traffic is slow; protect Brockville lunch and Montreal arrival.', duration: '20-25 min', foodPlan: 'Snack only; do not make this lunch.', parking: 'On-site visitor parking, 262 Orchard Rd, Colborne, ON', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=The+Big+Apple+Colborne', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' },
      { date: '2026-08-14', time: '11:30', segment: 'Vaughan to Montreal', name: '1000 Islands Restaurant & Pizzeria', type: 'Food', priority: 'Top food Plan B', rating: 4.6, reviews: 361, why: 'Higher TripAdvisor lunch option in Brockville than the current pizza fallback.', useIf: 'Use if you want a stronger rated sit-down lunch near the route.', skipIf: 'Skip if it adds downtown parking stress or timing slips past 12:45.', duration: '45-60 min', foodPlan: 'Proper lunch: pizza, pasta, Greek comfort food.', parking: 'Downtown Brockville street/lot parking nearby; confirm live map.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=1000+Islands+Restaurant+%26+Pizzeria+Brockville', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g181758-d765948-Reviews-1000_Islands_Restaurant_Pizzeria-Brockville_Ontario.html' },
      { date: '2026-08-14', time: '12:40', segment: 'Vaughan to Montreal', name: 'Brockville Railway Tunnel', type: 'Attraction', priority: 'Top short attraction', rating: 4.6, reviews: 637, why: 'Free, short, memorable movement break by the waterfront.', useIf: 'Use only if lunch finishes early and Montreal ETA remains comfortable.', skipIf: 'Skip first if anyone is tired or traffic is heavy.', duration: '20-35 min', foodPlan: 'No meal; pair with Brockville lunch.', parking: 'Waterfront/downtown parking near Market St W.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Brockville+Railway+Tunnel', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g181758-d1236724-Reviews-Brockville_Railway_Tunnel-Brockville_Ontario.html' },
      { date: '2026-08-14', time: '17:45', segment: 'Montreal evening', name: 'Time Out Market Montreal', type: 'Food', priority: 'Easy family dinner', rating: 3.9, reviews: 162, why: 'Not the highest-rated food, but very practical with choices, seating and indoor comfort.', useIf: 'Use when the family wants easy food after check-in.', skipIf: 'Skip for Lloyd if arrival is late or everyone is cooked.', duration: '45-75 min', foodPlan: 'Light dinner: everyone picks simple food.', parking: 'Walk from Marriott; do not move the car.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Time+Out+Market+Montreal', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g155032-d19271060-Reviews-Time_Out_Market_Montreal-Montreal_Quebec.html' },
      { date: '2026-08-15', time: '11:30', segment: 'Montreal to Quebec City', name: 'Parc de la Chute-Montmorency', type: 'Attraction', priority: 'Priority', rating: 4.4, reviews: 10473, why: 'Major scenic stop before the Quebec City hotel, with strong traveler feedback and easy child appeal.', useIf: 'Use as Plan A unless weather or construction makes it unpleasant.', skipIf: 'Skip cable car/extra walking before skipping the whole stop.', duration: '75-120 min', foodPlan: 'Lunch at or near the park.', parking: 'Lower-site P1/P2 visitor parking, 5300 Boulevard Sainte-Anne.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Parc+de+la+Chute-Montmorency+P1+P2', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155582-Reviews-Parc_de_la_Chute_Montmorency-Quebec_City_Quebec.html' },
      { date: '2026-08-15', time: '12:45', segment: 'Montreal to Quebec City', name: 'Les Cafes de Julie', type: 'Food', priority: 'Top light food Plan B', rating: 4.8, reviews: 44, why: 'Much stronger TripAdvisor score than the Manoir restaurant nearby; better if you want a quick light lunch.', useIf: 'Use if Manoir feels too slow or you want more attraction time.', skipIf: 'Skip if you need guaranteed seated lunch inside the park.', duration: '35-45 min', foodPlan: 'Light lunch: soup, sandwich, coffee, sweets.', parking: 'Near Montmorency; verify live parking before detouring.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Les+Cafes+de+Julie+Quebec+City', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g155033-d6702385-Reviews-Les_Cafes_de_Julie-Quebec_City_Quebec.html' },
      { date: '2026-08-15', time: '17:10', segment: 'Quebec City evening', name: 'Terrasse Dufferin', type: 'Attraction', priority: 'Top easy walk', rating: 4.6, reviews: 3740, why: 'Classic Old Quebec view walk that stays short and scenic.', useIf: 'Use if everyone has energy after Cofortel check-in.', skipIf: 'Skip if parking looks difficult or child needs hotel downtime.', duration: '30-45 min', foodPlan: 'Pair with light dinner nearby.', parking: 'Park once at Stationnement De Beaucours or Hotel-de-Ville garage.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Terrasse+Dufferin+Quebec+City', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155589-Reviews-Terrasse_Dufferin-Quebec_City_Quebec.html' },
      { date: '2026-08-15', time: '18:15', segment: 'Quebec City evening', name: 'La Buche', type: 'Food', priority: 'Strong local dinner', rating: 4.3, reviews: 2383, why: 'Very popular Quebecois dinner near Old Quebec sights.', useIf: 'Use with a reservation and an early dinner time.', skipIf: 'Skip if the wait is long; choose a simpler nearby meal.', duration: '60-75 min', foodPlan: 'Light or proper dinner depending on lunch size.', parking: 'Walk from Old Quebec parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=La+Buche+Quebec+City', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g155033-d8330527-Reviews-La_Buche-Quebec_City_Quebec.html' },
      { date: '2026-08-16', time: '09:10', segment: 'Quebec City to Fredericton', name: 'Quais de Kamouraska / Kamouraska Quai Miller', type: 'Attraction', priority: 'Requested scenic stop', rating: 4.4, reviews: 44, why: 'Requested waterfront stop; TripAdvisor lists Quais de Kamouraska as a local attraction.', useIf: 'Use as a short St. Lawrence reset before lunch.', skipIf: 'Skip only for severe weather or if departure slips badly.', duration: '20-25 min', foodPlan: 'No meal; scenic walk only.', parking: 'Public parking around Avenue LeBlanc / Rue du Quai.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Quais+de+Kamouraska+Avenue+LeBlanc', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g1172165-d8536022-Reviews-Quais_de_Kamouraska-Kamouraska_Bas_Saint_Laurent_Quebec.html' },
      { date: '2026-08-16', time: '10:30', segment: 'Quebec City to Fredericton', name: "L'Estaminet", type: 'Food', priority: 'Substantial lunch', rating: 4.2, reviews: 488, why: 'Reliable rated lunch in Riviere-du-Loup before the long NB stretch.', useIf: "Use as the day's proper meal.", skipIf: 'Skip only if service wait threatens Fredericton arrival; use quick fallback nearby.', duration: '50-60 min', foodPlan: 'Proper lunch: pasta, burgers, salads, pub plates.', parking: 'Street/nearby parking in Riviere-du-Loup; confirm live map.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=L%27estaminet+Riviere-du-Loup', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g182149-d772494-Reviews-L_estaminet-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html' },
      { date: '2026-08-16', time: '11:45', segment: 'Quebec City to Fredericton', name: 'Parc des Chutes', type: 'Attraction', priority: 'Top stretch Plan B', rating: 4.3, reviews: 347, why: 'Waterfall and trails; best if lunch is fast and legs need movement.', useIf: 'Use only if you leave Riviere-du-Loup on time.', skipIf: 'Skip if Fredericton arrival would pass 18:00.', duration: '25-45 min', foodPlan: 'No meal; washroom/stretch if available.', parking: 'Park near Rue Frontenac access.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Parc+des+Chutes+Riviere-du-Loup', taUrl: 'https://www.tripadvisor.ca/ShowUserReviews-g182149-d3370299-r690514046-Parc_des_Chutes-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html' },
      { date: '2026-08-16', time: '13:30', segment: 'Quebec City to Fredericton', name: 'Grand Falls Gorge', type: 'Attraction', priority: 'Optional scenic reset', rating: 4.2, reviews: 329, why: 'TripAdvisor ranks it No.1 in Grand Falls; a strong scenic break but adds time.', useIf: 'Use only if drivers feel fresh and hotel ETA remains safe.', skipIf: 'Skip for any fatigue; this is a long driving day.', duration: '35-50 min', foodPlan: 'No meal; quick scenic walk.', parking: 'Visitor parking around 25 Madawaska Rd.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Grand+Falls+Gorge+25+Madawaska+Road', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g212305-d1237726-Reviews-Grand_Falls_Gorge-Grand_Falls_New_Brunswick.html' },
      { date: '2026-08-16', time: '15:20', segment: 'Quebec City to Fredericton', name: 'Hartland Covered Bridge', type: 'Attraction', priority: 'Fast photo stop', rating: 4.4, reviews: 290, why: "World's longest covered bridge; useful low-effort driver reset.", useIf: 'Use instead of Grand Falls if you want a quicker stop.', skipIf: 'Skip if anyone wants straight hotel recovery.', duration: '15-25 min', foodPlan: 'No meal; photo/stretch only.', parking: 'Hartland visitor parking near bridge / Highway 105 side.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hartland+Covered+Bridge+visitor+parking', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html' },
      { date: '2026-08-16', time: '18:45', segment: 'Fredericton evening', name: 'STMR.36 BBQ & Social', type: 'Food', priority: 'Strategic hotel dinner', rating: 3.7, reviews: 68, why: 'Convenient on-site dinner after the longest outbound drive, but TripAdvisor score is not strong.', useIf: 'Use only when the family needs zero extra driving.', skipIf: 'If energy remains, consider Isaac’s Way instead after checking live hours.', duration: '45-60 min', foodPlan: 'Light dinner: small BBQ plate, soup, salad, kids option.', parking: 'On-site at Delta Fredericton.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=STMR.36+BBQ+Fredericton', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g154957-d21316892-Reviews-STMR_36_BBQ_Social-Fredericton_New_Brunswick.html' },
      { date: '2026-08-17', time: '09:45', segment: 'Fredericton to Charlottetown', name: 'Magnetic Hill Park', type: 'Attraction', priority: 'Kid-friendly quick stop', rating: 3.7, reviews: 661, why: 'Fun optical illusion, close to route, low walking, but the rating makes it strategic only.', useIf: 'Use if staffed access and timing are confirmed.', skipIf: 'Skip if closed, crowded or Cape Jourimain becomes the better stop.', duration: '25-40 min', foodPlan: 'No meal; nearby washrooms if open.', parking: 'Magnetic Hill visitor area, Mountain Road.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Magnetic+Hill+Park+Moncton', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g154958-d183715-Reviews-Magnetic_Hill_Park-Moncton_New_Brunswick.html' },
      { date: '2026-08-17', time: '12:15', segment: 'Before Confederation Bridge', name: 'Cape Jourimain Nature Centre', type: 'Attraction', priority: 'Top rest stop before bridge', rating: 4.3, reviews: 78, why: 'Clean facilities, bridge view, beach and lighthouse trail; good family reset.', useIf: 'Use if you want a calmer stop before PEI.', skipIf: 'Skip if you already used Magnetic Hill and Hampton arrival would slip.', duration: '35-60 min', foodPlan: 'Light lunch/snack only if cafe is open; keep dinner as proper meal.', parking: 'Cape Jourimain visitor parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cape+Jourimain+Nature+Centre', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g4332393-d4431312-Reviews-Cape_Jourimain_Nature_Centre-Bayfield_New_Brunswick.html' },
      { date: '2026-08-17', time: '16:50', segment: 'PEI dinner', name: 'New Glasgow Lobster Suppers', type: 'Food', priority: 'Proper dinner', rating: 4.2, reviews: 1105, why: 'Classic PEI family lobster supper with many reviews.', useIf: "Use as the day's substantial meal.", skipIf: 'Skip only if the wait is too long; use The Mill or PEI Preserve Company nearby.', duration: '75-100 min', foodPlan: 'Proper dinner: lobster supper or seafood/comfort plates.', parking: 'On-site restaurant parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=New+Glasgow+Lobster+Suppers', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g1800168-d770333-Reviews-New_Glasgow_Lobster_Supper-New_Glasgow_Prince_Edward_Island.html' },
      { date: '2026-08-17', time: '18:30', segment: 'Charlottetown evening', name: 'Victoria Park / Prince Edward Battery', type: 'Attraction', priority: 'Easy sunset add-on', rating: 4.1, reviews: 48, why: 'Low-pressure waterfront walk/playground near hotel after check-in.', useIf: 'Use only if the child still has energy.', skipIf: 'Skip first; hotel pool/rest beats another outing.', duration: '20-40 min', foodPlan: 'Dessert or snack only.', parking: 'Victoria Park parking around 45-51 Victoria Park Roadway.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Prince+Edward+Battery+Charlottetown', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g155023-d590362-Reviews-Prince_Edward_Battery-Charlottetown_Prince_Edward_Island.html' },
      { date: '2026-08-18', time: '08:30', segment: 'Charlottetown / Cavendish loop', name: 'Green Gables', type: 'Attraction', priority: 'Priority', rating: 4.3, reviews: 1657, why: 'Signature PEI stop with house, grounds and short Haunted Woods walk.', useIf: 'Use early to avoid crowds.', skipIf: 'Shorten the trail before skipping the site.', duration: '75-120 min', foodPlan: 'Hotel breakfast before leaving; lunch later.', parking: 'Green Gables Heritage Place visitor parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Green+Gables+Heritage+Place+Cavendish', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186971-Reviews-Green_Gables-Cavendish_Prince_Edward_Island.html' },
      { date: '2026-08-18', time: '10:45', segment: 'Cavendish coast', name: 'Cavendish Beach', type: 'Attraction', priority: 'Top family beach', rating: 4.5, reviews: 955, why: 'TripAdvisor reviews call it family-friendly with good amenities and parking.', useIf: 'Use if weather is good and the child wants beach time.', skipIf: 'Skip for rain, wind, or tiredness.', duration: '45-90 min', foodPlan: 'No full meal; beach snack only.', parking: 'Cavendish Beach lot in PEI National Park.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cavendish+Beach+PEI+parking', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186975-Reviews-Cavendish_Beach-Cavendish_Prince_Edward_Island.html' },
      { date: '2026-08-18', time: '12:30', segment: 'New Glasgow / North Rustico', name: 'Prince Edward Island Preserve Company', type: 'Food', priority: 'Top lunch Plan B', rating: 4.4, reviews: 1002, why: 'Strong rated, scenic lunch alternative near New Glasgow.', useIf: 'Use for proper lunch if dinner will be light.', skipIf: 'Skip if buses/crowds are heavy; use a quicker North Rustico stop.', duration: '50-75 min', foodPlan: 'Proper lunch: chowder, sandwiches, preserves dessert.', parking: 'On-site parking at New Glasgow.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Prince+Edward+Island+Preserve+Company+New+Glasgow', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g1800168-d1873580-Reviews-Prince_Edward_Island_Preserve_Company-New_Glasgow_Prince_Edward_Island.html' },
      { date: '2026-08-18', time: '18:00', segment: 'Charlottetown dinner', name: 'Slaymaker & Nichols Gastro House', type: 'Food', priority: 'Memorable dinner', rating: 4.5, reviews: 117, why: 'High-rated Charlottetown dinner; good for the one proper meal if lunch was light.', useIf: 'Reserve and use if everyone can handle downtown parking.', skipIf: 'Skip for simple food if Old Home Week traffic is rough.', duration: '75-90 min', foodPlan: 'Proper dinner: gastropub/seafood dishes; order light if lunch was heavy.', parking: 'Downtown paid parking; walk from selected garage.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Slaymaker+%26+Nichols+Charlottetown', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g155023-d19503722-Reviews-Slaymaker_Nichols_Gastro_House-Charlottetown_Prince_Edward_Island.html' },
      { date: '2026-08-19', time: '09:00', segment: 'Charlottetown to Hopewell / Moncton', name: 'Sackville Waterfowl Park', type: 'Attraction / rest', priority: 'Top rest before Hopewell', rating: 4.7, reviews: 172, why: 'Best quality rest stop before Hopewell: boardwalk, washrooms nearby, nature reset.', useIf: 'Use as the controlled 20-minute pre-Hopewell break.', skipIf: 'Skip only if tide timing is at risk; then go straight to Hopewell.', duration: '15-25 min', foodPlan: 'No meal; snack/washroom only.', parking: 'Sackville Waterfowl Park parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sackville+Waterfowl+Park', taUrl: 'https://www.tripadvisor.ca/Attractions-g154956-Activities-c57-New_Brunswick.html' },
      { date: '2026-08-19', time: '10:15', segment: 'Hopewell tide window', name: 'Hopewell Rocks', type: 'Attraction', priority: 'Priority', rating: 4.6, reviews: 322, why: 'The main tide experience; TripAdvisor admission page shows strong recommendation rate.', useIf: 'Use exactly inside the tide plan.', skipIf: 'Do not replace this with optional stops unless weather/fatigue cancels the day.', duration: '2-3 h', foodPlan: 'Lunch at/near park after ocean floor.', parking: 'Hopewell Rocks visitor parking, 131 Discovery Rd.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hopewell+Rocks+visitor+parking', taUrl: 'https://www.tripadvisor.ca/AttractionProductReview-g499179-d11991515-Hopewell_Rocks_Admission-Hopewell_Cape_Albert_County_New_Brunswick.html' },
      { date: '2026-08-19', time: '14:15', segment: 'Hopewell to Moncton', name: 'Albert County Museum', type: 'Attraction', priority: 'Optional only', rating: 4.5, reviews: 85, why: 'Logical short indoor/outdoor add-on near Hopewell if you finish early.', useIf: 'Use only if Hopewell ends early and Moncton ETA stays easy.', skipIf: 'Skip for pool/rest at Best Western.', duration: '30-45 min', foodPlan: 'No meal; snack only.', parking: 'On-site visitor parking, 3940 Route 114.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Albert+County+Museum+Hopewell+Cape', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g499179-d2254756-Reviews-Albert_County_Museum-Hopewell_Cape_Albert_County_New_Brunswick.html' },
      { date: '2026-08-19', time: '18:00', segment: 'Moncton dinner', name: 'Tide & Boar Gastropub', type: 'Food', priority: 'Dinner option', rating: 4.1, reviews: 1041, why: 'Reliable Moncton gastropub choice with many reviews.', useIf: 'Use if lunch was light and family wants proper dinner.', skipIf: 'Skip if everyone needs simple food near hotel.', duration: '60-75 min', foodPlan: 'Proper dinner or light shared plates.', parking: 'Downtown Moncton parking; check live availability.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tide+%26+Boar+Gastropub+Moncton', taUrl: 'https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html' },
      { date: '2026-08-19', time: '18:10', segment: 'Moncton dinner backup', name: 'Pump House Brewpub', type: 'Food', priority: 'Higher-rated backup', rating: 4.2, reviews: 1223, why: 'Slightly higher-rated casual Moncton backup; good with kids if available.', useIf: 'Use if Tide & Boar is full or too slow.', skipIf: 'Skip if downtown parking is poor.', duration: '60-75 min', foodPlan: 'Casual dinner: pub food, pizza, salads.', parking: 'Downtown Moncton parking; verify live map.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pump+House+Brewpub+Moncton', taUrl: 'https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html' },
      { date: '2026-08-20', time: '10:45', segment: 'Moncton to Quebec City', name: 'Hartland Covered Bridge', type: 'Attraction', priority: 'Fast photo stop', rating: 4.4, reviews: 290, why: 'Efficient stop near the highway on a long return drive.', useIf: 'Use if you skipped it outbound or need a movement break.', skipIf: 'Skip if anyone wants an earlier DoubleTree arrival.', duration: '15-25 min', foodPlan: 'No meal.', parking: 'Hartland visitor parking near bridge.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hartland+Covered+Bridge+visitor+parking', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html' },
      { date: '2026-08-20', time: '12:45', segment: 'Moncton to Quebec City', name: 'Pizza Le Patrimoine', type: 'Food', priority: 'Top Edmundston lunch', rating: 4.7, reviews: 352, why: 'Much stronger TripAdvisor food option in Edmundston than the route placeholder.', useIf: "Use if you want the day's proper lunch without a major detour.", skipIf: 'Skip if it is closed or would delay DoubleTree arrival; use a simple chain meal.', duration: '45-60 min', foodPlan: 'Proper lunch: pizza, Italian comfort food, salads.', parking: 'Restaurant parking / nearby Edmundston parking; verify live.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pizza+Le+Patrimoine+Edmundston', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g182168-d1916906-Reviews-Pizza_Le_Patrimoine-Edmundston_New_Brunswick.html' },
      { date: '2026-08-20', time: '14:15', segment: 'Moncton to Quebec City', name: 'Parc des Chutes', type: 'Attraction', priority: 'Stretch Plan B', rating: 4.3, reviews: 347, why: 'Good nature break if the long return day is running ahead.', useIf: 'Use only if arrival at DoubleTree remains before dinner.', skipIf: 'Skip first; hotel recovery matters more.', duration: '25-40 min', foodPlan: 'No meal.', parking: 'Park near Rue Frontenac access.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Parc+des+Chutes+Riviere-du-Loup', taUrl: 'https://www.tripadvisor.ca/ShowUserReviews-g182149-d3370299-r690514046-Parc_des_Chutes-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html' },
      { date: '2026-08-21', time: '10:00', segment: 'Quebec City to Vaughan', name: 'Fromagerie Victoria', type: 'Food / quick stop', priority: 'Strategic poutine stop', rating: 3.9, reviews: 74, why: 'Convenient Quebec food stop near the route; not destination-grade by rating.', useIf: 'Use for a quick cheese curd/poutine break if breakfast was early.', skipIf: 'Skip if you want to protect lunch farther west.', duration: '20-30 min', foodPlan: 'Snack/light food only.', parking: 'Levis area parking; confirm exact location live.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Fromagerie+Victoria+Levis', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g182163-d6913530-Reviews-Fromagerie_Victoria-Levis_Chaudiere_Appalaches_Quebec.html' },
      { date: '2026-08-21', time: '11:30', segment: 'Quebec City to Vaughan', name: 'Scores Boucherville', type: 'Food', priority: 'Simple proper lunch', rating: null, reviews: null, why: 'Simple family lunch near the route with chicken/salad options.', useIf: "Use as the day's proper lunch if the family wants predictable food.", skipIf: 'Skip if traffic around Montreal is bad; push to a highway-area alternative.', duration: '45-60 min', foodPlan: 'Proper lunch: rotisserie chicken/salad bar.', parking: 'Restaurant parking in Boucherville.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Restaurant+Scores+Boucherville', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g182198-d770803-Reviews-Restaurant_Scores-Boucherville_Quebec.html' },
      { date: '2026-08-21', time: '14:30', segment: '401 westbound', name: 'ONroute Mallorytown North', type: 'Fuel / washroom only', priority: 'Do not eat here', rating: 2.2, reviews: 6, why: 'TripAdvisor feedback is weak; use only for fuel, washroom or fatigue safety.', useIf: 'Use only as a safety/fuel stop.', skipIf: 'Do not use for lunch or dinner unless absolutely necessary.', duration: '10-20 min', foodPlan: 'No meal; emergency snack only.', parking: 'ONroute Mallorytown North westbound.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=ONroute+Mallorytown+North', taUrl: 'https://www.tripadvisor.ca/Restaurant_Review-g1174591-d20471594-Reviews-ONroute_Mallorytown_North-Mallorytown_Ontario.html' },
      { date: '2026-08-21', time: '18:00', segment: '401 westbound', name: 'The Big Apple', type: 'Attraction / snack', priority: 'Strategic return break', rating: 3.5, reviews: 951, why: 'Final kid-friendly stretch before the last drive home.', useIf: 'Use only if it helps prevent late-day meltdown.', skipIf: 'Skip if traffic is heavy or home ETA is already late.', duration: '15-25 min', foodPlan: 'Snack/dessert only.', parking: 'On-site visitor parking.', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=The+Big+Apple+Colborne', taUrl: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' }
    ],
    hotelsCrossCheck: [
      { date: '2026-08-14', city: 'Montreal', hotel: 'Montreal Marriott Chateau Champlain', rating: 4.1, reviews: 2617, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g155032-d185746-Reviews-Montreal_Marriott_Chateau_Champlain-Montreal_Quebec.html' },
      { date: '2026-08-15', city: 'Quebec City', hotel: 'Hotel Cofortel', rating: 4.4, reviews: 897, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g10850433-d1309009-Reviews-Hotel_Cofortel-L_Ancienne_Lorette_Quebec.html' },
      { date: '2026-08-16', city: 'Fredericton', hotel: 'Delta Hotels by Marriott Fredericton', rating: 4.4, reviews: 943, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g154957-d182691-Reviews-Delta_Hotels_by_Marriott_Fredericton-Fredericton_New_Brunswick.html' },
      { date: '2026-08-17', city: 'Charlottetown', hotel: 'Hampton Inn & Suites Charlottetown', rating: 4.4, reviews: 154, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d17675210-Reviews-Hampton_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
      { date: '2026-08-18', city: 'Charlottetown', hotel: "Canadas Best Value Inn & Suites Charlottetown", rating: 3.6, reviews: 331, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d226269-Reviews-Canadas_Best_Value_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
      { date: '2026-08-19', city: 'Moncton', hotel: 'Best Western Plus Moncton', rating: null, reviews: null, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g154958-d281344-Reviews-Best_Western_Plus_Moncton-Moncton_New_Brunswick.html' },
      { date: '2026-08-20', city: 'Quebec City', hotel: 'DoubleTree by Hilton Quebec Resort', rating: null, reviews: 152, taUrl: 'https://www.tripadvisor.ca/Hotel_Review-g155033-d575089-Reviews-DoubleTree_by_Hilton_Quebec_Resort-Quebec_City_Quebec.html' }
    ],
    sourceNotes: [
      { topic: 'TripAdvisor ratings', note: 'Ratings and review counts are snapshots from current TripAdvisor pages/search snippets visible during planning on 2026-07-17. Some pages did not expose a numeric rating in the snippet; those rows keep the TripAdvisor URL but leave rating blank.' },
      { topic: 'Route logic', note: 'Stops are in driving order and meant as Plan B choices. Pick the best one for time, weather and child energy instead of adding every row.' },
      { topic: 'Low-rated stops', note: 'Low-rated highway/convenience stops are not recommendations for food; they remain only for safety, washroom, fuel or timing.' },
      { topic: 'Booked hotels', note: 'Hotels are already booked by the family and are treated as fixed anchors, not shopping recommendations.' }
    ]
  };

  // Coordinates (OpenStreetMap Nominatim) for the Plan B stops that are NOT the
  // same physical place as an existing operational stop or route-side idea —
  // e.g. Green Gables, Hopewell Rocks and Cape Jourimain are already numbered
  // Plan A pins, so only genuinely new alternates get a map entry here. A couple
  // of restaurants Nominatim couldn't resolve use their same-town neighbour's
  // coordinates, nudged slightly so they don't sit exactly on an existing pin.
  // Three Plan B rows are deliberately left out here because they're the same
  // physical place as an existing routeOptionsByDay idea: Parc des Chutes
  // (= "Parc des Chutes de Rivière-du-Loup"), Prince Edward Island Preserve
  // Company (= "Gardens of Hope & Butterfly House", same New Glasgow parking
  // lot), and Albert County Museum (= "Albert County Museum & RB Bennett
  // Centre").
  var PLAN_B_IDEA_COORDS = {
    '1000 Islands Restaurant & Pizzeria': [44.5873, -75.6888],
    'Les Cafes de Julie': [46.8878, -71.1502],
    'Grand Falls Gorge': [47.0453, -67.7360],
    'Pump House Brewpub': [46.0897, -64.7745],
    'Pizza Le Patrimoine': [47.3652, -68.3290],
    'Fromagerie Victoria': [46.6781, -71.3488]
  };

  function planBRatingChip(rating, reviews, source) {
    var ratingHtml = rating
      ? '<span class="ta-rating' + (rating >= 4.5 ? '' : rating >= 4.0 ? ' ta-ok' : ' ta-low') + '">★ ' + Number(rating).toFixed(1) + '</span>'
      : '<span class="tag">' + escapeHtml(source || 'TripAdvisor') + ' page linked</span>';
    return ratingHtml + (reviews ? '<span class="tag">' + escapeHtml(String(reviews)) + ' reviews</span>' : '');
  }

  // Rating chip for a scheduled stop's { source, rating, reviews, url } record
  // (see STOP_RATINGS below) — same visual language as the Plan B rating chip,
  // plus a link back to the review page it came from.
  function stopRatingChip(rating) {
    if (!rating) return '';
    return planBRatingChip(rating.rating, rating.reviews, rating.source) + externalLink(rating.url, rating.source || 'TripAdvisor', 'tag');
  }

  function planBTypeBucket(type) {
    var t = normalize(type);
    if (t.indexOf('food') !== -1) return 'Food';
    if (t.indexOf('fuel') !== -1) return 'Fuel / washroom';
    return 'Attraction';
  }

  function planBStopCard(stop) {
    var catClass = categoryClass(stop.type);
    return [
      '<article class="data-card"><h3>', escapeHtml(stop.time), ' — ', escapeHtml(stop.name), '</h3>',
      '<p>', catClass ? '<span class="tag ' + catClass + '">' + escapeHtml(planBTypeBucket(stop.type)) + '</span>' : '',
      '<span class="tag">', escapeHtml(stop.priority), '</span>',
      planBRatingChip(stop.rating, stop.reviews), '</p>',
      '<p>', escapeHtml(stop.why), '</p>',
      '<dl>',
      '<dt>Use if</dt><dd>', escapeHtml(stop.useIf), '</dd>',
      '<dt>Skip if</dt><dd>', escapeHtml(stop.skipIf), '</dd>',
      '<dt>Duration</dt><dd>', escapeHtml(stop.duration), '</dd>',
      '<dt>Food plan</dt><dd>', escapeHtml(stop.foodPlan), '</dd>',
      '<dt>Parking</dt><dd>', escapeHtml(stop.parking), '</dd>',
      '</dl>',
      '<div class="links">', externalLink(stop.mapsUrl, 'Map'), externalLink(stop.taUrl, 'TripAdvisor'), '</div>',
      '</article>'
    ].join('');
  }

  function mountPlanBSection() {
    var section = document.getElementById('planb');
    var typeOptions = ['Food', 'Attraction', 'Fuel / washroom'];
    section.innerHTML = [
      '<h2 id="planb-heading" class="section-heading">TripAdvisor Plan B — rated alternates &amp; upgrades</h2>',
      '<p class="section-intro">Top-rated and strategically useful alternatives along the same booked-hotel route, built from a TripAdvisor snapshot taken 2026-07-17. Hotels stay fixed and safe; use at most one or two Plan B upgrades per day.</p>',
      mapMarkup(planBMap, {
        title: 'Plan B on the map · switch stops as you go',
        intro: 'The same interactive route map, right here on the Plan B page so you can switch as you want. Numbered pins are the scheduled Plan A stops (hollow = optional); ★ stars are the TripAdvisor Plan B and route-side alternates you can swap in. Tap any pin for ratings, timing, parking and directions.',
        cardAria: 'Plan B route map',
        mapAria: 'Interactive Plan B route map'
      }),
      '<div class="card full ok"><h2>How to use Plan B</h2><ul class="offline-list">',
      planBData.rules.map(function (rule) { return '<li><strong>' + escapeHtml(rule.rule) + ':</strong> ' + escapeHtml(rule.note) + '</li>'; }).join(''),
      '</ul></div>',
      '<div class="card full" style="margin-top:16px"><h2>Day-by-day focus</h2><div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Booked overnight</th><th>Plan B focus</th><th>Best upgrade if ahead</th><th>First thing to skip</th></tr></thead><tbody>',
      planBData.dailyFocus.map(function (row) {
        var day = sourceDay(row.date);
        return '<tr><td>' + escapeHtml(day ? day.dateLabel : row.date) + '</td><td>' + escapeHtml(row.overnight) + '</td><td>' + escapeHtml(row.focus) + '</td><td>' + escapeHtml(row.upgrade) + '</td><td>' + escapeHtml(row.skip) + '</td></tr>';
      }).join(''),
      '</tbody></table></div></div>',
      '<div class="control-grid" style="margin-top:16px" aria-label="Plan B filters">',
      '<label for="planbDay">Day<select id="planbDay"><option value="">All days</option>', operationalPlan.days.map(function (day) { return '<option value="' + escapeHtml(day.id) + '">' + escapeHtml(day.label) + '</option>'; }).join(''), '</select></label>',
      '<label for="planbType">Type<select id="planbType"><option value="">All types</option>', typeOptions.map(function (type) { return '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>'; }).join(''), '</select></label>',
      '<label for="planbSearch">Search<input id="planbSearch" type="search" placeholder="Stop, city, or note" autocomplete="off"></label>',
      '</div>',
      '<div id="planbResultStatus" class="status-line" role="status" aria-live="polite"></div>',
      '<div id="planbResult"></div>',
      '<div class="card full" style="margin-top:16px"><h2>Booked hotels — TripAdvisor cross-check</h2><p class="muted">Hotels are already booked and fixed; ratings are shown only for reference, not as shopping recommendations.</p><div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>City</th><th>Hotel</th><th>TripAdvisor</th></tr></thead><tbody>',
      planBData.hotelsCrossCheck.map(function (hotel) {
        var day = sourceDay(hotel.date);
        return '<tr><td>' + escapeHtml(day ? day.dateLabel : hotel.date) + '</td><td>' + escapeHtml(hotel.city) + '</td><td>' + escapeHtml(hotel.hotel) + '</td><td>' + planBRatingChip(hotel.rating, hotel.reviews) + ' ' + externalLink(hotel.taUrl, 'TripAdvisor') + '</td></tr>';
      }).join(''),
      '</tbody></table></div></div>',
      '<div class="card full" style="margin-top:16px"><h2>Source notes</h2><ul class="offline-list">',
      planBData.sourceNotes.map(function (note) { return '<li><strong>' + escapeHtml(note.topic) + ':</strong> ' + escapeHtml(note.note) + '</li>'; }).join(''),
      '</ul></div>'
    ].join('');
    wireMapControls(planBMap);
    document.getElementById('planbDay').addEventListener('change', function (event) { uiFilters.planbDay = event.target.value; renderPlanBContent(); });
    document.getElementById('planbType').addEventListener('change', function (event) { uiFilters.planbType = event.target.value; renderPlanBContent(); });
    document.getElementById('planbSearch').addEventListener('input', function (event) { uiFilters.planbSearch = event.target.value; renderPlanBContent(); });
    renderPlanBContent();
  }

  function renderPlanBContent() {
    var query = normalize(uiFilters.planbSearch);
    var filtered = planBData.stops.filter(function (stop) {
      if (uiFilters.planbDay && stop.date !== uiFilters.planbDay) return false;
      if (uiFilters.planbType && planBTypeBucket(stop.type) !== uiFilters.planbType) return false;
      var text = normalize([stop.name, stop.segment, stop.why, stop.useIf, stop.skipIf, stop.foodPlan].join(' '));
      return !query || text.indexOf(query) !== -1;
    });
    document.getElementById('planbResultStatus').textContent = 'Showing ' + filtered.length + ' of ' + planBData.stops.length + ' Plan B stops.';
    var groups = operationalPlan.days.map(function (day) {
      return { id: day.id, label: day.label, items: filtered.filter(function (stop) { return stop.date === day.id; }) };
    });
    document.getElementById('planbResult').innerHTML = filtered.length
      ? groups.filter(function (group) { return group.items.length; }).map(function (group) {
          return '<div class="day-group" data-day="' + escapeHtml(group.id) + '"><h3 class="day-group-heading">' + escapeHtml(group.label) + '</h3><div class="attr-grid">' + group.items.map(planBStopCard).join('') + '</div></div>';
        }).join('')
      : '<div class="empty-state">No Plan B stops match. Clear a filter or search term.</div>';
  }

  function mountFoodSection() {
    var section = document.getElementById('food');
    section.innerHTML = [
      '<h2 id="food-heading" class="section-heading">Food — best picks first</h2>',
      '<p class="section-intro">Food ideas for the route, grouped for quick comparison. <strong>☆ Pick</strong> pins a card to the top; <strong>✕ Remove</strong> hides it. Both save in this browser and are reversible. Reconfirm seasonal hours and menus before going.</p>',
      '<details class="card full" style="margin:0 0 16px"><summary><strong>Locked-in daily meal plan</strong> — one Plan A per meal slot</summary><p class="small muted" style="margin:10px 0 12px">Reserve La Bûche, Slaymaker &amp; Nichols and Tide &amp; Boar. New Glasgow is an early walk-in, and Aug 16 dinner stays on site at Delta.</p><div class="timeline">', mealPlanRows(), '</div></details>',
      '<div class="control-grid" aria-label="Food suggestion filters">',
      '<label for="foodDayV2">Day<select id="foodDayV2"><option value="">All days</option><option value="extras">New ideas only</option></select></label>',
      '<label for="mealFilterV2">Meal<select id="mealFilterV2"><option value="">All meals</option></select></label>',
      '<label for="foodSearchV2">Search food ideas<input id="foodSearchV2" type="search" placeholder="Restaurant, city, or dish" autocomplete="off"></label>',
      '</div>',
      '<div class="sugg-toolbar"><div id="foodResultStatus" class="status-line" role="status" aria-live="polite"></div><div class="action-bar" style="margin:0" id="foodRemovedControls"></div></div>',
      '<div id="foodResult" class="sugg-grid"></div>'
    ].join('');
    document.getElementById('foodDayV2').innerHTML += operationalPlan.days.map(function (day) {
      return '<option value="' + escapeHtml(day.id) + '">' + escapeHtml(day.label) + '</option>';
    }).join('');
    var meals = unique(foodSuggestionList().map(function (item) { return item.meal; }));
    document.getElementById('mealFilterV2').innerHTML += meals.map(function (meal) { return '<option value="' + escapeHtml(meal) + '">' + escapeHtml(meal) + '</option>'; }).join('');
    document.getElementById('foodDayV2').addEventListener('change', function (event) { uiFilters.foodDay = event.target.value; renderFoodContent(); });
    document.getElementById('mealFilterV2').addEventListener('change', function (event) { uiFilters.foodMeal = event.target.value; renderFoodContent(); });
    document.getElementById('foodSearchV2').addEventListener('input', function (event) { uiFilters.foodSearch = event.target.value; renderFoodContent(); });
    section.addEventListener('click', suggestionClickHandler('food', renderFoodContent));
    renderFoodContent();
  }

  function menuRankHtml(item) {
    if (!item.menuRank || !item.menuRank.length) return '';
    return [
      '<div class="menu-rank"><p class="menu-rank-title">Best menu items</p><ol>',
      item.menuRank.map(function (dish, index) {
        return '<li><span class="mr-pos mr-' + (index + 1) + '">' + (index + 1) + '</span>' + escapeHtml(dish) + '</li>';
      }).join(''),
      '</ol></div>'
    ].join('');
  }

  function foodCardDetails(item) {
    var rows = [
      !(item.menuRank && item.menuRank.length) && item.order ? '<p><strong>Order:</strong> ' + escapeHtml(item.order) + '</p>' : '',
      item.tip ? '<p><strong>Timing:</strong> ' + escapeHtml(item.tip) + '</p>' : '',
      item.backup ? '<p><strong>Backup:</strong> ' + escapeHtml(item.backup) + '</p>' : '',
      item.reserve ? '<p><strong>Reservation:</strong> ' + escapeHtml(item.reserve) + '</p>' : '',
      item.address ? '<p class="small">' + escapeHtml(item.address) + '</p>' : ''
    ].join('');
    return [
      menuRankHtml(item),
      '<div class="links">', externalLink(item.mapUrl, 'Map'), externalLink(item.source, 'Website'), '</div>',
      rows ? '<details><summary>Timing &amp; backup</summary>' + rows + '</details>' : ''
    ].join('');
  }

  function renderFoodContent() {
    var query = normalize(uiFilters.foodSearch);
    var all = foodSuggestionList();
    var removedAll = all.filter(function (item) { return itemMark(item.id) === 'removed'; });
    if (!removedAll.length) uiFilters.foodShowRemoved = false;
    var showRemoved = uiFilters.foodShowRemoved;
    var filtered = all.filter(function (item) {
      if (uiFilters.foodDay === 'extras' ? item.planned : (uiFilters.foodDay && item.dayId !== uiFilters.foodDay)) return false;
      if (uiFilters.foodMeal && item.meal !== uiFilters.foodMeal) return false;
      var text = normalize([item.name, item.city, item.meal, item.region, item.dayLabel, item.summary, item.order, item.tip, (item.menuRank || []).join(' ')].join(' '));
      return !query || text.indexOf(query) !== -1;
    });
    var rows = sortSuggestions(filtered.filter(function (item) {
      return showRemoved ? itemMark(item.id) === 'removed' : itemMark(item.id) !== 'removed';
    }));
    var pickedCount = all.filter(function (item) { return itemMark(item.id) === 'picked'; }).length;
    document.getElementById('foodDayV2').value = uiFilters.foodDay;
    document.getElementById('mealFilterV2').value = uiFilters.foodMeal;
    document.getElementById('foodSearchV2').value = uiFilters.foodSearch;
    document.getElementById('foodResultStatus').textContent = showRemoved
      ? 'Viewing ' + rows.length + ' removed food idea' + (rows.length === 1 ? '' : 's') + '.'
      : 'Showing ' + rows.length + ' of ' + all.length + ' food ideas · ' + pickedCount + ' picked · ' + removedAll.length + ' removed.';
    document.getElementById('foodRemovedControls').innerHTML = removedControlsHtml(removedAll.length, showRemoved);
    document.getElementById('foodResult').innerHTML = rows.length
      ? rows.map(function (item) {
          item.tags = [item.meal, item.dayLabel, item.city].filter(Boolean);
          return suggestionCard(item, foodCardDetails(item));
        }).join('')
      : '<div class="empty-state">' + (showRemoved ? 'Nothing removed with these filters.' : 'No food ideas match. Clear a filter or search term.') + '</div>';
    wirePhotoFallbacks(document.getElementById('foodResult'));
  }

  function attractionSuggestionList() {
    var sundayDriveAttractions = [
      {
        id: 'xattr-nb-botanical-garden', name: 'New Brunswick Botanical Garden', rating: 4.6,
        fits: 'Optional Aug 16 Edmundston break', region: 'Edmundston, NB', best: 'Early afternoon; confirm Sunday hours',
        desc: 'Twelve themed gardens beside the Madawaska River, including colourful mosaiculture. Use only if the family wants a longer break on this high-drive day.',
        kid: 'Flowers and large living sculptures make this more playful than a formal garden; cap the visit at 45–60 minutes.',
        address: '15 Boulevard Isidore-Boucher, Edmundston, NB E7B 1V6', source: 'https://jardinnbgarden.com/',
        mapUrl: mapSearchUrl('15 Boulevard Isidore-Boucher, Edmundston, NB E7B 1V6')
      }
    ];
    var operationalScenicAttractions = [];
    operationalPlan.days.forEach(function (day) {
      (day.stops || []).forEach(function (stop) {
        if (!/(photo|scenic)/i.test(stop.kind || '')) return;
        var cleanName = String(stop.title || '').replace(/\s+(photo stop|river-view (stretch|reset))$/i, '').trim();
        operationalScenicAttractions.push({
          id: 'attr-plan-' + day.id + '-' + stop.id,
          name: cleanName || stop.title,
          rating: 4.7,
          dayId: day.id,
          dayLabel: day.label,
          dayShort: '',
          best: [stop.time, stop.timeBudget].filter(Boolean).join(' · '),
          summary: stop.notes || 'Short on-route scenery stop from the operational itinerary.',
          kid: stop.kidPlan || '',
          foodWash: stop.food || '',
          address: stop.address || '',
          mapUrl: stop.mapUrl || mapSearchUrl(stop.address || stop.title),
          source: stop.sourceUrl || '',
          planned: true,
          planLabel: 'Plan stop',
          region: stop.city || '',
          photo: '', photoNote: '', icon: 'ðŸ—ºï¸'
        });
      });
    });
    var planned = rawData.attractions.map(function (attraction) {
      var attractionName = normalize(attraction.Attraction);
      var isGrandFalls = attractionName.indexOf('grand falls gorge') !== -1;
      var isMagneticHill = attractionName.indexOf('magnetic hill illusion') !== -1;
      var isHopewell = attractionName.indexOf('hopewell rocks') !== -1;
      var correctedAddress = isMagneticHill ? '2846 Mountain Road, Moncton, NB E1G 2W7' : (attraction.Address || '');
      var dayMatch = String(attraction.Day || '').match(/Aug\s+(\d{1,2})/i);
      var dayId = dayMatch ? '2026-08-' + String(dayMatch[1]).padStart(2, '0') : '';
      var tripDay = sourceDay(dayId);
      return {
        id: 'attr-' + slug(attraction.Attraction),
        name: attraction.Attraction,
        rating: Number(attraction.Rating || 0),
        photo: attraction['Photo URL'] || '', photoNote: attraction['Photo note'] || '',
        dayId: dayId, dayLabel: isGrandFalls ? 'Backup only — not in Plan A' : (tripDay ? tripDay.dateLabel : (attraction.Day || '')), dayShort: isGrandFalls ? '' : (attraction.Day || ''),
        best: isHopewell ? 'Predicted access about 9:00 AM–2:45 PM; target stairs 10:45 and confirm with park staff.' : (attraction['Best time'] || ''),
        summary: isGrandFalls ? 'Scenic gorge retained only as a future-trip idea; the Aug 16 Plan A uses Edmundston and Hartland service breaks instead.' : (attraction.Description || ''),
        kid: isHopewell ? 'Timing-sensitive: use closed-toe grippy shoes, consider the shuttle, and treat 60–90 minutes on the floor as enough.' : (attraction['Kid fit'] || ''), foodWash: attraction['Food / Washroom'] || '',
        address: correctedAddress,
        mapUrl: isMagneticHill ? mapSearchUrl(correctedAddress) : (attraction['Map URL'] || mapSearchUrl(correctedAddress || attraction.Attraction)),
        source: attraction['Source URL'] || '',
        planned: !isGrandFalls, planLabel: isGrandFalls ? 'Backup only' : '', region: '',
        icon: '🗺️'
      };
    });
    var extras = (rawData.attractionExtras || []).concat(sundayDriveAttractions).map(function (attraction) {
      var dayMatch = String(attraction.fits || '').match(/Aug\s+(\d{1,2})/i);
      var dayId = dayMatch ? '2026-08-' + String(dayMatch[1]).padStart(2, '0') : '';
      var tripDay = sourceDay(dayId);
      return {
        id: attraction.id,
        name: attraction.name,
        rating: Number(attraction.rating || 0),
        photo: attraction.photo || '', photoNote: attraction.photoNote || '',
        dayId: dayId, dayLabel: tripDay ? tripDay.dateLabel : (attraction.fits || attraction.region || 'Flexible'), dayShort: '',
        best: attraction.best || '',
        summary: attraction.desc || '',
        kid: attraction.kid || '', foodWash: '',
        address: attraction.address || '',
        mapUrl: attraction.mapUrl || mapSearchUrl(attraction.address || attraction.name),
        source: attraction.source || '',
        planned: false, region: attraction.region || '',
        icon: '🗺️'
      };
    });
    return planned.concat(operationalScenicAttractions, extras);
  }

  function mountAttractionsSection() {
    var section = document.getElementById('attractions');
    section.innerHTML = [
      '<h2 id="attractions-heading" class="section-heading">Attractions — day by day</h2>',
      '<p class="section-intro">Route attractions plus nearby backups, grouped in trip-day order. <strong>☆ Pick</strong> pins a card within its day; <strong>✕ Remove</strong> hides it. Both save in this browser and are reversible. Use official links to reconfirm seasonal details.</p>',
      '<div class="control-grid"><label for="attrSearchV2">Search attractions<input id="attrSearchV2" type="search" placeholder="Attraction, area, or detail" autocomplete="off"></label></div>',
      '<div class="sugg-toolbar"><div id="attrResultStatus" class="status-line" role="status" aria-live="polite"></div><div class="action-bar" style="margin:0" id="attrRemovedControls"></div></div>',
      '<div id="attrResult"></div>'
    ].join('');
    document.getElementById('attrSearchV2').addEventListener('input', function (event) {
      uiFilters.attractionSearch = event.target.value;
      renderAttractionsContent();
    });
    section.addEventListener('click', suggestionClickHandler('attractions', renderAttractionsContent));
    renderAttractionsContent();
  }

  function attractionCardDetails(item) {
    var ticket = ticketForAttraction(item.name);
    var quality = qualityForAttractionName(item.name);
    var rows = [
      item.best ? '<p><strong>Best time:</strong> ' + escapeHtml(item.best) + '</p>' : '',
      item.foodWash ? '<p><strong>Food / washroom:</strong> ' + escapeHtml(item.foodWash) + '</p>' : '',
      renderTicketGuidance(ticket),
      renderAttractionQuality(quality),
      item.address ? '<p class="small">' + escapeHtml(item.address) + '</p>' : ''
    ].join('');
    return [
      item.kid ? '<p class="small"><strong>Kid fit:</strong> ' + escapeHtml(item.kid) + '</p>' : '',
      '<div class="links">', externalLink(item.mapUrl, 'Map'), externalLink(item.source, 'Source'), '</div>',
      rows ? '<details' + (ticket && ticket.required ? ' open' : '') + '><summary>Timing, tickets &amp; kid backup</summary>' + rows + '</details>' : ''
    ].join('');
  }

  function renderAttractionsContent() {
    var query = normalize(uiFilters.attractionSearch);
    var all = attractionSuggestionList();
    var removedAll = all.filter(function (item) { return itemMark(item.id) === 'removed'; });
    if (!removedAll.length) uiFilters.attractionShowRemoved = false;
    var showRemoved = uiFilters.attractionShowRemoved;
    var filtered = all.filter(function (item) {
      var ticket = ticketForAttraction(item.name);
      var quality = qualityForAttractionName(item.name);
      var text = normalize([item.name, item.summary, item.address, item.kid, item.region, item.dayLabel, ticket && ticket.label, ticket && ticket.note, quality && 'kid backup', quality && quality.backupTitle, quality && quality.backupAddress].join(' '));
      return !query || text.indexOf(query) !== -1;
    });
    var rows = sortSuggestions(filtered.filter(function (item) {
      return showRemoved ? itemMark(item.id) === 'removed' : itemMark(item.id) !== 'removed';
    }));
    var pickedCount = all.filter(function (item) { return itemMark(item.id) === 'picked'; }).length;
    document.getElementById('attrSearchV2').value = uiFilters.attractionSearch;
    document.getElementById('attrResultStatus').textContent = showRemoved
      ? 'Viewing ' + rows.length + ' removed attraction' + (rows.length === 1 ? '' : 's') + '.'
      : 'Showing ' + rows.length + ' of ' + all.length + ' attractions · ' + pickedCount + ' picked · ' + removedAll.length + ' removed.';
    document.getElementById('attrRemovedControls').innerHTML = removedControlsHtml(removedAll.length, showRemoved);
    var attractionGroups = operationalPlan.days.map(function (day) {
      return { id: day.id, label: day.label, items: rows.filter(function (item) { return item.dayId === day.id; }) };
    });
    attractionGroups.push({ id: 'flexible', label: 'Flexible and backup ideas', items: rows.filter(function (item) {
      return !item.dayId || !sourceDay(item.dayId);
    }) });
    document.getElementById('attrResult').innerHTML = rows.length
      ? attractionGroups.filter(function (group) { return group.items.length; }).map(function (group) {
          return '<div class="day-group" data-day="' + escapeHtml(group.id) + '"><h3 class="day-group-heading">' + escapeHtml(group.label) + '</h3><div class="sugg-grid">' + group.items.map(function (item) {
            item.tags = ['Attraction', item.dayLabel, item.region].filter(Boolean);
            return suggestionCard(item, attractionCardDetails(item));
          }).join('') + '</div></div>';
        }).join('')
      : '<div class="empty-state">' + (showRemoved ? 'Nothing removed with this search.' : 'No attractions match. Try another search.') + '</div>';
    wirePhotoFallbacks(document.getElementById('attrResult'));
  }

  function renderHotels() {
    var section = document.getElementById('hotels');
    section.innerHTML = [
      '<h2 id="hotels-heading" class="section-heading">Hotels</h2>',
      '<p class="section-intro">All seven nights are booked and safe. They are shown in overnight order with the confirmed room and check-in logistics; private itinerary numbers and the reservation holder’s name stay off this public page.</p>',
      '<div class="mobile-card-list">',
      rawData.hotels.map(function (hotel) {
        return [
          '<div class="day-group" data-day="', escapeHtml(hotel.Date || ''), '"><h3 class="day-group-heading">', escapeHtml(hotel['Date label'] || hotel.Date || ''), ' — ', escapeHtml(hotel.Base || ''), '</h3>',
          '<article class="data-card ok"><h3>', escapeHtml(hotel['Recommended hotel'] || ''), '</h3>',
          '<p><span class="tag category-hotel">Hotel · booked</span><span class="tag category-ok">Booked · safe</span></p>',
          '<p><strong>', escapeHtml(hotel['Date label'] || hotel.Date || ''), '</strong> · ', escapeHtml(hotel.Base || ''), '</p>',
          '<p>', escapeHtml(hotel['Why recommended'] || ''), '</p>',
          '<dl><dt>Address</dt><dd>', escapeHtml(hotel.Address || '—'), '</dd><dt>Check-in</dt><dd>', escapeHtml(hotel['Check-in'] || '—'), '</dd><dt>Check-out</dt><dd>', escapeHtml(hotel['Check-out'] || '—'), '</dd><dt>Room</dt><dd>', escapeHtml(hotel.Room || '—'), '</dd><dt>Guests</dt><dd>', escapeHtml(hotel.Guests || '—'), '</dd><dt>Cancellation</dt><dd>', escapeHtml(hotel.Cancellation || 'Reconfirm directly.'), '</dd></dl>',
          '<p class="small muted">Booking status: ', escapeHtml(hotel.Status || 'Booked · safe'), '. Keep the private confirmation email available at check-in.</p>',
          '<div class="links">', externalLink(hotel['Map URL'], 'Map'), externalLink(hotel['Address/source'], 'Official hotel'), externalLink(hotel['Amenities/source'], 'Amenities / dining'), '</div>',
          '</article></div>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderFuel() {
    var section = document.getElementById('fuel');
    section.innerHTML = [
      '<h2 id="fuel-heading" class="section-heading">Fuel plan</h2>',
      '<p class="section-intro">Family-safe fuel strategy: start full with 91 AKI minimum, then refuel by a quarter tank remaining—or sooner when the live range approaches 120–150 km, weather is poor, or the next reliable station is uncertain. The car’s live range and safe station access override fixed-distance math.</p>',
      '<div class="mobile-card-list">',
      minimalFuelPlan.map(function (fuel) {
        return [
          '<article class="data-card"><h3>', escapeHtml(fuel.stop || 'Fuel decision'), '</h3>',
          '<p><span class="tag">', escapeHtml(fuel.dateLabel || ''), '</span><span class="tag">', escapeHtml(fuel.tank || 'Check dash'), '</span></p>',
          '<dl><dt>Address / zone</dt><dd>', escapeHtml(fuel.address || '—'), '</dd><dt>Action</dt><dd>', escapeHtml(fuel.action || 'Review'), '</dd><dt>Why</dt><dd>', escapeHtml(fuel.reason || '—'), '</dd></dl>',
          '<p class="small"><strong>Rule:</strong> refuel by 25%; never delay fuel for a tidy mileage target and never let it compete with the Hopewell tide window.</p>',
          '<div class="links">', externalLink(fuel.mapUrl, 'Map'), externalLink(fuel.sourceUrl, 'Station source'), '</div></article>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderSanity() {
    var section = document.getElementById('sanity');
    section.innerHTML = [
      '<h2 id="sanity-heading" class="section-heading">Drive sanity & fallbacks</h2>',
      '<p class="section-intro">The app never auto-completes a stop. Choose a manual delay mode when reality changes, then protect sleep and the next required stop.</p>',
      '<div class="mobile-card-list">',
      operationalPlan.days.map(function (day) {
        return [
          '<details class="data-card ', riskClass(day.risk), '"', normalize(day.risk) === 'high' ? ' open' : '', '><summary><strong>', escapeHtml(day.label), '</strong> · ', escapeHtml(day.risk), ' risk · ', escapeHtml(day.driveKm), ' km</summary>',
          '<p><strong>', escapeHtml(day.routeFocus), '</strong><br>', escapeHtml(day.pureDriveTime), '</p>',
          '<p><strong>Morning:</strong> Wake ', escapeHtml(day.wakeTime), ' · target rollout ', escapeHtml(day.departTarget), '<br><strong>Driver plan:</strong> ', escapeHtml(day.driverPlan), '</p>',
          '<p><strong>Delay rule:</strong> ', escapeHtml(day.contingency), '</p>',
          '<p><strong>Fallback:</strong> ', escapeHtml(day.emergency), '</p>',
          '<p class="small"><strong>Time zone:</strong> ', escapeHtml(day.timeZoneNote), '</p>',
          dayRouteLinks(day),
          '</details>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderSources() {
    var section = document.getElementById('sources');
    var sourceItems = rawData.sources.filter(function (source) {
      return !/^Low-fuel corridor:/i.test(String(source.Topic || ''));
    }).map(function (source) {
      var fact = source['Key fact used'];
      if (/Hopewell Cape tide predictions/i.test(String(source.Topic || ''))) {
        fact = 'CHS predicts low tide at 11:52 AM ADT on Aug 19. Estimated floor access is about 9:00 AM–2:45 PM, but actual access remains at park staff discretion.';
      }
      return { name: source.Topic, fact: fact, url: source['Source URL'] };
    });
    var fuelSourceItems = minimalFuelPlan.map(function (fuel) {
      return { name: fuel.stop, fact: 'Verify 91 AKI before travel and refuel by 25% remaining, sooner near 120–150 km displayed range or uncertain services.', url: fuel.sourceUrl || fuel.mapUrl };
    });
    var items = sourceItems.concat(fuelSourceItems).concat(ticketGuidanceList).concat(roadLinks.map(function (link) {
      return { name: link.title, fact: link.detail, url: link.url };
    }));
    section.innerHTML = [
      '<h2 id="sources-heading" class="section-heading">Sources & live verification</h2>',
      '<p class="section-intro">Use these links before departure and whenever a schedule, tide, menu, or road condition might have changed.</p>',
      '<ol class="source-list">',
      items.filter(function (item) { return safeExternalUrl(item.url); }).map(function (item) {
        return '<li><strong>' + escapeHtml(item.name || 'Source') + '</strong>: ' + escapeHtml(item.fact || 'Open for details.') + '<br>' + externalLink(item.url, 'Open source') + '</li>';
      }).join(''),
      '</ol>'
    ].join('');
  }

  var wakeLockWanted = false;
  var wakeLockSentinel = null;

  function wakeLockSupported() {
    return 'wakeLock' in navigator && typeof navigator.wakeLock.request === 'function';
  }

  function syncWakeCheckbox() {
    var box = document.getElementById('wakeLockToggle');
    if (box) box.checked = Boolean(wakeLockSentinel);
  }

  function acquireWakeLock() {
    if (!wakeLockSupported()) return;
    navigator.wakeLock.request('screen').then(function (sentinel) {
      wakeLockSentinel = sentinel;
      sentinel.addEventListener('release', function () {
        wakeLockSentinel = null;
        syncWakeCheckbox();
      });
      syncWakeCheckbox();
      setStatus('Screen will stay awake while this page is open.');
    }).catch(function () {
      wakeLockWanted = false;
      syncWakeCheckbox();
      setStatus('This browser refused the screen wake lock (often low battery mode).');
    });
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) wakeLockSentinel.release().catch(function () {});
    wakeLockSentinel = null;
    syncWakeCheckbox();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && wakeLockWanted && !wakeLockSentinel) acquireWakeLock();
  });

  function renderWakeLockControl() {
    if (!wakeLockSupported()) return '';
    return '<p class="wake-row"><label><input type="checkbox" id="wakeLockToggle"' + (wakeLockWanted ? ' checked' : '') + '> Keep the screen awake (navigator/passenger phone)</label></p>';
  }

  function renderTodayBanner(day) {
    var today = localIsoDate();
    if (day.id === today || !operationalPlan.days.some(function (item) { return item.id === today; })) return '';
    return '<div class="note today-note">It is a trip day — you are viewing ' + escapeHtml(day.label) + '. <button type="button" class="button primary" id="jumpToday">Switch to today’s plan</button></div>';
  }

  function scheduleModeLabel(mode) {
    return { preview: 'Planning', 'on-time': 'On schedule', ahead30: '30 min ahead', ahead60: '60+ min ahead', late30: '30+ min late', late60: '60+ min late' }[mode] || 'Planning';
  }

  function shortDate(isoDate) {
    var parts = String(isoDate || '').split('-');
    if (parts.length !== 3) return isoDate || '';
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  function renderHotelSafeBanner(day) {
    var hotel = hotelForNight(day.id);
    var tonight = hotel ? hotel['Recommended hotel'] : 'Trip hotel nights complete';
    return '<div class="hotel-safe-banner"><div><strong>7/7 hotels booked · safe</strong><span>Tonight: ' + escapeHtml(tonight) + '</span></div><span class="tag category-ok">No hotel action needed</span></div>';
  }

  function routeOptionId(option) {
    return slug(option && option.name || 'option');
  }

  function optionMinimumMinutes(option) {
    var match = String(option && option.visit || '').match(/\d+/);
    return match ? Number(match[0]) : 999;
  }

  function recommendedRouteOption(day, minutes) {
    var plan = routeOptionsByDay[day.id];
    if (!plan || !minutes || day.id === '2026-08-21') return null;
    return plan.options.find(function (option) { return optionMinimumMinutes(option) <= minutes; }) || null;
  }

  function selectedRouteOption(day) {
    var id = tripState.routeChoices[day.id];
    var plan = routeOptionsByDay[day.id];
    return plan && plan.options.find(function (option) { return routeOptionId(option) === id; }) || null;
  }

  function renderTodayRouteOption(day) {
    var minutes = aheadMinutes(day);
    var selected = selectedRouteOption(day);
    var choice = tripState.routeChoices[day.id] || '';
    if (!minutes && !selected) return '';
    if (choice === 'dismissed') return '<article class="decision-card"><div class="decision-head"><div><span class="tag">Extra time</span><h3>No extra stop selected</h3><p class="muted">The default route stays unchanged.</p></div></div><div class="decision-actions"><button type="button" class="button subtle" data-route-choice="show">Show suggestion</button></div></article>';
    var option = selected || recommendedRouteOption(day, minutes);
    if (!option) return '<article class="decision-card"><div class="decision-head"><div><span class="tag">Extra time</span><h3>Keep the buffer</h3><p>No safe optional attraction fits this margin. Use it for a calmer meal or hotel recovery.</p></div></div></article>';
    return [
      '<article class="decision-card', selected ? ' is-selected' : '', '"><div class="decision-head"><div><span class="tag">', selected ? 'Chosen extra' : 'Safe suggestion', '</span><h3>', escapeHtml(option.name), '</h3><p>', escapeHtml(option.why), '</p></div><strong>', escapeHtml(option.visit), '</strong></div>',
      '<p class="small"><strong>Where it fits:</strong> ', escapeHtml(option.routePoint), '<br><strong>Go only if:</strong> ', escapeHtml(option.gate), '<br><strong>Closest parking:</strong> ', escapeHtml(option.parking), '</p>',
      '<div class="decision-actions">', externalLink(option.map, 'Parking map', 'button'), externalLink(option.source, 'Official info', 'button subtle'), selected ? '<button type="button" class="button subtle" data-route-choice="clear">Remove choice</button>' : '<button type="button" class="button primary" data-route-choice="' + escapeHtml(routeOptionId(option)) + '">Use this option</button><button type="button" class="button subtle" data-route-choice="dismissed">Not today</button>', '</div></article>'
    ].join('');
  }

  function renderTodayMealChoice(day) {
    var plan = mealFlexByDay[day.id];
    if (!plan || !plan.options || !plan.options.length) return '';
    var option = plan.options[0];
    var choice = tripState.mealChoices[day.id] === 'quick' ? 'quick' : 'proper';
    return [
      '<article class="decision-card', choice === 'quick' ? ' is-selected' : '', '"><div class="decision-head"><div><span class="tag category-food">Meal pace</span><h3>', choice === 'proper' ? 'Proper meals stay in Plan A' : escapeHtml(option.meal + ': ' + option.foodName), '</h3><p>', choice === 'proper' ? 'Hotel breakfast plus the planned proper lunch and dinner remain selected.' : escapeHtml(option.order + ' · ' + option.window + '. ' + option.saved), '</p></div></div>',
      '<div class="meal-choice-buttons" role="group" aria-label="Meal pace"><button type="button" class="button subtle" data-meal-choice="proper" aria-pressed="', choice === 'proper', '">Plan A meals</button><button type="button" class="button subtle" data-meal-choice="quick" aria-pressed="', choice === 'quick', '">Use quick option</button></div>',
      choice === 'quick' ? '<p class="small"><strong>Time unlocked for:</strong> ' + escapeHtml(option.experience) + '<br><strong>Closest parking:</strong> ' + escapeHtml(option.parking) + '</p><div class="decision-actions">' + externalLink(option.foodMap, 'Food map', 'button') + externalLink(option.experienceMap, 'Extra stop map', 'button subtle') + '</div>' : '',
      '</article>'
    ].join('');
  }

  function renderFreshnessCard(day) {
    var check = dayVerificationByDay[day.id];
    if (!check) return '';
    var due = localIsoDate() >= check.due;
    return '<article class="freshness-card' + (due ? ' is-due' : '') + '"><p><strong>' + (due ? 'Live recheck due now' : 'Live recheck due ' + escapeHtml(shortDate(check.due))) + '</strong> · plan reviewed ' + escapeHtml(shortDate(PLAN_REVIEWED_ON)) + '</p><p class="small">' + escapeHtml(check.summary) + '</p><div class="action-bar">' + dayWeatherLink(day.id, 'button subtle') + externalLink(check.roadUrl, 'Road conditions', 'button subtle') + '</div></article>';
  }

  function renderOfflineReadiness() {
    var done = offlineReadinessItems.filter(function (item) { return tripState.offlineReadiness[item.id]; }).length;
    return '<article class="readiness-card"><h3>Offline ready · ' + done + '/' + offlineReadinessItems.length + '</h3><p class="small muted">Finish before departure; progress stays on this device.</p><div class="readiness-grid">' + offlineReadinessItems.map(function (item) {
      return '<label class="readiness-item"><input type="checkbox" data-offline-ready="' + escapeHtml(item.id) + '"' + (tripState.offlineReadiness[item.id] ? ' checked' : '') + '> <span>' + escapeHtml(item.label) + '</span></label>';
    }).join('') + '</div></article>';
  }

  function renderExpenseCard() {
    var totals = expenseTotals();
    var budget = expenseState.budget;
    var remaining = budget ? Math.round((budget - totals.total) * 100) / 100 : 0;
    var pct = budget ? Math.min(100, Math.round((totals.total / budget) * 100)) : 0;
    var recent = expenseState.items.slice(-6).reverse();
    return [
      '<article class="quick-card expense-card"><h3>Trip spend</h3>',
      '<div class="expense-summary"><strong class="expense-total">', escapeHtml(formatMoney(totals.total)), '</strong>',
      budget ? '<span class="small"> of ' + escapeHtml(formatMoney(budget)) + ' budget · ' + (remaining >= 0 ? escapeHtml(formatMoney(remaining)) + ' left' : escapeHtml(formatMoney(-remaining)) + ' over') + '</span>' : '<span class="small"> spent so far</span>',
      '</div>',
      budget ? '<div class="progress-meter" aria-label="' + pct + '% of budget spent"><span style="width:' + pct + '%' + (remaining < 0 ? ';background:var(--danger)' : '') + '"></span></div>' : '',
      totals.total ? '<p class="small">' + EXPENSE_CATEGORIES.filter(function (category) { return totals.byCategory[category]; }).map(function (category) { return escapeHtml(category) + ' ' + escapeHtml(formatMoney(totals.byCategory[category])); }).join(' · ') + '</p>' : '',
      '<form id="expenseForm" class="expense-form" autocomplete="off">',
      '<label class="field-label">Amount<input id="expenseAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" required></label>',
      '<label class="field-label">Category<select id="expenseCategory">', EXPENSE_CATEGORIES.map(function (category) { return '<option>' + escapeHtml(category) + '</option>'; }).join(''), '</select></label>',
      '<label class="field-label">Note (optional)<input id="expenseLabel" maxlength="80" placeholder="e.g. Tide &amp; Boar dinner"></label>',
      '<button type="submit" class="button primary">Add</button>',
      '</form>',
      '<div class="action-bar"><button type="button" class="button subtle" id="setBudget">', budget ? 'Change budget' : 'Set a trip budget', '</button>', expenseState.items.length ? '<button type="button" class="button subtle" id="exportExpenses">Export CSV</button>' : '', '</div>',
      recent.length ? '<ul class="expense-list">' + recent.map(function (item) {
        return '<li><span>' + escapeHtml(item.date.slice(5)) + ' · ' + escapeHtml(item.category) + (item.label ? ' · ' + escapeHtml(item.label) : '') + '</span><span class="expense-row-right">' + escapeHtml(formatMoney(item.amount)) + ' <button type="button" class="expense-delete" data-expense-id="' + escapeHtml(item.id) + '" aria-label="Delete this expense">✕</button></span></li>';
      }).join('') + '</ul>' : '<p class="small muted">No expenses logged yet. Everything stays in this browser; use a sync code to bring it to the other phone.</p>',
      '</article>'
    ].join('');
  }

  function wireExpenseCard() {
    var form = document.getElementById('expenseForm');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var amount = Number(document.getElementById('expenseAmount').value);
      if (!(amount > 0)) return;
      expenseState.items.push(sanitizeExpense({
        date: localIsoDate(),
        category: document.getElementById('expenseCategory').value,
        label: document.getElementById('expenseLabel').value,
        amount: amount
      }));
      persistExpenses();
      renderLive();
      setStatus('Expense added.');
    });
    document.getElementById('setBudget').addEventListener('click', function () {
      var input = window.prompt('Trip budget in dollars (leave empty to remove):', expenseState.budget || '');
      if (input === null) return;
      expenseState.budget = Number(input) > 0 ? Math.round(Number(input) * 100) / 100 : 0;
      persistExpenses();
      renderLive();
    });
    var exportButton = document.getElementById('exportExpenses');
    if (exportButton) {
      exportButton.addEventListener('click', function () {
        var csvField = function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; };
        var rows = [['Date', 'Category', 'Note', 'Amount'].join(',')];
        expenseState.items.forEach(function (item) {
          rows.push([item.date, item.category, csvField(item.label), item.amount.toFixed(2)].join(','));
        });
        rows.push(['', '', csvField('Total'), expenseTotals().total.toFixed(2)].join(','));
        downloadText('pei-road-trip-expenses.csv', rows.join('\n'), 'text/csv;charset=utf-8');
        setStatus('Expenses exported as CSV.');
      });
    }
    document.querySelectorAll('.expense-delete').forEach(function (button) {
      button.addEventListener('click', function () {
        expenseState.items = expenseState.items.filter(function (item) { return item.id !== button.dataset.expenseId; });
        persistExpenses();
        renderLive();
      });
    });
  }

  // When the active day is the real calendar day, show the current clock time and
  // the stop the schedule puts you at right now. This is a non-destructive nudge:
  // it never toggles Done/Skip, which stay manual. Times are read in the device's
  // local zone, so it stays sensible as the trip crosses into Atlantic time.
  function renderTodayNowLine(day) {
    if (day.id !== localIsoDate()) return '';
    var now = new Date();
    var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var mins = now.getHours() * 60 + now.getMinutes();
    var list = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    var current = null;
    list.forEach(function (stop) {
      var t = clockMinutes(stop.time);
      if (t != null && t <= mins) current = stop;
    });
    return '<p class="small today-now"><strong>Now ' + hhmm + '</strong>'
      + (current ? ' · by the clock, around <strong>' + escapeHtml(current.title) + '</strong>' : ' · before today’s first stop')
      + '</p>';
  }

  // Opt-in: on tap, use the device GPS to find the closest of today's mapped
  // stops and offer navigation to it. The location is used only in-page for the
  // distance math and is never stored or transmitted.
  function findNearestStop(day) {
    var status = document.getElementById('nearestStopStatus');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location is not available on this device.';
      return;
    }
    if (status) status.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(function (position) {
      var here = [position.coords.latitude, position.coords.longitude];
      var candidates = visibleStops(day).filter(function (stop) { return stop.coords && !stop.choiceGated; });
      if (!candidates.length) {
        if (status) status.textContent = 'No mapped stops today to compare against.';
        return;
      }
      var best = null, bestKm = Infinity;
      candidates.forEach(function (stop) {
        var km = tripDistanceKm(here, stop.coords);
        if (km < bestKm) { bestKm = km; best = stop; }
      });
      var distance = bestKm < 1 ? Math.round(bestKm * 1000) + ' m' : bestKm.toFixed(bestKm < 10 ? 1 : 0) + ' km';
      if (status) {
        status.innerHTML = 'Nearest stop: <strong>' + escapeHtml(best.title) + '</strong> · about '
          + escapeHtml(distance) + ' away · ' + escapeHtml(best.time) + ' '
          + externalLink(routeUrl([best]), 'Navigate', 'button subtle');
      }
      setStatus('Nearest stop: ' + best.title + ', about ' + distance + ' away.');
    }, function (error) {
      if (status) {
        status.textContent = error && error.code === 1
          ? 'Location permission was declined. Pick a stop from the plan below instead.'
          : 'Could not get your location. Check that GPS/location is on and try again.';
      }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function renderLive() {
    var section = document.getElementById('live');
    var day = dayById(tripState.activeDate);
    var mode = tripState.modes[day.id] || 'preview';
    var stops = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    var completed = stops.filter(function (stop) { return stopStatus(stop.id) === 'done'; }).length;
    var next = nextStop(day);
    var prior = stops.filter(function (stop) { return stopStatus(stop.id) === 'done'; }).pop() || stops[0];
    var nextRoute = next ? routeUrl(prior && prior.id !== next.id ? [prior, next] : [next]) : '';
    var progress = stops.length ? Math.round((completed / stops.length) * 100) : 0;
    var modeName = scheduleModeLabel(mode);
    var tonightTarget = (hotelPlanRules[day.id] && hotelPlanRules[day.id].arrival) || 'confirm arrival';
    var tideDetails = day.id === operationalPlan.tidePlan.date ? '<div class="mode-note safe"><strong>Hopewell:</strong> Low tide 11:52 AM. Target entrance 10:15–10:30 and stairs by 10:45; staff control actual floor access.<div class="action-bar">' + externalLink(operationalPlan.tidePlan.sourceUrl, 'Tide table', 'button subtle') + externalLink(operationalPlan.tidePlan.chsUrl, 'CHS prediction', 'button subtle') + '</div></div>' : '';
    section.innerHTML = [
      '<h2 id="live-heading" class="section-heading">Today</h2>',
      '<p class="section-intro">Your next action, route, and progress.</p>',
      renderTodayBanner(day),
      renderHotelSafeBanner(day),
      '<div class="trip-control-grid">',
      '<article class="next-stop"><p class="route-label">', escapeHtml(modeName), ' · <span class="risk-chip ', riskClass(day.risk), '">', escapeHtml(day.risk), ' risk</span></p>',
      next ? '<h3>' + escapeHtml(next.title) + '</h3><p class="muted next-time">' + escapeHtml(next.time) + (next.zone ? ' ' + escapeHtml(next.zone) : '') + ' · ' + escapeHtml(next.city) + '</p>' : '<h3>Day complete</h3><p class="muted">All active stops are complete.</p>',
      '<p class="small"><strong>Hotel arrival target:</strong> ', escapeHtml(tonightTarget), '</p>',
      renderTodayNowLine(day),
      '<div class="action-bar">', next ? externalLink(nextRoute, 'Navigate', 'button') : '', dayRouteLinks(day, 'button secondary'), '</div>',
      '<div class="today-action-row"><button type="button" class="button subtle" id="nearestStopBtn">Find nearest stop</button></div>',
      '<p id="nearestStopStatus" class="small muted" role="status" aria-live="polite"></p>',
      next ? '<div class="today-action-row"><button type="button" class="button primary" data-live-stop-action="done">Done</button>' + (next.priority !== 'required' ? '<button type="button" class="button subtle" data-live-stop-action="skip">Skip this optional stop</button>' : '') + '</div>' : '',
      '<div class="trip-progress"><strong>', completed, '/', stops.length, ' active stops complete</strong><div class="progress-meter" aria-label="' + completed + ' of ' + stops.length + ' active stops complete"><span style="width:' + progress + '%"></span></div></div>',
      next ? '<details class="next-details"><summary>What to know</summary><p>' + escapeHtml(next.notes) + '</p></details>' : '',
      renderWakeLockControl(),
      '</article>',
      '</div>',
      '<div class="control-grid primary-controls today-controls" aria-label="Trip control settings">',
      '<label for="liveDay">Day<select id="liveDay">', operationalPlan.days.map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(dayOptionLabel(item)) + '</option>'; }).join(''), '</select></label>',
      '<label for="liveMode">Schedule<select id="liveMode"><option value="preview">Planning</option><option value="on-time">On schedule</option><option value="ahead30">30 min ahead</option><option value="ahead60">60+ min ahead</option><option value="late30">30+ min late</option><option value="late60">60+ min late</option></select></label>',
      '</div>',
      renderDayRouteMap(day, visibleStops(day), 'Today’s route'),
      renderTodayRouteOption(day),
      renderTodayMealChoice(day),
      renderFreshnessCard(day),
      renderOfflineReadiness(),
      '<details class="quick-card compact-guidance"><summary><strong>If plans change</strong></summary><p><strong>If delayed:</strong> ', escapeHtml(day.contingency), '</p><p><strong>Safety fallback:</strong> ', escapeHtml(day.emergency), '</p><div class="action-bar"><button type="button" class="button subtle" id="openDayPlan">Open full plan</button>', dayWeatherLink(day.id), '</div></details>',
      tideDetails,
    ].join('');
    document.getElementById('liveDay').value = day.id;
    document.getElementById('liveMode').value = mode;
    document.getElementById('liveDay').addEventListener('change', function (event) {
      tripState.activeDate = event.target.value;
      uiFilters.dayId = event.target.value;
      persist();
      renderDayContent();
      renderLive();
      var nextDaySelect = document.getElementById('liveDay');
      if (nextDaySelect) nextDaySelect.focus();
    });
    document.getElementById('liveMode').addEventListener('change', function (event) {
      tripState.modes[day.id] = event.target.value;
      persist();
      renderDayContent();
      renderLive();
      var nextModeSelect = document.getElementById('liveMode');
      if (nextModeSelect) nextModeSelect.focus();
    });
    var nearestButton = document.getElementById('nearestStopBtn');
    if (nearestButton) nearestButton.addEventListener('click', function () { findNearestStop(day); });
    section.querySelectorAll('[data-live-stop-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!next) return;
        var action = button.dataset.liveStopAction;
        if (action === 'skip' && next.priority === 'required') return;
        tripState.stops[next.id] = action === 'skip' ? 'skipped' : 'done';
        persist();
        renderDayContent();
        renderLive();
      });
    });
    section.querySelectorAll('.day-map [data-stop-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        var stopId = button.dataset.stopId;
        var action = button.dataset.stopAction;
        if (action === 'toggle') {
          tripState.stops[stopId] = stopStatus(stopId) === 'done' ? 'pending' : 'done';
          persist();
          renderDayContent();
          renderLive();
        } else if (action === 'skip') {
          tripState.stops[stopId] = stopStatus(stopId) === 'skipped' ? 'pending' : 'skipped';
          persist();
          renderDayContent();
          renderLive();
        } else if (action === 'copy') {
          copyText(button.dataset.address || '').then(function () { setStatus('Address copied to the clipboard.'); });
        }
      });
    });
    section.querySelectorAll('[data-route-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        var choice = button.dataset.routeChoice;
        if (choice === 'clear' || choice === 'show') delete tripState.routeChoices[day.id];
        else tripState.routeChoices[day.id] = choice;
        persist();
        renderLive();
      });
    });
    section.querySelectorAll('[data-meal-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        tripState.mealChoices[day.id] = button.dataset.mealChoice === 'quick' ? 'quick' : 'proper';
        persist();
        renderLive();
      });
    });
    section.querySelectorAll('[data-offline-ready]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) tripState.offlineReadiness[input.dataset.offlineReady] = true;
        else delete tripState.offlineReadiness[input.dataset.offlineReady];
        persist();
        renderChecklist();
        renderOffline();
        renderLive();
      });
    });
    document.getElementById('openDayPlan').addEventListener('click', function () {
      uiFilters.dayId = day.id;
      renderDayContent();
      activateSection('daybyday', true);
    });
    var wakeToggle = document.getElementById('wakeLockToggle');
    if (wakeToggle) {
      wakeToggle.checked = Boolean(wakeLockSentinel);
      wakeToggle.addEventListener('change', function () {
        wakeLockWanted = wakeToggle.checked;
        if (wakeLockWanted) acquireWakeLock();
        else releaseWakeLock();
      });
    }
    var jumpToday = document.getElementById('jumpToday');
    if (jumpToday) {
      jumpToday.addEventListener('click', function () {
        var today = localIsoDate();
        tripState.activeDate = today;
        uiFilters.dayId = today;
        persist();
        renderDayContent();
        renderLive();
      });
    }
  }

  function taskState(taskId) {
    var existing = tripState.tasks[taskId] || {};
    return {
      done: Boolean(existing.done),
      status: ['Not started', 'Need confirmation', 'Confirmed', 'Completed', 'Not applicable'].indexOf(existing.status) !== -1 ? existing.status : 'Not started',
      checkedAt: typeof existing.checkedAt === 'string' ? existing.checkedAt : '',
      confirmation: typeof existing.confirmation === 'string' ? existing.confirmation.slice(0, 120) : '',
      notes: typeof existing.notes === 'string' ? existing.notes.slice(0, 500) : ''
    };
  }

  function checklistProgress() {
    return checklistTasks.filter(function (item) { return taskState(item.id).done; }).length;
  }

  function overdueTaskCount() {
    var today = localIsoDate();
    return checklistTasks.filter(function (item) {
      var state = taskState(item.id);
      return item.dueDate && item.dueDate < today && !state.done && state.status !== 'Not applicable';
    }).length;
  }

  function updateChecklistBadge() {
    var tab = document.getElementById('tab-checklist');
    if (!tab) return;
    var overdue = overdueTaskCount();
    tab.innerHTML = 'Prep' + (overdue ? ' <span class="nav-badge" aria-label="' + overdue + ' overdue tasks">' + overdue + '</span>' : '');
  }

  function renderPackingSection() {
    var progress = packingProgress();
    return [
      '<details class="hotel-bookings packing-summary"><summary><strong>Packing checklist</strong> · ', progress.done, '/', progress.total, ' packed</summary><div class="packing-content">',
      '<div class="packing-grid">',
      packingGroups.map(function (group) {
        var groupDone = group.items.filter(function (item) { return packingState.items[packingItemId(group.name, item)]; }).length;
        return [
          '<article class="card packing-group"><h3>', escapeHtml(group.name), ' <span class="small muted">', groupDone, '/', group.items.length, '</span></h3>',
          '<ul class="packing-list">',
          group.items.map(function (item) {
            var id = packingItemId(group.name, item);
            var checked = Boolean(packingState.items[id]);
            return '<li><label class="packing-item' + (checked ? ' is-done' : '') + '"><input type="checkbox" data-packing-id="' + escapeHtml(id) + '"' + (checked ? ' checked' : '') + '> <span>' + escapeHtml(item) + '</span></label></li>';
          }).join(''),
          '</ul></article>'
        ].join('');
      }).join(''),
      '</div></div></details>'
    ].join('');
  }

  function renderBookedHotelSummary() {
    return [
      '<details class="hotel-bookings"><summary><strong>Booked hotels</strong> · 7/7 safe nights</summary><div class="hotel-list">',
      rawData.hotels.map(function (hotel) {
        return [
          '<article class="hotel-compact"><p class="route-label">', escapeHtml(hotel['Date label'] || hotel.Date || ''), ' · ', escapeHtml(hotel.Base || ''), '</p>',
          '<h3>', escapeHtml(hotel['Recommended hotel'] || ''), '</h3>',
          '<p class="hotel-times"><span><strong>In:</strong> ', escapeHtml(hotel['Check-in'] || 'Reconfirm'), '</span><span><strong>Out:</strong> ', escapeHtml(hotel['Check-out'] || 'Reconfirm'), '</span></p>',
          '<p><span class="tag category-ok">Booked · safe</span></p>',
          '<div class="action-bar">', externalLink(hotel['Map URL'], 'Directions', 'button primary'), '</div>',
          '<details class="task-details"><summary>Room & booking details</summary><div><p><strong>Room:</strong> ', escapeHtml(hotel.Room || '—'), '<br><strong>Guests:</strong> ', escapeHtml(hotel.Guests || '—'), '</p><p><strong>Address:</strong> ', escapeHtml(hotel.Address || '—'), '</p><p><strong>Cancellation:</strong> ', escapeHtml(hotel.Cancellation || 'Reconfirm directly.'), '</p><div class="action-bar">', externalLink(hotel['Address/source'], 'Official hotel', 'button subtle'), externalLink(hotel['Amenities/source'], 'Amenities', 'button subtle'), '</div></div></details>',
          '</article>'
        ].join('');
      }).join(''),
      '</div></details>'
    ].join('');
  }

  function taskBrief(description) {
    var text = String(description || '').trim();
    var end = text.search(/[.!?](?:\s|$)/);
    return end >= 0 ? text.slice(0, end + 1) : text;
  }

  function renderChecklistTask(item) {
    var state = taskState(item.id);
    var brief = taskBrief(item.description);
    return [
      '<article class="checklist-row ', state.done ? 'is-done' : '', item.priority === 'Critical' ? ' is-critical' : (item.priority === 'High' ? ' is-high' : ''), '">',
      '<input id="task-', escapeHtml(item.id), '" type="checkbox" data-task-id="', escapeHtml(item.id), '" data-task-field="done" ', state.done ? 'checked' : '', ' aria-label="Mark ', escapeHtml(item.title), ' complete">',
      '<div><h3>', escapeHtml(item.title), '</h3><p class="task-meta"><span class="tag">', escapeHtml(item.category), '</span>', item.priority === 'Critical' || item.priority === 'High' ? '<span class="tag category-alert">' + escapeHtml(item.priority) + '</span>' : '', item.dueDate ? '<span class="small"><strong>By ' + escapeHtml(item.dueDate) + '</strong></span>' : '', '</p>',
      brief ? '<p>' + escapeHtml(brief) + '</p>' : '', '</div>',
      '<details class="task-details"><summary>Details & notes</summary><div>', brief !== item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '', '<div class="action-bar">', externalLink(item.url, 'Source', 'button subtle'), '</div>',
      '<div class="checklist-fields"><label>Status<select data-task-id="', escapeHtml(item.id), '" data-task-field="status"><option', state.status === 'Not started' ? ' selected' : '', '>Not started</option><option', state.status === 'Need confirmation' ? ' selected' : '', '>Need confirmation</option><option', state.status === 'Confirmed' ? ' selected' : '', '>Confirmed</option><option', state.status === 'Completed' ? ' selected' : '', '>Completed</option><option', state.status === 'Not applicable' ? ' selected' : '', '>Not applicable</option></select></label>',
      '<label>Last checked<input type="date" value="', escapeHtml(state.checkedAt), '" data-task-id="', escapeHtml(item.id), '" data-task-field="checkedAt"></label>',
      '<label>Confirmation code<input maxlength="120" value="', escapeHtml(state.confirmation), '" data-task-id="', escapeHtml(item.id), '" data-task-field="confirmation"></label><label>Private notes<input maxlength="500" value="', escapeHtml(state.notes), '" data-task-id="', escapeHtml(item.id), '" data-task-field="notes"></label></div>',
      '</div></details></article>'
    ].join('');
  }

  function renderChecklist() {
    var section = document.getElementById('checklist');
    var done = checklistProgress();
    var priorityOrder = { Critical: 0, High: 1, Normal: 2 };
    var ordered = checklistTasks.slice().sort(function (a, b) {
      var doneDiff = Number(taskState(a.id).done) - Number(taskState(b.id).done);
      if (doneDiff) return doneDiff;
      var priorityDiff = (priorityOrder[a.priority] == null ? 3 : priorityOrder[a.priority]) - (priorityOrder[b.priority] == null ? 3 : priorityOrder[b.priority]);
      if (priorityDiff) return priorityDiff;
      return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
    });
    var pending = ordered.filter(function (item) { return !taskState(item.id).done; });
    var completed = ordered.filter(function (item) { return taskState(item.id).done; });
    section.innerHTML = [
      '<h2 id="checklist-heading" class="section-heading">Prep</h2>',
      '<p class="section-intro">Bookings, confirmations, and packing—unfinished items first.</p>',
      '<div class="checklist-toolbar"><strong>', done, '/', checklistTasks.length, ' tasks complete</strong><div class="progress-meter" aria-hidden="true"><span style="width:', (checklistTasks.length ? Math.round((done / checklistTasks.length) * 100) : 0), '%"></span></div></div>',
      '<input id="importProgressFile" type="file" accept="application/json" hidden>',
      '<div id="checklistStatus" class="status-line" role="status" aria-live="polite"></div>',
      renderBookedHotelSummary(),
      renderOfflineReadiness(),
      renderReservationCallList(),
      '<h3 style="margin:22px 0 10px">To do</h3>',
      pending.length ? pending.map(renderChecklistTask).join('') : '<div class="card ok"><strong>All preparation tasks are complete.</strong></div>',
      completed.length ? '<details class="completed-tasks hotel-bookings"><summary><strong>Completed</strong> · ' + completed.length + '</summary><div style="padding:0 12px 12px">' + completed.map(renderChecklistTask).join('') + '</div></details>' : '',
      renderPackingSection(),
      '<details class="prep-tools"><summary>Manage saved trip data</summary><div class="action-bar" style="padding:0 12px 12px"><button type="button" class="button subtle" id="exportRedacted">Export redacted</button><button type="button" class="button subtle" id="exportPrivate">Export private</button><button type="button" class="button subtle" id="importProgress">Import</button><button type="button" class="button danger" id="resetProgress">Reset</button></div></details>'
    ].join('');
    section.onchange = onChecklistChange;
    document.getElementById('exportRedacted').addEventListener('click', function () { exportProgress(true); });
    document.getElementById('exportPrivate').addEventListener('click', function () { exportProgress(false); });
    document.getElementById('importProgress').addEventListener('click', function () { document.getElementById('importProgressFile').click(); });
    document.getElementById('importProgressFile').addEventListener('change', importProgress);
    document.getElementById('resetProgress').addEventListener('click', resetProgress);
  }

  function onChecklistChange(event) {
    var target = event.target;
    if (target.dataset.offlineReady) {
      if (target.checked) tripState.offlineReadiness[target.dataset.offlineReady] = true;
      else delete tripState.offlineReadiness[target.dataset.offlineReady];
      persist();
      renderChecklist();
      renderLive();
      renderOffline();
      return;
    }
    if (target.dataset.packingId) {
      if (target.checked) packingState.items[target.dataset.packingId] = true;
      else delete packingState.items[target.dataset.packingId];
      persistPacking();
      renderChecklist();
      return;
    }
    if (!target.dataset.taskId) return;
    var id = target.dataset.taskId;
    var field = target.dataset.taskField;
    var current = taskState(id);
    current[field] = field === 'done' ? target.checked : String(target.value || '').slice(field === 'notes' ? 0 : 0, field === 'notes' ? 500 : 120);
    tripState.tasks[id] = current;
    persist();
    renderChecklist();
    updateChecklistBadge();
  }

  function serializableState(redacted) {
    var taskData = {};
    checklistTasks.forEach(function (item) {
      var current = taskState(item.id);
      taskData[item.id] = redacted ? { done: current.done, status: current.status, checkedAt: current.checkedAt } : current;
    });
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      redacted: Boolean(redacted),
      activeDate: tripState.activeDate,
      modes: tripState.modes,
      stops: tripState.stops,
      tasks: taskData,
      routeChoices: tripState.routeChoices,
      mealChoices: tripState.mealChoices,
      offlineReadiness: tripState.offlineReadiness,
      picks: pickState.items,
      packing: packingState.items,
      expenses: redacted ? undefined : { budget: expenseState.budget, items: expenseState.items }
    };
  }

  function applyImportedState(imported) {
    if (!imported || imported.version !== 2 || typeof imported !== 'object') throw new Error('Unsupported export');
    var validDays = new Set(operationalPlan.days.map(function (day) { return day.id; }));
    var validStops = new Set(operationalPlan.days.flatMap(function (day) { return day.stops.map(function (stop) { return stop.id; }); }));
    var validTasks = new Set(checklistTasks.map(function (item) { return item.id; }));
    if (validDays.has(imported.activeDate)) tripState.activeDate = imported.activeDate;
    if (imported.modes && typeof imported.modes === 'object') {
      Object.keys(imported.modes).forEach(function (key) {
        if (validDays.has(key) && ['preview', 'on-time', 'ahead30', 'ahead60', 'late30', 'late60'].indexOf(imported.modes[key]) !== -1) tripState.modes[key] = imported.modes[key];
      });
    }
    if (imported.stops && typeof imported.stops === 'object') {
      Object.keys(imported.stops).forEach(function (key) {
        if (validStops.has(key) && ['pending', 'done', 'skipped'].indexOf(imported.stops[key]) !== -1) tripState.stops[key] = imported.stops[key];
      });
    }
    if (imported.tasks && typeof imported.tasks === 'object') {
      Object.keys(imported.tasks).forEach(function (key) {
        if (!validTasks.has(key) || !imported.tasks[key] || typeof imported.tasks[key] !== 'object') return;
        var input = imported.tasks[key];
        tripState.tasks[key] = {
          done: Boolean(input.done),
          status: ['Not started', 'Need confirmation', 'Confirmed', 'Completed', 'Not applicable'].indexOf(input.status) !== -1 ? input.status : 'Not started',
          checkedAt: typeof input.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.checkedAt) ? input.checkedAt : '',
          confirmation: typeof input.confirmation === 'string' ? input.confirmation.slice(0, 120) : '',
          notes: typeof input.notes === 'string' ? input.notes.slice(0, 500) : ''
        };
      });
    }
    if (imported.routeChoices && typeof imported.routeChoices === 'object') {
      Object.keys(imported.routeChoices).forEach(function (key) {
        if (!validDays.has(key)) return;
        var plan = routeOptionsByDay[key];
        var allowed = ['dismissed'].concat(plan ? plan.options.map(routeOptionId) : []);
        if (allowed.indexOf(imported.routeChoices[key]) !== -1) tripState.routeChoices[key] = imported.routeChoices[key];
      });
    }
    if (imported.mealChoices && typeof imported.mealChoices === 'object') {
      Object.keys(imported.mealChoices).forEach(function (key) {
        if (validDays.has(key) && ['proper', 'quick'].indexOf(imported.mealChoices[key]) !== -1) tripState.mealChoices[key] = imported.mealChoices[key];
      });
    }
    if (imported.offlineReadiness && typeof imported.offlineReadiness === 'object') {
      var readinessIds = new Set(offlineReadinessItems.map(function (item) { return item.id; }));
      Object.keys(imported.offlineReadiness).forEach(function (key) {
        if (readinessIds.has(key) && imported.offlineReadiness[key]) tripState.offlineReadiness[key] = true;
      });
    }
    if (imported.picks && typeof imported.picks === 'object') {
      Object.keys(imported.picks).forEach(function (key) {
        if (['picked', 'removed'].indexOf(imported.picks[key]) !== -1) pickState.items[key] = imported.picks[key];
      });
    }
    if (imported.packing && typeof imported.packing === 'object') {
      var validPacking = new Set();
      packingGroups.forEach(function (group) {
        group.items.forEach(function (item) { validPacking.add(packingItemId(group.name, item)); });
      });
      Object.keys(imported.packing).forEach(function (key) {
        if (validPacking.has(key) && imported.packing[key]) packingState.items[key] = true;
      });
    }
    if (imported.expenses && typeof imported.expenses === 'object') {
      if (Number(imported.expenses.budget) > 0) expenseState.budget = Number(imported.expenses.budget);
      if (Array.isArray(imported.expenses.items)) {
        var known = new Set(expenseState.items.map(function (item) { return item.id; }));
        imported.expenses.items.forEach(function (item) {
          if (item && Number(item.amount) > 0 && !known.has(String(item.id))) expenseState.items.push(sanitizeExpense(item));
        });
      }
    }
    uiFilters.dayId = tripState.activeDate;
    persist();
    persistPicks();
    persistPacking();
    persistExpenses();
    renderDayContent();
    renderLive();
    renderChecklist();
    if (secondaryMounted.food) renderFoodContent();
    if (secondaryMounted.attractions) renderAttractionsContent();
  }

  function buildSyncCode() {
    var payload = JSON.stringify(serializableState(false));
    return 'PEITRIP2:' + btoa(unescape(encodeURIComponent(payload)));
  }

  function applySyncCode(code) {
    var raw = String(code || '').trim();
    if (raw.indexOf('PEITRIP2:') !== 0) throw new Error('Not a sync code');
    var json = decodeURIComponent(escape(atob(raw.slice('PEITRIP2:'.length))));
    applyImportedState(JSON.parse(json));
  }

  function downloadText(filename, content, type) {
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportProgress(redacted) {
    downloadText(redacted ? 'pei-road-trip-progress-redacted.json' : 'pei-road-trip-progress-private.json', JSON.stringify(serializableState(redacted), null, 2), 'application/json');
    setStatus(redacted ? 'Redacted progress exported.' : 'Private progress exported. Keep that file secure.');
  }

  function importProgress(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        applyImportedState(JSON.parse(String(reader.result || '')));
        setStatus('Progress imported and validated.');
      } catch (error) {
        setStatus('That file could not be imported. Use an export from this version of the itinerary.');
      }
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    if (!window.confirm('Reset all locally stored trip progress, notes, confirmation codes, packing, expenses, and food/attraction picks on this browser?')) return;
    tripState = emptyState();
    pickState = { version: 1, items: {} };
    packingState = { version: 1, items: {} };
    expenseState = { version: 1, budget: 0, items: [] };
    uiFilters.dayId = tripState.activeDate;
    persist();
    persistPicks();
    persistPacking();
    persistExpenses();
    renderDayContent();
    renderLive();
    renderChecklist();
    if (secondaryMounted.food) renderFoodContent();
    if (secondaryMounted.attractions) renderAttractionsContent();
    setStatus('Local trip progress was reset.');
  }

  function buildOfflineTextPack() {
    var lines = [
      'PEI FOODIE ROAD TRIP 2026 — OFFLINE ESSENTIALS',
      'Private family plan. Do not share real-time locations.',
      'Approximate route: ' + operationalPlan.roughTotalKm + ' km',
      ''
    ];
    operationalPlan.days.forEach(function (day) {
      lines.push(day.label + ' — ' + day.routeFocus);
      lines.push('Drive: ' + day.driveKm + ' km | ' + day.pureDriveTime);
      lines.push('Time zone: ' + day.timeZoneNote);
      lines.push('Fallback: ' + day.emergency);
      visibleStops(day).forEach(function (stop) {
        lines.push('• ' + stop.time + (stop.zone ? ' ' + stop.zone : '') + ' — ' + stop.title + (stop.address ? ' — ' + stop.address : ''));
      });
      lines.push('');
    });
    lines.push('OFFICIAL ROAD CHECKS');
    roadLinks.forEach(function (link) { lines.push('• ' + link.title + ': ' + link.url); });
    lines.push('');
    lines.push('Emergency: call 911 for emergencies. Maps, sources, restaurant pages, and live checks need connectivity.');
    return lines.join('\n');
  }

  // Full stop-by-stop reference, rendered from the same operationalPlan used
  // everywhere else, for a paper/PDF backup that needs no connection. Shown only
  // when printing (see #printableItinerary rules in index.html).
  function printStopAddress(stop) {
    if (stop.parkingAddress) return (stop.parkingName ? stop.parkingName + ' — ' : '') + stop.parkingAddress;
    return stop.address || '';
  }

  function buildPrintableItinerary() {
    var head = '<div class="pi-head"><h1>PEI Foodie Road Trip — Aug 14–21, 2026</h1>' +
      '<p class="pi-sub">Printable stop-by-stop reference · approx ' + escapeHtml(String(operationalPlan.roughTotalKm)) +
      ' km · works with no internet · printed ' + escapeHtml(new Date().toLocaleDateString('en-CA')) +
      '. Times are local (see each day’s time zone); confirm hours, tides, fuel and road conditions before you go.</p></div>';
    var days = operationalPlan.days.map(function (day) {
      var stops = day.stops.filter(function (stop) { return !stop.choiceGated; }).map(function (stop) {
        var addr = printStopAddress(stop);
        var note = (stop.notes || '').trim();
        if (note.length > 240) note = note.slice(0, 237).replace(/\s+\S*$/, '') + '…';
        var tag = stop.priority === 'optional'
          ? ' <span class="pi-opt">(optional)</span>'
          : (stop.conditional ? ' <span class="pi-opt">(only if confirmed)</span>' : '');
        return '<div class="pi-stop"><div class="pi-line"><span class="pi-time">' +
          escapeHtml(stop.time || '') + (stop.zone ? ' ' + escapeHtml(stop.zone) : '') + '</span> — <strong>' +
          escapeHtml(stop.title || stop.locationName || 'Stop') + '</strong>' + tag + '</div>' +
          (addr ? '<div class="pi-addr">' + escapeHtml(addr) + '</div>' : '') +
          (note ? '<div class="pi-note">' + escapeHtml(note) + '</div>' : '') + '</div>';
      }).join('');
      var meals = (day.meals || []).map(function (meal) {
        return escapeHtml(meal.meal) + ': ' + escapeHtml(meal.title);
      }).join(' · ');
      var routeOptions = (routeOptionsByDay[day.id] && routeOptionsByDay[day.id].options) || [];
      var ideas = routeOptions.map(function (option) { return escapeHtml(option.name); }).join('; ');
      var hotel = hotelShortNames[day.id] || '';
      return '<section class="pi-day"><h2>' + escapeHtml(day.label) + ' — ' + escapeHtml(day.routeFocus || '') + '</h2>' +
        '<p class="pi-meta">Drive ~' + escapeHtml(String(day.driveKm)) + ' km · ' +
        escapeHtml(day.pureDriveTime || '') + ' · ' + escapeHtml(day.timeZoneNote || '') + '</p>' +
        stops +
        (meals ? '<p class="pi-meals"><strong>Meals</strong> — ' + meals + '</p>' : '') +
        '<p class="pi-hotel"><strong>Tonight</strong> — ' + escapeHtml(hotel) + '</p>' +
        (ideas ? '<p class="pi-ideas"><strong>Optional ideas</strong> — ' + ideas + '</p>' : '') +
        '</section>';
    }).join('');
    var essentials = '<section class="pi-day"><h2>Safety &amp; essentials — carry this offline</h2>' +
      '<p class="pi-meta">Call 911 for emergencies (ON, QC, NB, PEI). Fuel: use 91 AKI — start full, then refuel by a quarter tank remaining, or sooner near 120–150 km range.</p>' +
      '<div class="pi-stop"><div class="pi-line"><strong>Emergency &amp; 24/7 lines</strong></div>' +
      emergencyContacts.slice(0, 8).map(function (contact) {
        return '<div class="pi-note">' + escapeHtml(contact.name) + ' — ' + escapeHtml(contact.phone) + '</div>';
      }).join('') + '</div>' +
      '<div class="pi-stop"><div class="pi-line"><strong>Hotel front desks</strong></div>' +
      emergencyContacts.slice(8).map(function (contact) {
        return '<div class="pi-note">' + escapeHtml(contact.name) + ' — ' + escapeHtml(contact.phone) + '</div>';
      }).join('') + '</div>' +
      '<div class="pi-stop"><div class="pi-line"><strong>Restaurant reservations</strong></div>' +
      reservationContacts.map(function (contact) {
        return '<div class="pi-note">' + escapeHtml(contact.name) + ' — ' + escapeHtml(contact.phone) + '</div>';
      }).join('') + '</div>' +
      '<div class="pi-stop"><div class="pi-line"><strong>Planned fuel stops (91 AKI)</strong></div>' +
      minimalFuelPlan.map(function (fuel) {
        return '<div class="pi-note">' + escapeHtml(fuel.dateLabel) + ' — ' + escapeHtml(fuel.stop) +
          (fuel.address ? ' · ' + escapeHtml(fuel.address) : '') + '</div>';
      }).join('') + '</div>' +
      '</section>';
    return head + days + essentials;
  }

  function printAllStops() {
    var host = document.getElementById('printableItinerary');
    if (host) host.innerHTML = buildPrintableItinerary();
    document.body.classList.add('print-all');
    var cleanup = function () {
      document.body.classList.remove('print-all');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // Must match the cache names in sw.js so the pre-fetched tiles/photos are the
  // same ones the service worker serves offline.
  var PHOTO_CACHE = 'pei-foodie-road-trip-photos-v1';
  var TILE_CACHE = 'pei-foodie-road-trip-tiles-v1';
  var TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  function allPhotoUrls() {
    return unique(foodSuggestionList().concat(attractionSuggestionList()).map(function (item) {
      return safeExternalUrl(item.photo);
    }));
  }

  function photoCachingSupported() {
    return 'caches' in window && location.protocol !== 'file:';
  }

  function tileUrl(z, x, y) {
    return TILE_TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  // The tiles to pre-fetch for the whole trip: a light regional overview across
  // the route corridor (zooms 6-8) plus a detail tile centred on each stop
  // (zooms 11-13). Deduplicated and capped so this stays a polite, one-time
  // download rather than a bulk area export.
  function offlineTileUrls() {
    var model = buildTripMapModel();
    var coords = model.locations.map(function (loc) { return loc.coords; }).filter(Boolean);
    if (!coords.length) return [];
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coords.forEach(function (c) {
      minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
      minLng = Math.min(minLng, c[1]); maxLng = Math.max(maxLng, c[1]);
    });
    var pad = 0.15;
    minLat -= pad; maxLat += pad; minLng -= pad; maxLng += pad;
    var seen = {};
    var urls = [];
    var CAP = 900;
    function add(z, x, y) {
      var key = z + '/' + x + '/' + y;
      if (seen[key] || urls.length >= CAP) return;
      seen[key] = true;
      urls.push(tileUrl(z, x, y));
    }
    [6, 7, 8].forEach(function (z) {
      var x0 = lonToTileX(minLng, z), x1 = lonToTileX(maxLng, z);
      var y0 = latToTileY(maxLat, z), y1 = latToTileY(minLat, z);
      for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
        for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) add(z, x, y);
      }
    });
    coords.forEach(function (c) {
      [11, 12, 13].forEach(function (z) { add(z, lonToTileX(c[1], z), latToTileY(c[0], z)); });
    });
    return urls;
  }

  // Fetch URLs into a named cache in small parallel batches (polite concurrency),
  // reporting progress. Opaque cross-origin responses are stored as-is.
  function fillCache(cacheName, urls, onProgress) {
    if (!urls.length) return Promise.resolve({ done: 0, failed: 0, total: 0 });
    return caches.open(cacheName).then(function (cache) {
      var done = 0, failed = 0, batch = 6;
      function run(start) {
        if (start >= urls.length) return Promise.resolve();
        return Promise.all(urls.slice(start, start + batch).map(function (url) {
          var request = new Request(url, { mode: 'no-cors' });
          return fetch(request).then(function (response) { return cache.put(request, response); })
            .then(function () { done += 1; }).catch(function () { failed += 1; })
            .then(function () { if (onProgress) onProgress(done + failed, urls.length); });
        })).then(function () { return run(start + batch); });
      }
      return run(0).then(function () { return { done: done, failed: failed, total: urls.length }; });
    });
  }

  function saveOfflineAssets() {
    var status = document.getElementById('offlineAssetsStatus');
    var button = document.getElementById('saveOfflineAssets');
    if (!photoCachingSupported()) {
      if (status) status.textContent = 'Offline saving needs the hosted site (it is unavailable when opened as a local file).';
      return;
    }
    var tiles = offlineTileUrls();
    var photos = allPhotoUrls();
    if (button) button.disabled = true;
    if (status) status.textContent = 'Saving route map… 0 / ' + tiles.length + ' tiles.';
    fillCache(TILE_CACHE, tiles, function (n, total) {
      if (status) status.textContent = 'Saving route map… ' + n + ' / ' + total + ' tiles.';
    }).then(function (tileResult) {
      if (status) status.textContent = 'Saving photos… 0 / ' + photos.length + '.';
      return fillCache(PHOTO_CACHE, photos, function (n, total) {
        if (status) status.textContent = 'Saving photos… ' + n + ' / ' + total + '.';
      }).then(function (photoResult) {
        var failed = tileResult.failed + photoResult.failed;
        if (status) status.textContent = 'Offline pack ready: ' + tileResult.done + ' map tiles and '
          + photoResult.done + ' photos saved' + (failed ? ' (' + failed + ' failed — retry on better Wi-Fi)' : '') + '.';
        setStatus('Offline map and photos saved for this trip.');
      });
    }).catch(function () {
      if (status) status.textContent = 'Offline save failed. Retry on a stable connection.';
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function clearOfflineAssets() {
    var status = document.getElementById('offlineAssetsStatus');
    Promise.all([caches.delete(TILE_CACHE), caches.delete(PHOTO_CACHE)]).then(function (results) {
      var removed = results.some(Boolean);
      if (status) status.textContent = removed ? 'Offline map and photos cleared.' : 'No offline pack to clear.';
    });
  }

  function renderOffline() {
    var section = document.getElementById('offline');
    var phoneLink = function (contact) {
      return '<li><a class="tel-link" href="tel:' + escapeHtml(contact.phone.replace(/[^\d+*]/g, '')) + '"><strong>' + escapeHtml(contact.name) + '</strong><span>' + escapeHtml(contact.phone) + ' · ' + escapeHtml(contact.detail) + '</span></a></li>';
    };
    var primaryContacts = [emergencyContacts[0], emergencyContacts[1], emergencyContacts[7]];
    var supportContacts = emergencyContacts.slice(2, 7);
    var hotelContacts = emergencyContacts.slice(8);
    section.innerHTML = [
      '<h2 id="offline-heading" class="section-heading">Safety</h2>',
      '<p class="section-intro">Emergency contacts, fuel rules, live checks, and offline tools.</p>',
      '<div class="note" id="networkNotice" role="status">', navigator.onLine ? 'Online · live links available' : 'Offline · use saved addresses and phone numbers', '</div>',
      renderOfflineReadiness(),
      '<article class="card" style="margin-top:12px"><h3>Call now</h3><ul class="offline-list emergency-list safety-contacts">', primaryContacts.map(phoneLink).join(''), '</ul></article>',
      '<details class="safety-details"><summary>Park, poison, and bridge numbers</summary><ul class="offline-list emergency-list" style="padding:0 12px 12px">', supportContacts.map(phoneLink).join(''), '</ul></details>',
      '<details class="safety-details"><summary>Hotel phone numbers · 7</summary><ul class="offline-list emergency-list" style="padding:0 12px 12px">', hotelContacts.map(phoneLink).join(''), '</ul></details>',
      '<div class="fuel-rule"><strong>Fuel:</strong> Use 91 AKI. Start full and refuel by 25% remaining—or sooner near 120–150 km displayed range.</div>',
      '<details class="safety-details"><summary>Planned fuel stops</summary><div class="hotel-list">', minimalFuelPlan.map(function (fuel) {
        return '<article class="hotel-compact"><p class="route-label">' + escapeHtml(fuel.dateLabel || '') + '</p><h3>' + escapeHtml(fuel.stop || 'Fuel decision') + '</h3><p>' + escapeHtml(fuel.action || '') + '</p><div class="action-bar">' + externalLink(fuel.mapUrl, 'Directions', 'button primary') + externalLink(fuel.sourceUrl, 'Station', 'button subtle') + '</div></article>';
      }).join(''), '</div></details>',
      '<details class="safety-details"><summary>Roads, weather, bridge & tides</summary><div class="reference-links">', roadLinks.concat(weatherLinks).map(function (link) { return '<a class="road-link" href="' + escapeHtml(safeExternalUrl(link.url)) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">' + escapeHtml(link.title) + '<span>' + escapeHtml(link.detail) + '</span></a>'; }).join(''), '</div><p class="small" style="padding:0 13px 13px"><strong>Stop rule:</strong> Severe-weather warnings cancel coastal walks; bridge advisories pause crossings; Hopewell staff control ocean-floor access.</p></details>',
      '<article class="card"><h3>Save for offline use</h3><p class="small">Download the page before leaving Wi-Fi. Live checks still need a connection.</p><div class="action-bar"><button type="button" class="button primary" id="downloadHtmlPack">Save offline copy</button><button type="button" class="button subtle" id="downloadTextPack">Emergency text</button><button type="button" class="button subtle" id="printTrip">Print all stops</button></div></article>',
      '<article class="card"><h3>Offline route map &amp; photos</h3><p class="small">Save the map tiles along the whole route plus the food and attraction photos so they show with no signal. Do this on Wi-Fi before you leave; it downloads once and updates as you browse the map online.</p><div class="action-bar"><button type="button" class="button primary" id="saveOfflineAssets">Save map + photos</button><button type="button" class="button subtle" id="clearOfflineAssets">Clear saved</button></div><p id="offlineAssetsStatus" class="small muted" role="status" aria-live="polite"></p></article>',
      '<details class="safety-details"><summary>Advanced · sync between phones</summary><div style="padding:0 13px 13px"><p class="small">Sync codes include private notes. Share only between your own phones.</p><div class="action-bar"><button type="button" class="button primary" id="copySyncCode">Copy sync code</button></div><label class="field-label" for="syncCodeInput">Paste code<textarea id="syncCodeInput" rows="3" placeholder="PEITRIP2:…"></textarea></label><div class="action-bar"><button type="button" class="button subtle" id="applySyncCode">Apply code</button></div><div id="syncStatus" class="status-line" role="status" aria-live="polite"></div></div></details>',
      '<p class="compact-privacy">Private plan · progress is saved on this device.</p>'
    ].join('');
    section.querySelectorAll('[data-offline-ready]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) tripState.offlineReadiness[input.dataset.offlineReady] = true;
        else delete tripState.offlineReadiness[input.dataset.offlineReady];
        persist();
        renderLive();
        renderChecklist();
        renderOffline();
      });
    });
    var saveAssetsButton = document.getElementById('saveOfflineAssets');
    if (saveAssetsButton) saveAssetsButton.addEventListener('click', saveOfflineAssets);
    var clearAssetsButton = document.getElementById('clearOfflineAssets');
    if (clearAssetsButton) clearAssetsButton.addEventListener('click', clearOfflineAssets);
    document.getElementById('printTrip').addEventListener('click', printAllStops);
    document.getElementById('downloadTextPack').addEventListener('click', function () {
      downloadText('pei-foodie-road-trip-offline-essentials.txt', buildOfflineTextPack());
      setStatus('Offline emergency text pack downloaded.');
    });
    document.getElementById('downloadHtmlPack').addEventListener('click', function () {
      fetch('./app.js').then(function (response) {
        if (!response.ok) throw new Error('Renderer unavailable');
        return response.text();
      }).then(function (source) {
        var packed = '<!doctype html>\n' + document.documentElement.outerHTML;
        packed = packed.replace(/<script id="trip-control-script" src="app\.js"><\/script>/i, '<script id="trip-control-script">' + source.replace(/<\/script>/gi, '<\\/script>') + '<\/script>');
        downloadText('pei-foodie-road-trip-offline-copy.html', packed, 'text/html;charset=utf-8');
        setStatus('Self-contained offline copy downloaded. Live external links still need a connection.');
      }).catch(function () {
        setStatus('The offline copy could not be assembled. Use Print / PDF and download the emergency text pack instead.');
      });
    });
    document.getElementById('copySyncCode').addEventListener('click', function () {
      copyText(buildSyncCode()).then(function () {
        document.getElementById('syncStatus').textContent = 'Sync code copied. Paste it into the same box on the other phone.';
      });
    });
    document.getElementById('applySyncCode').addEventListener('click', function () {
      var field = document.getElementById('syncCodeInput');
      try {
        applySyncCode(field.value);
        setStatus('Sync code applied.');
        var syncStatus = document.getElementById('syncStatus');
        if (syncStatus) syncStatus.textContent = 'Sync applied — picks, checklist, packing, and expenses are now on this phone.';
        if (field) field.value = '';
      } catch (error) {
        document.getElementById('syncStatus').textContent = 'That code could not be applied. Copy a fresh sync code from the other phone and paste the whole thing.';
      }
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    return new Promise(function (resolve) {
      var area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (error) {}
      area.remove();
      resolve();
    });
  }

  function registerOfflineSupport() {
    function refreshNetworkNotice() {
      var notice = document.getElementById('networkNotice');
      if (notice) notice.textContent = navigator.onLine ? 'Online right now. External links and live checks can open.' : 'Offline right now — use the saved itinerary and addresses, then reconnect for external links.';
    }
    window.addEventListener('online', refreshNetworkNotice);
    window.addEventListener('offline', refreshNetworkNotice);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').then(function () {
        setStatus('Offline cache support is ready for this hosted copy.');
      }).catch(function () {
        setStatus('This copy still works offline as a downloaded file; hosted cache registration was unavailable.');
      });
    }
  }

  var THEME_KEY = 'pei-foodie-road-trip/theme';

  function storedTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      return ['light', 'dark', 'auto'].indexOf(value) !== -1 ? value : 'auto';
    } catch (error) {
      return 'auto';
    }
  }

  function applyTheme(pref) {
    var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // Keep native UI chrome (scrollbars, <select> option popups, date pickers,
    // form-control defaults) matched to the chosen theme, not just the OS.
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#12171d' : '#0f5b63';
    var toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.textContent = pref === 'auto' ? '◐ Auto' : dark ? '🌙 Dark' : '☀️ Light';
      toggle.setAttribute('aria-label', 'Colour theme: ' + pref + '. Tap to switch.');
    }
  }

  function cycleTheme() {
    var next = { auto: 'dark', dark: 'light', light: 'auto' }[storedTheme()] || 'auto';
    try { localStorage.setItem(THEME_KEY, next); } catch (error) {}
    applyTheme(next);
    setStatus('Theme set to ' + next + '.');
  }

  function initTheme() {
    applyTheme(storedTheme());
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (storedTheme() === 'auto') applyTheme('auto'); };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }
  }

  function boot() {
    var main = document.getElementById('main-content');
    appStatus = document.createElement('div');
    appStatus.className = 'sr-only';
    appStatus.setAttribute('role', 'status');
    appStatus.setAttribute('aria-live', 'polite');
    main.prepend(appStatus);
    mountToast();
    buildNavigation();
    initTheme();
    mountDaySection();
    renderLive();
    renderChecklist();
    renderOffline();
    updateChecklistBadge();
    var initialSection = validSectionId(location.hash) || 'live';
    activateSection(initialSection, false, true);
    try { history.replaceState({ section: initialSection }, '', '#' + initialSection); } catch (error) {}
    window.addEventListener('popstate', function (event) {
      var id = (event.state && event.state.section) || validSectionId(location.hash) || 'live';
      if (validSectionId(id)) activateSection(id, false, true);
    });
    registerOfflineSupport();
    if (planValidationErrors.length) setStatus('The operational plan has ' + planValidationErrors.length + ' validation warning' + (planValidationErrors.length === 1 ? '' : 's') + '. Review the sources section before travel.');
    window.__tripControlBooted = true;
  }

  boot();
}());
