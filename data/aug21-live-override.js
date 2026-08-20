// Live itinerary override for Fri, Aug 21, 2026.
// User-selected Google Maps route: Quebec City -> Starbucks Brossard ->
// River Mill Restaurant Kingston -> home in Vaughan.
// Safety rule stays in force: never drive more than 2 hours continuously.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug21PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug21PracticalBase(helpers) || {};

    practical['d8-starbucks-brossard'] = {
      'Why / duration': 'First planned route stop for coffee, washroom and a proper reset · target 15–20 minutes.',
      'Location': 'Starbucks Coffee Company, 1025 Boulevard du Quartier, Brossard, QC J4Z 3R9.',
      'Safety rule': 'This is the first planned destination, not permission to exceed 2 hours continuously. If live traffic puts Starbucks beyond the 2-hour limit, take a short safe highway break first and then continue here.'
    };

    practical['d8-river-mill'] = {
      'Why / duration': 'Main lunch and driver reset in Kingston · allow about 60–75 minutes.',
      'Location': 'River Mill Restaurant, 2 Cataraqui Street, Kingston, ON K7K 1Z7.',
      'Food': 'Friday lunch stop. River Mill serves lunch and gives the family a full seated break before the final Ontario leg.',
      'Safety rule': 'If Brossard to Kingston will exceed 2 hours of continuous driving, stop briefly at the first safe highway facility before the limit, then continue to River Mill.'
    };

    practical['d8-home'] = {
      'Why / duration': 'Final destination in Vaughan · no sightseeing or shopping detours.',
      'Safety rule': 'Kingston to Vaughan may also exceed the 2-hour continuous-driving limit depending on traffic. Take one short highway safety break if needed. Fatigue always beats the schedule.'
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

    plan.generatedOn = '2026-08-20';

    var aug21Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-21'; });
    if (aug21Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug21Index] = makeDay({
        id: '2026-08-21',
        label: 'Fri, Aug 21, 2026',
        mainActivity: 'Go home: Quebec City -> Brossard -> Kingston -> Vaughan',
        optionalActivity: 'None — Friday is a homebound travel day',
        downtime: 'Starbucks reset in Brossard, seated lunch at River Mill in Kingston, plus short highway safety breaks only when needed',
        rainPlan: 'Same route. Slow down for conditions and shorten driving segments if visibility or fatigue worsens.',
        parentWarning: 'Hard rule: maximum 2 hours of continuous driving. The Google Maps pins are route anchors, not permission to stretch a segment. At about 1 h 45 min, start looking for a safe break if the next planned stop is still too far away.',
        routeFocus: 'DoubleTree Quebec Resort -> Starbucks, 1025 Bd du Quartier, Brossard -> River Mill Restaurant, Kingston -> home in Vaughan',
        driveKm: 810,
        pureDriveTime: 'About 8 hours before breaks in normal conditions; live Google Maps traffic is the source of truth',
        risk: 'Medium',
        lateThresholdMin: 0,
        wakeTime: '05:15',
        departTarget: '06:30 EDT wheels moving',
        driverPlan: 'Use the new Google Maps route. Two-driver safety pattern: nobody drives more than 2 hours continuously. Swap at Starbucks or River Mill when useful. Add a short safe highway break whenever live traffic would make a planned segment too long.',
        timeZoneNote: 'All times are Eastern Daylight Time (EDT).',
        contingency: 'Follow the supplied route through Brossard and Kingston. Traffic can move every arrival time, so treat times below as targets. If the next planned pin is more than 2 hours away, stop at the first safe highway facility before the limit, then resume the same route.',
        emergency: 'Fatigue, weather and fuel range beat the schedule. Prefer Shell/Esso for fuel when practical, but use any safe station if needed.',
        stops: [
          customStop({
            id: 'd8-depart', dayId: '2026-08-21', time: '06:30', zone: 'EDT',
            title: 'Depart DoubleTree by Hilton Quebec Resort',
            locationName: 'DoubleTree by Hilton Quebec Resort',
            kind: 'Start / hotel', priority: 'required',
            address: '7900 Rue du Marigot, Quebec, QC G1G 6T8', city: 'Quebec City, QC',
            timeBudget: '0 min',
            notes: 'Breakfast, checkout, fuel check and washroom before 06:30. Head toward Brossard. If live traffic makes the first planned stop more than 2 hours away, take a quick safe highway break before Starbucks.',
            food: 'Breakfast before departure or grab-and-go if needed.',
            kidPlan: 'Washroom before leaving; keep water and simple snacks accessible.',
            mapUrl: mapSearchUrl('DoubleTree by Hilton Quebec Resort, 7900 Rue du Marigot, Quebec, QC G1G 6T8')
          }),
          customStop({
            id: 'd8-starbucks-brossard', dayId: '2026-08-21', time: '≈08:45–09:15 target', zone: 'EDT',
            title: 'Starbucks Brossard — coffee + reset',
            locationName: 'Starbucks Coffee Company',
            kind: 'Coffee / washroom / driver reset', priority: 'required',
            address: '1025 Bd du Quartier, Brossard, QC J4Z 3R9', city: 'Brossard, QC',
            timeBudget: '15-20 min',
            notes: 'This is the Starbucks pin from the new route. Coffee, washroom and quick movement. Do not stretch the drive to reach it: add a short safe break earlier if traffic pushes the first segment past 2 hours.',
            food: 'Coffee plus light breakfast/snack only if needed; save the main meal for Kingston.',
            kidPlan: 'Washroom and short movement break.',
            mapUrl: mapSearchUrl('Starbucks Coffee Company, 1025 Bd du Quartier, Brossard, QC J4Z 3R9'),
            sourceUrl: 'https://www.starbucks.ca/'
          }),
          customStop({
            id: 'd8-river-mill', dayId: '2026-08-21', time: '≈11:45–13:00 target', zone: 'EDT',
            title: 'River Mill Restaurant — Kingston lunch',
            locationName: 'River Mill Restaurant',
            kind: 'Lunch / washroom / long driver reset', priority: 'required',
            address: '2 Cataraqui St, Kingston, ON K7K 1Z7', city: 'Kingston, ON',
            timeBudget: '60-75 min',
            notes: 'Main Friday meal stop from the new route. River Mill is a seated waterfront restaurant. Friday lunch service is available. If live traffic makes Brossard to Kingston longer than 2 hours continuously, take a short highway safety break first and then continue here.',
            food: 'Sit-down lunch. Keep the meal relaxed enough to reset both drivers, but avoid turning it into a long sightseeing stop.',
            kidPlan: 'Proper out-of-car break, washroom and lunch before the final Ontario leg.',
            mapUrl: mapSearchUrl('River Mill Restaurant, 2 Cataraqui St, Kingston, ON K7K 1Z7'),
            sourceUrl: 'https://www.rivermill.ca/'
          }),
          customStop({
            id: 'd8-home', dayId: '2026-08-21', time: '≈16:00–17:00 realistic', zone: 'EDT',
            title: 'Arrive home — Vaughan',
            locationName: 'Home in Vaughan',
            kind: 'Finish / home', priority: 'required',
            address: 'Vaughan, ON', city: 'Vaughan, ON',
            notes: 'Continue home after lunch. Friday GTA traffic may move this later. If Kingston to home approaches 2 hours of continuous driving, take a short highway safety break before the limit. The exact private home address is intentionally not stored in this public repository.',
            mapUrl: mapSearchUrl('Vaughan, ON')
          })
        ],
        meals: [
          mealSlot({ id: 'd8-breakfast', meal: 'Breakfast', title: 'Breakfast before 06:30 departure', selectedStopId: 'd8-depart', backup: 'Use Starbucks for a light breakfast if needed.' }),
          mealSlot({ id: 'd8-lunch', meal: 'Lunch', title: 'River Mill Restaurant in Kingston', selectedStopId: 'd8-river-mill', backup: 'If timing slips badly, eat at the first practical highway stop rather than driving hungry or tired.' }),
          mealSlot({ id: 'd8-dinner', meal: 'Dinner', title: 'Home in Vaughan', selectedStopId: 'd8-home', backup: 'Only eat on the road if traffic or fatigue makes arrival substantially later.' })
        ]
      });
    }

    return plan;
  };
}
