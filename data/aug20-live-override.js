// Live itinerary override for Thu, Aug 20, 2026.
// Follows Henry's shared Google Maps route exactly enough to keep the travel day
// simple: Moncton -> Lincoln/Waasis -> Edmundston -> Halte de Fraserville ->
// La Fabrique du Smoked Meat -> DoubleTree Quebec Resort.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug20PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug20PracticalBase(helpers) || {};

    practical['d7-lincoln-big-stop'] = {
      'Why / duration': 'Highway-aligned washroom, coffee and stretch stop near Fredericton without the Regent Mall detour · about 15–20 minutes.',
      'Family logistics': 'Fuel, washrooms, convenience store and food are all at the same travel-stop complex. Keep the stop short so the Edmundston lunch window stays comfortable.',
      'Backup': 'If everyone is comfortable and fuel is fine, make this a 10-minute washroom-only stop.'
    };

    practical['d7-edmundston-shared'] = {
      'Why / duration': 'The exact Edmundston waypoint from the shared route, centred on 180 Boulevard Hébert · about 45–60 minutes for lunch and a driver reset.',
      'Family logistics': 'Flameo is at the shared pin; Pizza Delight, Maple Leaf Queen’s Buffet, McDonald’s and Petro-Canada are in the same immediate commercial cluster.',
      'Fuel': 'Use the nearby Petro-Canada only if the tank/range says it is useful; avoid creating a separate fuel detour.'
    };

    practical['d7-fraserville'] = {
      'Why / duration': 'Simple Québec highway rest area for washroom, movement and a quiet reset · about 10–15 minutes.',
      'Family logistics': 'No meal is required here. Use the washroom, walk for a few minutes and keep moving toward Québec City.',
      'Backup': 'If the child is sleeping and the driver is fully alert, this can be shortened, but do not skip a needed fatigue break.'
    };

    practical['d7-smoked-meat'] = {
      'Cuisine / order': 'Québec smoked-meat stop at La Fabrique du Smoked Meat · sandwiches, smoked-meat plates and family-friendly comfort food.',
      'Timing': 'Thursday listing shows service through 20:00. Treat this as the proper dinner before the final short drive to the hotel.',
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
        mainActivity: 'Long return-positioning drive: Moncton to Québec City on Henry’s shared Google Maps route',
        optionalActivity: 'None — protect the driving rhythm, dinner and hotel arrival',
        downtime: 'After dinner, make the final short drive to DoubleTree, unload and stop for the night',
        rainPlan: 'The route still works in rain. Keep all breaks short and indoor where possible; add driving buffer instead of sightseeing.',
        parentWarning: 'This is the heavy driving day. The shared Google Maps route is the source of truth. Do not add Hartland, downtown sightseeing or extra attractions.',
        routeFocus: 'Best Western Plus Moncton → Lincoln/Waasis Irving Big Stop → 180 Bd Hébert Edmundston → Halte de Fraserville → La Fabrique du Smoked Meat → DoubleTree Quebec Resort',
        driveKm: 770,
        pureDriveTime: 'Long full-day drive; use the shared Google Maps live ETA and traffic as the source of truth',
        risk: 'Medium-High',
        lateThresholdMin: 30,
        wakeTime: '05:30–05:45',
        departTarget: '06:45 ADT wheels moving',
        driverPlan: 'Two-driver day. First adult handles Moncton to the Fredericton-area break; swap there or in Edmundston. Use Halte de Fraserville as the final fatigue check before Québec City.',
        timeZoneNote: 'Start in Atlantic Time (ADT). Québec is one hour behind on Eastern Time (EDT); the app times switch after Edmundston.',
        contingency: 'If behind schedule, shorten Lincoln/Waasis and Halte de Fraserville to essential washroom/stretch breaks. Keep the Edmundston lunch/reset and the Québec City dinner stop.',
        emergency: 'If fatigue becomes the constraint, stop safely even if the schedule slips. Skip dinner dining time only if needed and use takeout; never trade a fatigue break for an arrival target.',
        stops: [
          customStop({
            id: 'd7-depart', dayId: '2026-08-20', time: '06:45', zone: 'ADT',
            title: 'Depart Best Western Plus Moncton', locationName: 'Best Western Plus Moncton',
            kind: 'Start / hotel', priority: 'required',
            address: '300 Lewisville Rd, Moncton, NB E1A 5Y4', city: 'Moncton, NB',
            timeBudget: '0 min',
            notes: 'Breakfast, checkout and luggage should be finished before 06:45. Open the shared Google Maps route before leaving and use its live ETA all day.',
            food: 'Use the included hotel breakfast if it fits the departure target; otherwise use the packed no-delay backup.',
            kidPlan: 'Washroom before departure and keep water/snacks reachable.',
            mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Rd, Moncton, NB E1A 5Y4'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-lincoln-big-stop', dayId: '2026-08-20', time: '08:35–08:55 target', zone: 'ADT',
            title: 'Lincoln/Waasis Irving Big Stop — washroom + coffee + stretch',
            locationName: 'Irving 24 / Lincoln Big Stop',
            kind: 'Rest stop / fuel / washroom', priority: 'required',
            address: '415 Nevers Rd, Waasis, NB E3B 9E1', city: 'Waasis / Fredericton area, NB',
            timeBudget: '15-20 min',
            notes: 'This replaces the old Regent Mall detour and matches the Fredericton-area waypoint in the shared route. Keep it efficient: washroom, coffee, movement and fuel only if useful.',
            food: 'Big Stop restaurant and convenience-store options are on site, but save the proper meal for Edmundston unless the family needs food now.',
            kidPlan: 'Quick walk and washroom before the next long leg.',
            mapUrl: mapSearchUrl('Irving 24, 415 Nevers Rd, Waasis, NB E3B 9E1'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-edmundston-shared', dayId: '2026-08-20', time: '11:45–12:45 target', zone: 'ADT',
            title: 'Edmundston lunch + driver reset — shared Maps stop',
            locationName: 'Flameo Edmundston / Brunswick commercial cluster',
            kind: 'Lunch / driver swap / optional fuel', priority: 'required',
            address: '180 Bd Hébert, Edmundston, NB E3V 2S7', city: 'Edmundston, NB',
            timeBudget: '45-60 min',
            notes: 'This is the exact Edmundston waypoint from the shared route. Flameo is at the pin; use it as the default lunch. Nearby choices remain available if the family changes its mind. Do a real driver reset here.',
            food: 'Default: Flameo bowls. Nearby cluster also has Pizza Delight, Maple Leaf Queen’s Buffet and McDonald’s.',
            kidPlan: 'Sit down, use the washroom and give the child a proper out-of-car break.',
            mapUrl: mapSearchUrl('Flameo Edmundston, 180 Bd Hébert, Edmundston, NB E3V 2S7'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-fraserville', dayId: '2026-08-20', time: '13:30–13:45 target', zone: 'EDT',
            title: 'Halte de Fraserville — washroom + stretch',
            locationName: 'Halte de Fraserville',
            kind: 'Highway rest area', priority: 'required',
            address: 'Autoroute 85, Rivière-du-Loup area, QC G5R 0L3', city: 'Rivière-du-Loup, QC',
            timeBudget: '10-15 min',
            notes: 'Québec time is one hour behind New Brunswick. This exact shared-route stop replaces the old Shell/fuel card. Use the washroom, move for a few minutes and continue.',
            food: 'No meal planned here.',
            kidPlan: 'Short stretch and bathroom reset.',
            mapUrl: mapSearchUrl('Halte de Fraserville, Rivière-du-Loup, QC G5R 0L3'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-smoked-meat', dayId: '2026-08-20', time: '17:00–18:00 target', zone: 'EDT',
            title: 'Dinner: La Fabrique du Smoked Meat',
            locationName: 'La Fabrique du Smoked Meat',
            kind: 'Dinner / Québec City food stop', priority: 'required',
            address: '727 Rue Raoul-Jobin, Québec, QC G1N 1S1', city: 'Québec City, QC',
            timeBudget: '45-60 min',
            notes: 'This is the Québec City waypoint in Henry’s shared route. Eat here before hotel check-in so there is no second outing after unloading. Thursday hours are listed through 20:00.',
            food: 'Smoked-meat sandwich/plate and simple comfort-food choices.',
            kidPlan: 'Final proper seated break of the day, then only the short hotel leg remains.',
            mapUrl: mapSearchUrl('La Fabrique du Smoked Meat, 727 Rue Raoul-Jobin, Québec, QC G1N 1S1'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          }),
          customStop({
            id: 'd7-hotel', dayId: '2026-08-20', time: '18:20–19:00 target', zone: 'EDT',
            title: 'Check in: DoubleTree by Hilton Quebec Resort',
            locationName: 'DoubleTree by Hilton Quebec Resort',
            kind: 'Hotel / end of driving day', priority: 'required',
            address: '7900 Rue du Marigot, Québec, QC G1G 6T8', city: 'Québec City, QC',
            notes: 'Final destination in the shared route. Register for parking, unload, settle into the suite and end the day. No downtown detour after check-in.',
            food: 'Dinner is already handled at La Fabrique du Smoked Meat.',
            kidPlan: 'Straight to room/reset and early bedtime after the long road day.',
            mapUrl: mapSearchUrl('DoubleTree by Hilton Quebec Resort, 7900 Rue du Marigot, Québec, QC G1G 6T8'),
            sourceUrl: 'https://maps.app.goo.gl/GCTZ4AECxQ77SkAJA?g_st=ac'
          })
        ],
        meals: [
          mealSlot({ id: 'd7-breakfast', meal: 'Breakfast', title: 'Best Western Plus Moncton breakfast', selectedStopId: 'd7-depart', backup: 'Packed breakfast if hotel service would delay the 06:45 departure.' }),
          mealSlot({ id: 'd7-lunch', meal: 'Lunch', title: 'Flameo Edmundston — shared-route lunch stop', selectedStopId: 'd7-edmundston-shared', backup: 'Pizza Delight or another option in the same 180 Bd Hébert cluster; do not create a separate detour.' }),
          mealSlot({ id: 'd7-dinner', meal: 'Dinner', title: 'La Fabrique du Smoked Meat — Québec City', selectedStopId: 'd7-smoked-meat', backup: 'Takeout from the same stop if arrival is late; then continue directly to DoubleTree.' })
        ]
      });
    }

    return plan;
  };
}
