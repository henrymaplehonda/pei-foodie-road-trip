// Live itinerary override for Mon, Aug 17, 2026.
// Loaded after the core trip data and before app.js so the current road-trip
// plan can be revised without rewriting the full historical plan file.
window.TripData = window.TripData || {};

// Hopewell moved from Aug 19 to Aug 17. Keep the ticket/tide card aligned with
// the day the family will actually be there.
if (typeof window.TripData.ticketGuidance === 'function') {
  var aug17TicketBase = window.TripData.ticketGuidance;
  window.TripData.ticketGuidance = function (helpers) {
    var guidance = aug17TicketBase(helpers);
    if (guidance && guidance.hopewell) {
      guidance.hopewell = Object.assign({}, guidance.hopewell, {
        label: 'Low tide Mon Aug 17 · 10:20 AM',
        cta: 'Open Hopewell tickets',
        secondaryCta: 'Official CHS tide',
        secondaryUrl: 'https://www.tides.gc.ca/en/stations/00170',
        note: 'Canadian Hydrographic Service predicts low tide at Hopewell Cape at 10:20 AM ADT on Monday, Aug 17 (1.075 m). Target parking around 09:35–09:45 and follow park staff for actual ocean-floor access.',
        required: true
      });
    }
    return guidance;
  };
}

