// Live itinerary override for Fri, Aug 21, 2026.
// Final-day rule: get home to Vaughan efficiently, but never drive more than
// 2 hours continuously. No attractions, downtowns, shopping or restaurant detours.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug21PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug21PracticalBase(helpers) || {};

    practical['d8-hurons'] = {
      'Why / duration': 'First safety break on the A20 corridor · target 10–15 minutes only.',
      'Safety rule': 'Do not stretch the first driving segment beyond 2 hours. At about 1 h 45 min, start looking for the next safe rest area even if traffic changed the planned timing.',
      'Family logistics': 'Washroom, quick walk, water, driver swap if useful. No attraction or meal detour.'
    };

    practical['d8-riviere-beaudette'] = {
      'Why / duration': 'Second highway-only reset before Ontario · target 10–15 minutes.',
      'Services': 'Québec 511 lists this as a full A20 service area with washrooms, fuel and food, so everything can be handled without leaving the route.',
      'Safety rule': 'If Montréal/A30 traffic makes this more than 2 hours from the previous stop, use the first safe service/rest area before the 2-hour mark instead.'
    };

    practical['d8-mallorytown'] = {
      'Why / duration': 'Main westbound 401 break · 20–30 minutes for lunch, fuel, washroom and driver reset.',
      'Services': 'ONroute Mallorytown North is directly on westbound Highway 401 and open 24/7 with fuel, washrooms and quick food.',
      'Safety rule': 'This is not a sightseeing stop. Eat quickly, switch drivers if useful and continue only when alert.'
    };

    practical['d8-trenton'] = {
      'Why / duration': 'Final planned westbound 401 safety break · target 10–15 minutes.',
      'Services': 'ONroute Trenton North is directly on westbound Highway 401 and open 24/7 with fuel, washrooms and quick food.',
      'Safety rule': 'After this stop, continue toward Vaughan. If GTA traffic pushes the final segment toward 2 hours, stop earlier at the next safe highway facility.'
    };

    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug21PlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug21PlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers) return plan;

    var makeDay = helpers.makeDay;
    var customStop = helpers.customStop;
    var mealSlot = helpers.mealSlot;
    var mapSearchUrl = helpers.mapSearchUrl;

    plan.generatedOn = '2026-08-18';

    var aug21Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-21'; });
    if (aug21Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug21Index] = makeDay({
        id: '2026-08-21',
        label: 'Fri, Aug 21, 2026',
        mainActivity: 'Go home safely and efficiently: Québec City → Vaughan',
        optionalActivity: 'None — no attractions, shopping, downtowns or restaurant detours',
        downtime: 'Only highway rest/fuel/food stops required for safety',
        rainPlan: 'Same route. Slow down for conditions and shorten each driving segment if visibility or fatigue worsens.',
        parentWarning: 'Hard rule: maximum 2 hours of continuous driving. At 1 h 45 min, start looking for the next safe stop. If tired sooner, stop sooner. Arrival time never overrides fatigue.',
        routeFocus: 'DoubleTree Quebec Resort → A20 rest stop near Drummondville → Aire de service de Rivière-Beaudette → ONroute Mallorytown North → ONroute Trenton North → Vaughan',
        driveKm: 810,
        pureDriveTime: 'About 8 hours before breaks in normal conditions; live Google Maps traffic is the source of truth',
        risk: 'Medium',
        lateThresholdMin: 0,
        wakeTime: '05:15',
        departTarget: '06:30 EDT wheels moving',
        driverPlan: 'Two-driver safety pattern. No one drives more than 2 hours continuously. Swap at any break when useful. At 1 h 45 min, begin choosing the next safe stop; if either adult feels tired sooner, stop immediately at the next safe facility.',
        timeZoneNote: 'All times are Eastern Daylight Time (EDT).',
        contingency: 'Use the shared Google Maps route and live traffic. Planned stops are anchors, not obligations: if traffic makes the next anchor more than 2 hours away, stop at the first safe highway rest/service area before the 2-hour mark. If a planned stop is unnecessary but another safe stop already satisfied the break rule, continue.',
        emergency: 'Fatigue beats the schedule. Pull into a safe rest/service area, switch drivers or nap. Do not use coffee, music or an open window as substitutes for rest.',
        stops: [
          customStop({
            id: 'd8-depart', dayId: '2026-08-21', time: '06:30', zone: 'EDT',
            title: 'Depart DoubleTree by Hilton Quebec Resort',
            locationName: 'DoubleTree by Hilton Quebec Resort',
            kind: 'Start / hotel', priority: 'required',
            address: '7900 Rue du Marigot, Québec, QC G1G 6T8', city: 'Québec City, QC',
            timeBudget: '0 min',
            notes: 'Breakfast, checkout, full/healthy fuel level and washroom before 06:30. Open Henry’s shared Google Maps route before moving. No sightseeing today.',
            food: 'Breakfast before departure or grab-and-go if needed.',
            kidPlan: 'Washroom before leaving; keep water and simple snacks accessible.',
            mapUrl: mapSearchUrl('DoubleTree by Hilton Quebec Resort, 7900 Rue du Marigot, Québec, QC G1G 6T8'),
            sourceUrl: 'https://maps.app.goo.gl/sQht9QeTxt6jXHPQ9?g_st=ac'
          }),
          customStop({
            id: 'd8-hurons', dayId: '2026-08-21', time: '≈08:00–08:15 target', zone: 'EDT',
            title: 'A20 safety break — Drummondville corridor',
            locationName: 'Halte des Hurons',
            kind: 'Highway rest area / washroom / stretch', priority: 'required',
            city: 'Drummondville area, QC',
            timeBudget: '10-15 min',
            notes: 'First short safety reset. Stay on the A20 corridor. Washroom, walk, water and driver swap only if useful. No attraction detour. If live traffic puts another safe A20 rest area at a better 1 h 30–1 h 50 interval, use that instead.',
            food: 'Snack only if needed.',
            kidPlan: 'Quick out-of-car movement and washroom.',
            mapUrl: mapSearchUrl('Halte des Hurons, Autoroute 20, Québec'),
            sourceUrl: 'https://www.quebec511.info/en/diffusion/haltes/route.aspx?id=20'
          }),
          customStop({
            id: 'd8-riviere-beaudette', dayId: '2026-08-21', time: '≈10:00–10:15 target', zone: 'EDT',
            title: 'Aire de service de Rivière-Beaudette — quick reset',
            locationName: 'Aire de service de Rivière-Beaudette',
            kind: 'Highway service area / washroom / fuel', priority: 'required',
            city: 'Rivière-Beaudette, QC',
            timeBudget: '10-15 min',
            notes: 'Full A20 service area. Use washroom, stretch and fuel only if useful. If Montréal/A30 traffic would make this more than 2 hours from the previous break, stop at an earlier safe rest/service area before the 2-hour mark.',
            food: 'Grab-and-go only; save the main food break for Mallorytown unless hungry now.',
            kidPlan: 'Short reset; no wandering around or attraction time.',
            mapUrl: mapSearchUrl('Aire de service de Rivière-Beaudette, Québec'),
            sourceUrl: 'https://www.quebec511.info/en/diffusion/haltes/route.aspx?id=20'
          }),
          customStop({
            id: 'd8-mallorytown', dayId: '2026-08-21', time: '≈11:30–12:00 target', zone: 'EDT',
            title: 'ONroute Mallorytown North — main lunch/fuel break',
            locationName: 'ONroute Mallorytown North',
            kind: 'Highway service centre / lunch / fuel / driver reset', priority: 'required',
            address: '678 Highway 401 Westbound, Mallorytown, ON K0E 1R0', city: 'Mallorytown, ON',
            timeBudget: '20-30 min',
            notes: 'Directly on westbound 401 and open 24/7. This is the longest planned stop: washroom, quick food, fuel if needed and driver swap. No exit-town restaurant detour.',
            food: 'Use the quickest on-site option that works for the family.',
            kidPlan: 'Proper out-of-car reset before the next 401 segment.',
            mapUrl: mapSearchUrl('ONroute Mallorytown North, 678 Highway 401 Westbound, Mallorytown, ON K0E 1R0'),
            sourceUrl: 'https://www.onroute.ca/locations/mallorytown-north'
          }),
          customStop({
            id: 'd8-trenton', dayId: '2026-08-21', time: '≈13:30–14:00 target', zone: 'EDT',
            title: 'ONroute Trenton North — final planned safety break',
            locationName: 'ONroute Trenton North',
            kind: 'Highway service centre / washroom / stretch', priority: 'required',
            address: '17278 Highway 401 Westbound, Brighton, ON K0K 1H0', city: 'Brighton / Trenton, ON',
            timeBudget: '10-15 min',
            notes: 'Directly on westbound 401 and open 24/7. Washroom, stretch, top up fuel only if useful, then continue straight toward Vaughan. If the final GTA segment is projected to exceed 2 hours, stop sooner at the next safe highway facility.',
            food: 'Coffee/snack only if needed.',
            kidPlan: 'Last planned movement break before home.',
            mapUrl: mapSearchUrl('ONroute Trenton North, 17278 Highway 401 Westbound, Brighton, ON K0K 1H0'),
            sourceUrl: 'https://www.onroute.ca/locations/trenton-north'
          }),
          customStop({
            id: 'd8-home', dayId: '2026-08-21', time: '≈16:00–17:00 realistic', zone: 'EDT',
            title: 'Arrive home — Vaughan',
            locationName: 'Vaughan, Ontario',
            kind: 'Finish / home', priority: 'required',
            address: 'Vaughan, ON', city: 'Vaughan, ON',
            notes: 'Go straight home. Friday traffic may shift this later. Taking an extra safety break is always the correct choice if any driver becomes tired.',
            mapUrl: mapSearchUrl('Vaughan, ON'),
            sourceUrl: 'https://maps.app.goo.gl/sQht9QeTxt6jXHPQ9?g_st=ac'
          })
        ],
        meals: [
          mealSlot({ id: 'd8-breakfast', meal: 'Breakfast', title: 'Breakfast before 06:30 departure', selectedStopId: 'd8-depart', backup: 'Grab-and-go breakfast; do not create a restaurant detour.' }),
          mealSlot({ id: 'd8-lunch', meal: 'Lunch', title: 'Quick on-route lunch at Mallorytown North', selectedStopId: 'd8-mallorytown', backup: 'Grab food at the first safe highway service area if hunger comes earlier; do not leave the route for a restaurant.' }),
          mealSlot({ id: 'd8-dinner', meal: 'Dinner', title: 'Home in Vaughan', selectedStopId: 'd8-home', backup: 'Only eat on the road if traffic/fatigue makes arrival substantially later.' })
        ]
      });
    }

    return plan;
  };
}
