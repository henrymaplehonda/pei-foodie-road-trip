// Live itinerary override for Wed, Aug 19, 2026.
// Family nature day requested Aug 18: Marine Rail Park -> Plage Aboiteau Beach
// -> Irishtown Nature Park. Keep the route simple and return to Moncton early.
window.TripData = window.TripData || {};

if (typeof window.TripData.stopPractical === 'function') {
  var aug19PracticalBase = window.TripData.stopPractical;
  window.TripData.stopPractical = function (helpers) {
    var practical = aug19PracticalBase(helpers) || {};

    practical['d6-marine-rail'] = {
      'Why / duration': 'Short waterfront/bridge-view stop in Borden-Carleton before returning to New Brunswick · about 30–40 minutes.',
      'Family logistics': 'Easy outdoor stop with public toilets, picnic space and room for a child to move. Keep it short so the beach gets the best late-morning window.',
      'Bridge': 'Confederation Bridge toll is collected when leaving PEI. 2026 first-two-axle toll is C$20. No reservation is required.'
    };

    practical['d6-aboiteau'] = {
      'Why / duration': 'Main family stop of the day · about 2–2.5 hours including lunch.',
      'Hours / fee': 'Summer services operate daily 09:00–20:00. Day parking for a car is C$10 in Parking A or C$15 in Parking B from 09:00–17:00.',
      'Family logistics': 'Beach, boardwalk, washrooms and on-site food are all together. Restaurant À la Dune opens at 11:00 Wednesday, so lunch can happen without another drive.'
    };

    practical['d6-irishtown'] = {
      'Why / duration': 'Shaded final nature walk close to Moncton · target 60–75 minutes.',
      'Trail choice': 'Use the surfaced trail for an easy family walk. The City lists 4.7 km of surfaced trails plus more challenging natural footpaths.',
      'Water warning': 'The reservoir is currently closed to recreational water use because cyanobacteria was detected. Walking trails remain the plan; do not enter the water.'
    };

    return practical;
  };
}

