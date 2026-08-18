// Live itinerary override for Tue, Aug 18, 2026.
// Keeps tomorrow's plan aligned with the family's current Charlottetown base
// and the stops chosen during the trip, without rewriting the historical plan.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug18PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug18PracticalBase(helpers) || {};

    practical['d5-tea-hill'] = {
      'Why / duration': 'Low-tide family beach exploration close to Charlottetown · about 90–120 minutes.',
      'Timing': 'Charlottetown CHS prediction bottoms out around 09:44–09:46 ADT on Tue Aug 18. Aim to be on the beach around 09:00 so the family sees the flats before, during and just after low tide.',
      'Family logistics': 'Wear shoes that can get wet or muddy. Bring wipes, a change of socks/shoes, bug spray and close supervision for the 6-year-old around tidal pools.',
      'Backup': 'If weather is poor, shorten Tea Hill rather than moving the whole day later; Point Prim lunch opens at noon.'
    };

    practical['d5-point-prim-lunch'] = {
      'Cuisine / order': 'Oceanfront PEI seafood · chowder, lobster rolls, oysters and other local seafood.',
      'Timing': 'Current Tuesday hours are 12:00–18:00. Target lunch around noon to 13:15.',
      'Family logistics': 'The Chowderhouse is beside the lighthouse, so park once and make lunch + lighthouse one combined stop.',
      'Backup': 'If the outdoor seating is uncomfortable because of wind/rain, use the quickest available seafood option and keep the lighthouse visit short.'
    };

    practical['d5-point-prim'] = {
      'Why / duration': 'PEI’s oldest lighthouse plus Northumberland Strait views · about 35–50 minutes.',
      'Timing': 'Current Tuesday hours are 10:00–18:00, so it fits naturally immediately after lunch.',
      'Family logistics': 'The tower climb has steep stairs; the grounds and coastal views still work if the child does not want to climb.',
      'Backup': 'Use the grounds/photo stop only if everyone is tired after lunch.'
    };

    practical['d5-shared-trail'] = {
      'Why / duration': 'Nature-trail finish selected during the trip · target about 60–90 minutes depending on child energy.',
      'Map': 'Use Henry’s exact shared Google Maps pin. The saved pin is authoritative for this stop.',
      'Family logistics': 'Bring water, bug spray and footwear with grip. Turn around early rather than forcing a full loop with a tired 6-year-old.',
      'Driving guardrail': 'Keep the whole day at or below about 3 hours of actual driving. Check the live Google Maps round-trip ETA before leaving Point Prim and shorten the trail visit if traffic or the pin location pushes the day over that limit.'
    };

    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug18PlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug18PlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers) return plan;

    var makeDay = helpers.makeDay;
    var customStop = helpers.customStop;
    var mealSlot = helpers.mealSlot;
    var mapSearchUrl = helpers.mapSearchUrl;

    plan.generatedOn = '2026-08-17';

    var aug18Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-18'; });
    if (aug18Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug18Index] = makeDay({
        id: '2026-08-18',
        label: 'Tue, Aug 18, 2026',
        mainActivity: 'Tea Hill low tide + Point Prim seafood/lighthouse + nature trail',
        optionalActivity: 'No extra attraction stack — use any spare energy for a longer trail walk or hotel pool',
        downtime: 'Return to Hampton Inn & Suites Charlottetown in the late afternoon; keep dinner flexible',
        rainPlan: 'Light rain: keep Tea Hill short, eat at Point Prim and use the lighthouse grounds. Heavy rain/thunder: skip the trail and return to Hampton early.',
        parentWarning: 'The day is intentionally simple. Tea Hill low tide is the morning anchor; the 3-hour total-driving ceiling is the afternoon guardrail.',
        routeFocus: 'Hampton Charlottetown → Tea Hill Park & Beach → Point Prim Chowderhouse → Point Prim Lighthouse → shared nature-trail pin → Hampton Charlottetown',
        driveKm: 180,
        pureDriveTime: 'Target ≤3 h total driving; verify the exact shared trail pin and live traffic in Google Maps before leaving Point Prim',
        risk: 'Low-Medium',
        lateThresholdMin: 30,
        wakeTime: '07:15–07:30',
        departTarget: '08:35 wheels moving',
        driverPlan: 'Easy family day. One driver can handle it, with the second adult free for navigation, snacks and kid logistics.',
        timeZoneNote: 'All times are Atlantic Time (ADT).',
        contingency: 'If Tea Hill runs long, keep lunch at Point Prim near noon and shorten the lighthouse to a grounds/photo stop. Before the trail, check the live round-trip drive time; protect the 3-hour driving cap.',
        emergency: 'Skip the trail first. Point Prim is already a complete coastal outing, so returning directly to Hampton is always the low-stress fallback.',
        stops: [
          customStop({
            id: 'd5-depart', dayId: '2026-08-18', time: '08:35', zone: 'ADT',
            title: 'Depart Hampton Inn & Suites Charlottetown', locationName: 'Hampton Inn & Suites Charlottetown',
            kind: 'Start / hotel', priority: 'required',
            address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE',
            timeBudget: '0 min',
            notes: 'Eat breakfast at the hotel, pack beach shoes and leave around 08:35. There is no hotel switch in today’s Plan A.',
            food: 'Hotel breakfast before departure.',
            kidPlan: 'Use the washroom before leaving and keep the beach change-of-shoes bag easy to reach.',
            mapUrl: mapSearchUrl('Hampton Inn & Suites Charlottetown, 300 Capital Drive, Charlottetown, PE C1E 1E8'),
            sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/'
          }),
          customStop({
            id: 'd5-tea-hill', dayId: '2026-08-18', time: '09:00–11:00 · low around 09:45', zone: 'ADT',
            title: 'Tea Hill Park & Beach — low-tide morning', locationName: 'Tea Hill Park & Beach',
            kind: 'Beach / tidal nature exploration', priority: 'required',
            address: '492 Keppoch Rd, Stratford, PE C1B 2J8', city: 'Stratford, PE',
            leg: 'Short drive from Hampton; verify live navigation', timeBudget: '90-120 min',
            notes: 'CHS Charlottetown predictions put the Aug 18 low around 09:44–09:46 ADT at roughly 0.714 m. Explore the tidal flats and shallow pools rather than treating this as a conventional swimming beach.',
            food: 'Water and a light snack only; save appetite for Point Prim seafood.',
            kidPlan: 'Shoes that can get muddy, wipes and backup socks/shoes. Stay close around tidal pools.',
            mapUrl: mapSearchUrl('Tea Hill Park & Beach, 492 Keppoch Rd, Stratford, PE C1B 2J8'),
            sourceUrl: 'https://www.tides.gc.ca/en/stations/1700'
          }),
          customStop({
            id: 'd5-point-prim-lunch', dayId: '2026-08-18', time: '12:00–13:15', zone: 'ADT',
            title: 'Seafood lunch: Point Prim Chowderhouse', locationName: 'Point Prim Chowderhouse',
            kind: 'Lunch / seafood', priority: 'required',
            address: '2150 Point Prim Rd, Belfast, PE C0A 1A0', city: 'Belfast, PE',
            leg: 'Scenic drive from Tea Hill; verify live navigation', timeBudget: '60-75 min',
            notes: 'Current Tuesday hours are 12:00–18:00. Keep this as the proper sit-down/reset block before the lighthouse and trail.',
            food: 'Seafood chowder, lobster roll or another local seafood choice. Outdoor/oceanfront setting is part of the stop.',
            kidPlan: 'Good time for a washroom and seated reset before the lighthouse.',
            mapUrl: mapSearchUrl('Point Prim Chowderhouse, 2150 Point Prim Rd, Belfast, PE C0A 1A0'),
            sourceUrl: 'https://www.chowderhouse.online/'
          }),
          customStop({
            id: 'd5-point-prim', dayId: '2026-08-18', time: '13:15–14:00', zone: 'ADT',
            title: 'Point Prim Lighthouse', locationName: 'Point Prim Lighthouse',
            kind: 'Lighthouse / coastal walk', priority: 'required',
            address: '2147 Point Prim Rd, Belfast, PE C0A 1A0', city: 'Belfast, PE',
            timeBudget: '35-50 min',
            notes: 'The lighthouse is beside lunch. Current Tuesday hours are 10:00–18:00. Walk the grounds and climb only if everyone wants to.',
            kidPlan: 'Steep tower stairs; the grounds and shoreline are the easy alternative.',
            mapUrl: mapSearchUrl('Point Prim Lighthouse, 2147 Point Prim Rd, Belfast, PE C0A 1A0'),
            sourceUrl: 'https://pointprimlighthouse.com/'
          }),
          customStop({
            id: 'd5-shared-trail', dayId: '2026-08-18', time: '14:30–16:00 target', zone: 'ADT',
            title: 'Nature trail — shared Google Maps pin', locationName: 'Nature trail — shared Google Maps pin',
            kind: 'Nature trail / family hike', priority: 'required',
            timeBudget: '60-90 min',
            notes: 'This is the exact Google Maps location added during the trip. Before leaving Point Prim, open the pin and check the live route so the full day remains within the approximately 3-hour driving limit.',
            food: 'Bring water and a small snack.',
            kidPlan: 'Treat 60 minutes as enough. Turn around early if the 6-year-old is tiring; do not chase a full loop just to finish it.',
            mapUrl: 'https://maps.app.goo.gl/dzgdYE5bV4ChKMyU6?g_st=ac',
            sourceUrl: 'https://maps.app.goo.gl/dzgdYE5bV4ChKMyU6?g_st=ac'
          }),
          customStop({
            id: 'd5-return', dayId: '2026-08-18', time: '16:45–17:30 target', zone: 'ADT',
            title: 'Return to Hampton Inn & Suites Charlottetown', locationName: 'Hampton Inn & Suites Charlottetown',
            kind: 'Hotel return / rest', priority: 'required',
            address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE',
            notes: 'Return to Hampton, shower/change after the beach and trail, then decide on dinner based on energy. No mandatory evening sightseeing.',
            kidPlan: 'Pool/rest if energy remains; otherwise make the evening quiet.',
            mapUrl: mapSearchUrl('Hampton Inn & Suites Charlottetown, 300 Capital Drive, Charlottetown, PE C1E 1E8'),
            sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/'
          })
        ],
        meals: [
          mealSlot({ id: 'd5-breakfast', meal: 'Breakfast', title: 'Hampton hotel breakfast', selectedStopId: 'd5-depart', backup: 'Quick nearby breakfast only if hotel breakfast does not work.' }),
          mealSlot({ id: 'd5-lunch', meal: 'Lunch', title: 'Point Prim Chowderhouse', selectedStopId: 'd5-point-prim-lunch', backup: 'Use another nearby Belfast/Point Prim seafood option only if the Chowderhouse is unexpectedly unavailable.' }),
          mealSlot({ id: 'd5-dinner', meal: 'Dinner', title: 'Flexible Charlottetown dinner after hotel reset', selectedStopId: 'd5-return', backup: 'Takeout near Hampton if the family is tired.', conditional: true })
        ]
      });
    }

    return plan;
  };
}
