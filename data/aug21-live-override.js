// Live itinerary override for Fri, Aug 21, 2026.
// Final-day rule: get home to Vaughan efficiently, never drive more than
// 2 hours continuously, and prefer Shell/Esso for fuel.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug21PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug21PracticalBase(helpers) || {};

    practical['d8-drummondville-shell'] = {
      'Why / duration': 'First safety break plus preferred-brand fuel · target 10–15 minutes.',
      'Fuel': 'Primary Friday fuel stop: Shell at 1380 Boulevard Lemire Ouest, Drummondville. Shell V-Power 91 is listed at this location.',
      'Safety rule': 'Do not stretch the first driving segment beyond 2 hours. At about 1 h 45 min, start looking for the next safe stop even if traffic changed the timing.'
    };

    practical['d8-riviere-beaudette'] = {
      'Why / duration': 'Second highway-only reset before Ontario · target 10–15 minutes.',
      'Fuel': 'Break only if the Drummondville Shell fill was sufficient. An Esso near Les Coteaux/Hudson is the preferred-brand backup if range unexpectedly requires another fill.',
      'Safety rule': 'If Montréal/A30 traffic makes this more than 2 hours from Drummondville, use the first safe service/rest area before the 2-hour mark instead.'
    };

    practical['d8-mallorytown'] = {
      'Why / duration': 'Main westbound 401 break · 20–30 minutes for lunch, washroom and driver reset.',
      'Fuel': 'ONroute fuel is Canadian Tire Gas+. Prefer not to fill here if the Drummondville Shell fill gives comfortable range. Use it only if fuel safety requires it.',
      'Safety rule': 'This is not a sightseeing stop. Eat quickly, switch drivers if useful and continue only when alert.'
    };

    practical['d8-trenton'] = {
      'Why / duration': 'Final planned westbound 401 safety break · target 10–15 minutes.',
      'Fuel': 'Treat as break-only when range is healthy. Prefer Shell/Esso; use ONroute fuel only if needed to maintain a safe reserve.',
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
        parentWarning: 'Hard rule: maximum 2 hours of continuous driving. At 1 h 45 min, start looking for the next safe stop. Fuel preference is Shell/Esso, but safety and range always win.',
        routeFocus: 'DoubleTree Quebec Resort → Shell Drummondville → Aire de service de Rivière-Beaudette → ONroute Mallorytown North → ONroute Trenton North → Vaughan',
        driveKm: 810,
        pureDriveTime: 'About 8 hours before breaks in normal conditions; live Google Maps traffic is the source of truth',
        risk: 'Medium',
        lateThresholdMin: 0,
        wakeTime: '05:15',
        departTarget: '06:30 EDT wheels moving',
        driverPlan: 'Two-driver safety pattern. No one drives more than 2 hours continuously. Swap at any break when useful. Prefer Shell/Esso fuel; use another brand only when range or safety makes it necessary.',
        timeZoneNote: 'All times are Eastern Daylight Time (EDT).',
        contingency: 'Planned stops are anchors, not obligations. If traffic makes the next anchor more than 2 hours away, stop at the first safe highway facility before the limit. Do not extend a segment just to reach Shell or Esso.',
        emergency: 'Fatigue and fuel range beat the schedule and brand preference. Pull into a safe facility, switch drivers or rest.',
        stops: [
          customStop({
            id: 'd8-depart', dayId: '2026-08-21', time: '06:30', zone: 'EDT',
            title: 'Depart DoubleTree by Hilton Quebec Resort',
            locationName: 'DoubleTree by Hilton Quebec Resort',
            kind: 'Start / hotel', priority: 'required',
            address: '7900 Rue du Marigot, Québec, QC G1G 6T8', city: 'Québec City, QC',
            timeBudget: '0 min',
            notes: 'Breakfast, checkout, healthy fuel level and washroom before 06:30. No sightseeing today. If the tank is unexpectedly low, use the first practical Shell/Esso rather than stretching range.',
            food: 'Breakfast before departure or grab-and-go if needed.',
            kidPlan: 'Washroom before leaving; keep water and simple snacks accessible.',
            mapUrl: mapSearchUrl('DoubleTree by Hilton Quebec Resort, 7900 Rue du Marigot, Québec, QC G1G 6T8'),
            sourceUrl: 'https://maps.app.goo.gl/sQht9QeTxt6jXHPQ9?g_st=ac'
          }),
          customStop({
            id: 'd8-drummondville-shell', dayId: '2026-08-21', time: '≈08:00–08:15 target', zone: 'EDT',
            title: 'Shell Drummondville — fuel + first safety break',
            locationName: 'Shell — Boulevard Lemire Ouest',
            kind: 'Preferred fuel / washroom / stretch', priority: 'required',
            address: '1380 Bd Lemire O, Drummondville, QC J2B 6V4', city: 'Drummondville, QC',
            timeBudget: '10-15 min',
            notes: 'Primary Friday fuel stop. This Shell is near A20, lists V-Power 91 and has washrooms. Fill here to minimize the chance of needing Canadian Tire Gas+ later at ONroute.',
            food: 'Coffee/snack only if needed.',
            kidPlan: 'Quick out-of-car movement and washroom.',
            mapUrl: mapSearchUrl('Shell, 1380 Bd Lemire O, Drummondville, QC J2B 6V4'),
            sourceUrl: 'https://www.shell.ca/'
          }),
          customStop({
            id: 'd8-riviere-beaudette', dayId: '2026-08-21', time: '≈10:00–10:15 target', zone: 'EDT',
            title: 'Aire de service de Rivière-Beaudette — quick reset',
            locationName: 'Aire de service de Rivière-Beaudette',
            kind: 'Highway service area / washroom / stretch', priority: 'required',
            address: '100 Autoroute 20, Rivière-Beaudette, QC J0P 1R0', city: 'Rivière-Beaudette, QC',
            timeBudget: '10-15 min',
            notes: 'Break only when the Drummondville Shell fill gives comfortable range. Washroom, stretch and continue. If traffic would make this more than 2 hours from Drummondville, stop earlier at the first safe facility.',
            food: 'Grab-and-go only if hungry; save the main food break for Mallorytown.',
            kidPlan: 'Short reset; no attraction time.',
            mapUrl: mapSearchUrl('Aire de service de Rivière-Beaudette, 100 Autoroute 20, Rivière-Beaudette, QC J0P 1R0'),
            sourceUrl: 'https://www.quebec511.info/en/diffusion/haltes/route.aspx?id=20'
          }),
          customStop({
            id: 'd8-mallorytown', dayId: '2026-08-21', time: '≈11:30–12:00 target', zone: 'EDT',
            title: 'ONroute Mallorytown North — main lunch break',
            locationName: 'ONroute Mallorytown North',
            kind: 'Highway service centre / lunch / driver reset', priority: 'required',
            address: '678 Highway 401 Westbound, Mallorytown, ON K0E 1R0', city: 'Mallorytown, ON',
            timeBudget: '20-30 min',
            notes: 'Directly on westbound 401 and open 24/7. Washroom, quick food and driver swap. Prefer not to fuel here because the on-site brand is Canadian Tire Gas+; use it only if the safe fuel reserve says you should.',
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
            notes: 'Washroom and stretch, then continue straight toward Vaughan. Treat fuel here as emergency/need-based only; preferred fuel remains Shell/Esso. If the GTA leg is projected to exceed 2 hours, stop sooner at the next safe highway facility.',
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
            notes: 'Go straight home. Friday traffic may shift this later. Taking an extra safety break is always correct if a driver becomes tired.',
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