if (typeof window.TripData.operationalPlan === 'function') {
  var aug19PlanBase = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    var plan = aug19PlanBase(helpers);
    if (!plan || !Array.isArray(plan.days) || !helpers) return plan;

    var makeDay = helpers.makeDay;
    var customStop = helpers.customStop;
    var mealSlot = helpers.mealSlot;
    var mapSearchUrl = helpers.mapSearchUrl;

    plan.generatedOn = '2026-08-18';

    var aug19Index = plan.days.findIndex(function (day) { return day && day.id === '2026-08-19'; });
    if (aug19Index >= 0 && typeof makeDay === 'function') {
      plan.days[aug19Index] = makeDay({
        id: '2026-08-19',
        label: 'Wed, Aug 19, 2026',
        mainActivity: 'Marine Rail Park + Aboiteau Beach + Irishtown Nature Park',
        optionalActivity: 'None — these three requested stops are the day',
        downtime: 'Return to Best Western Plus Moncton by mid-afternoon for a quiet reset before Thursday’s long drive',
        rainPlan: 'If rain becomes heavy, shorten Marine Rail and the beach to brief walks and preserve Irishtown only if trail conditions are comfortable. Do not replace the day with extra attractions.',
        parentWarning: 'Marine Rail Park is on PEI, so the day includes a Confederation Bridge round trip. The bridge toll is collected when leaving PEI. Irishtown reservoir water recreation is currently closed because of cyanobacteria; walking trails remain open.',
        routeFocus: 'Best Western Plus Moncton → Marine Rail Park, Borden-Carleton → Plage Aboiteau Beach, Cap-Pelé → Irishtown Nature Park → Best Western Plus Moncton',
        driveKm: 190,
        pureDriveTime: 'About 2.5–3 hours total before stops; use live Google Maps traffic as the source of truth',
        risk: 'Low-Medium',
        lateThresholdMin: 30,
        wakeTime: '06:15–06:30',
        departTarget: '07:15 ADT wheels moving',
        driverPlan: 'Easy single-driver day if desired. No individual driving segment should approach the 2-hour safety ceiling. Swap drivers whenever useful.',
        timeZoneNote: 'New Brunswick and PEI are both on Atlantic Daylight Time (ADT).',
        contingency: 'If departure slips, keep all three requested stops but shorten Marine Rail to 20–25 minutes and Irishtown to a 45-minute surfaced-trail walk. Protect at least 90 minutes at Aboiteau.',
        emergency: 'If bridge weather, fatigue or road conditions become unsafe, use live bridge/traffic advisories and stop safely. Safety overrides the schedule.',
        stops: [
          customStop({
            id: 'd6-depart', dayId: '2026-08-19', time: '07:15', zone: 'ADT',
            title: 'Depart Best Western Plus Moncton',
            locationName: 'Best Western Plus Moncton',
            kind: 'Start / hotel', priority: 'required',
            address: '300 Lewisville Rd, Moncton, NB E1A 5Y4', city: 'Moncton, NB',
            timeBudget: '0 min',
            notes: 'Breakfast, sunscreen, beach towels, water and change of clothes ready before departure. Check live Confederation Bridge conditions before leaving.',
            food: 'Breakfast at the hotel before departure.',
            kidPlan: 'Washroom before leaving; keep a snack and water accessible.',
            mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Rd, Moncton, NB E1A 5Y4')
          }),
          customStop({
            id: 'd6-marine-rail', dayId: '2026-08-19', time: '≈08:15–08:50', zone: 'ADT',
            title: 'Marine Rail Park — Confederation Bridge viewpoint',
            locationName: 'Marine Rail Park / Marine Rail Historical Park',
            kind: 'Waterfront park / bridge viewpoint / family break', priority: 'required',
            address: '41 Borden Ave, Borden-Carleton, PE C0B 1X0', city: 'Borden-Carleton, PE',
            timeBudget: '30-40 min',
            notes: 'Requested stop. Keep it relaxed but short: bridge photos, waterfront, lighthouse/rail-history area and bathroom. The bridge is open 24/7; toll is collected on the return from PEI to NB.',
            food: 'No meal planned. Use packed snack only if needed.',
            kidPlan: 'Open grassy space and a short walk before getting back in the car.',
            mapUrl: mapSearchUrl('Marine Rail Park, 41 Borden Ave, Borden-Carleton, PE C0B 1X0'),
            sourceUrl: 'https://www.borden-carleton.ca/copy-of-borden-carleton-regional-library'
          }),
          customStop({
            id: 'd6-aboiteau', dayId: '2026-08-19', time: '≈09:45–12:15', zone: 'ADT',
            title: 'Plage Aboiteau Beach — beach + lunch',
            locationName: 'Plage Aboiteau Beach',
            kind: 'Beach / family time / lunch', priority: 'required',
            address: '150 Allée du Parc, Cap-Pelé, NB E4N 1S4', city: 'Cap-Pelé, NB',
            timeBudget: '2-2.5 h',
            notes: 'Requested main stop. Summer services run 09:00–20:00. Car parking is C$10 in Parking A or C$15 in Parking B during the 09:00–17:00 admission window. Beach access, washrooms and food stay in one place.',
            food: 'Restaurant À la Dune on site opens at 11:00 Wednesday. Use it for lunch so there is no restaurant detour.',
            kidPlan: 'Beach/play time, rinse/change if needed, then lunch before leaving.',
            mapUrl: mapSearchUrl('Plage Aboiteau Beach, 150 Allée du Parc, Cap-Pelé, NB E4N 1S4'),
            sourceUrl: 'https://plageaboiteau.ca/en/'
          }),
          customStop({
            id: 'd6-irishtown', dayId: '2026-08-19', time: '≈13:00–14:15', zone: 'ADT',
            title: 'Irishtown Nature Park — shaded family walk',
            locationName: 'Irishtown Nature Park',
            kind: 'Nature trail / family walk', priority: 'required',
            address: '1155 Elmwood Dr, Moncton, NB E1H 2H7', city: 'Moncton, NB',
            timeBudget: '60-75 min',
            notes: 'Requested final stop. Use the surfaced trail for an easy family walk; turn around whenever the child has had enough. The reservoir is currently closed to recreational water use because of cyanobacteria, so this visit is walking only.',
            food: 'Water/snack only. Lunch was at Aboiteau.',
            kidPlan: 'Choose the surfaced trail rather than the rougher footpaths. Washrooms are available at the park.',
            mapUrl: mapSearchUrl('Irishtown Nature Park, 1155 Elmwood Dr, Moncton, NB E1H 2H7'),
            sourceUrl: 'https://www.moncton.ca/en/irishtown-nature-park'
          }),
          customStop({
            id: 'd6-hotel', dayId: '2026-08-19', time: '≈14:30–15:00', zone: 'ADT',
            title: 'Return to Best Western Plus Moncton',
            locationName: 'Best Western Plus Moncton',
            kind: 'Hotel / end of day', priority: 'required',
            address: '300 Lewisville Rd, Moncton, NB E1A 5Y4', city: 'Moncton, NB',
            notes: 'Return early, shower/reset and pack for Thursday’s long drive. No additional attraction is needed.',
            food: 'Dinner can stay flexible near the hotel.',
            kidPlan: 'Downtime and early evening after three outdoor stops.',
            mapUrl: mapSearchUrl('Best Western Plus Moncton, 300 Lewisville Rd, Moncton, NB E1A 5Y4')
          })
        ],
        meals: [
          mealSlot({ id: 'd6-breakfast', meal: 'Breakfast', title: 'Best Western Plus Moncton breakfast', selectedStopId: 'd6-depart', backup: 'Packed breakfast only if hotel service would delay departure.' }),
          mealSlot({ id: 'd6-lunch', meal: 'Lunch', title: 'Restaurant À la Dune at Aboiteau Beach', selectedStopId: 'd6-aboiteau', backup: 'Use another on-site beach food option; avoid a separate restaurant detour.' }),
          mealSlot({ id: 'd6-dinner', meal: 'Dinner', title: 'Flexible dinner near Best Western Plus Moncton', selectedStopId: 'd6-hotel', backup: 'Takeout near the hotel if everyone is tired.' })
        ]
      });
    }

    return plan;
  };
}
