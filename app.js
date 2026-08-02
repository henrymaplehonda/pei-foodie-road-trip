(function () {
  'use strict';

  var STORE_KEY = 'pei-foodie-road-trip/state/v3';
  var LEGACY_STORE_KEY = 'pei-foodie-road-trip/state/v2';
  var BOOKED_HOTEL_STOP_IDS = new Set(['d1-hotel', 'd2-hotel', 'd3-hotel', 'd4-hotel', 'd5-hotel', 'd6-hotel', 'd7-hotel']);
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

  // A switch rather than a lookup object: escapeHtml runs over every field of
  // every card on every render and the callback fires once per escaped
  // character, so this avoids allocating a map each time. It also keeps the
  // helper self-contained, which is how test/unit.js evaluates it.
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (match) {
      switch (match) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
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

  var STOP_COORDS = TripData.STOP_COORDS;

  var STOP_RATINGS = TripData.STOP_RATINGS;

  // Plan B alternates and their map coordinates are needed by the effective-
  // route resolver (next-stop swaps), so they are read here with the other
  // TripData tables rather than down in the Plan B section.
  var planBData = TripData.planBData;
  var PLAN_B_IDEA_COORDS = TripData.PLAN_B_IDEA_COORDS;

  // Every stop has the same shape whether it was hand-written, lifted from a row
  // of the source itinerary, or built from a foodie record. The shape lives here
  // once, as field -> value used when neither the caller nor the source record
  // supplies one, so the three builders below differ only in where they read
  // from — not in which fields they remember to set.
  var STOP_DEFAULTS = {
    time: 'Flexible', zone: '', title: 'Trip stop', locationName: '', kind: 'Stop',
    priority: 'required', skipAt: 0, saves: '', address: '', parkingName: '',
    parkingAddress: '', city: '', leg: '', timeBudget: '', notes: '', food: '',
    kidPlan: '', mapUrl: '', sourceUrl: '', reservation: ''
  };

  // Fields the stop search boxes match on. Joined and normalized once per stop
  // in buildStop rather than on every keystroke in each filter.
  var STOP_SEARCH_FIELDS = ['title', 'locationName', 'parkingName', 'parkingAddress',
    'kind', 'address', 'city', 'notes', 'food', 'kidPlan'];

  // Merge a caller's patch over an optional source record (already mapped onto
  // stop field names by its builder) into the one stop shape.
  function buildStop(details, source) {
    source = source || {};
    var stop = {};
    Object.keys(STOP_DEFAULTS).forEach(function (field) {
      stop[field] = details[field] || source[field] || STOP_DEFAULTS[field];
    });
    stop.dayId = details.dayId;
    stop.id = details.id || slug(details.dayId + '-' + stop.title);
    stop.locationName = details.locationName || details.title || source.locationName || stop.title;
    stop.skipAt = Number(details.skipAt || 0);
    stop.mapUrl = stop.mapUrl || mapSearchUrl(stop.address);
    stop.arrival = details.arrival || source.arrival || null;
    stop.parkingEntrance = details.parkingEntrance || null;
    stop.ticket = details.ticket || null;
    stop.attractionQuality = details.attractionQuality || attractionQualityForStop(stop.kind, stop.title);
    stop.conditional = Boolean(details.conditional);
    stop.choiceGated = Boolean(details.choiceGated);
    stop.replaceable = Boolean(details.replaceable);
    stop.routeEligible = details.routeEligible !== false;
    stop.coords = details.coords || STOP_COORDS[stop.id] || null;
    stop.rating = details.rating || STOP_RATINGS[stop.id] || null;
    stop.searchText = normalize(STOP_SEARCH_FIELDS.map(function (field) { return stop[field]; }).join(' '));
    return stop;
  }

  function customStop(details) {
    return buildStop(details, null);
  }

  // The source itinerary rows carry human column headings; translate them onto
  // stop field names once, here, rather than at every use site.
  function sourceRowFields(row) {
    return {
      time: row.Time,
      title: row['Stop / Segment'],
      locationName: row['Stop / Segment'],
      kind: row.Type,
      priority: normalize(row.Type).indexOf('optional') !== -1 ? 'optional' : 'required',
      address: row.Address,
      city: row['City / Province'],
      leg: row['Drive from previous'],
      timeBudget: row['Time budget'],
      notes: row.Notes,
      food: row['Food / Washroom'],
      kidPlan: row['Kid plan'],
      mapUrl: row['Map URL'],
      sourceUrl: row['Source URL']
    };
  }

  function foodRowFields(food) {
    return {
      title: food.name,
      locationName: food.name,
      kind: food.meal || 'Meal',
      address: food.address,
      city: food.city,
      notes: food.why,
      food: food.order,
      mapUrl: food.mapUrl,
      sourceUrl: food.source,
      reservation: food.reserve
    };
  }

  function findSourceRow(dayId, stopId) {
    var day = sourceDay(dayId);
    return (day && day.stops.find(function (stop) { return stop.id === stopId; })) || null;
  }

  function findFoodRecord(dayId, foodId) {
    return rawData.foodies.find(function (food) {
      return food.date === dayId && food.id === foodId;
    }) || null;
  }

  // A stop the plan takes from the source itinerary. `patch` overrides anything
  // the source row already says.
  function sourceStop(dayId, stopId, patch) {
    patch = patch || {};
    patch.dayId = dayId;
    var row = findSourceRow(dayId, stopId);
    if (!row) {
      buildErrors.push('Missing source stop "' + stopId + '" on ' + dayId);
      return buildStop({
        id: patch.id || slug(dayId + '-' + stopId),
        dayId: dayId,
        title: patch.title || stopId,
        time: patch.time || 'Verify',
        kind: patch.kind || 'Stop',
        notes: patch.notes || 'Source stop needs review.'
      }, null);
    }
    return buildStop(patch, sourceRowFields(row));
  }

  function foodStop(dayId, foodId, patch) {
    patch = patch || {};
    patch.dayId = dayId;
    var food = findFoodRecord(dayId, foodId);
    if (!food) {
      buildErrors.push('Missing foodie record "' + foodId + '" on ' + dayId);
      return buildStop({
        id: patch.id || slug(dayId + '-' + foodId),
        dayId: dayId,
        title: patch.title || foodId,
        time: patch.time || 'Verify',
        kind: patch.kind || 'Meal'
      }, null);
    }
    return buildStop(patch, foodRowFields(food));
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

  var ticketGuidance = TripData.ticketGuidance({ mapSearchUrl: mapSearchUrl });

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

  function renderParkingEntrance(entrance, includeNote) {
    if (!entrance) return '';
    return [
      '<div class="parking-entrance">',
      '<h4>Underground parking entrance</h4>',
      includeNote !== false && entrance.note ? '<p class="small">' + escapeHtml(entrance.note) + '</p>' : '',
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

  var operationalPlan = TripData.operationalPlan({
    customStop: customStop, sourceStop: sourceStop, foodStop: foodStop,
    makeDay: makeDay, mealSlot: mealSlot, mapSearchUrl: mapSearchUrl,
    streetViewUrl: streetViewUrl, satelliteUrl: satelliteUrl,
    ticketGuidance: ticketGuidance, attractionQualityByKey: attractionQualityByKey
  });

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

  var mealContracts = TripData.mealContracts({ mapSearchUrl: mapSearchUrl });

  var mealFlexByDay = TripData.mealFlexByDay({ mapSearchUrl: mapSearchUrl });

  var routeOptionsByDay = TripData.routeOptionsByDay({ mapSearchUrl: mapSearchUrl });

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

  var stopPractical = TripData.stopPractical({ mapSearchUrl: mapSearchUrl });

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
      var adds = options.filter(function (option) { return optionCostMinutes(option) <= ahead; }).slice(0, 1);
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

  var minimalFuelPlan = TripData.minimalFuelPlan({ mapSearchUrl: mapSearchUrl });

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
    return dates.find(function (date) { return date >= today; }) || dates[dates.length - 1];
  }

  function emptyState() {
    return { version: 3, activeDate: defaultDate(), modes: {}, stops: {}, tasks: {}, routeChoices: {}, mealChoices: {}, stopSwaps: {}, calmByDay: {}, offlineReadiness: {}, offlineMode: false };
  }

  function readState() {
    try {
      var currentRaw = localStorage.getItem(STORE_KEY);
      var legacyRaw = localStorage.getItem(LEGACY_STORE_KEY);
      var parsed = JSON.parse(currentRaw || legacyRaw || 'null');
      if (!parsed || [2, 3].indexOf(parsed.version) === -1) return emptyState();
      var base = emptyState();
      base.activeDate = operationalPlan.days.some(function (day) { return day.id === parsed.activeDate; }) ? parsed.activeDate : base.activeDate;
      base.modes = parsed.modes && typeof parsed.modes === 'object' ? parsed.modes : {};
      base.stops = parsed.stops && typeof parsed.stops === 'object' ? parsed.stops : {};
      base.tasks = parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {};
      base.routeChoices = parsed.routeChoices && typeof parsed.routeChoices === 'object' ? parsed.routeChoices : {};
      base.mealChoices = parsed.mealChoices && typeof parsed.mealChoices === 'object' ? parsed.mealChoices : {};
      base.stopSwaps = parsed.stopSwaps && typeof parsed.stopSwaps === 'object' ? parsed.stopSwaps : {};
      base.calmByDay = parsed.calmByDay && typeof parsed.calmByDay === 'object' ? parsed.calmByDay : {};
      base.offlineReadiness = parsed.offlineReadiness && typeof parsed.offlineReadiness === 'object' ? parsed.offlineReadiness : {};
      base.offlineMode = Boolean(parsed.offlineMode);
      operationalPlan.days.forEach(function (day) {
        day.stops.forEach(function (stop) {
          if (isHotelStop(stop) && base.stops[stop.id] === 'skipped') delete base.stops[stop.id];
          if (isHotelStop(stop)) delete base.stopSwaps[stop.id];
        });
      });
      if (!currentRaw && legacyRaw) {
        localStorage.setItem(STORE_KEY, JSON.stringify(base));
        localStorage.removeItem(LEGACY_STORE_KEY);
      }
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
      localStorage.removeItem(LEGACY_STORE_KEY);
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

  function persistSilently() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(tripState));
      localStorage.removeItem(LEGACY_STORE_KEY);
    } catch (error) {}
  }

  var CALM_BANK_BASE = {
    '2026-08-14': 45, '2026-08-15': 50, '2026-08-16': 25, '2026-08-17': 45,
    '2026-08-18': 60, '2026-08-19': 35, '2026-08-20': 30, '2026-08-21': 25
  };

  function durationRange(value) {
    var text = String(value || '').replace(/[\u2013\u2014]/g, '-');
    var minuteRange = /(\d{1,3})\s*-\s*(\d{1,3})\s*min/i.exec(text);
    if (minuteRange) return { min: Number(minuteRange[1]), max: Number(minuteRange[2]) };
    var hourRange = /(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2}))?\s*-\s*(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2}))?/i.exec(text);
    if (hourRange) {
      return {
        min: Math.round(Number(hourRange[1]) * 60 + Number(hourRange[2] || 0)),
        max: Math.round(Number(hourRange[3]) * 60 + Number(hourRange[4] || 0))
      };
    }
    var singleHour = /(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2}))?/i.exec(text);
    if (singleHour) {
      var hourMinutes = Math.round(Number(singleHour[1]) * 60 + Number(singleHour[2] || 0));
      return { min: hourMinutes, max: hourMinutes };
    }
    var singleMinute = /(\d{1,3})\s*min/i.exec(text);
    if (singleMinute) return { min: Number(singleMinute[1]), max: Number(singleMinute[1]) };
    return { min: 0, max: 0 };
  }

  function optionCostMinutes(option) {
    if (option && option.timing && Number(option.timing.totalImpactMin) >= 0) return Number(option.timing.totalImpactMin);
    var visit = durationRange(option && option.visit);
    var detour = durationRange(option && option.routeImpact);
    return Math.max(0, visit.max + detour.max);
  }

  function mealSavedMinutes(option) {
    if (option && option.timing && Number(option.timing.savedMin) >= 0) return Number(option.timing.savedMin);
    return durationRange(option && option.saved).min;
  }

  function calmDayState(day) {
    var input = tripState.calmByDay && tripState.calmByDay[day.id];
    input = input && typeof input === 'object' ? input : {};
    var allowedPhases = ['ready', 'driving', 'arriving', 'at-stop', 'waiting'];
    return {
      phase: allowedPhases.indexOf(input.phase) !== -1 ? input.phase : 'ready',
      stopId: typeof input.stopId === 'string' ? input.stopId : '',
      legStartedAt: typeof input.legStartedAt === 'string' ? input.legStartedAt : '',
      arrivedAt: typeof input.arrivedAt === 'string' ? input.arrivedAt : '',
      beadIndex: Math.max(0, Math.min(3, Number(input.beadIndex) || 0)),
      kidView: Boolean(input.kidView),
      pulseNeed: ['late', 'hungry', 'tired', 'rain', 'washroom'].indexOf(input.pulseNeed) !== -1 ? input.pulseNeed : '',
      pulseApplied: Boolean(input.pulseApplied),
      protectRecovery: Boolean(input.protectRecovery),
      rescueStopId: typeof input.rescueStopId === 'string' ? input.rescueStopId : '',
      waitStopId: typeof input.waitStopId === 'string' ? input.waitStopId : '',
      waitMinutes: [0, 15, 30, 45, 60].indexOf(Number(input.waitMinutes)) !== -1 ? Number(input.waitMinutes) : 0,
      waitAction: ['stay', 'quick'].indexOf(input.waitAction) !== -1 ? input.waitAction : '',
      mealExperience: Boolean(input.mealExperience)
    };
  }

  function saveCalmDayState(day, patch) {
    var next = calmDayState(day);
    Object.keys(patch || {}).forEach(function (key) { next[key] = patch[key]; });
    tripState.calmByDay[day.id] = next;
    persist();
    return next;
  }

  function selectedMealFlex(day) {
    var plan = mealFlexByDay[day.id];
    return plan && plan.options && plan.options[0] || null;
  }

  function sameRouteAsQuickMeal(day, routeChoice, mealOption) {
    if (!routeChoice || !mealOption || tripState.mealChoices[day.id] !== 'quick') return false;
    var routeName = normalize(routeChoice.name);
    var mealName = normalize(mealOption.foodName);
    return Boolean(routeName && mealName && (routeName.indexOf(mealName) !== -1 || mealName.indexOf(routeName) !== -1));
  }

  function makeQuickMealStop(day, option) {
    var effect = option.effect || {};
    var replacedId = (effect.replaceStopIds || [])[0];
    var source = stopById(day, replacedId);
    var stop = buildStop({
      id: 'meal-quick-' + day.id,
      dayId: day.id,
      time: option.foodTime || (source ? source.time : 'Flexible'),
      zone: source ? source.zone : '',
      title: 'Quick ' + String(option.meal || 'meal').replace(/ shortcut/i, '').toLowerCase() + ': ' + option.foodName,
      locationName: option.foodName,
      kind: source ? source.kind : 'Quick meal',
      priority: 'required',
      routeEligible: source ? source.routeEligible : true,
      address: option.foodAddress,
      city: option.foodCity || (source ? source.city : ''),
      leg: option.foodLeg || (source ? source.leg : ''),
      timeBudget: option.window,
      notes: option.order + ' ' + (option.saved || ''),
      food: option.order,
      kidPlan: 'Keep the stop simple, use the washroom, and bank the saved time unless everyone wants the paired experience.',
      mapUrl: option.foodMap,
      sourceUrl: option.foodSource
    }, source);
    stop.selectedFlex = true;
    stop.flexSource = 'meal';
    stop.replacesStopId = replacedId;
    return stop;
  }

  function makeRouteChoiceStop(day, option) {
    var stop = buildStop({
      id: 'route-flex-' + day.id + '-' + routeOptionId(option),
      dayId: day.id,
      time: 'Flexible choice',
      title: option.name,
      locationName: option.name,
      kind: 'Chosen flexible stop',
      priority: 'optional',
      address: option.parking,
      parkingName: option.parking,
      parkingAddress: option.parking,
      city: '',
      leg: option.routePoint,
      timeBudget: option.visit,
      notes: option.why + ' Go only if: ' + option.gate,
      food: 'Keep the planned meals and hotel arrival protected.',
      kidPlan: option.why,
      mapUrl: option.map,
      sourceUrl: option.source,
      coords: option.coords
    }, null);
    stop.selectedFlex = true;
    stop.flexSource = 'route';
    return stop;
  }

  // ----- Next-stop swaps -----------------------------------------------------
  // A stop can be swapped in place for a rated Plan B alternate (used by the
  // Today view's next-stop chooser, food swaps limited to well-rated venues).
  // The swap keeps the slot's id, clock time, and priority, so progress
  // tracking, meal rules, and every stop after it stay aligned; only the venue
  // — and its rating, arrival target, and links — changes.
  function planBRowsForDay(dayId) {
    return ((planBData && planBData.stops) || []).filter(function (row) { return row.date === dayId; });
  }

  function planBRowById(dayId, rowId) {
    if (!rowId) return null;
    return planBRowsForDay(dayId).find(function (row) { return slug(row.name) === rowId; }) || null;
  }

  // The routable place text from a curated Google Maps search link. Plan B's
  // "parking" field is advisory prose, not an address, so the swap stop routes
  // to the link's own "query=" place instead.
  function mapsQueryText(url) {
    var match = /[?&]query=([^&]+)/.exec(String(url || ''));
    if (!match) return '';
    try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (error) { return ''; }
  }

  function makeSwapStop(day, stop, row) {
    var swapped = buildStop({
      id: stop.id,
      dayId: day.id,
      time: stop.time,
      zone: stop.zone,
      title: row.name,
      locationName: row.name,
      kind: stop.kind,
      priority: stop.priority,
      routeEligible: stop.routeEligible,
      address: mapsQueryText(row.mapsUrl) || row.name,
      city: stop.city,
      leg: stop.leg,
      timeBudget: row.duration || stop.timeBudget,
      notes: [row.why, row.useIf ? 'Use if: ' + row.useIf : '', row.skipIf ? 'Skip if: ' + row.skipIf : '', row.parking ? 'Parking: ' + row.parking : ''].filter(Boolean).join(' '),
      food: row.foodPlan || stop.food,
      kidPlan: stop.kidPlan,
      mapUrl: row.mapsUrl,
      sourceUrl: row.taUrl
    }, null);
    // Same-id fallbacks in buildStop would keep the replaced venue's pin and
    // review score; the swap must carry its own (or none, never the old one).
    swapped.coords = PLAN_B_IDEA_COORDS[row.name] || null;
    swapped.rating = row.rating ? { source: 'TripAdvisor', rating: row.rating, reviews: row.reviews, url: row.taUrl } : null;
    swapped.selectedFlex = true;
    swapped.flexSource = 'swap';
    swapped.swapOfTitle = stop.title;
    return swapped;
  }

  function makeMealExperienceStop(day, option) {
    var experienceEffect = option.experienceEffect || {};
    var impact = Math.max(0, Number(experienceEffect.totalImpactMin) || 0);
    var stop = buildStop({
      id: 'meal-experience-' + day.id,
      dayId: day.id,
      time: 'Flexible with saved meal time',
      title: option.experience,
      locationName: option.experience,
      kind: 'Chosen saved-time experience',
      priority: 'optional',
      address: option.parking,
      parkingName: option.parking,
      parkingAddress: option.parking,
      timeBudget: impact ? impact + ' min' : 'Short reset',
      notes: option.experienceDetail,
      food: 'Meal handled by ' + option.foodName + '.',
      kidPlan: option.experienceDetail,
      mapUrl: option.experienceMap,
      sourceUrl: option.experienceSource
    }, null);
    stop.selectedFlex = true;
    stop.flexSource = 'meal-experience';
    return stop;
  }

  function applyMealExperience(stops, day, option) {
    var effect = option.experienceEffect || {};
    var targetId = effect.activateStopId || effect.mergeWithStopId || '';
    var targetIndex = targetId ? stops.findIndex(function (stop) { return stop.id === targetId; }) : -1;
    if (targetIndex !== -1 && effect.mergeWithStopId) {
      // A paired on-site experience may share a booked hotel checkpoint, but it
      // never changes that checkpoint's identity, priority, or route behavior.
      stops[targetIndex] = Object.assign({}, stops[targetIndex], {
        pairedExperience: true,
        notes: [stops[targetIndex].notes, option.experienceDetail].filter(Boolean).join(' ')
      });
      return stops;
    }
    if (targetIndex !== -1 && effect.activateStopId) {
      stops[targetIndex] = Object.assign({}, stops[targetIndex], {
        choiceGated: false,
        conditional: false,
        routeEligible: effect.routeEligible !== false,
        selectedFlex: true,
        flexSource: 'meal-experience',
        notes: [stops[targetIndex].notes, option.experienceDetail].filter(Boolean).join(' ')
      });
      return stops;
    }
    return applyStopEffect(stops, makeMealExperienceStop(day, option), {
      insertAfterStopId: effect.insertAfterStopId || 'meal-quick-' + day.id,
      insertBeforeStopId: effect.insertBeforeStopId || '',
      replaceStopIds: []
    });
  }

  function applyStopEffect(stops, stop, effect) {
    var replaceIds = ((effect && effect.replaceStopIds) || []).filter(function (id) {
      var target = stops.find(function (item) { return item.id === id; });
      var mealReplacement = stop && stop.flexSource === 'meal';
      return !target || (!isHotelStop(target) && (mealReplacement || target.priority !== 'required' || target.replaceable));
    });
    var originalIndex = -1;
    replaceIds.forEach(function (id) {
      var index = stops.findIndex(function (item) { return item.id === id; });
      if (index !== -1 && (originalIndex === -1 || index < originalIndex)) originalIndex = index;
    });
    var remaining = stops.filter(function (item) { return replaceIds.indexOf(item.id) === -1; });
    var insertAt = -1;
    var anchorIndex = function (id) {
      return remaining.findIndex(function (item) { return item.id === id || item.replacesStopId === id; });
    };
    if (effect && effect.insertBeforeStopId) insertAt = anchorIndex(effect.insertBeforeStopId);
    if (effect && effect.insertAfterStopId) {
      var afterIndex = anchorIndex(effect.insertAfterStopId);
      if (afterIndex !== -1) insertAt = afterIndex + 1;
    }
    if (insertAt === -1 && originalIndex !== -1) insertAt = Math.min(originalIndex, remaining.length);
    if (insertAt === -1) insertAt = Math.max(0, remaining.length - 1);
    remaining.splice(insertAt, 0, stop);
    return remaining;
  }

  function effectiveStops(day) {
    var stops = day.stops.map(function (stop) {
      var row = !isHotelStop(stop) && tripState.stopSwaps ? planBRowById(day.id, tripState.stopSwaps[stop.id]) : null;
      return row ? makeSwapStop(day, stop, row) : Object.assign({}, stop);
    });
    var calm = calmDayState(day);
    var mealOption = selectedMealFlex(day);
    if (tripState.mealChoices[day.id] === 'quick' && mealOption) {
      stops = applyStopEffect(stops, makeQuickMealStop(day, mealOption), mealOption.effect || {});
    }
    var routePlan = routeOptionsByDay[day.id];
    var routeChoice = selectedRouteOption(day);
    var sameAsQuickMeal = sameRouteAsQuickMeal(day, routeChoice, mealOption);
    if (routePlan && routeChoice && !sameAsQuickMeal && !calm.protectRecovery) {
      stops = applyStopEffect(stops, makeRouteChoiceStop(day, routeChoice), routeChoice.effect || {});
    }
    if (calm.mealExperience && mealOption && tripState.mealChoices[day.id] === 'quick' && !calm.protectRecovery) {
      stops = applyMealExperience(stops, day, mealOption);
    }
    // Rain on the PEI day activates the curated indoor branch and replaces the
    // beach. Other rain/tired recoveries remove only pending optional stops;
    // booked hotels and all required anchors are never eligible.
    if (calm.pulseApplied && calm.pulseNeed === 'rain' && day.id === '2026-08-18') {
      var rainStop = stopById(day, 'd5-rain');
      if (rainStop) {
        rainStop = Object.assign({}, rainStop, { choiceGated: false, selectedFlex: true, flexSource: 'rescue' });
        stops = applyStopEffect(stops, rainStop, { insertBeforeStopId: 'd5-hotel', replaceStopIds: ['d5-beach', 'd5-rain'] });
      }
    }
    if (calm.pulseApplied && calm.pulseNeed === 'washroom' && calm.rescueStopId) {
      var resetIndex = stops.findIndex(function (stop) { return stop.id === calm.rescueStopId; });
      if (resetIndex !== -1 && !isHotelStop(stops[resetIndex])) {
        var reset = Object.assign({}, stops[resetIndex], { id: 'rescue-' + stops[resetIndex].id, title: 'Reset now: ' + stops[resetIndex].title, selectedFlex: true, flexSource: 'rescue' });
        reset.replacesStopId = stops[resetIndex].id;
        stops.splice(resetIndex, 1);
        var firstPendingIndex = stops.findIndex(function (stop) { return stopStatus(stop.id) === 'pending' && !stop.choiceGated; });
        stops.splice(firstPendingIndex === -1 ? stops.length : firstPendingIndex, 0, reset);
      }
    }
    if (calm.protectRecovery) {
      stops = stops.filter(function (stop) {
        return !(stop.priority === 'optional' && stopStatus(stop.id) === 'pending' && stop.flexSource !== 'rescue');
      });
    }
    return stops.map(function (stop, index) { stop.order = index + 1; return stop; });
  }

  function calmBank(day) {
    var base = CALM_BANK_BASE[day.id] || 30;
    var delta = aheadMinutes(day) - modeMinutes(day);
    var calm = calmDayState(day);
    var routeChoice = selectedRouteOption(day);
    var mealOption = selectedMealFlex(day);
    if (routeChoice && !calm.protectRecovery && !sameRouteAsQuickMeal(day, routeChoice, mealOption)) {
      delta += routeChoice.timing ? Number(routeChoice.timing.bankDeltaMin) || 0 : -optionCostMinutes(routeChoice);
    }
    if (tripState.mealChoices[day.id] === 'quick' && mealOption) delta += mealSavedMinutes(mealOption);
    if (calm.mealExperience && mealOption && !calm.protectRecovery) {
      delta -= Math.max(0, Number(mealOption.experienceEffect && mealOption.experienceEffect.totalImpactMin) || 0);
    }
    if (calm.phase === 'waiting' && calm.waitAction !== 'quick') delta -= calm.waitMinutes;
    var raw = base + delta;
    return { base: base, delta: delta, raw: raw, minutes: Math.max(0, raw), tight: raw < 15 };
  }

  function hiddenInMode(day, stop) {
    var minutes = modeMinutes(day);
    return Boolean(!stop.selectedFlex && stop.skipAt && minutes >= stop.skipAt);
  }

  function stopStatus(stopId) {
    return tripState.stops[stopId] || 'pending';
  }

  function canSkipStop(stop) {
    return Boolean(stop && !isHotelStop(stop) && !stop.selectedFlex && !stop.flexSource);
  }

  function setStopStatus(day, stopId, status) {
    var stop = effectiveStops(day).find(function (item) { return item.id === stopId; }) || stopById(day, stopId);
    if (status === 'skipped' && !canSkipStop(stop)) {
      setStatus(isHotelStop(stop) ? 'Booked hotel anchors stay fixed and cannot be skipped.' : 'Use Remove choice for a selected flexible stop.');
      return false;
    }
    tripState.stops[stopId] = status;
    return true;
  }

  function visibleStops(day) {
    return effectiveStops(day).filter(function (stop) {
      return stopStatus(stop.id) !== 'skipped' && !hiddenInMode(day, stop);
    });
  }

  function nextStop(day) {
    var list = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    return list.find(function (stop) { return stopStatus(stop.id) === 'pending'; }) || null;
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
    var phase = tripPhase();
    var tabs = [
      ['live', phase === 'pretrip' ? 'Ready' : phase === 'complete' ? 'Recap' : 'Today'],
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
      built: false, unavailable: false, pendingFit: false, markers: [], ids: ids,
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
          source: option.source || '', coords: option.coords, choiceId: routeOptionId(option)
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
        html: '<span class="trip-pin is-idea' + (loc.isSelected ? ' is-selected' : '') + '" style="--pin:' + cat.color + '">' + (loc.isSelected ? '✓' : '★') + '</span>',
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
        '<p class="trip-pop-title">', escapeHtml(s.title), s.optional ? ' <span class="trip-pop-flag">' + (loc.isSelected ? 'Chosen' : s.isIdea ? 'Idea' : 'Optional') + '</span>' : '', '</p>',
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
    operationalPlan.days.forEach(function (day) {
      if (filterDay !== 'all' && day.id !== filterDay) return;
      visibleStops(day).forEach(function (stop) {
        if (stop.routeEligible === false || stop.conditional || !stop.coords) return;
        var last = pts[pts.length - 1];
        if (last && last[0] === stop.coords[0] && last[1] === stop.coords[1]) return;
        pts.push(stop.coords);
      });
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

  // A section that is not the active tab is hidden, so its map host measures
  // 0x0. Leaflet usually rides that out because it caches the container size,
  // but its own trackResize handler clears that cache: rotate the phone while
  // on Today, and the next fit of the hidden Plan map measures 0x0 for real and
  // clamps to maxZoom instead of framing the day.
  function mapIsVisible(state) {
    var host = document.getElementById(state.ids.host);
    return Boolean(host && host.clientWidth > 0 && host.clientHeight > 0);
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
      if (loc.isIdea) {
        loc.isSelected = loc.stops.some(function (stop) {
          return stop.choiceId && tripState.routeChoices[stop.dayId] === stop.choiceId;
        });
        entry.marker.setIcon(tripMarkerIcon(loc));
        entry.marker.setPopupContent(tripPopupHtml(loc));
      }
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
    // The Today tab can change the day while the Plan tab is hidden, so a fit
    // asked for off-screen is deferred until that tab is opened and measurable.
    if (fit) {
      if (mapIsVisible(state)) fitMap(state, fitCoords);
      else state.pendingFit = true;
    }
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
      // invalidateSize() first, so the deferred fit measures the real container.
      if (state.pendingFit) {
        state.pendingFit = false;
        refreshMap(state, true);
      }
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
      iconSize: [20, 20], iconAnchor: [10, 10]
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
        state.locateMarker = L.marker(here, { icon: liveLocationIcon(), zIndexOffset: 2000, keyboard: false, interactive: false }).addTo(state.map);
        state.locateAccuracy = L.circle(here, { radius: accuracy, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.08, interactive: false }).addTo(state.map);
      } else {
        state.locateMarker.setLatLng(here);
        state.locateAccuracy.setLatLng(here).setRadius(accuracy);
      }
      if (status) status.textContent = 'Live location on · accurate to about ' + Math.round(accuracy) + ' m.';
      if (firstFix) { state.map.setView(here, Math.max(state.map.getZoom(), 15)); firstFix = false; }
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
      // Each route map shares its Day filter with the day dropdown further down
      // the same page, so changing one changes both.
      syncPageDayFromMap(state, dayField.value);
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
      syncPageDayFromMap(state, 'all');
    });
  }

  // The Plan tab and the Today tab show the same plan from two angles, so
  // anything that changes plan state has to refresh both. Calling them as a pair
  // by hand was the source of "the other tab still shows the old value" bugs.
  function renderPlanViews() {
    renderDayContent();
    renderLive();
    if (tripMap.built) refreshMap(tripMap, false);
  }

  // The single way to select a day: update state, persist, re-render both plan
  // views and move the Plan-tab route map to match. Every day control goes
  // through here — the Day dropdowns, the previous/next paging buttons, "Open
  // full plan" and "Jump to today" — so a day change can never land in one place
  // and not the others. Calling it from the map's own Day filter is safe: that
  // handler sets tripMap.filters.day first, so syncMapDayFromItinerary() sees no
  // change and returns before it can bounce back.
  function applyItineraryDay(dayId) {
    uiFilters.dayId = dayId;
    tripState.activeDate = dayId;
    persist();
    renderPlanViews();
    syncMapDayFromItinerary(dayId);
  }

  // A route map's Day filter changed -> move the day dropdown on that same page
  // to match, so the map and the list below it never disagree about the date.
  function syncPageDayFromMap(state, dayId) {
    // The itinerary always shows exactly one day, so it has no equivalent of the
    // map's "Show entire trip".
    if (state === tripMap) {
      if (dayId !== 'all') syncItineraryDayFromMap(dayId);
      return;
    }
    if (state === planBMap) syncPlanBDayFromMap(dayId);
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

  // Plan B map Day filter changed -> move the Plan B list's Day dropdown to
  // match. That list does have an "All days" option, so the map's "Show entire
  // trip" maps straight onto it.
  function syncPlanBDayFromMap(dayId) {
    var value = dayId === 'all' ? '' : dayId;
    var select = document.getElementById('planbDay');
    if (!select || uiFilters.planbDay === value) return;
    select.value = value;
    uiFilters.planbDay = value;
    renderPlanBContent();
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
    });
    document.getElementById('dayMode').addEventListener('change', function (event) {
      tripState.modes[uiFilters.dayId] = event.target.value;
      persist();
      renderPlanViews();
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
        renderPlanViews();
      }
      if (button.dataset.stopAction === 'skip') {
        var skipDay = dayById(uiFilters.dayId);
        if (!setStopStatus(skipDay, stopId, stopStatus(stopId) === 'skipped' ? 'pending' : 'skipped')) return;
        persist();
        renderPlanViews();
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
      canSkipStop(stop) ? '<button type="button" class="button subtle" data-stop-action="skip" data-stop-id="' + escapeHtml(stop.id) + '" aria-pressed="' + (currentStatus === 'skipped' ? 'true' : 'false') + '">Skip stop</button>' : '',
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
      return (!type || stop.kind === type) && (!query || stop.searchText.indexOf(query) !== -1);
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
      applyItineraryDay(operationalPlan.days[dayIndex - 1].id);
      document.getElementById('daybyday-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('nextDay').addEventListener('click', function () {
      if (dayIndex >= operationalPlan.days.length - 1) return;
      applyItineraryDay(operationalPlan.days[dayIndex + 1].id);
      document.getElementById('daybyday-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function shortDay(label) {
    var match = String(label || '').match(/[A-Z][a-z]{2} \d+/);
    return match ? match[0] : '';
  }

  // Built from static trip data only — the picked/removed marks live in
  // pickState and are read separately — so the list is built once and reused.
  // Without this it was rebuilt on every keystroke in the food search box.
  var foodSuggestionCache = null;

  function foodSuggestionList() {
    if (foodSuggestionCache) return foodSuggestionCache;
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
    foodSuggestionCache = planned.concat(extras);
    foodSuggestionCache.forEach(function (item) {
      item.searchText = normalize([item.name, item.city, item.meal, item.region,
        item.dayLabel, item.summary, item.order, item.tip, item.menuRank.join(' ')].join(' '));
    });
    return foodSuggestionCache;
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

  // Plan B stops never change after load, so the text its search box matches
  // against is joined and normalized here rather than on every keystroke.
  planBData.stops.forEach(function (stop) {
    stop.searchText = normalize([stop.name, stop.segment, stop.why, stop.skipIf, stop.useIf, stop.foodPlan].join(' '));
  });

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
      return !query || stop.searchText.indexOf(query) !== -1;
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
      return !query || item.searchText.indexOf(query) !== -1;
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

  // Cached for the same reason as foodSuggestionList above.
  var attractionSuggestionCache = null;

  function attractionSuggestionList() {
    if (attractionSuggestionCache) return attractionSuggestionCache;
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
    attractionSuggestionCache = planned.concat(operationalScenicAttractions, extras);
    attractionSuggestionCache.forEach(function (item) {
      var ticket = ticketForAttraction(item.name);
      var quality = qualityForAttractionName(item.name);
      item.searchText = normalize([item.name, item.summary, item.address, item.kid,
        item.region, item.dayLabel, ticket && ticket.label, ticket && ticket.note,
        quality && 'kid backup', quality && quality.backupTitle,
        quality && quality.backupAddress].join(' '));
    });
    return attractionSuggestionCache;
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
      return !query || item.searchText.indexOf(query) !== -1;
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

  function tripPhase(isoDate) {
    var today = isoDate || localIsoDate();
    var first = operationalPlan.days[0].id;
    var last = operationalPlan.days[operationalPlan.days.length - 1].id;
    return today < first ? 'pretrip' : today > last ? 'complete' : 'trip';
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
    return '<div class="hotel-safe-banner"><div><strong>7/7 hotels booked · safe · fixed anchors</strong><span>Tonight: ' + escapeHtml(tonight) + '</span></div><span class="tag category-ok">Hotels stay unchanged</span></div>';
  }

  function routeOptionId(option) {
    return option && option.id || slug(option && option.name || 'option');
  }

  function optionMinimumMinutes(option) {
    return optionCostMinutes(option);
  }

  function recommendedRouteOption(day, minutes) {
    var plan = routeOptionsByDay[day.id];
    if (!plan || !minutes || day.id === '2026-08-21') return null;
    return plan.options.find(function (option) { return optionCostMinutes(option) <= minutes; }) || null;
  }

  function selectedRouteOption(day) {
    var id = tripState.routeChoices[day.id];
    var plan = routeOptionsByDay[day.id];
    return plan && plan.options.find(function (option) { return routeOptionId(option) === id; }) || null;
  }

  // ----- Next-stop chooser ---------------------------------------------------
  // At each decision point (ready to roll, or standing at a stop) the Today
  // view offers a short menu of what the next stop could be: the planned stop,
  // well-rated Plan B food swaps, and route-side ideas that would slot in
  // next. Every choice flows through effectiveStops, so the stops after it —
  // directions, timing, map order — follow automatically.

  function nextChooserTarget(day, calm) {
    var pending = visibleStops(day).filter(function (stop) {
      return !stop.choiceGated && stopStatus(stop.id) === 'pending';
    });
    if (calm.phase === 'ready') return pending[0] || null;
    if (calm.phase !== 'at-stop') return null;
    return pending[0] && pending[0].id === calm.stopId ? pending[1] || null : pending[0] || null;
  }

  // Good-food rule: only alternates with a solid TripAdvisor score (4.2+) are
  // offered for a meal slot, best-rated first. Venues already in the day's
  // plan and rows scheduled for a different meal (over 3 h away) are excluded.
  function nextFoodSwapRows(day, target) {
    if (!target || !isMealStop(target) || isHotelStop(target)) return [];
    if (target.flexSource && target.flexSource !== 'swap') return [];
    var targetMinutes = clockMinutes(target.time);
    var targetName = normalize(target.locationName || target.title);
    var planNames = effectiveStops(day).filter(function (stop) { return stop.id !== target.id; })
      .map(function (stop) { return normalize(stop.locationName || stop.title); });
    return planBRowsForDay(day.id).filter(function (row) {
      if (normalize(row.type).indexOf('food') === -1) return false;
      if (!(Number(row.rating) >= 4.2)) return false;
      var name = normalize(row.name);
      if (!name || targetName.indexOf(name) !== -1 || name.indexOf(targetName) !== -1) return false;
      if (planNames.some(function (planName) { return planName && (planName.indexOf(name) !== -1 || name.indexOf(planName) !== -1); })) return false;
      var rowMinutes = clockMinutes(row.time);
      if (targetMinutes != null && rowMinutes != null && Math.abs(rowMinutes - targetMinutes) > 180) return false;
      return true;
    }).sort(function (a, b) { return Number(b.rating) - Number(a.rating); }).slice(0, 2);
  }

  // Route-side ideas that would actually be encountered next: each candidate
  // is simulated through applyStopEffect and offered only when it lands at or
  // immediately after the chooser target, still costs no more than the Calm
  // Bank, and no idea has been chosen for the day yet.
  function nextRouteIdeaOptions(day, target) {
    if (!target || selectedRouteOption(day) || tripState.routeChoices[day.id] === 'dismissed') return [];
    var plan = routeOptionsByDay[day.id];
    if (!plan) return [];
    var bankMinutes = calmBank(day).minutes;
    var mealOption = selectedMealFlex(day);
    var base = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    return plan.options.filter(function (option) {
      if (optionCostMinutes(option) > bankMinutes) return false;
      if (sameRouteAsQuickMeal(day, option, mealOption)) return false;
      var flexId = 'route-flex-' + day.id + '-' + routeOptionId(option);
      if (stopStatus(flexId) !== 'pending') return false;
      var simulated = applyStopEffect(base.map(function (stop) { return Object.assign({}, stop); }), makeRouteChoiceStop(day, option), option.effect || {});
      var ideaIndex = simulated.findIndex(function (stop) { return stop.id === flexId; });
      if (ideaIndex === -1) return false;
      var firstPendingIndex = simulated.findIndex(function (stop) { return stopStatus(stop.id) === 'pending'; });
      var targetIndex = simulated.findIndex(function (stop) { return stop.id === target.id; });
      return ideaIndex >= Math.max(0, firstPendingIndex) && (targetIndex === -1 || ideaIndex <= targetIndex + 1);
    }).sort(function (a, b) { return optionCostMinutes(a) - optionCostMinutes(b); }).slice(0, 2);
  }

  // One-line "what this stop is about" summary for a quick decision.
  function stopBrief(stop) {
    var text = String(stop.notes || stop.kidPlan || stop.food || '');
    var sentence = /^[^.!?]*[.!?]/.exec(text);
    var brief = sentence ? sentence[0].trim() : text.slice(0, 140);
    return brief;
  }

  function renderNextStopChooser(day) {
    var calm = calmDayState(day);
    if (calm.phase !== 'ready' && calm.phase !== 'at-stop') return '';
    if (calm.protectRecovery) return '';
    var target = nextChooserTarget(day, calm);
    if (!target) return '';
    var swapped = target.flexSource === 'swap';
    var foods = nextFoodSwapRows(day, target);
    var ideas = nextRouteIdeaOptions(day, target);
    if (!foods.length && !ideas.length && !swapped && calm.phase === 'ready') return '';
    var pendingAfter = visibleStops(day).filter(function (stop) {
      return !stop.choiceGated && stopStatus(stop.id) === 'pending';
    });
    var targetPosition = pendingAfter.findIndex(function (stop) { return stop.id === target.id; });
    var following = targetPosition !== -1 ? pendingAfter[targetPosition + 1] : null;
    var kindClass = categoryClass(target.kind);
    var plannedTags = '<span class="tag">Planned next</span>'
      + (isHotelStop(target) ? '<span class="tag category-hotel">Booked hotel · fixed</span>' : kindClass ? '<span class="tag ' + kindClass + '">' + escapeHtml(target.kind) + '</span>' : '')
      + (target.rating ? stopRatingChip(target.rating) : '');
    var plannedBlock = [
      '<div class="next-option is-selected" data-testid="next-option-planned"><div class="next-option-head">', plannedTags, '</div>',
      '<h4>', escapeHtml(target.time), (target.zone ? ' ' + escapeHtml(target.zone) : ''), ' · ', escapeHtml(target.title), '</h4>',
      '<p class="small">', escapeHtml(stopBrief(target)), target.timeBudget ? ' · About ' + escapeHtml(target.timeBudget) : '', '</p>',
      swapped ? '<p class="small muted">Swapped in for ' + escapeHtml(target.swapOfTitle || 'the planned stop') + '.</p><div class="decision-actions"><button type="button" class="button subtle" data-next-restore="' + escapeHtml(target.id) + '">Back to ' + escapeHtml(target.swapOfTitle || 'the planned stop') + '</button></div>' : '',
      calm.phase === 'at-stop' && target.priority === 'optional' && canSkipStop(target) && following ? '<div class="decision-actions"><button type="button" class="button subtle" data-next-skip="' + escapeHtml(target.id) + '">Skip it · go straight to ' + escapeHtml(following.title) + '</button></div>' : '',
      '</div>'
    ].join('');
    var foodBlocks = foods.map(function (row) {
      return [
        '<div class="next-option" data-testid="next-option-food"><div class="next-option-head">',
        '<span class="tag category-food">', row.rating >= 4.5 ? 'Top-rated food' : 'Highly rated food', '</span>', planBRatingChip(row.rating, row.reviews),
        '</div><h4>', escapeHtml(row.name), '</h4>',
        '<p class="small">', escapeHtml(row.why), ' ', escapeHtml(row.foodPlan || ''), row.duration ? ' · ' + escapeHtml(row.duration) : '', '</p>',
        '<div class="decision-actions"><button type="button" class="button primary" data-next-swap="', escapeHtml(slug(row.name)), '" data-swap-target="', escapeHtml(target.id), '">Make this the next stop</button>', externalLink(row.mapsUrl, 'Map', 'button subtle'), externalLink(row.taUrl, 'Reviews', 'button subtle'), '</div></div>'
      ].join('');
    });
    var ideaBlocks = ideas.map(function (option) {
      return [
        '<div class="next-option" data-testid="next-option-idea"><div class="next-option-head">',
        '<span class="tag category-attraction">Route-side idea</span><span class="tag">−', optionCostMinutes(option), ' min</span>',
        '</div><h4>', escapeHtml(option.name), '</h4>',
        '<p class="small">', escapeHtml(option.why), option.visit ? ' · ' + escapeHtml(option.visit) : '', '</p>',
        '<p class="small muted"><strong>Where it fits:</strong> ', escapeHtml(option.routePoint), '</p>',
        '<div class="decision-actions"><button type="button" class="button primary" data-next-route="', escapeHtml(routeOptionId(option)), '">Make this the next stop</button>', externalLink(option.map, 'Parking map', 'button subtle'), '</div></div>'
      ].join('');
    });
    var alternatives = foodBlocks.concat(ideaBlocks).slice(0, 3);
    return [
      '<article class="decision-card next-chooser" data-testid="next-chooser"><div class="decision-head"><div><span class="tag">Next stop options</span>',
      '<h3>', calm.phase === 'at-stop' ? 'After this: choose the next stop' : 'Choose the next stop', '</h3>',
      '<p class="muted">One tap decides. Everything after it adjusts automatically.</p></div></div>',
      plannedBlock,
      alternatives.join(''),
      '<p class="small muted">Choosing updates directions, timing and the map for the rest of the day. Booked hotels never move.</p>',
      '</article>'
    ].join('');
  }

  function renderTodayRouteOption(day) {
    var calm = calmDayState(day);
    if (calm.phase !== 'ready') {
      return '<details class="decision-card planning-paused"><summary><strong>Route choices paused while this step is active</strong></summary><p class="small muted">Finish or resume the current stop before changing optional route ideas.</p></details>';
    }
    if (calm.protectRecovery) {
      return '<article class="decision-card is-protected"><div class="decision-head"><div><span class="tag category-ok">Recovery protected</span><h3>Extra route stops are paused</h3><p class="muted">The active route keeps only the core plan, safety resets, meals, and the seven fixed hotel anchors.</p></div></div></article>';
    }
    var minutes = aheadMinutes(day);
    var selected = selectedRouteOption(day);
    var choice = tripState.routeChoices[day.id] || '';
    if (!minutes && !selected) return '';
    if (choice === 'dismissed') return '<article class="decision-card"><div class="decision-head"><div><span class="tag">Extra time</span><h3>No extra stop selected</h3><p class="muted">The default route stays unchanged.</p></div></div><div class="decision-actions"><button type="button" class="button subtle" data-route-choice="show">Show suggestion</button></div></article>';
    var option = selected || recommendedRouteOption(day, minutes);
    if (!option) return '<article class="decision-card"><div class="decision-head"><div><span class="tag">Extra time</span><h3>Keep the buffer</h3><p>No safe optional attraction fits this margin. Use it for a calmer meal or hotel recovery.</p></div></div></article>';
    return [
      '<article class="decision-card', selected ? ' is-selected' : '', '"><div class="decision-head"><div><span class="tag">', selected ? 'Chosen · active in route' : 'Safe suggestion', '</span><h3>', escapeHtml(option.name), '</h3><p>', escapeHtml(option.why), '</p></div><strong>−', optionCostMinutes(option), ' min</strong></div>',
      '<p class="small"><strong>Where it fits:</strong> ', escapeHtml(option.routePoint), '<br><strong>Go only if:</strong> ', escapeHtml(option.gate), '<br><strong>Closest parking:</strong> ', escapeHtml(option.parking), '</p>',
      '<div class="decision-actions">', externalLink(option.map, 'Parking map', 'button'), externalLink(option.source, 'Official info', 'button subtle'), selected ? '<button type="button" class="button subtle" data-route-choice="clear">Remove choice</button>' : '<button type="button" class="button primary" data-route-choice="' + escapeHtml(routeOptionId(option)) + '">Use this option</button><button type="button" class="button subtle" data-route-choice="dismissed">Not today</button>', '</div></article>'
    ].join('');
  }

  function renderTodayMealChoice(day) {
    var plan = mealFlexByDay[day.id];
    if (!plan || !plan.options || !plan.options.length) return '';
    var option = plan.options[0];
    var choice = tripState.mealChoices[day.id] === 'quick' ? 'quick' : 'proper';
    var calm = calmDayState(day);
    if (calm.phase !== 'ready') {
      return '<details class="decision-card planning-paused"><summary><strong>Meal pace is locked for this active step</strong></summary><p class="small muted">Use the restaurant Wait Pivot if a queue changes the plan, or finish this step before switching meals.</p></details>';
    }
    return [
      '<article class="decision-card', choice === 'quick' ? ' is-selected' : '', '"><div class="decision-head"><div><span class="tag category-food">Meal pace</span><h3>', choice === 'proper' ? 'Proper meals stay in Plan A' : escapeHtml(option.meal + ': ' + option.foodName), '</h3><p>', choice === 'proper' ? 'Hotel breakfast plus the planned proper lunch and dinner remain selected.' : escapeHtml(option.order + ' · ' + option.window + '. ' + option.saved), '</p></div></div>',
      '<div class="meal-choice-buttons" role="group" aria-label="Meal pace"><button type="button" class="button subtle" data-meal-choice="proper" aria-pressed="', choice === 'proper', '">Plan A meals</button><button type="button" class="button subtle" data-meal-choice="quick" aria-pressed="', choice === 'quick', '">Use quick option</button></div>',
      choice === 'quick' ? '<p class="small"><strong>' + (calm.protectRecovery ? 'Saved time banked for recovery.' : 'Time unlocked for:') + '</strong>' + (calm.protectRecovery ? '' : ' ' + escapeHtml(option.experience) + '<br><strong>Closest parking:</strong> ' + escapeHtml(option.parking)) + '</p><div class="decision-actions">' + externalLink(option.foodMap, 'Food map', 'button') + (!calm.protectRecovery ? '<button type="button" class="button subtle" data-meal-experience="' + (calm.mealExperience ? 'remove' : 'add') + '">' + (calm.mealExperience ? 'Bank the time instead' : 'Add paired experience') + '</button>' : '') + '</div>' : '',
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
    var items = '<div class="readiness-grid">' + offlineReadinessItems.map(function (item) {
      return '<label class="readiness-item"><input type="checkbox" data-offline-ready="' + escapeHtml(item.id) + '"' + (tripState.offlineReadiness[item.id] ? ' checked' : '') + '> <span>' + escapeHtml(item.label) + '</span></label>';
    }).join('') + '</div>';
    if (done === offlineReadinessItems.length) return '<details class="readiness-card is-complete"><summary><strong>Offline ready ✓</strong> · all ' + done + ' essentials saved</summary>' + items + '</details>';
    return '<article class="readiness-card"><h3>Offline ready · ' + done + '/' + offlineReadinessItems.length + '</h3><p class="small muted">Finish before departure; progress stays on this device.</p>' + items + '</article>';
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
    var select = document.getElementById('resyncStopSelect');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location is not available on this device.';
      return;
    }
    if (status) status.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(function (position) {
      var here = [position.coords.latitude, position.coords.longitude];
      var candidates = visibleStops(day).filter(function (stop) {
        return stop.coords && !stop.choiceGated && stopStatus(stop.id) === 'pending';
      });
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
      if (select) select.value = best.id;
      if (status) {
        status.innerHTML = 'Nearest stop: <strong>' + escapeHtml(best.title) + '</strong> · about '
          + escapeHtml(distance) + ' away · ' + escapeHtml(best.time)
          + '. Confirm it below before changing progress.';
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

  function resyncToStop(day, stopId) {
    var stops = effectiveStops(day).filter(function (stop) { return !stop.choiceGated; });
    var targetIndex = stops.findIndex(function (stop) { return stop.id === stopId; });
    if (targetIndex === -1 || stopStatus(stops[targetIndex].id) !== 'pending') return false;
    stops.slice(0, targetIndex).forEach(function (stop) {
      if (stopStatus(stop.id) !== 'pending') return;
      tripState.stops[stop.id] = stop.priority === 'optional' && canSkipStop(stop) ? 'skipped' : 'done';
      if (stop.flexSource === 'rescue' && stop.replacesStopId) tripState.stops[stop.replacesStopId] = 'done';
    });
    tripState.calmByDay[day.id] = { phase: 'ready', stopId: stopId };
    persist();
    return true;
  }

  function isMealStop(stop) {
    return /breakfast|brunch|lunch|dinner|restaurant|bistro|cafe|café|food hall|suppers|dining/i.test([stop && stop.kind, stop && stop.title].join(' '));
  }

  function isHotelStop(stop) {
    return Boolean(stop && BOOKED_HOTEL_STOP_IDS.has(stop.id));
  }

  function isInPlaceCheckpoint(stop) {
    if (!stop || isHotelStop(stop) || stop.flexSource === 'rescue') return false;
    return /^d\d+-(depart|checkout|morning-ready|breakfast-stop)$/.test(stop.id || '');
  }

  function isOnSiteStop(stop) {
    if (!stop || isHotelStop(stop) || stop.flexSource === 'rescue' || isInPlaceCheckpoint(stop)) return false;
    return stop.routeEligible === false
      && durationRange(stop.leg).max === 0
      && !/\d+(?:\.\d+)?\s*km/i.test(stop.leg || '')
      && (/on-site|inside|at the hotel|same property/i.test(stop.leg || '') || /on-site/i.test(stop.kind || ''));
  }

  function journeyBeads(stop) {
    var drive = durationRange(stop && stop.leg).max;
    var destination = stop && (stop.locationName || stop.title) || 'the next stop';
    if (drive && drive <= 35) return ['Settle in', 'Look for the arrival signs', 'Arrive at ' + destination];
    if (drive && drive <= 90) return ['Settle in', 'Halfway stretch', 'Look for the destination', 'Arrive at ' + destination];
    return ['Settle in', 'Snack and comfort check', 'Movement-break moment', 'Arrive at ' + destination];
  }

  function liveCalmState(day, next) {
    var calm = calmDayState(day);
    if (!next) {
      if (calm.stopId || calm.legStartedAt || calm.arrivedAt || calm.waitStopId) {
        calm = Object.assign(calm, {
          phase: 'ready', stopId: '', legStartedAt: '', arrivedAt: '', beadIndex: 0,
          waitStopId: '', waitMinutes: 0, waitAction: ''
        });
        tripState.calmByDay[day.id] = calm;
        persistSilently();
      }
      return Object.assign({}, calm, { phase: 'complete', stopId: '' });
    }
    if (calm.stopId && calm.stopId !== next.id) {
      calm = Object.assign(calm, {
        phase: 'ready', stopId: next.id, legStartedAt: '', arrivedAt: '', beadIndex: 0,
        waitStopId: '', waitMinutes: 0, waitAction: ''
      });
      tripState.calmByDay[day.id] = calm;
      persistSilently();
      return calm;
    }
    if (!calm.stopId) {
      calm.stopId = next.id;
      tripState.calmByDay[day.id] = calm;
      persistSilently();
    }
    return calm;
  }

  function renderJourneyBeads(day, stop, calm) {
    var beads = journeyBeads(stop);
    var index = Math.min(calm.beadIndex, beads.length - 1);
    var paused = Boolean(calm.pulseNeed && !calm.pulseApplied);
    return [
      '<article class="quick-card journey-card calm-context" data-testid="journey-beads"><div class="calm-card-head"><div><span class="tag">Road moments</span><h3 tabindex="-1" id="calmContextHeading">', calm.kidView ? 'Kid view: just a few moments' : 'No exact countdown—just the next moments', '</h3></div><strong>', index + 1, '/', beads.length, '</strong></div>',
      '<div class="bead-progress" role="progressbar" aria-label="Road moment ', index + 1, ' of ', beads.length, '" aria-valuemin="1" aria-valuemax="', beads.length, '" aria-valuenow="', index + 1, '"><span style="width:', Math.round(((index + 1) / beads.length) * 100), '%"></span></div>',
      '<ol class="journey-beads', calm.kidView ? ' kid-view' : '', '">', beads.map(function (bead, beadIndex) {
        return '<li' + (beadIndex === index ? ' aria-current="step" class="is-current"' : beadIndex < index ? ' class="is-done"' : '') + '><span>' + (beadIndex + 1) + '</span>' + escapeHtml(bead) + '</li>';
      }).join(''), '</ol>',
      paused ? '<p class="small calm-paused">Road moments paused while you choose a family reset.</p>' : '',
      '<div class="decision-actions"><button type="button" class="button primary" data-calm-action="next-bead"', paused || index >= beads.length - 1 ? ' disabled' : '', '>Next road moment</button><button type="button" class="button subtle" data-calm-action="kid-view" aria-pressed="', calm.kidView, '">', calm.kidView ? 'Standard view' : 'Show kid view', '</button></div></article>'
    ].join('');
  }

  function arrivalForStop(stop) {
    var explicit = stop.arrival || {};
    var hasStructuredParking = Boolean(stop.parkingName && stop.parkingAddress
      && normalize(stop.parkingName) !== normalize(stop.parkingAddress));
    var mode = explicit.mode || (isOnSiteStop(stop) ? 'on-site' : hasStructuredParking ? 'parking' : 'venue');
    if (['parking', 'venue', 'on-site'].indexOf(mode) === -1) mode = 'venue';
    var label = explicit.label || (mode === 'parking' ? stop.parkingName : stop.locationName || stop.title);
    if (isHotelStop(stop)) label = String(label || '').replace(/^\s*check in:\s*/i, '');
    var address = explicit.address || (mode === 'parking' ? stop.parkingAddress : stop.address || stop.parkingAddress);
    var directionsUrl = explicit.directionsUrl || '';
    if (!directionsUrl && mode === 'parking' && address) directionsUrl = mapSearchUrl([label, address].filter(Boolean).join(', '));
    if (!directionsUrl && explicit.address) directionsUrl = mapSearchUrl([label, address].filter(Boolean).join(', '));
    if (!directionsUrl) directionsUrl = stop.mapUrl || mapSearchUrl(address);
    return {
      mode: mode,
      label: label || stop.title,
      address: address,
      directionsUrl: directionsUrl,
      instruction: explicit.instruction || '',
      firstStep: explicit.firstStep || '',
      entrance: stop.parkingEntrance || null
    };
  }

  function arrivalFirstStep(stop, arrival) {
    if (arrival.firstStep) return arrival.firstStep;
    if (isHotelStop(stop)) return 'Check in using the saved booking confirmation; this hotel is already fixed.';
    if (arrival.instruction) return arrival.instruction;
    if (arrival.entrance) return 'Use the saved entrance details below.';
    if (arrival.mode === 'on-site') return 'Continue inside; no second parking step is needed.';
    if (/washroom/i.test(stop.food || '')) return 'Use the on-site washroom first if anyone needs it.';
    return 'Follow posted signs on arrival; no entrance detail is assumed.';
  }

  function renderArrivalBubble(day, stop, calm) {
    var arrival = arrivalForStop(stop);
    var isParking = arrival.mode === 'parking';
    var parked = calm.phase === 'at-stop';
    var thenStep = stop.kidPlan || stop.food || '';
    var hotelTag = isHotelStop(stop) ? '<span class="tag category-hotel">Booked hotel · fixed</span>' : '';
    var targetLabel = isParking ? 'Parking target' : arrival.mode === 'on-site' ? 'Already on site' : 'Arrival target';
    var leadCopy = parked
      ? (isHotelStop(stop) ? 'Check in when ready; the booking stays fixed.' : 'Take the next step when ready.')
      : isParking ? 'Park first. The rest can wait.' : arrival.mode === 'on-site' ? 'You’re already here. Take the next step when ready.' : 'Arrive first. The rest can wait.';
    var headingLead = parked ? (isParking ? 'You’re parked at ' : 'You’ve arrived at ') : 'Aim for ';
    var stepLabel = isParking ? 'Park' : arrival.mode === 'on-site' ? 'Continue' : 'Arrive';
    var stepSummary = isParking ? 'Use the saved parking target above.' : arrival.mode === 'on-site' ? 'Continue from this property.' : 'Use the saved arrival target above.';
    var directionsLabel = isParking ? 'Open parking directions' : 'Open directions';
    var confirmationLabel = isParking ? 'We’re parked' : arrival.mode === 'on-site' ? 'We’re ready' : 'We’ve arrived';
    var completionLabel = isHotelStop(stop) ? 'Checked in · room secured' : 'Done here';
    var missingEntrance = arrival.mode === 'on-site'
      ? 'No separate entrance step is needed.'
      : (isParking ? 'No saved entrance detail is available. Follow posted signs on arrival.' : 'No separate entrance detail is saved. Use the saved address above and follow posted signs on arrival.');
    return [
      '<article class="decision-card arrival-bubble calm-context is-selected" data-testid="arrival-bubble" data-arrival-state="', parked ? 'landed' : 'final-approach', '" data-arrival-mode="', escapeHtml(arrival.mode), '"><div class="calm-card-head"><div><div class="arrival-tags"><span class="tag">', parked ? 'Landed' : 'Final approach', '</span>', hotelTag, '</div><h3 tabindex="-1" id="calmContextHeading">', escapeHtml(headingLead), escapeHtml(arrival.label), '</h3><p class="arrival-calm-copy">', escapeHtml(leadCopy), '</p>', parked ? '' : '<p class="small arrival-distance-note">Shown because you tapped “We’re close” · no location tracking or distance claim.</p>', '</div></div>',
      '<div class="arrival-target" role="group" aria-labelledby="arrivalTargetHeading"><p class="route-label" id="arrivalTargetHeading">', escapeHtml(targetLabel), '</p><strong>', escapeHtml(arrival.label), '</strong>',
      arrival.address ? '<address>' + escapeHtml(arrival.address) + '</address>' : '<p class="small muted">No separate arrival address is saved. Follow the pinned destination and posted signs.</p>',
      '<div class="arrival-target-actions">', arrival.mode === 'on-site' ? '' : externalLink(arrival.directionsUrl, directionsLabel, 'button primary'), arrival.address ? '<button type="button" class="button subtle" data-arrival-copy data-address="' + escapeHtml(arrival.address) + '">Copy address</button>' : '', '</div></div>',
      '<div class="decision-actions">',
      parked ? '<button type="button" class="button primary" data-calm-action="done">' + escapeHtml(completionLabel) + '</button>' : '<button type="button" class="button primary" data-calm-action="parked">' + escapeHtml(confirmationLabel) + '</button>',
      parked && isMealStop(stop) ? '<button type="button" class="button subtle" data-calm-action="start-wait">Restaurant wait?</button>' : '',
      parked ? '<button type="button" class="button subtle" data-calm-action="undo-arrival">Not here yet</button>' : '<button type="button" class="button subtle" data-calm-action="back-to-road">Back to road view</button>', '</div>',
      !navigator.onLine ? '<p class="small offline-arrival-note">Offline · the saved address remains available; Maps may need a connection.</p>' : '',
      arrival.entrance && arrival.entrance.note ? '<p class="arrival-entrance-note"><strong>Saved entrance note:</strong> ' + escapeHtml(arrival.entrance.note) + '</p>' : '',
      '<ol class="arrival-steps"><li data-arrival-step="arrive"><strong>', escapeHtml(stepLabel), '</strong><span>', escapeHtml(stepSummary), '</span></li>',
      '<li data-arrival-step="first"><strong>First</strong><span>', escapeHtml(arrivalFirstStep(stop, arrival)), '</span></li>',
      thenStep ? '<li data-arrival-step="then"><strong>Then</strong><span>' + escapeHtml(thenStep) + '</span></li>' : '', '</ol>',
      isHotelStop(stop) ? '<p class="hotel-lock-note"><strong>Booked hotel anchor:</strong> this is tonight’s fixed stay. Flexible planning can change only what happens before or after arrival.</p>' : '',
      '<details class="arrival-details"><summary>Entrance and stop details</summary>',
      arrival.entrance ? renderParkingEntrance(arrival.entrance, false) : '<p class="small"><strong>Entrance:</strong> ' + escapeHtml(missingEntrance) + '</p>',
      stop.notes ? '<p>' + escapeHtml(stop.notes) + '</p>' : '', stop.reservation ? '<p><strong>Reservation:</strong> ' + escapeHtml(stop.reservation) + '</p>' : '', '</details></article>'
    ].join('');
  }

  function waitPivot(day, stop, minutes) {
    var mealOption = selectedMealFlex(day);
    var replaces = mealOption && mealOption.effect && mealOption.effect.replaceStopIds || [];
    if (mealOption && replaces.indexOf(stop.id) !== -1 && minutes >= Number(mealOption.triggerWaitMin || 25)) {
      return { kind: 'quick', title: 'Switch to ' + mealOption.foodName, detail: 'This replaces ' + stop.title + ', avoids the quoted wait, and keeps every booked hotel and required anchor unchanged.' };
    }
    return { kind: 'stay', title: minutes >= 45 ? 'Wait here and make it the recovery block' : 'Stay, rest, and keep the table', detail: 'Use the wait for washrooms, water and quiet time. Do not add a detour just to fill the clock.' };
  }

  function renderWaitPivot(day, stop, calm) {
    var pivot = calm.waitMinutes ? waitPivot(day, stop, calm.waitMinutes) : null;
    return [
      '<article class="decision-card wait-pivot calm-context" data-testid="wait-pivot"><span class="tag category-food">Restaurant wait</span><h3 tabindex="-1" id="calmContextHeading">How long is the wait?</h3>',
      '<fieldset class="choice-chips"><legend class="sr-only">Quoted restaurant wait</legend>', [15, 30, 45, 60].map(function (minutes) {
        return '<button type="button" class="choice-chip" data-wait-minutes="' + minutes + '" aria-pressed="' + (calm.waitMinutes === minutes) + '">' + (minutes === 60 ? '60+ min' : minutes + ' min') + '</button>';
      }).join(''), '</fieldset>',
      pivot ? '<div class="pivot-result" role="status"><span class="route-label">Best move</span><h4>' + escapeHtml(pivot.title) + '</h4><p>' + escapeHtml(pivot.detail) + '</p></div>' : '<p class="small muted">Choose the quoted wait. The app will recommend one calm move.</p>',
      '<div class="decision-actions">', pivot ? '<button type="button" class="button primary" data-wait-action="' + pivot.kind + '">Use this plan</button>' : '', '<button type="button" class="button subtle" data-calm-action="meal-started">Meal has started</button></div></article>'
    ].join('');
  }

  function rescueRecommendation(day, need) {
    var pending = effectiveStops(day).filter(function (stop) { return stopStatus(stop.id) === 'pending' && !stop.choiceGated; });
    if (need === 'late') return { title: 'Recover 30 minutes', detail: day.contingency, action: 'Apply recovery' };
    if (need === 'hungry') {
      var meal = selectedMealFlex(day);
      var nextFood = pending.find(isMealStop);
      return meal ? { title: 'Use ' + meal.foodName, detail: meal.order + ' ' + meal.saved + '. All booked hotels remain fixed.', action: 'Use quick meal' }
        : { title: nextFood ? 'Head toward ' + nextFood.title : 'Use packed food now', detail: nextFood ? nextFood.food : 'Keep the next required stop and avoid an unplanned detour.', action: '' };
    }
    if (need === 'tired') return { title: 'Protect hotel recovery', detail: 'Remove pending optional stops and keep the booked hotel, meals and safety breaks unchanged.', action: 'Protect recovery' };
    if (need === 'rain') return { title: day.id === '2026-08-18' ? 'Use the curated indoor PEI branch' : 'Use the rain plan', detail: day.rainPlan + ' Booked hotels stay unchanged.', action: 'Apply rain plan' };
    if (need === 'washroom') {
      var reset = pending.find(function (stop) {
        return !isHotelStop(stop) && /washroom|service|mall|fuel|restaurant/i.test([stop.kind, stop.food, stop.title].join(' '));
      });
      return { title: reset ? 'Use ' + reset.title : 'Use the next safe service stop', detail: reset ? (reset.food || reset.notes) : 'Stop safely at the next signed service area.', action: reset ? 'Make this the next reset' : '', stop: reset };
    }
    return null;
  }

  function renderFamilyPulse(day, calm) {
    var labels = { late: 'Running late', hungry: 'Hungry', tired: 'Low energy', rain: 'Rain', washroom: 'Need washroom' };
    var recommendation = rescueRecommendation(day, calm.pulseNeed);
    return [
      '<article class="decision-card family-pulse" data-testid="family-pulse"><div class="calm-card-head"><div><span class="tag">Family pulse</span><h3>How’s everyone?</h3></div></div>',
      '<fieldset class="choice-chips"><legend class="sr-only">Choose what the family needs</legend>', Object.keys(labels).map(function (need) {
        return '<button type="button" class="choice-chip" data-pulse-need="' + need + '" aria-pressed="' + (calm.pulseNeed === need) + '">' + labels[need] + '</button>';
      }).join(''), '</fieldset>',
      recommendation ? '<div class="pulse-result" role="status"><span class="route-label">Best reset now</span><h4>' + escapeHtml(recommendation.title) + '</h4><p>' + escapeHtml(recommendation.detail) + '</p><div class="decision-actions">' + (recommendation.action ? '<button type="button" class="button primary" data-pulse-apply="' + escapeHtml(calm.pulseNeed) + '">' + escapeHtml(recommendation.action) + '</button>' : '') + (recommendation.stop ? externalLink(recommendation.stop.mapUrl, 'Directions', 'button subtle') : '') + '<button type="button" class="button subtle" data-pulse-clear>Keep current plan</button></div></div>' : '<p class="small muted">Pick one need and get one conservative recommendation.</p>',
      '<p class="small passenger-note">Passenger use only while the car is moving.</p></article>'
    ].join('');
  }

  function renderCalmBank(day) {
    var bank = calmBank(day);
    var route = selectedRouteOption(day);
    var meal = selectedMealFlex(day);
    var calm = calmDayState(day);
    var breakdown = ['Base plan cushion ' + bank.base + ' min'];
    if (aheadMinutes(day)) breakdown.push('Ahead +' + aheadMinutes(day));
    if (modeMinutes(day)) breakdown.push('Delay -' + modeMinutes(day));
    if (route && !calm.protectRecovery && !sameRouteAsQuickMeal(day, route, meal)) breakdown.push(route.name + ' ' + (route.timing.bankDeltaMin || -optionCostMinutes(route)) + ' min');
    if (tripState.mealChoices[day.id] === 'quick' && meal) breakdown.push(meal.foodName + ' +' + mealSavedMinutes(meal) + ' min');
    if (calm.mealExperience && meal && !calm.protectRecovery) {
      var experienceImpact = Number(meal.experienceEffect && meal.experienceEffect.totalImpactMin) || 0;
      breakdown.push(meal.experience + (experienceImpact ? ' -' + experienceImpact + ' min' : ' · no added drive'));
    }
    if (calm.phase === 'waiting' && calm.waitAction !== 'quick' && calm.waitMinutes) breakdown.push('Quoted wait -' + calm.waitMinutes + ' min');
    return '<article class="calm-bank' + (bank.tight ? ' is-tight' : '') + '" data-testid="calm-bank"><div><span class="route-label">Calm Bank · before live traffic</span><h3>' + bank.minutes + ' relaxed minutes</h3><p>' + (bank.raw < 0 ? 'The current choices exceed the planned cushion. Use a recovery action before adding anything.' : bank.tight ? 'Cushion is tight—bank it for the booked hotel and recovery.' : 'Available for an optional stop, a slower meal, or simply arriving rested.') + '</p></div><details><summary>How this is calculated</summary><ul>' + breakdown.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul><p class="small">Live traffic, weather and queues can reduce this. The booked hotel target always wins.</p></details></article>';
  }

  function renderNoRegrets(day, calm) {
    var hotel = hotelForNight(day.id);
    var destination = hotel ? hotel['Recommended hotel'] : 'home safely';
    return '<article class="success-card"><span class="tag category-ok">No-regrets day</span><h3>Today is a win if…</h3><p><strong>' + escapeHtml(day.mainActivity) + '</strong>, then arrive rested at <strong>' + escapeHtml(destination) + '</strong>. Everything else is a bonus.</p><button type="button" class="button subtle" data-protect-recovery aria-pressed="' + calm.protectRecovery + '">' + (calm.protectRecovery ? 'Recovery protected · undo' : 'Protect recovery time') + '</button></article>';
  }

  function renderPhaseBrief(day, next, phase) {
    if (phase === 'pretrip') {
      var days = Math.max(0, daysBetween(localIsoDate(), operationalPlan.days[0].id));
      var openTasks = checklistTasks.filter(function (item) { return !taskState(item.id).done; }).sort(function (a, b) { return String(a.dueDate).localeCompare(String(b.dueDate)); });
      return '<article class="phase-card"><span class="tag">Before departure</span><h3>' + days + ' days until the road trip</h3><p>' + (openTasks[0] ? '<strong>Next prep:</strong> ' + escapeHtml(openTasks[0].title) : 'Prep is complete. Keep the offline pack on both phones.') + '</p><p class="small">All seven hotels are already booked and stay fixed.</p></article>';
    }
    if (phase === 'complete') return '<article class="phase-card is-complete"><span class="tag category-ok">Trip complete</span><h3>You made it home</h3><p>The itinerary is now a recap. Hotel bookings and private progress remain on this device.</p></article>';
    if (!next) {
      var index = operationalPlan.days.findIndex(function (item) { return item.id === day.id; });
      var tomorrow = operationalPlan.days[index + 1];
      return '<article class="phase-card is-complete"><span class="tag category-ok">Tonight’s reset</span><h3>You made it. Tomorrow can wait.</h3><p>' + (tomorrow ? 'Next departure: ' + escapeHtml(tomorrow.departTarget) + '. Charge phones, stage bags and confirm breakfast—nothing else is required tonight.' : 'The road trip is complete. Rest first.') + '</p></article>';
    }
    return '';
  }

  function renderTripRecap(section) {
    var total = 0;
    var completed = 0;
    operationalPlan.days.forEach(function (day) {
      effectiveStops(day).filter(function (stop) { return !stop.choiceGated; }).forEach(function (stop) {
        total += 1;
        if (stopStatus(stop.id) === 'done') completed += 1;
      });
    });
    var pct = total ? Math.round((completed / total) * 100) : 0;
    section.innerHTML = [
      '<h2 id="live-heading" class="section-heading">Trip recap</h2>',
      '<p class="section-intro">The road trip is complete. Keep the memories; the logistics can rest.</p>',
      '<article class="phase-card is-complete recap-card"><span class="tag category-ok">Home safely</span><h3>Eight days · seven fixed hotel stays</h3><p>You protected the booked route anchors while keeping meals and optional stops flexible.</p>',
      '<div class="trip-progress"><strong>', completed, '/', total, ' active checkpoints recorded complete</strong><div class="progress-meter" aria-label="', completed, ' of ', total, ' active checkpoints complete"><span style="width:', pct, '%"></span></div></div>',
      '<div class="decision-actions"><button type="button" class="button primary" id="recapPlan">Review the trip plan</button><button type="button" class="button subtle" id="recapPrep">Review prep notes</button></div></article>',
      renderHotelSafeBanner(operationalPlan.days[operationalPlan.days.length - 1])
    ].join('');
    document.getElementById('recapPlan').addEventListener('click', function () { activateSection('daybyday', true); });
    document.getElementById('recapPrep').addEventListener('click', function () { activateSection('checklist', true); });
  }

  function renderLive() {
    var section = document.getElementById('live');
    var phase = tripPhase();
    if (phase === 'complete') {
      renderTripRecap(section);
      return;
    }
    var day = dayById(tripState.activeDate);
    var mode = tripState.modes[day.id] || 'preview';
    var stops = visibleStops(day).filter(function (stop) { return !stop.choiceGated; });
    var completed = stops.filter(function (stop) { return stopStatus(stop.id) === 'done'; }).length;
    var next = nextStop(day);
    var prior = stops.filter(function (stop) { return stopStatus(stop.id) === 'done'; }).pop() || stops[0];
    var nextRoute = next ? routeUrl(prior && prior.id !== next.id ? [prior, next] : [next]) : '';
    var progress = stops.length ? Math.round((completed / stops.length) * 100) : 0;
    var modeName = scheduleModeLabel(mode);
    var calm = liveCalmState(day, next);
    var tonightTarget = (hotelPlanRules[day.id] && hotelPlanRules[day.id].arrival) || 'confirm arrival';
    var tideDetails = day.id === operationalPlan.tidePlan.date ? '<div class="mode-note safe"><strong>Hopewell:</strong> Low tide 11:52 AM. Target entrance 10:15–10:30 and stairs by 10:45; staff control actual floor access.<div class="action-bar">' + externalLink(operationalPlan.tidePlan.sourceUrl, 'Tide table', 'button subtle') + externalLink(operationalPlan.tidePlan.chsUrl, 'CHS prediction', 'button subtle') + '</div></div>' : '';
    var heading = phase === 'pretrip' ? 'Get ready' : phase === 'complete' ? 'Trip recap' : 'Today';
    var intro = phase === 'pretrip' ? 'Finish the essentials, then preview one calm step at a time.' : phase === 'complete' ? 'The road trip is complete.' : 'One next step. Everything else can wait.';
    var inPlaceCheckpoint = isInPlaceCheckpoint(next);
    var onSiteStop = isOnSiteStop(next);
    var heroLabel = calm.phase === 'driving' ? 'On the way' : calm.phase === 'arriving' ? 'Arriving at' : calm.phase === 'at-stop' ? 'At stop' : calm.phase === 'waiting' ? 'Waiting' : phase === 'pretrip' ? 'Preview' : 'Ready';
    var context = next && calm.phase === 'driving' ? renderJourneyBeads(day, next, calm)
      : next && (calm.phase === 'arriving' || calm.phase === 'at-stop') ? renderArrivalBubble(day, next, calm)
        : next && calm.phase === 'waiting' ? renderWaitPivot(day, next, calm) : '';
    var heroActions = '';
    if (next && calm.phase === 'ready' && inPlaceCheckpoint) heroActions = '<button type="button" class="button primary" data-calm-action="start-day">Ready · continue</button>';
    else if (next && calm.phase === 'ready' && onSiteStop) heroActions = '<button type="button" class="button primary" data-calm-action="start-stop">Start this stop</button>';
    else if (next && calm.phase === 'ready') heroActions = externalLink(nextRoute, 'Directions', 'button') + '<button type="button" class="button primary" data-calm-action="start-leg">Start this leg</button>';
    else if (next && calm.phase === 'driving') heroActions = externalLink(nextRoute, 'Directions', 'button') + '<button type="button" class="button primary" data-calm-action="near">We’re close</button>';
    else if (next) heroActions = externalLink(nextRoute, 'Directions', 'button');
    section.innerHTML = [
      '<h2 id="live-heading" class="section-heading">', heading, '</h2>',
      '<p class="section-intro">', intro, '</p>',
      renderTodayBanner(day),
      renderPhaseBrief(day, next, phase),
      '<div class="trip-control-grid">',
      '<article class="next-stop" data-testid="calm-hero"><p class="route-label">', escapeHtml(heroLabel), ' · ', escapeHtml(modeName), ' · <span class="risk-chip ', riskClass(day.risk), '">', escapeHtml(day.risk), ' risk</span></p>',
      next ? '<h3>' + escapeHtml(next.title) + '</h3><p class="muted next-time">' + escapeHtml(next.time) + (next.zone ? ' ' + escapeHtml(next.zone) : '') + ' · ' + escapeHtml(next.city) + '</p>' : '<h3>Day complete</h3><p class="muted">All active stops are complete.</p>',
      '<p class="small"><strong>Hotel arrival target:</strong> ', escapeHtml(tonightTarget), '</p>',
      renderTodayNowLine(day),
      '<div class="action-bar">', heroActions, '</div>',
      next && canSkipStop(next) && next.priority !== 'required' && calm.phase !== 'at-stop' && calm.phase !== 'waiting' ? '<div class="today-action-row"><button type="button" class="button subtle" data-calm-action="skip">Skip this optional stop</button><button type="button" class="button subtle" data-protect-recovery>Bank the time</button></div>' : '',
      '<div class="trip-progress"><strong>', completed, '/', stops.length, ' active stops complete</strong><div class="progress-meter" aria-label="' + completed + ' of ' + stops.length + ' active stops complete"><span style="width:' + progress + '%"></span></div></div>',
      next ? '<details class="next-details"><summary>What to know</summary><p>' + escapeHtml(next.notes) + '</p></details>' : '',
      next ? '<details class="next-details"><summary>Full-day directions</summary><div class="action-bar">' + dayRouteLinks(day, 'button secondary') + '</div></details>' : '',
      next ? '<details class="resync-control"><summary>We are somewhere else</summary><label for="resyncStopSelect">Resume from<select id="resyncStopSelect">' + stops.filter(function (stop) { return stopStatus(stop.id) === 'pending'; }).map(function (stop) { return '<option value="' + escapeHtml(stop.id) + '">' + escapeHtml(stop.time + ' · ' + stop.title) + '</option>'; }).join('') + '</select></label><div class="decision-actions"><button type="button" class="button subtle" id="nearestStopBtn">Find nearest stop</button><button type="button" class="button subtle" id="applyResync">Resume here</button></div><p id="nearestStopStatus" class="small muted" role="status" aria-live="polite">Confirming a stop marks earlier required stops done and earlier optional stops skipped.</p></details>' : '',
      renderWakeLockControl(),
      '</article>',
      '</div>',
      context,
      renderNextStopChooser(day),
      renderFamilyPulse(day, calm),
      '<div class="calm-summary-grid">', renderCalmBank(day), renderNoRegrets(day, calm), '</div>',
      renderHotelSafeBanner(day),
      tideDetails,
      renderTodayRouteOption(day),
      renderTodayMealChoice(day),
      '<details class="planning-drawer"><summary>Change day or schedule</summary><div class="control-grid primary-controls today-controls" aria-label="Trip control settings">',
      '<label for="liveDay">Day<select id="liveDay">', operationalPlan.days.map(function (item) { return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(dayOptionLabel(item)) + '</option>'; }).join(''), '</select></label>',
      '<label for="liveMode">Schedule<select id="liveMode"><option value="preview">Planning</option><option value="on-time">On schedule</option><option value="ahead30">30 min ahead</option><option value="ahead60">60+ min ahead</option><option value="late30">30+ min late</option><option value="late60">60+ min late</option></select></label>',
      '</div></details>',
      '<details class="today-route-drawer"><summary>See the whole day · ', stops.length, ' active stops</summary>', renderDayRouteMap(day, visibleStops(day), 'Today’s route'), '</details>',
      renderFreshnessCard(day),
      renderOfflineReadiness(),
      '<details class="quick-card compact-guidance"><summary><strong>If plans change</strong></summary><p><strong>If delayed:</strong> ', escapeHtml(day.contingency), '</p><p><strong>Safety fallback:</strong> ', escapeHtml(day.emergency), '</p><div class="action-bar"><button type="button" class="button subtle" id="openDayPlan">Open full plan</button>', dayWeatherLink(day.id), '</div></details>',
    ].join('');
    document.getElementById('liveDay').value = day.id;
    document.getElementById('liveMode').value = mode;
    document.getElementById('liveDay').addEventListener('change', function (event) {
      applyItineraryDay(event.target.value);
      var dayDrawer = document.querySelector('#live .planning-drawer');
      if (dayDrawer) dayDrawer.open = true;
      var nextDaySelect = document.getElementById('liveDay');
      if (nextDaySelect) nextDaySelect.focus();
    });
    document.getElementById('liveMode').addEventListener('change', function (event) {
      tripState.modes[day.id] = event.target.value;
      persist();
      renderPlanViews();
      var modeDrawer = document.querySelector('#live .planning-drawer');
      if (modeDrawer) modeDrawer.open = true;
      var nextModeSelect = document.getElementById('liveMode');
      if (nextModeSelect) nextModeSelect.focus();
    });
    var nearestButton = document.getElementById('nearestStopBtn');
    if (nearestButton) nearestButton.addEventListener('click', function () { findNearestStop(day); });
    var applyResync = document.getElementById('applyResync');
    if (applyResync) applyResync.addEventListener('click', function () {
      var select = document.getElementById('resyncStopSelect');
      if (select && resyncToStop(day, select.value)) {
        renderPlanViews();
        setStatus('Trip resumed from the selected stop. Booked hotels remain unchanged.');
      }
    });
    section.querySelectorAll('[data-calm-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!next) return;
        var action = button.dataset.calmAction;
        var patch = { stopId: next.id };
        if (action === 'start-day') {
          tripState.stops[next.id] = 'done';
          tripState.calmByDay[day.id] = { phase: 'ready', protectRecovery: calm.protectRecovery };
          persist();
          renderPlanViews();
          return;
        } else if (action === 'start-stop') patch = { phase: 'at-stop', stopId: next.id, arrivedAt: new Date().toISOString(), legStartedAt: '' };
        else if (action === 'start-leg') patch = { phase: 'driving', stopId: next.id, legStartedAt: new Date().toISOString(), beadIndex: 0 };
        else if (action === 'near') patch.phase = 'arriving';
        else if (action === 'back-to-road') patch = { phase: 'driving', stopId: next.id, arrivedAt: '' };
        else if (action === 'parked') {
          patch.phase = 'at-stop';
          patch.arrivedAt = new Date().toISOString();
          if (day.id === localIsoDate()) {
            var planned = clockMinutes(next.time);
            var now = new Date();
            if (planned != null) {
              var drift = now.getHours() * 60 + now.getMinutes() - planned;
              tripState.modes[day.id] = drift >= 60 ? 'late60' : drift >= 30 ? 'late30' : drift <= -60 ? 'ahead60' : drift <= -30 ? 'ahead30' : 'on-time';
            }
          }
        } else if (action === 'undo-arrival') patch = { phase: 'arriving', stopId: next.id, arrivedAt: '' };
        else if (action === 'start-wait') patch = { phase: 'waiting', stopId: next.id, waitStopId: next.id, waitMinutes: 0, waitAction: '' };
        else if (action === 'meal-started') patch = { phase: 'at-stop', stopId: next.id, waitMinutes: 0, waitAction: '' };
        else if (action === 'next-bead') patch.beadIndex = calm.beadIndex + 1;
        else if (action === 'kid-view') patch.kidView = !calm.kidView;
        else if (action === 'skip' && next.priority !== 'required') {
          if (!setStopStatus(day, next.id, 'skipped')) return;
          tripState.calmByDay[day.id] = { phase: 'ready' };
          persist();
          renderPlanViews();
          return;
        } else if (action === 'done') {
          tripState.stops[next.id] = 'done';
          if (next.flexSource === 'rescue' && next.replacesStopId) tripState.stops[next.replacesStopId] = 'done';
          tripState.calmByDay[day.id] = { phase: 'ready', protectRecovery: calm.protectRecovery };
          persist();
          renderPlanViews();
          return;
        }
        saveCalmDayState(day, patch);
        renderPlanViews();
        var contextHeading = document.getElementById('calmContextHeading');
        if (contextHeading) {
          if (action === 'near' || action === 'parked' || action === 'undo-arrival' || action === 'back-to-road') {
            contextHeading.focus({ preventScroll: true });
            var contextCard = contextHeading.closest('.calm-context');
            if (contextCard) contextCard.scrollIntoView({ block: 'start' });
          } else contextHeading.focus({ preventScroll: true });
        }
      });
    });
    section.querySelectorAll('[data-arrival-copy]').forEach(function (button) {
      button.addEventListener('click', function () {
        copyText(button.dataset.address || '').then(function () { setStatus('Arrival address copied.'); });
      });
    });
    section.querySelectorAll('[data-wait-minutes]').forEach(function (button) {
      button.addEventListener('click', function () {
        saveCalmDayState(day, { waitMinutes: Number(button.dataset.waitMinutes), waitAction: '' });
        renderLive();
      });
    });
    section.querySelectorAll('[data-wait-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        var action = button.dataset.waitAction;
        if (action === 'quick') {
          tripState.mealChoices[day.id] = 'quick';
          tripState.calmByDay[day.id] = { phase: 'ready', waitAction: 'quick' };
        } else {
          saveCalmDayState(day, { waitAction: 'stay' });
        }
        persist();
        renderPlanViews();
      });
    });
    section.querySelectorAll('[data-pulse-need]').forEach(function (button) {
      button.addEventListener('click', function () {
        var need = button.dataset.pulseNeed;
        saveCalmDayState(day, { pulseNeed: calm.pulseNeed === need ? '' : need, pulseApplied: false, rescueStopId: '' });
        renderLive();
      });
    });
    section.querySelectorAll('[data-pulse-apply]').forEach(function (button) {
      button.addEventListener('click', function () {
        var need = button.dataset.pulseApply;
        var recommendation = rescueRecommendation(day, need);
        var pulsePatch = { pulseNeed: need, pulseApplied: true };
        if (need === 'late') { tripState.modes[day.id] = 'late30'; pulsePatch.protectRecovery = true; }
        if (need === 'hungry' && selectedMealFlex(day)) tripState.mealChoices[day.id] = 'quick';
        if (need === 'tired' || need === 'rain') pulsePatch.protectRecovery = true;
        if (need === 'washroom' && recommendation && recommendation.stop) pulsePatch.rescueStopId = recommendation.stop.id;
        if (pulsePatch.protectRecovery) {
          delete tripState.routeChoices[day.id];
          pulsePatch.mealExperience = false;
        }
        saveCalmDayState(day, pulsePatch);
        renderPlanViews();
      });
    });
    section.querySelectorAll('[data-pulse-clear]').forEach(function (button) {
      button.addEventListener('click', function () {
        saveCalmDayState(day, { pulseNeed: '', pulseApplied: false, rescueStopId: '' });
        renderLive();
      });
    });
    section.querySelectorAll('[data-protect-recovery]').forEach(function (button) {
      button.addEventListener('click', function () {
        var protect = !calm.protectRecovery;
        if (protect) delete tripState.routeChoices[day.id];
        saveCalmDayState(day, { protectRecovery: protect, mealExperience: protect ? false : calm.mealExperience });
        renderPlanViews();
      });
    });
    section.querySelectorAll('.day-map [data-stop-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        var stopId = button.dataset.stopId;
        var action = button.dataset.stopAction;
        if (action === 'toggle') {
          tripState.stops[stopId] = stopStatus(stopId) === 'done' ? 'pending' : 'done';
          persist();
          renderPlanViews();
        } else if (action === 'skip') {
          if (!setStopStatus(day, stopId, stopStatus(stopId) === 'skipped' ? 'pending' : 'skipped')) return;
          persist();
          renderPlanViews();
        } else if (action === 'copy') {
          copyText(button.dataset.address || '').then(function () { setStatus('Address copied to the clipboard.'); });
        }
      });
    });
    section.querySelectorAll('[data-route-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        var currentCalm = calmDayState(day);
        if (currentCalm.protectRecovery || currentCalm.phase !== 'ready') {
          setStatus('Finish the active step or unprotect recovery before adding a route stop.');
          return;
        }
        var choice = button.dataset.routeChoice;
        if (choice === 'clear' || choice === 'show') delete tripState.routeChoices[day.id];
        else tripState.routeChoices[day.id] = choice;
        persist();
        renderPlanViews();
      });
    });
    section.querySelectorAll('[data-next-swap]').forEach(function (button) {
      button.addEventListener('click', function () {
        var currentCalm = calmDayState(day);
        if (currentCalm.protectRecovery || (currentCalm.phase !== 'ready' && currentCalm.phase !== 'at-stop')) {
          setStatus('Finish the active step before changing the next stop.');
          return;
        }
        var targetId = button.dataset.swapTarget;
        var row = planBRowById(day.id, button.dataset.nextSwap);
        var targetStop = stopById(day, targetId);
        if (!row || !targetStop || isHotelStop(targetStop)) return;
        tripState.stopSwaps[targetId] = button.dataset.nextSwap;
        persist();
        renderPlanViews();
        setStatus('Next stop switched to ' + row.name + (row.rating ? ' (' + row.rating + '★)' : '') + '. The stops after it stay on plan.');
      });
    });
    section.querySelectorAll('[data-next-restore]').forEach(function (button) {
      button.addEventListener('click', function () {
        var stopId = button.dataset.nextRestore;
        var original = stopById(day, stopId);
        delete tripState.stopSwaps[stopId];
        persist();
        renderPlanViews();
        setStatus('Restored the planned stop' + (original ? ': ' + original.title : '') + '.');
      });
    });
    section.querySelectorAll('[data-next-route]').forEach(function (button) {
      button.addEventListener('click', function () {
        var currentCalm = calmDayState(day);
        if (currentCalm.protectRecovery || (currentCalm.phase !== 'ready' && currentCalm.phase !== 'at-stop')) {
          setStatus('Finish the active step or unprotect recovery before adding a route stop.');
          return;
        }
        tripState.routeChoices[day.id] = button.dataset.nextRoute;
        persist();
        renderPlanViews();
        setStatus('Added to the route. The stops after it adjust automatically; booked hotels stay fixed.');
      });
    });
    section.querySelectorAll('[data-next-skip]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!setStopStatus(day, button.dataset.nextSkip, 'skipped')) return;
        persist();
        renderPlanViews();
        setStatus('Optional stop skipped. The next stop moved up.');
      });
    });
    section.querySelectorAll('[data-meal-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (calmDayState(day).phase !== 'ready') {
          setStatus('Finish the active step before changing the meal pace.');
          return;
        }
        tripState.mealChoices[day.id] = button.dataset.mealChoice === 'quick' ? 'quick' : 'proper';
        if (tripState.mealChoices[day.id] === 'quick' && sameRouteAsQuickMeal(day, selectedRouteOption(day), selectedMealFlex(day))) {
          delete tripState.routeChoices[day.id];
        }
        if (tripState.mealChoices[day.id] === 'proper') saveCalmDayState(day, { mealExperience: false });
        persist();
        renderPlanViews();
      });
    });
    section.querySelectorAll('[data-meal-experience]').forEach(function (button) {
      button.addEventListener('click', function () {
        var currentCalm = calmDayState(day);
        if (currentCalm.protectRecovery || currentCalm.phase !== 'ready') {
          setStatus('Paired experiences stay paused while recovery is protected or a step is active.');
          return;
        }
        saveCalmDayState(day, { mealExperience: button.dataset.mealExperience === 'add' });
        renderPlanViews();
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
      applyItineraryDay(day.id);
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
        applyItineraryDay(localIsoDate());
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
    var calmData = tripState.calmByDay;
    if (redacted) {
      calmData = {};
      Object.keys(tripState.calmByDay || {}).forEach(function (dayId) {
        var calm = calmDayState(dayById(dayId));
        calmData[dayId] = {
          phase: calm.phase,
          beadIndex: calm.beadIndex,
          kidView: calm.kidView,
          pulseNeed: calm.pulseNeed,
          pulseApplied: calm.pulseApplied,
          protectRecovery: calm.protectRecovery,
          waitMinutes: calm.waitMinutes,
          waitAction: calm.waitAction,
          mealExperience: calm.mealExperience
        };
      });
    }
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      redacted: Boolean(redacted),
      activeDate: tripState.activeDate,
      modes: tripState.modes,
      stops: tripState.stops,
      tasks: taskData,
      routeChoices: tripState.routeChoices,
      mealChoices: tripState.mealChoices,
      stopSwaps: tripState.stopSwaps,
      calmByDay: calmData,
      offlineReadiness: tripState.offlineReadiness,
      picks: pickState.items,
      packing: packingState.items,
      expenses: redacted ? undefined : { budget: expenseState.budget, items: expenseState.items }
    };
  }

  function applyImportedState(imported) {
    if (!imported || [2, 3].indexOf(imported.version) === -1 || typeof imported !== 'object') throw new Error('Unsupported export');
    var validDays = new Set(operationalPlan.days.map(function (day) { return day.id; }));
    var validStops = new Set(operationalPlan.days.flatMap(function (day) { return day.stops.map(function (stop) { return stop.id; }); }));
    var validStopById = {};
    operationalPlan.days.forEach(function (day) {
      day.stops.forEach(function (stop) { validStopById[stop.id] = stop; });
    });
    var validSyntheticStops = new Set();
    operationalPlan.days.forEach(function (day) {
      var routePlan = routeOptionsByDay[day.id];
      (routePlan && routePlan.options || []).forEach(function (option) {
        validSyntheticStops.add('route-flex-' + day.id + '-' + routeOptionId(option));
      });
      if (mealFlexByDay[day.id]) {
        validSyntheticStops.add('meal-quick-' + day.id);
        validSyntheticStops.add('meal-experience-' + day.id);
      }
      day.stops.forEach(function (stop) {
        if (!isHotelStop(stop)) validSyntheticStops.add('rescue-' + stop.id);
      });
    });
    var validTasks = new Set(checklistTasks.map(function (item) { return item.id; }));
    if (validDays.has(imported.activeDate)) tripState.activeDate = imported.activeDate;
    if (imported.modes && typeof imported.modes === 'object') {
      Object.keys(imported.modes).forEach(function (key) {
        if (validDays.has(key) && ['preview', 'on-time', 'ahead30', 'ahead60', 'late30', 'late60'].indexOf(imported.modes[key]) !== -1) tripState.modes[key] = imported.modes[key];
      });
    }
    if (imported.stops && typeof imported.stops === 'object') {
      Object.keys(imported.stops).forEach(function (key) {
        var importedStatus = imported.stops[key];
        if (importedStatus === 'skipped' && validStopById[key] && isHotelStop(validStopById[key])) return;
        if ((validStops.has(key) || validSyntheticStops.has(key)) && ['pending', 'done', 'skipped'].indexOf(importedStatus) !== -1) tripState.stops[key] = importedStatus;
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
    if (imported.stopSwaps && typeof imported.stopSwaps === 'object') {
      var dayIdByStop = {};
      operationalPlan.days.forEach(function (day) {
        day.stops.forEach(function (stop) { dayIdByStop[stop.id] = day.id; });
      });
      Object.keys(imported.stopSwaps).forEach(function (key) {
        var swapDayId = dayIdByStop[key];
        if (!swapDayId || isHotelStop(validStopById[key])) return;
        if (planBRowById(swapDayId, imported.stopSwaps[key])) tripState.stopSwaps[key] = String(imported.stopSwaps[key]);
      });
    }
    if (imported.calmByDay && typeof imported.calmByDay === 'object') {
      Object.keys(imported.calmByDay).forEach(function (key) {
        if (!validDays.has(key) || !imported.calmByDay[key] || typeof imported.calmByDay[key] !== 'object') return;
        tripState.calmByDay[key] = imported.calmByDay[key];
        tripState.calmByDay[key] = calmDayState(dayById(key));
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
    renderPlanViews();
    renderChecklist();
    if (secondaryMounted.food) renderFoodContent();
    if (secondaryMounted.attractions) renderAttractionsContent();
  }

  function buildSyncCode() {
    var payload = JSON.stringify(serializableState(false));
    return 'PEITRIP3:' + btoa(unescape(encodeURIComponent(payload)));
  }

  function applySyncCode(code) {
    var raw = String(code || '').trim();
    var prefix = raw.indexOf('PEITRIP3:') === 0 ? 'PEITRIP3:' : raw.indexOf('PEITRIP2:') === 0 ? 'PEITRIP2:' : '';
    if (!prefix) throw new Error('Not a sync code');
    var json = decodeURIComponent(escape(atob(raw.slice(prefix.length))));
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
    renderPlanViews();
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
      '<details class="safety-details"><summary>Advanced · sync between phones</summary><div style="padding:0 13px 13px"><p class="small">Sync codes include private notes. Share only between your own phones.</p><div class="action-bar"><button type="button" class="button primary" id="copySyncCode">Copy sync code</button></div><label class="field-label" for="syncCodeInput">Paste code<textarea id="syncCodeInput" rows="3" placeholder="PEITRIP3:…"></textarea></label><div class="action-bar"><button type="button" class="button subtle" id="applySyncCode">Apply code</button></div><div id="syncStatus" class="status-line" role="status" aria-live="polite"></div></div></details>',
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
    window.__tripControlTest = {
      phase: tripPhase,
      durationRange: durationRange,
      defaultDate: defaultDate,
      dayStops: function (dayId) {
        return effectiveStops(dayById(dayId)).map(function (stop) {
          return {
            id: stop.id,
            title: stop.title,
            priority: stop.priority,
            flexSource: stop.flexSource || '',
            replacesStopId: stop.replacesStopId || '',
            choiceGated: Boolean(stop.choiceGated),
            routeEligible: stop.routeEligible !== false,
            city: stop.city || '',
            leg: stop.leg || '',
            pairedExperience: Boolean(stop.pairedExperience),
            hotel: isHotelStop(stop)
          };
        });
      },
      calmBank: function (dayId) { return Object.assign({}, calmBank(dayById(dayId))); },
      state: function () { return JSON.parse(JSON.stringify(tripState)); },
      serializable: function (redacted) { return JSON.parse(JSON.stringify(serializableState(Boolean(redacted)))); }
    };
    window.__tripControlBooted = true;
  }

  boot();
}());
