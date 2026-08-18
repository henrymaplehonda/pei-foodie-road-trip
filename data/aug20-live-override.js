// Live itinerary override for Thu, Aug 20, 2026.
// Follows Henry's shared Google Maps route while enforcing the trip safety rule:
// no more than 2 hours of continuous driving. Fuel preference is Shell/Esso.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug20PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug20PracticalBase(helpers) || {};

    practical['d7-lincoln-big-stop'] = {
      'Why / duration': 'Highway-aligned washroom, coffee and stretch stop near Fredericton · about 10–15 minutes.',
      'Fuel': 'Break only. Prefer not to buy Irving fuel here. The planned Shell Woodstock stop is the primary fuel stop unless range requires fuel sooner.',
      'Safety rule': 'Do not exceed 2 hours of continuous driving. Leave this stop alert and reset the driving clock.'
    };

    practical['d7-woodstock-shell'] = {
      'Why / duration': 'Safety break plus preferred-brand fuel before the northern New Brunswick leg · about 10–15 minutes.',
      'Fuel': 'Primary Thursday fuel stop: Shell / Maliseet Fuels II, 1 Mowin Ln. Shell V-Power 91 is listed at this location.',
      'Safety rule': 'This breaks the old Waasis-to-Edmundston stretch into safe segments. Fill here if useful, then the next leg to Edmundston is under the 2-hour ceiling in normal conditions.'
    };

    practical['d7-edmundston-shared'] = {
      'Why / duration': 'The exact Edmundston waypoint from the shared route, centred on 180 Boulevard Hébert · about 45–60 minutes for lunch and a driver reset.',
      'Family logistics': 'Flameo is at the shared pin; nearby food choices remain available if the family changes its mind.',
      'Fuel': 'Petro-Canada is at this cluster, but Shell/Esso is preferred. If you filled at Woodstock, treat Edmundston as lunch/rest only. Use Petro-Canada only if range or safety requires it.'
    };

    practical['d7-fraserville'] = {
      'Why / duration': 'Québec highway rest area for washroom, movement and a driver reset · about 10–15 minutes.',
      'Fuel': 'No fuel planned here. An Esso exists on Boulevard Cartier in Rivière-du-Loup if an unexpected fuel need develops.',
      'Safety rule': 'Reset the driving clock here before continuing west on A20.'
    };

    practical['d7-saint-roch-shell'] = {
      'Why / duration': 'Second short safety break on A20 and preferred-brand fuel backup · about 10–15 minutes.',
      'Fuel': 'Shell at 483 Route de la Seigneurie, Saint-Roch-des-Aulnaies. Top up here only if useful; otherwise bathroom/stretch and continue.',
      'Safety rule': 'This prevents the Rivière-du-Loup-to-Québec City portion from becoming one long continuous driving block.'
    };

    practical['d7-smoked-meat'] = {
      'Cuisine / order': 'Québec smoked-meat stop at La Fabrique du Smoked Meat · sandwiches, smoked-meat plates and family-friendly comfort food.',
      'Timing': 'Treat this as the proper dinner before the final short drive to the hotel.',
      'Family logistics': 'Eat before hotel check-in so the evening ends immediately after unloading. No Old Québec sightseeing stack on this long driving day.'
    };

    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug20PlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug20PlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers) return plan;

    var makeDay = helpers.makeDay;
    var customStop = helpers.customStop;
    var mealSlot = helpers.mealSlot;
    var mapSearchUrl = helpers.mapSearchUrl;

    plan.generatedOn = '2026-08-18';

    var aug20Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-20'; });
    if (aug20Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug20Index] = makeDay({
        id: '2026-08-20',
        label: 'Thu, Aug 20, 2026',
        mainActivity: 'Long return-positioning drive: Moncton to Québec City with maximum 2-hour driving segments',
        optionalActivity: 'None — breaks, food, fuel and hotel only',
        downtime: 'After dinner, make the final short drive to DoubleTree, unload and stop for the night',
        rainPlan: 'Same route. Slow down for conditions and stop earlier if weather or fatigue makes the 2-hour ceiling too aggressive.',
        parentWarning: 'Hard rule: maximum 2 hours continuous driving. At about 1 h 45 min, begin choosing the next safe stop. No attractions or sightseeing detours.',
        routeFocus: 'Best Western Plus Moncton → Lincoln/Waasis break → Shell Woodstock → Edmundston lunch → Halte de Fraserville → Shell Saint-Roch-des-Aulnaies → La Fabrique du Smoked Meat → DoubleTree Quebec Resort',
        driveKm: 770,
        pureDriveTime: 'Long full-day drive; live Google Maps traffic is the source of truth',
        risk: 'Medium-High',
        lateThresholdMin: 0,
        wakeTime: '05:30–05:45',
        departTarget: '06:45 ADT wheels moving',
        driverPlan: 'Two-driver safety pattern. No one drives more than 2 hours continuously. Swap at any break when useful. The fuel preference is Shell or Esso; use another brand only when range or safety makes it necessary.',
        timeZoneNote: 'Start in Atlantic Time (ADT). Québec is one hour behind on Eastern Time (EDT).',
        contingency: 'Planned stops are safety anchors. If traffic means any next anchor is more than 2 hours away, use the first safe highway facility before the limit. Never extend a driving segment just to reach a preferred fuel brand.',
        emergency: 'Fatigue and fuel range beat the schedule and brand preference. Stop safely, switch drivers or rest whenever needed.',
        stops: [
          customStop({
            id: 'd7-depart', dayId: '2026-08-20', time: '06:45', zone: 'ADT',
            title: 'Depart Best Western Plus Moncton', locationName: 'Best Western Plus Moncton',
            kind: 'Start / hotel', priority: 'required',
            address: '300 Lewisville Rd, Moncton, NB E1A 5Y4', city: 'Moncton, NB',
            timeBudget: '0 min',
            notes: 'Breakfast, checkout and luggage finished before 06:45. Leave with a healthy fuel level. If fuel is unexpectedly low, use a nearby Shell/Esso before committing to the highway rather than stretching range.',
            food: 'Use the included hotel breakfast if it fits the departure target; otherwise use the packed no-delay backup.',
            kidPlan: 'Washroom before departure and keep water/snacks reachable.',
            mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Rd, Moncton, NB E1A 5Y4'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-lincoln-big-stop', dayId: '2026-08-20', time: '≈08:35–08:50 target', zone: 'ADT',
            title: 'Lincoln/Waasis Irving Big Stop — safety break only',
            locationName: 'Irving 24 / Lincoln Big Stop',
            kind: 'Rest stop / washroom / stretch', priority: 'required',
            address: '415 Nevers Rd, Waasis, NB E3B 9E1', city: 'Waasis / Fredericton area, NB',
            timeBudget: '10-15 min',
            notes: 'This remains the first on-route safety break. Washroom, coffee and movement. Prefer not to fuel here; Shell Woodstock is the planned fuel stop. If range is low, fuel here anyway rather than taking a risk.',
            food: 'Coffee/snack only if needed.',
            kidPlan: 'Quick walk and washroom.',
            mapUrl: mapSearchUrl('Irving 24, 415 Nevers Rd, Waasis, NB E3B 9E1'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-woodstock-shell', dayId: '2026-08-20', time: '≈10:00–10:15 target', zone: 'ADT',
            title: 'Shell Woodstock — fuel + safety break',
            locationName: 'Shell / Maliseet Fuels II',
            kind: 'Preferred fuel / washroom / stretch', priority: 'required',
            address: '1 Mowin Ln, Woodstock First Nation, NB E7M 0B1', city: 'Woodstock, NB',
            timeBudget: '10-15 min',
            notes: 'Primary Thursday fuel stop. Shell is open 24/7 and V-Power 91 is listed. Fill here if useful, use the washroom and reset before the Edmundston leg.',
            food: 'Snack only if needed; proper lunch remains Edmundston.',
            kidPlan: 'Short movement break.',
            mapUrl: mapSearchUrl('Shell Maliseet Fuels II, 1 Mowin Ln, Woodstock First Nation, NB E7M 0B1'),
            sourceUrl: 'https://www.shell.ca/'
          }),
          customStop({
            id: 'd7-edmundston-shared', dayId: '2026-08-20', time: '≈12:00–13:00 target', zone: 'ADT',
            title: 'Edmundston lunch + driver reset — shared Maps stop',
            locationName: 'Flameo Edmundston / Brunswick commercial cluster',
            kind: 'Lunch / driver swap', priority: 'required',
            address: '180 Bd Hébert, Edmundston, NB E3V 2S7', city: 'Edmundston, NB',
            timeBudget: '45-60 min',
            notes: 'Proper lunch and full out-of-car reset. If Shell Woodstock was used, do not add a Petro-Canada fill here unless range actually requires it.',
            food: 'Default: Flameo bowls. Nearby choices are acceptable without creating another detour.',
            kidPlan: 'Sit down, washroom and proper movement break.',
            mapUrl: mapSearchUrl('Flameo Edmundston, 180 Bd Hébert, Edmundston, NB E3V 2S7'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-fraserville', dayId: '2026-08-20', time: '≈13:30–14:00 EDT target', zone: 'EDT',
            title: 'Halte de Fraserville — safety break',
            locationName: 'Halte de Fraserville',
            kind: 'Highway rest area / washroom / stretch', priority: 'required',
            address: 'Autoroute 85, Rivière-du-Loup area, QC G5R 0L3', city: 'Rivière-du-Loup, QC',
            timeBudget: '10-15 min',
            notes: 'Québec is one hour behind New Brunswick. Washroom, stretch and reset. No fuel planned. If fuel is unexpectedly needed, the Esso on Boulevard Cartier in Rivière-du-Loup is the preferred nearby brand option.',
            food: 'No meal planned here.',
            kidPlan: 'Short movement and bathroom reset.',
            mapUrl: mapSearchUrl('Halte de Fraserville, Rivière-du-Loup, QC G5R 0L3'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-saint-roch-shell', dayId: '2026-08-20', time: '≈15:00 target', zone: 'EDT',
            title: 'Shell Saint-Roch-des-Aulnaies — safety break / optional top-up',
            locationName: 'Shell — Halte de la Seigneurie',
            kind: 'Preferred fuel / washroom / stretch', priority: 'required',
            address: '483 Rte de la Seigneurie, Saint-Roch-des-Aulnaies, QC G0R 4E0', city: 'Saint-Roch-des-Aulnaies, QC',
            timeBudget: '10-15 min',
            notes: 'Easy A20 travel stop. Use this to split the final Québec leg and top up only if useful. Shell is the preferred brand; do not waste time filling if range is already comfortable.',
            food: 'Quick snack only if needed.',
            kidPlan: 'Short stretch before Québec City.',
            mapUrl: mapSearchUrl('Shell, 483 Rte de la Seigneurie, Saint-Roch-des-Aulnaies, QC G0R 4E0'),
            sourceUrl: 'https://www.shell.ca/'
          }),
          customStop({
            id: 'd7-smoked-meat', dayId: '2026-08-20', time: '≈16:30–17:30 target', zone: 'EDT',
            title: 'Dinner: La Fabrique du Smoked Meat',
            locationName: 'La Fabrique du Smoked Meat',
            kind: 'Dinner / Québec City food stop', priority: 'required',
            address: '727 Rue Raoul-Jobin, Québec, QC G1N 1S1', city: 'Québec City, QC',
            timeBudget: '45-60 min',
            notes: 'Proper dinner before hotel check-in. No extra Québec City sightseeing.',
            food: 'Smoked-meat sandwich/plate and simple comfort-food choices.',
            kidPlan: 'Final proper seated break; only the short hotel leg remains.',
            mapUrl: mapSearchUrl('La Fabrique du Smoked Meat, 727 Rue Raoul-Jobin, Québec, QC G1N 1S1'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-hotel', dayId: '2026-08-20', time: '≈18:00 target', zone: 'EDT',
            title: 'Check in: DoubleTree by Hilton Quebec Resort',
            locationName: 'DoubleTree by Hilton Quebec Resort',
            kind: 'Hotel / end of driving day', priority: 'required',
            address: '7900 Rue du Marigot, Québec, QC G1G 6T8', city: 'Québec City, QC',
            notes: 'Register for parking, unload and end the day. No downtown detour after check-in.',
            food: 'Dinner already handled.',
            kidPlan: 'Straight to room/reset and early bedtime.',
            mapUrl: mapSearchUrl('DoubleTree by Hilton Quebec Resort, 7900 Rue du Marigot, Québec, QC G1G 6T8'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          })
        ],
        meals: [
          mealSlot({ id: 'd7-breakfast', meal: 'Breakfast', title: 'Best Western Plus Moncton breakfast', selectedStopId: 'd7-depart', backup: 'Packed breakfast if hotel service would delay departure.' }),
          mealSlot({ id: 'd7-lunch', meal: 'Lunch', title: 'Flameo Edmundston — shared-route lunch stop', selectedStopId: 'd7-edmundston-shared', backup: 'Another option in the same cluster; no separate restaurant detour.' }),
          mealSlot({ id: 'd7-dinner', meal: 'Dinner', title: 'La Fabrique du Smoked Meat — Québec City', selectedStopId: 'd7-smoked-meat', backup: 'Takeout from the same stop if late; then continue directly to DoubleTree.' })
        ]
      });
    }

    return plan;
  };
}