if (typeof window.TripData.stopPractical === 'function') {
  var aug17PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug17PracticalBase(helpers) || {};
    practical['d4-hopewell'] = {
      'Why / duration': 'Tomorrow’s tide anchor · arrive before the 10:20 AM low tide and spend about 75–95 minutes around the ocean-floor window.',
      'Timing': 'CHS: low 10:20 AM ADT at 1.075 m. Do not let breakfast or an optional stop delay the 07:00 departure.',
      'Family logistics': 'Closed-toe grippy footwear, wipes and a dry shoe/clothing backup in the car. Ocean-floor access remains at park staff discretion.',
      'Backup': 'If ocean-floor access is restricted, use the upper viewpoints and continue to Fundy rather than waiting out the tide.'
    };
    practical['d4-herring'] = {
      'Why / duration': 'Requested Fundy stop with a short family movement break · about 35–45 minutes.',
      'Map': 'Uses Henry’s exact shared Google Maps pin for Herring Cove Picnic Area.',
      'Family logistics': 'Washroom/picnic reset when available; keep the stop compact because Cape Jourimain facilities close at 5 PM.',
      'Backup': 'If running 30+ minutes late, make this a 15–20 minute scenic stop and skip any extra Fundy add-on.'
    };
    practical['d4-lobster'] = {
      'Cuisine / order': 'Fresh Alma lobster · whole lobster dinner/plate, lobster roll, chowder and Atlantic seafood.',
      'Timing': 'Restaurant lists Monday hours 12:00–19:30. Target 13:00 and leave around 14:00.',
      'Family logistics': '36 Shore Lane in Alma, right beside the Fundy route. Sit down if on time; switch to takeaway if the Cape Jourimain ETA approaches 16:30.',
      'Backup': 'Use the fish market/takeout counter rather than adding another restaurant detour.'
    };
    practical['d4-cape'] = {
      'Why / duration': 'Confederation Bridge viewpoint, observation tower and a short nature-centre stop · 30–40 minutes.',
      'Hours': 'Facilities are open Monday 10:00–17:00. Outdoor areas remain accessible beyond building hours, but the plan targets arrival before 16:20.',
      'Family logistics': 'Use the shortest trail/viewpoint combination and bring insect repellent.',
      'Backup': 'If arrival slips past 16:30, prioritize washroom + observation/bridge view and leave the longer trail for another trip.'
    };
    practical['d6-lunch'] = {
      'Cuisine / order': 'Easy Moncton sit-down lunch after leaving PEI · Italian-American pasta, grilled dishes and child-friendly options.',
      'Timing': 'Target about 11:45–12:45 on Wed Aug 19.',
      'Family logistics': 'No tide clock anymore. Eat properly, then use the hotel/pool as the recovery block.',
      'Backup': 'Use another nearby Moncton sit-down restaurant rather than driving back toward Hopewell.'
    };
    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug17PlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug17PlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers) return plan;

    var makeDay = helpers.makeDay;
    var customStop = helpers.customStop;
    var sourceStop = helpers.sourceStop;
    var foodStop = helpers.foodStop;
    var mealSlot = helpers.mealSlot;
    var mapSearchUrl = helpers.mapSearchUrl;

    plan.generatedOn = '2026-08-16';
    plan.tidePlan = {
      date: '2026-08-17',
      timeZone: 'America/Moncton',
      status: 'CHS prediction confirmed Aug 16; actual ocean-floor access remains at Hopewell Rocks staff discretion',
      verifyAfter: '2026-08-16',
      parkHours: 'Check the park notice in the morning before departure',
      tides: 'Aug 17 (ADT): high 3:49 AM (12.695 m) · low 10:20 AM (1.075 m) · high 4:12 PM (12.495 m) · low 10:44 PM (1.326 m)',
      accessWindow: 'Target Hopewell parking 09:35–09:45 and the ocean-floor access area before the 10:20 AM low tide; follow staff instructions for the actual safe window.',
      sourceUrl: 'https://www.parcsnbparks.info/en/parks/33/hopewell-rocks-provincial-park',
      chsUrl: 'https://www.tides.gc.ca/en/stations/00170',
      arrivalBufferMin: 35,
      minimumVisitMin: 75
    };

    var aug17Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-17'; });
    if (aug17Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug17Index] = makeDay({
        id: '2026-08-17',
        label: 'Mon, Aug 17, 2026',
        mainActivity: 'Hopewell Rocks at low tide + Fundy National Park / Herring Cove',
        optionalActivity: 'One extra Fundy viewpoint only if the Cape Jourimain ETA remains before 16:20',
        downtime: 'Hotel recovery after arrival in Charlottetown; no required evening sightseeing',
        rainPlan: 'Light rain: keep Hopewell and Herring Cove with grippy footwear. Thunder, closure or unsafe ocean-floor access: use Hopewell upper viewpoints, shorten Fundy and protect Cape Jourimain.',
        parentWarning: 'This is a tide-and-closing-time day. Hopewell 10:20 AM low tide and Cape Jourimain 5 PM facility closing are the two clocks that matter.',
        routeFocus: 'Delta Fredericton → Hopewell Rocks → Fundy / Herring Cove → Alma lobster → Cape Jourimain → Hampton Charlottetown',
        driveKm: 460,
        pureDriveTime: 'About 6 h before attraction, meal and parking time',
        risk: 'High',
        lateThresholdMin: 20,
        wakeTime: '05:45–06:00',
        departTarget: '07:00 wheels moving',
        driverPlan: 'Two-driver day. Driver 1 handles Fredericton to Hopewell; swap after Hopewell or Alma so the second adult is fresh for the Cape Jourimain / bridge / PEI finish.',
        timeZoneNote: 'All times are Atlantic Time (America/Moncton).',
        contingency: 'If Hopewell departure slips past 11:15, shorten Herring Cove to 20 minutes. If Alma departure would be later than 14:10, order lobster takeaway. Protect a Cape Jourimain arrival before about 16:20.',
        emergency: 'If Cape Jourimain ETA moves past 16:45, skip the longer trail and use only the observation/bridge-view stop. If fatigue becomes the issue, skip Cape entirely and go directly to Hampton.',
        stops: [
          customStop({
            id: 'd4-depart', dayId: '2026-08-17', time: '07:00', zone: 'AT',
            title: 'Depart Delta Hotels Fredericton', locationName: 'Delta Hotels Fredericton',
            kind: 'Start / hotel checkout', priority: 'required',
            address: '225 Woodstock Rd, Fredericton, NB E3B 2H8', city: 'Fredericton, NB',
            timeBudget: '0 min',
            notes: 'Eat early, finish checkout by 06:50 and make 07:00 the real wheels-moving time. Tomorrow’s Hopewell low tide is 10:20 AM, so do not add a Fredericton morning stop.',
            food: 'Hotel breakfast if it can be completed before 06:50; otherwise use a packed/grab-and-go breakfast.',
            mapUrl: 'https://maps.app.goo.gl/P7NLcXRCMEoksM1Q8?g_st=ac',
            sourceUrl: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/overview/'
          }),
          customStop({
            id: 'd4-hopewell', dayId: '2026-08-17', time: '09:35–11:05 · low tide 10:20', zone: 'AT',
            title: 'Hopewell Rocks — low-tide ocean floor', locationName: 'Hopewell Rocks Provincial Park',
            kind: 'Tide-dependent attraction', priority: 'required',
            address: '131 Discovery Rd, Hopewell Cape, NB E4H 4Z5', city: 'Hopewell Cape, NB',
            leg: 'Roughly 2.5 h from Fredericton; verify live navigation at departure', timeBudget: '75-95 min',
            notes: 'CHS predicts low tide at 10:20 AM ADT, height 1.075 m. Target parking 09:35–09:45. Head to the ocean-floor access area first, then use upper viewpoints on the way out. Staff instructions override the schedule.',
            food: 'Water/snack only. Save the proper seafood meal for Alma.',
            kidPlan: 'Closed-toe grippy shoes, wipes and dry backup shoes/clothes in the car.',
            mapUrl: mapSearchUrl('Hopewell Rocks main visitor parking, 131 Discovery Rd, Hopewell Cape, NB E4H 4Z5'),
            sourceUrl: 'https://www.tides.gc.ca/en/stations/00170'
          }),
          customStop({
            id: 'd4-herring', dayId: '2026-08-17', time: '11:50–12:35', zone: 'AT',
            title: 'Fundy National Park — Herring Cove Picnic Area', locationName: 'Herring Cove Picnic Area',
            kind: 'Fundy scenic stop / family stretch', priority: 'required', replaceable: true,
            address: 'Herring Cove Picnic Area, Alma Parish, NB E4H 4Y9', city: 'Fundy National Park, NB',
            leg: 'About 45–55 min from Hopewell; verify live navigation', timeBudget: '35-45 min',
            notes: 'This is Henry’s exact saved Google Maps stop. Enjoy the cove/picnic area and keep the visit compact. Add another Fundy viewpoint only if the live Cape Jourimain ETA remains safely before 16:20.',
            food: 'Snack/water only; lobster lunch is next in Alma.',
            kidPlan: 'Bathroom/stretch when facilities are available; stay close around coastal edges.',
            mapUrl: 'https://maps.app.goo.gl/LBFmXGhehvxG7jDp6?g_st=ac',
            sourceUrl: 'https://parks.canada.ca/pn-np/nb/fundy'
          }),
          customStop({
            id: 'd4-lobster', dayId: '2026-08-17', time: '13:00–14:00 · leave by 14:10', zone: 'AT',
            title: 'Lobster lunch: Alma Lobster Shop', locationName: 'Alma Lobster Shop',
            kind: 'Lunch / fresh lobster', priority: 'required',
            address: '36 Shore Lane, Alma, NB E4H 1L1', city: 'Alma, NB',
            timeBudget: '50-65 min',
            notes: 'Current official site lists Monday hours 12:00–19:30. This is the route-efficient lobster meal: whole lobster, lobster roll, chowder and Atlantic seafood. Aim to leave by 14:00–14:10 so Cape Jourimain does not become a race.',
            food: 'Whole lobster is the signature choice; lobster roll/chowder are quicker alternatives.',
            kidPlan: 'Proper seated reset after Hopewell/Fundy. Use takeaway if service is slow.',
            mapUrl: mapSearchUrl('Alma Lobster Shop, 36 Shore Lane, Alma, NB E4H 1L1'),
            sourceUrl: 'https://www.almalobster.live/'
          }),
          customStop({
            id: 'd4-cape', dayId: '2026-08-17', time: '16:15–16:50 target', zone: 'AT',
            title: 'Cape Jourimain Nature Centre', locationName: 'Cape Jourimain Nature Centre',
            kind: 'Nature centre / Confederation Bridge viewpoint', priority: 'required', replaceable: true,
            address: '5039 Route 16, Bayfield, NB E4M 3Z8', city: 'Bayfield, NB',
            timeBudget: '30-40 min',
            notes: 'Facilities are open Monday 10:00–17:00. Prioritize the observation tower / Confederation Bridge view and a short trail. Do not start a long trail near closing.',
            food: 'Snack only; lobster lunch was in Alma.',
            kidPlan: 'Short movement break before the bridge crossing; bring insect repellent.',
            mapUrl: mapSearchUrl('Cape Jourimain Nature Centre visitor parking, 5039 Route 16, Bayfield, NB E4M 3Z8'),
            sourceUrl: 'https://www.capejourimain.ca/'
          }),
          customStop({
            id: 'd4-hotel', dayId: '2026-08-17', time: '17:45–18:15 target', zone: 'AT',
            title: 'Arrive: Hampton Inn & Suites Charlottetown', locationName: 'Hampton Inn & Suites Charlottetown',
            kind: 'Hotel / finish', priority: 'required',
            address: '300 Capital Drive, Charlottetown, PE C1E 1E8', city: 'Charlottetown, PE',
            leg: 'About 55–65 min from Cape Jourimain including the Confederation Bridge', timeBudget: 'Rest of evening',
            notes: 'Final destination. Check in, unload and make the evening intentionally easy. No downtown outing is required after this full day.',
            food: 'Light dinner/snack near Capital Drive only if hungry after the lobster lunch.',
            kidPlan: 'Pool only if energy and posted hours fit; otherwise room reset and bedtime.',
            mapUrl: mapSearchUrl('Hampton Inn & Suites Charlottetown, 300 Capital Drive, Charlottetown, PE C1E 1E8'),
            sourceUrl: 'https://www.hilton.com/en/hotels/yqmchhx-hampton-suites-charlottetown/'
          })
        ],
        meals: [
          mealSlot({ id: 'd4-breakfast', meal: 'Breakfast', title: 'Early Delta breakfast / grab-and-go', selectedStopId: 'd4-depart', backup: 'Packed breakfast so the 07:00 departure stays protected.' }),
          mealSlot({ id: 'd4-lunch', meal: 'Lunch', title: 'Alma Lobster Shop', selectedStopId: 'd4-lobster', backup: 'Use Alma Lobster Shop takeout/fish-market service if table service threatens the Cape timing.' }),
          mealSlot({ id: 'd4-dinner', meal: 'Dinner', title: 'Light flexible dinner near Hampton', selectedStopId: 'd4-hotel', backup: 'Delivery/takeout to the hotel; no extra sightseeing drive required.', conditional: true })
        ]
      });
    }

    // Hopewell is now completed on Aug 17, so Aug 19 becomes a deliberately
    // easier PEI-to-Moncton transfer day instead of repeating the same park.
    var aug19Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-19'; });
    if (aug19Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug19Index] = makeDay({
        id: '2026-08-19',
        label: 'Wed, Aug 19, 2026',
        mainActivity: 'Easy PEI → Moncton transfer and hotel recovery',
        optionalActivity: 'Sackville Waterfowl Park or Magnetic Hill · choose based on energy',
        downtime: 'Long hotel/pool recovery block before dinner',
        rainPlan: 'Skip the outdoor boardwalk and go directly to Moncton for lunch, hotel and pool.',
        parentWarning: 'Hopewell is already done on Aug 17. Do not accidentally drive back there because an old saved plan says Aug 19.',
        routeFocus: 'Charlottetown → Confederation Bridge → Sackville → Moncton',
        driveKm: 190,
        pureDriveTime: 'About 2.5 h before stops',
        risk: 'Low-Medium',
        lateThresholdMin: 45,
        wakeTime: '07:00',
        departTarget: '09:00 wheels moving',
        driverPlan: 'Easy shared-driving day. Use the off-duty adult for hotel/check-in and kid logistics rather than a strict driver rotation.',
        timeZoneNote: 'All times are Atlantic Time (America/Moncton).',
        contingency: 'Skip Sackville first if everyone wants a slower morning. Magnetic Hill is optional and never more important than hotel recovery.',
        emergency: 'Go straight to Best Western Plus Moncton, eat nearby and use the pool/rest block.',
        stops: [
          customStop({ id: 'd6-depart', dayId: '2026-08-19', time: '09:00', zone: 'AT', title: 'Depart Charlottetown after a slow breakfast', kind: 'Start / hotel checkout', priority: 'required', address: '20 Capital Drive, Charlottetown, PE C1E 1E7', city: 'Charlottetown, PE', notes: 'Hopewell is already complete. Enjoy breakfast, pack calmly and leave around 09:00.', food: 'Included hotel breakfast if available.', mapUrl: mapSearchUrl('20 Capital Drive, Charlottetown, PE C1E 1E7'), sourceUrl: 'https://cbvipei.ca/' }),
          customStop({ id: 'd6-bridge', dayId: '2026-08-19', time: '09:50–10:05', zone: 'AT', title: 'Confederation Bridge crossing', kind: 'Drive', priority: 'required', address: 'Confederation Bridge, Borden-Carleton, PE', city: 'Borden-Carleton, PE', notes: 'Cross toward New Brunswick and check live bridge status before leaving Charlottetown.', mapUrl: mapSearchUrl('Confederation Bridge, Borden-Carleton, PE'), sourceUrl: 'https://www.confederationbridge.com/' }),
          customStop({ id: 'd6-sackville-rest', dayId: '2026-08-19', time: '10:45–11:15 optional', zone: 'AT', title: 'Sackville Waterfowl Park — optional stretch', locationName: 'Sackville Waterfowl Park & Tantramar Visitor Information Centre', kind: 'Optional boardwalk / washroom', priority: 'optional', address: '34 Mallard Drive, Sackville, NB E4L 4C3', city: 'Sackville, NB', timeBudget: '20-30 min', notes: 'Use this only if everyone wants a walk. Otherwise continue to Moncton and enjoy the easier day.', mapUrl: mapSearchUrl('Tantramar Visitor Information Centre, 34 Mallard Drive, Sackville, NB E4L 4C3'), sourceUrl: 'https://tourismnewbrunswick.ca/listing/sackville-waterfowl-park' }),
          customStop({ id: 'd6-lunch', dayId: '2026-08-19', time: '11:45–12:45', zone: 'AT', title: 'Proper lunch: Carrabba’s Italian Grill Moncton', locationName: 'Carrabba’s Italian Grill Moncton', kind: 'Lunch / seated restaurant', priority: 'required', address: '1000 Main St, Moncton, NB E1C 1G9', city: 'Moncton, NB', timeBudget: '50-60 min', notes: 'A relaxed sit-down lunch replaces the old Hopewell lunch. No tide clock today.', food: 'Pasta, grilled mains and family-friendly Italian-American choices.', mapUrl: mapSearchUrl('Carrabba’s Italian Grill, 1000 Main St, Moncton, NB E1C 1G9') }),
          customStop({ id: 'd6-magnetic', dayId: '2026-08-19', time: '13:15 optional', zone: 'AT', title: 'Magnetic Hill Illusion — optional', locationName: 'Magnetic Hill Illusion', kind: 'Optional attraction', priority: 'optional', conditional: true, choiceGated: true, address: '2846 Mountain Road, Moncton, NB E1G 2W7', city: 'Moncton, NB', timeBudget: '20-30 min', notes: 'Only if the gate is operating and the child wants it. Skip it for an earlier hotel/pool reset.', mapUrl: mapSearchUrl('Magnetic Hill Illusion, 2846 Mountain Road, Moncton, NB E1G 2W7'), sourceUrl: 'https://www.moncton.ca/en/magnetic-hill-illusion' }),
          customStop({ id: 'd6-hotel', dayId: '2026-08-19', time: '14:15–15:00 early-arrival target', zone: 'AT', title: 'Best Western Plus Moncton — recovery block', locationName: 'Best Western Plus Moncton', kind: 'Hotel / pool / rest', priority: 'required', address: '300 Lewisville Road, Moncton, NB E1A 5Y4', city: 'Moncton, NB', timeBudget: '2.5-3 h', notes: 'Ask for early room access; otherwise use the lobby/pool only as hotel policy allows and keep the afternoon low-effort.', food: 'No extra food stop needed after lunch.', kidPlan: 'Pool/rest is the main afternoon activity.', mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Road, Moncton, NB E1A 5Y4') }),
          foodStop('2026-08-19', 'tide-boar-gastropub', { id: 'd6-dinner', time: '18:00', zone: 'AT', kind: 'Dinner', priority: 'required', notes: 'Relaxed dinner after the hotel recovery block. No tide-related rush.' }),
          customStop({ id: 'd6-return', dayId: '2026-08-19', time: '19:30–19:45', zone: 'AT', title: 'Return to Best Western Plus Moncton', kind: 'Hotel return / sleep', priority: 'required', address: '300 Lewisville Road, Moncton, NB E1A 5Y4', city: 'Moncton, NB', notes: 'Return directly after dinner and prepare for the next driving day.', mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Road, Moncton, NB E1A 5Y4') })
        ],
        meals: [
          mealSlot({ id: 'd6-breakfast', meal: 'Breakfast', title: 'Slow Charlottetown hotel breakfast', selectedStopId: 'd6-depart', backup: 'Nearby quick breakfast before the 09:00 departure.' }),
          mealSlot({ id: 'd6-lunch', meal: 'Lunch', title: 'Carrabba’s Italian Grill Moncton', selectedStopId: 'd6-lunch', backup: 'Another nearby Moncton sit-down restaurant.' }),
          mealSlot({ id: 'd6-dinner', meal: 'Dinner', title: 'Tide & Boar — 6:00 PM', selectedStopId: 'd6-dinner', backup: 'Hotel-area dinner if everyone is tired.', reserve: 'Book around 6:00 PM if desired' })
        ]
      });
    }

    return plan;
  };
}
