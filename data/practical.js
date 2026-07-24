// Ticketing, per-stop practical notes and the fuel plan.
// Trip content, split out of app.js so the plan can be edited without
// reading the application code. Loaded as a plain script before app.js.
// The exported factory takes the URL/stop builders it needs from app.js,
// so this file stays free of application logic.
window.TripData = window.TripData || {};

window.TripData.ticketGuidance = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
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
  return ticketGuidance;
};

window.TripData.stopPractical = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
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
  return stopPractical;
};

window.TripData.minimalFuelPlan = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
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
  return minimalFuelPlan;
};
