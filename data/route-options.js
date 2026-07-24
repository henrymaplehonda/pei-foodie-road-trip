// Optional route-side stops offered for each day.
// Trip content, split out of app.js so the plan can be edited without
// reading the application code. Loaded as a plain script before app.js.
// The exported factory takes the URL/stop builders it needs from app.js,
// so this file stays free of application logic.
window.TripData = window.TripData || {};

window.TripData.routeOptionsByDay = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
  var routeOptionsByDay = {
    '2026-08-14': {
      rule: 'Several ideas along the 401, but choose at most one. Check live traffic first; the booked Montreal hotel and proper meals stay protected.',
      options: [{
        name: 'Lake Ontario Park',
        routePoint: 'Between ONroute Odessa and Brockville lunch',
        why: 'A high-quality child reset with an accessible waterfront walk, playground, splash pad and seasonal public washrooms.',
        visit: '35-45 min',
        routeImpact: 'Planning estimate: +20-30 min driving; verify in live Maps.',
        gate: 'Go only if the live Montreal hotel ETA remains 16:45 or earlier. Replace another stretch break; do not stack stops.',
        parking: 'Lake Ontario Park visitor parking, 920 King Street West, Kingston, ON',
        map: mapSearchUrl('Lake Ontario Park visitor parking, 920 King Street West, Kingston, ON'),
        source: 'https://www.cityofkingston.ca/activities-and-recreation/parks-trails-and-sports-fields-and-courts/parks/',
        coords: [44.22011, -76.53036]
      }, {
        name: 'Fort Henry National Historic Site',
        routePoint: 'At Kingston, near the Odessa service break',
        why: 'A restored 19th-century British fortress above the St. Lawrence with open ramparts and summer living-history demonstrations kids enjoy.',
        visit: '60-90 min',
        routeImpact: 'Planning estimate: +20-30 min off the 401 at Kingston plus the visit; paid admission. Verify live Maps.',
        gate: 'Use only as the single optional stop of the day, when both drivers are fresh and the Montreal ETA stays 16:30 or earlier. Then skip The Big Apple.',
        parking: 'Fort Henry visitor parking, 1 Fort Henry Drive, Kingston, ON K7K 5G8',
        map: mapSearchUrl('Fort Henry, 1 Fort Henry Drive, Kingston, ON K7K 5G8'),
        source: 'https://www.forthenry.com/',
        coords: [44.23088, -76.45902]
      }, {
        name: 'Kingston Penitentiary Tour',
        routePoint: 'At Kingston, near the Odessa service break',
        why: 'Guided tour of the former maximum-security prison (1835–2013): cell ranges, the main dome, the segregation wing and the yard—a major Kingston attraction right on the Highway 401 corridor.',
        visit: '1.5 h tour',
        routeImpact: 'Planning estimate: +20-30 min off the 401 at Kingston plus the timed 90-minute tour; paid admission, book ahead. Verify live Maps.',
        gate: 'A long, timed stop: use only as the single optional stop of the day, when both drivers are fresh, tickets are pre-booked and the Montreal ETA still holds. It likely pushes the Marriott arrival into the evening, so skip The Big Apple and Prehistoric World if you choose it.',
        parking: 'Kingston Penitentiary, 560 King Street West, Kingston, ON K7L 4V7 · free onsite parking',
        map: mapSearchUrl('Kingston Penitentiary, 560 King Street West, Kingston, ON K7L 4V7'),
        source: 'https://www.kingstonpentours.com/',
        coords: [44.2194, -76.5136]
      }, {
        name: 'Brockville Railway Tunnel',
        routePoint: 'At the Brockville lunch stop, on the St. Lawrence waterfront',
        why: 'Canada’s first railway tunnel, now a free, flat, lit walk under downtown Brockville with a light-and-sound display—an easy, memorable leg-stretch beside lunch.',
        visit: '30-45 min',
        routeImpact: 'Negligible—it is beside the Brockville lunch; verify parking in live Maps.',
        gate: 'Use instead of a longer lunch or another stretch break, only if the live Montreal ETA stays 16:45 or earlier.',
        parking: 'Blockhouse Island / railway tunnel south portal parking, Blockhouse Island Parkway, Brockville, ON',
        map: mapSearchUrl('Brockville Railway Tunnel, Blockhouse Island Parkway, Brockville, ON'),
        source: 'https://brockvilletourism.com/',
        coords: [44.59141, -75.68403]
      }, {
        name: 'Mount Royal — Kondiaronk Belvedere',
        routePoint: 'In Montréal, an optional evening add-on after hotel check-in',
        why: 'The classic downtown-skyline lookout above the city — an easy, free evening view if there is energy left after the Montréal check-in.',
        visit: '20-30 min',
        routeImpact: 'Evening city driving only; free chalet lookout with parking off Chemin Remembrance.',
        gate: 'Use only as a short after-check-in outing when the child is not overtired; skip it and rest if the day ran long.',
        parking: 'Maison Smith / Mount Royal lot, 1260 Chemin Remembrance, Montréal, QC H3H 1A2',
        map: mapSearchUrl('Belvedere Kondiaronk Mount Royal, 1260 Chemin Remembrance, Montreal, QC'),
        source: 'https://www.lemontroyal.qc.ca/en',
        coords: [45.50442, -73.58730]
      }]
    },
    '2026-08-15': {
      rule: 'A few easy ideas around Québec City—pick at most one. Keep Montmorency Falls, the La Bûche dinner and the 16:00 hotel access protected.',
      options: [{
        name: 'Trois-Rivieres Harbourfront Park',
        routePoint: 'At the Trois-Rivieres break, before Montmorency Falls',
        why: 'A short three-level St. Lawrence waterfront walk with harbour and Laviolette Bridge views; better than waiting beside the highway.',
        visit: '25-35 min',
        routeImpact: 'Planning estimate: +15-25 min city driving; verify in live Maps.',
        gate: 'Leave the harbourfront by 10:30. Skip immediately if Montreal traffic has already used the timing buffer.',
        parking: 'Parc portuaire / tourist information visitor parking, 1400 Rue du Fleuve, Trois-Rivieres, QC',
        map: mapSearchUrl('Parc portuaire tourist information parking, 1400 Rue du Fleuve, Trois-Rivieres, QC'),
        source: 'https://www.tourismetroisrivieres.com/en/what-to-do/harbourfront-park',
        coords: [46.34251, -72.53632]
      }, {
        name: 'Plains of Abraham (Battlefields Park)',
        routePoint: 'In Québec City, beside Old Québec',
        why: 'A large, free clifftop parkland with wide lawns, walking paths and river views—an easy, low-cost alternative to a crowded Old Québec walk.',
        visit: '30-60 min',
        routeImpact: 'Minimal within Québec City; free grounds, the museum is optional and paid.',
        gate: 'Use instead of, or right after, the Dufferin Terrace walk. Keep the La Bûche dinner and the 16:00 Cofortel access protected.',
        parking: 'Plains of Abraham / Discovery Pavilion parking, 835 Avenue Wilfrid-Laurier, Québec, QC G1R 2L3',
        map: mapSearchUrl('Plains of Abraham Discovery Pavilion, 835 Avenue Wilfrid-Laurier, Quebec, QC'),
        source: 'https://www.theplainsofabraham.ca/',
        coords: [46.79766, -71.22883]
      }, {
        name: 'Basilica of Sainte-Anne-de-Beaupré',
        routePoint: 'Just past Montmorency Falls on Boulevard Sainte-Anne',
        why: 'A grand, free-to-enter basilica with striking mosaics and stained glass, a short drive beyond Montmorency along the same shoreline road.',
        visit: '30-45 min',
        routeImpact: 'Planning estimate: +30-40 min return past Montmorency (it is a short backtrack); verify live Maps.',
        gate: 'Use only if Montmorency and lunch finish early and everyone has energy. Turn back if it would squeeze the Old Québec afternoon or the 18:15 dinner.',
        parking: 'Sanctuaire Sainte-Anne-de-Beaupré visitor parking, 10018 Avenue Royale, Sainte-Anne-de-Beaupré, QC G0A 3C0',
        map: mapSearchUrl('Sanctuaire Sainte-Anne-de-Beaupre, 10018 Avenue Royale, Sainte-Anne-de-Beaupre, QC'),
        source: 'https://sanctuairesainteanne.org/',
        coords: [47.02408, -70.92832]
      }, {
        name: 'Québec bridges riverside viewpoint (Anse au Foulon)',
        routePoint: 'On the Sillery riverfront in Québec City, below the cliffs',
        why: 'A quiet St. Lawrence riverside spot with views of the Québec and Pierre-Laporte bridges — an easy leg-stretch and photo stop.',
        visit: '15-25 min',
        routeImpact: 'Planning estimate: +15-20 min from Old Québec; verify parking in live Maps.',
        gate: 'Use only if Montmorency, Old Québec and dinner timing all hold; skip it to protect the 16:00 Cofortel access if the day is tight.',
        parking: 'Anse au Foulon riverside parking, 2793 Chemin du Foulon, Québec, QC G1W 2G6',
        map: mapSearchUrl('2793 Chemin du Foulon, Quebec City, QC G1W 2G6'),
        coords: [46.76661, -71.28460]
      }]
    },
    '2026-08-16': {
      rule: 'High-driving day: choose at most one, and only as a deliberate swap for Hartland and every other optional stop. Never an add-on.',
      options: [{
        name: 'New Brunswick Botanical Garden',
        routePoint: 'At Edmundston, before the Hartland corridor',
        why: 'A peaceful, family-friendly garden break with themed landscapes; the August 2026 schedule lists daily hours through 20:00.',
        visit: '60-75 min',
        routeImpact: 'Near the route; allow the full visit time plus parking. Paid admission.',
        gate: 'Use only if Kamouraska ran on time, both drivers feel fresh and live Fredericton hotel ETA remains 18:00 or earlier. Then skip Hartland.',
        parking: 'New Brunswick Botanical Garden main visitor parking, 15 Isidore-Boucher Boulevard, Edmundston, NB E7B 1V6',
        map: mapSearchUrl('New Brunswick Botanical Garden main parking, 15 Isidore-Boucher Boulevard, Edmundston, NB E7B 1V6'),
        source: 'https://jardinnbgarden.com/en/opening-hours/',
        coords: [47.43951, -68.39269]
      }, {
        name: 'Parc des Chutes de Rivière-du-Loup',
        routePoint: 'In Rivière-du-Loup, beside the lunch stop',
        why: 'A 33 m waterfall with a footbridge, shaded trails and lookouts right in town—an easy, free leg-stretch beside the Rivière-du-Loup lunch.',
        visit: '30-45 min',
        routeImpact: 'Negligible—it is in Rivière-du-Loup at the lunch stop; verify parking in live Maps.',
        gate: 'Use as a short walk after lunch, only if Kamouraska ran on time and the live Fredericton hotel ETA stays 18:00 or earlier. Then skip Hartland.',
        parking: 'Parc des Chutes visitor parking, Rue Frontenac, Rivière-du-Loup, QC',
        map: mapSearchUrl('Parc des Chutes, Rue Frontenac, Riviere-du-Loup, QC'),
        coords: [47.83344, -69.52898]
      }, {
        name: 'World’s Largest Axe',
        routePoint: 'At Nackawic, NB, a short detour off the TransCanada',
        why: 'A giant riverside roadside monument with a small park and washrooms — a fun, free child stretch and photo.',
        visit: '15 min',
        routeImpact: 'Planning estimate: +10-15 min off the route into Nackawic; verify live Maps.',
        gate: 'Use only as the day’s single quick stretch if on time; otherwise keep driving toward Fredericton.',
        parking: 'World’s Largest Axe parking, 152 Otis Drive, Nackawic, NB E6G 1H2',
        map: mapSearchUrl('Worlds Largest Axe, 152 Otis Drive, Nackawic, NB E6G 1H2'),
        coords: [45.99619, -67.24160]
      }, {
        name: 'New Brunswick Military History Museum',
        routePoint: 'At Oromocto (Base Gagetown), just before Fredericton',
        why: 'A large military-history collection with vehicles and exhibits near the end of the drive — a good indoor option for a rainy or hot afternoon.',
        visit: '45-60 min',
        routeImpact: 'Planning estimate: +15-20 min off the route at Oromocto; verify 2026 hours and base-access rules.',
        gate: 'Use instead of every other option, only if the drive is on time and the child wants an indoor stop. Confirm hours before detouring.',
        parking: 'NB Military History Museum parking, 119 Walnut Street, Oromocto, NB E2V 4J5',
        map: mapSearchUrl('New Brunswick Military History Museum, 119 Walnut Street, Oromocto, NB E2V 4J5'),
        source: 'https://www.nbmilitaryhistorymuseum.ca/',
        coords: [45.83843, -66.44290]
      }]
    },
    '2026-08-17': {
      rule: 'A few Moncton ideas, but pick at most one—Bore Park, Magnetic Hill or the Zoo, never a stack. The tide and hotel clock, not spare time, decide.',
      options: [{
        name: 'Bore Park tidal bore viewpoint',
        routePoint: 'In Moncton, before Cape Jourimain and PEI',
        why: 'A quick view of the Petitcodiac tidal wave; summer interpretive presentations are timed to the predicted bore.',
        visit: '25-35 min',
        routeImpact: 'Planning estimate: +15-25 min downtown driving; verify in live Maps.',
        gate: 'Go only when the official predicted wave is within 20 minutes of arrival. Replace Magnetic Hill and leave immediately after the wave.',
        parking: 'Treitz Haus / Bore Park visitor parking, 10 Bendview Court, Moncton, NB',
        map: mapSearchUrl('Treitz Haus Bore Park visitor parking, 10 Bendview Court, Moncton, NB'),
        source: 'https://www.resurgo.ca/learn-discover/tidal-bore-presentations',
        coords: [46.08969, -64.77066]
      }, {
        name: 'Magnetic Hill Zoo',
        routePoint: 'In Moncton, beside the Magnetic Hill area',
        why: 'The Maritimes’ largest zoo—a genuine kid highlight with shaded paths, if you want more than the quick Magnetic Hill illusion stop.',
        visit: '90-120 min',
        routeImpact: 'Planning estimate: +10-15 min from Magnetic Hill plus a longer visit; paid admission. Verify live Maps.',
        gate: 'Use instead of Cape Jourimain and every other optional stop, only if lunch was quick and the Charlottetown hotel ETA stays 17:00 or earlier.',
        parking: 'Magnetic Hill Zoo visitor parking, 125 Magic Mountain Road, Moncton, NB E1G 2W7',
        map: mapSearchUrl('Magnetic Hill Zoo, 125 Magic Mountain Road, Moncton, NB E1G 2W7'),
        source: 'https://magnetichillzoo.ca/',
        coords: [46.13808, -64.88466]
      }, {
        name: 'Giant Lobster (Shediac)',
        routePoint: 'At Shediac, NB, just off Route 15 before the bridge',
        why: 'The famous “World’s Largest Lobster” monument with a small park — a fun, free two-minute photo stop for the kids.',
        visit: '10-15 min',
        routeImpact: 'Planning estimate: +10-15 min into Shediac; verify live Maps.',
        gate: 'Use as a fast photo stretch only; keep the Confederation Bridge crossing and 15:15 Hampton ETA protected.',
        parking: 'Rotary Park / Giant Lobster parking, 229 Main Street, Shediac, NB E4P 2A5',
        map: mapSearchUrl('Giant Lobster, 229 Main Street, Shediac, NB E4P 2A5'),
        coords: [46.21930, -64.54030]
      }, {
        name: 'Port Borden Range Rear Lighthouse',
        routePoint: 'At Borden-Carleton, just after the bridge onto PEI',
        why: 'A tall red-and-white range lighthouse beside Gateway Village — an easy first-photo-on-the-island stop.',
        visit: '10-15 min',
        routeImpact: 'Negligible — right beside the bridge exit at Gateway Village; verify parking in live Maps.',
        gate: 'Use as a quick photo/washroom stretch at Gateway Village only if the Hampton ETA holds.',
        parking: 'Gateway Village visitor parking, Borden-Carleton, PE C0B 1X0',
        map: mapSearchUrl('Port Borden Range Rear Lighthouse, Borden-Carleton, PE'),
        coords: [46.24970, -63.70530]
      }, {
        name: 'Victoria Seaport Lighthouse Museum',
        routePoint: 'At Victoria-by-the-Sea, a short detour off Route 1',
        why: 'A tiny historic fishing village with a small lighthouse museum, chocolate shop and wharf — a charming, low-key seaside stretch.',
        visit: '30-45 min',
        routeImpact: 'Planning estimate: +15-20 min off Route 1 to Victoria; verify 2026 hours and live Maps.',
        gate: 'Use instead of another stop, only if the drive is on time for the 15:15 Hampton ETA.',
        parking: 'Victoria-by-the-Sea wharf parking, Victoria, PE C0A 2G0',
        map: mapSearchUrl('Victoria Seaport Lighthouse Museum, Victoria, PE'),
        coords: [46.21580, -63.48970]
      }, {
        name: 'Prince Edward Battery (Victoria Park)',
        routePoint: 'In Charlottetown, an optional evening add-on near the hotel',
        why: 'Historic cannons and harbour views along Victoria Park’s waterfront boardwalk — a free, easy evening walk after Charlottetown check-in.',
        visit: '30-45 min',
        routeImpact: 'Minimal within Charlottetown; free parking. Verify live Maps.',
        gate: 'Use only as a short evening outing if there is energy after check-in; the New Glasgow dinner stays the plan.',
        parking: 'Victoria Park / Prince Edward Battery parking, 45 Victoria Park Roadway, Charlottetown, PE C1A 8T6',
        map: mapSearchUrl('Prince Edward Battery, 45 Victoria Park Roadway, Charlottetown, PE C1A 8T6'),
        coords: [46.22480, -63.13600]
      }, {
        name: 'Peake’s Wharf & Confederation Landing (Charlottetown)',
        routePoint: 'On the Charlottetown waterfront, an optional evening add-on',
        why: 'A lively boardwalk with boats, buskers, shops and treats at the harbour — an easy family evening stroll.',
        visit: '30-60 min',
        routeImpact: 'Minimal within Charlottetown; paid downtown parking at Confederation Landing.',
        gate: 'Use as a relaxed evening walk only if energy remains after the New Glasgow dinner.',
        parking: 'Confederation Landing parking, 2 Great George Street, Charlottetown, PE C1A 4K7',
        map: mapSearchUrl('Peakes Wharf Confederation Landing, 2 Great George Street, Charlottetown, PE'),
        coords: [46.23200, -63.12650]
      }]
    },
    '2026-08-18': {
      rule: 'Choose one only. These are low-stress substitutes when the beach, weather or energy level changes—not extra mileage to collect.',
      options: [{
        name: 'Gardens of Hope & Butterfly House',
        routePoint: 'Between Cavendish / North Rustico and Charlottetown',
        why: 'A compact garden and tropical butterfly experience that genuinely works for a six-year-old; the Butterfly House is listed 10:00-17:00 in season.',
        visit: '45-60 min',
        routeImpact: 'Small New Glasgow route adjustment; verify live Maps.',
        gate: 'Use when the beach is shortened by at least 45 minutes. Arrive by 16:00 and protect the hotel switch and dinner.',
        parking: 'Prince Edward Island Preserve Company main visitor parking, 2841 New Glasgow Road, New Glasgow, PE C0A 1N0',
        map: mapSearchUrl('Prince Edward Island Preserve Company visitor parking, 2841 New Glasgow Road, New Glasgow, PE C0A 1N0'),
        source: 'https://preservecompany.com/pages/hours-of-operation',
        coords: [46.40913, -63.34818]
      }, {
        name: 'Cavendish Boardwalk',
        routePoint: 'In Cavendish, beside the day\'s main activity area',
        why: 'A very easy weather-flex stop with COWS ice cream, simple shops, clean facilities, a lawn and free parking.',
        visit: '30-45 min',
        routeImpact: 'Negligible within Cavendish; no separate scenic detour.',
        gate: 'Use instead of beach time or a longer Avonlea browse. Do not combine it with the Butterfly House option.',
        parking: 'Cavendish Boardwalk free visitor parking, 9139 Cavendish Road, Cavendish, PE C0A 1N0',
        map: mapSearchUrl('Cavendish Boardwalk free parking, 9139 Cavendish Road, Cavendish, PE C0A 1N0'),
        source: 'https://cavendishboardwalk.com/',
        coords: [46.48129, -63.41107]
      }, {
        name: 'Avonlea Village',
        routePoint: 'In Cavendish, near Green Gables',
        why: 'An Anne-of-Green-Gables-themed village of shops, treats and open lawn—an easy, low-key backup if Green Gables is busy or the beach is cut short.',
        visit: '45-60 min',
        routeImpact: 'Negligible within Cavendish; free to walk the grounds.',
        gate: 'Use instead of beach time or the Butterfly House option, arriving by 16:00 so the hotel switch and Slaymaker dinner stay protected.',
        parking: 'Avonlea Village visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0',
        map: mapSearchUrl('Avonlea Village, 8779 Route 6, Cavendish, PE C0A 1N0'),
        coords: [46.48908, -63.39025]
      }, {
        name: 'Cavendish Dunelands Trail (PEI National Park)',
        routePoint: 'In Cavendish, beside the beach/park area',
        why: 'A short boardwalk-and-dune loop through the coastal dunes — an easy, scenic nature walk that pairs with beach time.',
        visit: '30-45 min',
        routeImpact: 'Negligible within the Cavendish park area; free with park access.',
        gate: 'Use as a short scenic walk in place of extra beach time; keep the hotel switch and Slaymaker dinner protected.',
        parking: 'Cavendish Dunelands Trail parking, Gulf Shore Parkway West, Cavendish, PE',
        map: mapSearchUrl('Cavendish Dunelands Trail, Gulf Shore Parkway West, Cavendish, PE'),
        source: 'https://parks.canada.ca/pn-np/pe/pei-ipe',
        coords: [46.49860, -63.40980]
      }]
    },
    '2026-08-19': {
      rule: 'Ideas along Route 114 after Hopewell, but choose at most one—only after the ocean floor and lunch are done. All are easy to skip.',
      options: [{
        name: 'Albert County Museum & RB Bennett Centre',
        routePoint: 'Immediately after Hopewell Rocks, before Hillsborough',
        why: 'Twenty-four exhibits across historic buildings make a useful family history stop without leaving the Hopewell route.',
        visit: '45-60 min',
        routeImpact: 'Very small Route 114 detour; paid admission.',
        gate: 'Leave by 15:00 and confirm live Best Western ETA no later than 16:15. Otherwise protect hotel pool time.',
        parking: 'Albert County Museum on-site visitor parking, 3940 Route 114, Hopewell Cape, NB E4H 3J8',
        map: mapSearchUrl('Albert County Museum visitor parking, 3940 Route 114, Hopewell Cape, NB E4H 3J8'),
        source: 'https://www.albertcountymuseum.com/hours-admissions-index',
        coords: [45.84892, -64.5782]
      }, {
        name: 'Steeves House Museum',
        routePoint: 'On Route 114 in Hillsborough, before Moncton',
        why: 'A smaller historic-house visit suited to a short stop; the 2026 schedule is Wednesday-Monday, 10:00-17:00.',
        visit: '30-40 min self-guided',
        routeImpact: 'Minimal route change; self-guided admission is listed for age six and up.',
        gate: 'Choose this instead of Albert County Museum and leave by 15:20. Skip if anyone prefers the hotel reset.',
        parking: 'Steeves House Museum visitor parking, 40 Mill Street, Hillsborough, NB E4H 2Z8',
        map: mapSearchUrl('Steeves House Museum visitor parking, 40 Mill Street, Hillsborough, NB E4H 2Z8'),
        source: 'https://www.steeveshousemuseum.ca/visit',
        coords: [45.92527, -64.64388]
      }, {
        name: 'Cape Enrage',
        routePoint: 'A signed detour off Route 915, south of Hopewell Rocks',
        why: 'A dramatic clifftop lighthouse with Bay of Fundy views, a beach and optional zipline—a big-payoff scenic stop for a good-weather, on-time day.',
        visit: '45-75 min',
        routeImpact: 'Planning estimate: +40-55 min round trip off Route 915; verify live Maps and 2026 hours.',
        gate: 'Only replace both museums and every other stop, when the ocean floor finished early, weather is clear and the Best Western ETA stays 16:15 or earlier.',
        parking: 'Cape Enrage visitor parking, 650 Cape Enrage Road, Waterside, NB E4H 4Z5',
        map: mapSearchUrl('Cape Enrage, 650 Cape Enrage Road, Waterside, NB E4H 4Z5'),
        source: 'https://www.capenrage.ca/',
        coords: [45.59465, -64.78084]
      }]
    },
    '2026-08-20': {
      rule: 'Longest drive: at most one, and only as a child movement swap—never an added sightseeing stop. Kings Landing is a bigger commitment; use it only with a big time cushion.',
      options: [{
        name: 'Republique Provincial Park playground & riverside trail',
        routePoint: 'At Edmundston lunch, before the Quebec-bound drive',
        why: 'A fully equipped outdoor playground and an easy 1 km Petit-Temis riverside trail give the child a real reset close to the route.',
        visit: '25-35 min',
        routeImpact: 'Near the lunch corridor; verify day-use access and live Maps.',
        gate: 'Use only if lunch finishes early, both drivers are alert and live DoubleTree ETA remains 16:45 or earlier. Skip every other optional stop.',
        parking: 'Republique Provincial Park day-use parking, 31 Isidore-Boucher Boulevard, Edmundston, NB',
        map: mapSearchUrl('Republique Provincial Park day-use parking, 31 Isidore-Boucher Boulevard, Edmundston, NB'),
        source: 'https://www.parcsnb.ca/en/parks/8/republique-provincial-park',
        coords: [47.44127, -68.39394]
      }, {
        name: 'Kings Landing Historical Settlement',
        routePoint: 'Just west of Fredericton on the TransCanada, early in the day',
        why: 'A large riverside living-history village with costumed interpreters and animals—a genuine highlight, but a real time commitment on the longest driving day.',
        visit: '2-3 hours',
        routeImpact: 'Right off the TransCanada; paid admission and a long visit. Verify 2026 hours in live Maps.',
        gate: 'Only if you deliberately shorten the day by leaving Moncton very early and both drivers accept a late DoubleTree arrival. Skip if in any doubt—this is the day to just drive.',
        parking: 'Kings Landing visitor parking, 5804 Route 102, Prince William, NB E6K 0A5',
        map: mapSearchUrl('Kings Landing, 5804 Route 102, Prince William, NB E6K 0A5'),
        source: 'https://www.kingslanding.nb.ca/',
        coords: [45.87703, -66.97803]
      }]
    },
    '2026-08-21': {
      rule: 'One quick idea on the A-20—choose it only if it does not delay the fatigue-managed drive home. Fort Chambly is already the planned morning stop.',
      options: [{
        name: 'Fromagerie Lemaire',
        routePoint: 'At Saint-Cyrille-de-Wendover near Drummondville, right on the A-20',
        why: 'The classic Québec road-trip cheese stop: fresh curds and quick poutine directly beside the highway—an easy curds-to-go grab before Fort Chambly.',
        visit: '20-30 min',
        routeImpact: 'Negligible—it is right on the A-20 westbound; verify parking in live Maps.',
        gate: 'Use as a fast curds/washroom grab only if you are on time; skip it if the morning is already tight before Fort Chambly and the 11:00 Scores lunch.',
        parking: 'Fromagerie Lemaire on-site parking, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9',
        map: mapSearchUrl('Fromagerie Lemaire, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9'),
        source: 'https://www.fromagerie-lemaire.ca/menu-restaurant-fromagerie-lemaire/',
        coords: [45.91066, -72.45168]
      }, {
        name: 'Thousand Islands Parkway lookout',
        routePoint: 'Just west of Mallorytown, a short loop off Highway 401',
        why: 'A quiet St. Lawrence scenic drive with river-and-islands lookouts — a calm alternative stretch to a plain service stop.',
        visit: '20-30 min',
        routeImpact: 'Planning estimate: +10-20 min via the parkway loop; verify live Maps.',
        gate: 'Use in place of a service-stop stretch only if both drivers are fresh and you are on time to reach Vaughan safely.',
        parking: 'Thousand Islands Parkway lookout pull-off, Mallorytown, ON',
        map: mapSearchUrl('Thousand Islands Parkway lookout, Mallorytown, ON'),
        coords: [44.39080, -75.87600]
      }, {
        name: 'Brockville Waterfront (Blockhouse Island)',
        routePoint: 'At Brockville, a short detour off Highway 401',
        why: 'A flat riverfront park with benches, boats and the railway-tunnel portal nearby — an easy final leg-stretch on the drive home.',
        visit: '20-30 min',
        routeImpact: 'Planning estimate: +10-15 min into downtown Brockville; verify live Maps.',
        gate: 'Use as a single quick stretch only if on time and both drivers are alert; otherwise keep driving.',
        parking: 'Blockhouse Island parking, Blockhouse Island Parkway, Brockville, ON',
        map: mapSearchUrl('Blockhouse Island, Blockhouse Island Parkway, Brockville, ON'),
        coords: [44.59050, -75.68470]
      }]
    }
  };
  return routeOptionsByDay;
};
