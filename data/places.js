// Coordinates and rating snapshots for the mapped stops.
// Trip content, split out of app.js so the plan can be edited without
// reading the application code. Loaded as a plain script before app.js.
window.TripData = window.TripData || {};

// Documented stop coordinates for the consolidated route map. Each key is a
// stop id; the value is [latitude, longitude]. These were geocoded from the
// stops' own addresses (OpenStreetMap Nominatim) so the map reuses the single
// itinerary data source rather than a parallel list. A handful were set by
// hand where the raw civic address did not resolve cleanly:
//   - d1-hotel / d2-* Marriott: the coordinates already used by the hotel's
//     street-view link (45.4975, -73.5672).
//   - d1-odessa / d1-big-apple / d5-lunch: matched by place name; d5-lunch
//     (Blue Mussel Café's new 5033 Rustico Road location) uses the café's
//     known North Rustico-area coordinates, accurate to within ~2 km.
//   - d2-old-quebec: co-located with the La Bûche dinner in Old Québec.
//   - d3-kamouraska: Avenue LeBlanc / Quai Miller in Kamouraska village.
// A stop without an entry here still renders in the itinerary; it is simply
// listed under the map's "not shown" note instead of being silently dropped.
window.TripData.STOP_COORDS = {
    // 2026-08-14 — Vaughan → Colborne → Odessa → Brockville → Morrisburg → Montréal
    'd1-depart': [43.83512, -79.53467],
    'd1-fuel': [43.84984, -79.53776],
    'd1-big-apple': [44.02203, -77.90585],
    'd1-odessa': [44.28326, -76.65589],
    'd1-lunch': [44.6039, -75.70238],
    'd1-prehistoric-world': [44.94604, -75.10459],
    'd1-hotel': [45.4975, -73.5672],
    'd1-dinner': [45.48827, -73.58573],
    // 2026-08-15 — Montréal → Trois-Rivières → Montmorency → Old Québec
    'd2-breakfast-stop': [45.4975, -73.5672],
    'd2-depart': [45.4975, -73.5672],
    'd2-low-fuel': [46.35692, -72.6089],
    'd2-falls': [46.89075, -71.14774],
    'd2-lunch': [46.88692, -71.15221],
    'd2-hotel': [46.79038, -71.3538],
    'd2-old-quebec': [46.8114, -71.2065],
    'd2-dinner': [46.81127, -71.20801],
    'd2-return': [46.79038, -71.3538],
    // 2026-08-16 — Québec City → Rivière-du-Loup → Edmundston → Fredericton
    'd3-depart': [46.79038, -71.3538],
    'd3-kamouraska': [47.55697, -69.8784],
    'd3-lunch': [47.83259, -69.53644],
    'd3-edmundston': [47.3733, -68.30401],
    'd3-hartland': [46.29694, -67.52768],
    'd3-hotel': [45.96491, -66.66279],
    'd3-dinner': [45.97004, -66.63241],
    // 2026-08-17 — Fredericton → Moncton → Cape Jourimain → Charlottetown
    'd4-depart': [45.96491, -66.66279],
    'd4-magnetic': [46.13466, -64.88851],
    'd4-lunch': [46.10988, -64.77801],
    'd4-cape': [46.16164, -63.81519],
    'd4-hotel': [46.26187, -63.16567],
    'd4-dinner': [46.4103, -63.34585],
    'd4-victoria': [46.23385, -63.12644],
    'd4-return': [46.26187, -63.16567],
    // 2026-08-18 — Charlottetown hotel switch → Cavendish / North Rustico → Canadas Best Value Inn
    'd5-checkout': [46.26187, -63.16567],
    'd5-bag-drop': [46.26569, -63.15165],
    'd5-green-gables': [46.48874, -63.38211],
    'd5-lunch': [46.45653, -63.29398],
    'd5-beach': [46.49687, -63.35288],
    'd5-rain': [46.48764, -63.39695],
    'd5-hotel': [46.26569, -63.15165],
    'd5-dinner': [46.2361, -63.12984],
    'd5-return': [46.26569, -63.15165],
    // 2026-08-19 — PEI → Confederation Bridge → Hopewell Rocks → Moncton
    'd6-morning-ready': [46.26569, -63.15165],
    'd6-fuel': [46.25616, -63.19006],
    'd6-marine-rail': [46.25026, -63.70458],
    'd6-bridge': [46.23573, -63.72259],
    'd6-sackville-rest': [45.90783, -64.37094],
    'd6-hopewell': [45.81701, -64.5765],
    'd6-lunch': [45.81781, -64.57829],
    'd6-hotel': [46.10092, -64.7646],
    'd6-magnetic': [46.13466, -64.88851],
    'd6-dinner': [46.08872, -64.77583],
    'd6-return': [46.10092, -64.7646],
    // 2026-08-20 — Moncton → Fredericton → Edmundston → Québec City
    'd7-depart': [46.10092, -64.7646],
    'd7-fredericton': [45.93483, -66.66543],
    'd7-hartland': [46.29694, -67.52768],
    'd7-edmundston': [47.36387, -68.33122],
    'd7-rdl': [47.85107, -69.54159],
    'd7-hotel': [46.88505, -71.30772],
    'd7-dinner': [46.88505, -71.30772],
    // 2026-08-21 — Québec City → Centre-du-Québec → Boucherville → Mallorytown North → Vaughan
    'd8-depart': [46.88505, -71.30772],
    'd8-chambly': [45.44862, -73.27591],
    'd8-restaurant-lunch': [45.56878, -73.44477],
    'd8-mallory': [44.48987, -75.85694],
    'd8-big-apple': [44.02203, -77.90585],
    'd8-home': [43.83512, -79.53467]
  };

// TripAdvisor/Google ratings for every hotel, food and attraction stop in the
// operational plan, keyed by stop id. Reuses the same TripAdvisor snapshot as
// PLAN_B_IDEA_COORDS/planBData (taken 2026-07-17) where a stop is the same
// venue as a Plan B row or hotel cross-check entry; the remaining stops were
// looked up fresh on 2026-07-17. Ratings are only attached to the primary
// check-in stop for each hotel, not every checkout/return visit to the same
// building, so the same score is not repeated on non-review logistics cards.
// Two attractions (Ripley's Cavendish, Marine Rail Historical Park) have a
// confirmed TripAdvisor listing but no numeric score could be verified, so
// they keep source+url only (rating left null renders as "page linked").
window.TripData.STOP_RATINGS = {
    'd1-big-apple': { source: 'TripAdvisor', rating: 3.5, reviews: 951, url: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' },
    'd1-lunch': { source: 'TripAdvisor', rating: 3.7, reviews: 27, url: 'https://www.tripadvisor.com/Restaurant_Review-g181758-d4876488-Reviews-Tata_s_House_of_Pizza_Pasta-Brockville_Ontario.html' },
    'd1-prehistoric-world': { source: 'TripAdvisor', rating: 4.4, reviews: 99, url: 'https://www.tripadvisor.ca/Attraction_Review-g499277-d4600300-Reviews-Prehistoric_World-Morrisburg_Ontario.html' },
    'd1-hotel': { source: 'TripAdvisor', rating: 4.1, reviews: 2617, url: 'https://www.tripadvisor.ca/Hotel_Review-g155032-d185746-Reviews-Montreal_Marriott_Chateau_Champlain-Montreal_Quebec.html' },
    'd1-dinner': { source: 'TripAdvisor', rating: 3.9, reviews: 162, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155032-d19271060-Reviews-Time_Out_Market_Montreal-Montreal_Quebec.html' },
    'd2-breakfast-stop': { source: 'TripAdvisor', rating: 3.7, reviews: 23, url: 'https://www.tripadvisor.com/Restaurant_Review-g155032-d23479475-Reviews-Lloyd-Montreal_Quebec.html' },
    'd2-falls': { source: 'TripAdvisor', rating: 4.4, reviews: 10473, url: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155582-Reviews-Parc_de_la_Chute_Montmorency-Quebec_City_Quebec.html' },
    'd2-lunch': { source: 'TripAdvisor', rating: 3.7, reviews: 304, url: 'https://www.tripadvisor.com/Restaurant_Review-g155033-d706126-Reviews-Le_Manoir_Montmorency-Quebec_City_Quebec.html' },
    'd2-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 897, url: 'https://www.tripadvisor.ca/Hotel_Review-g10850433-d1309009-Reviews-Hotel_Cofortel-L_Ancienne_Lorette_Quebec.html' },
    'd2-old-quebec': { source: 'TripAdvisor', rating: 4.6, reviews: 3740, url: 'https://www.tripadvisor.ca/Attraction_Review-g155033-d155589-Reviews-Terrasse_Dufferin-Quebec_City_Quebec.html' },
    'd2-dinner': { source: 'TripAdvisor', rating: 4.3, reviews: 2383, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155033-d8330527-Reviews-La_Buche-Quebec_City_Quebec.html' },
    'd3-kamouraska': { source: 'TripAdvisor', rating: 4.4, reviews: 44, url: 'https://www.tripadvisor.ca/Attraction_Review-g1172165-d8536022-Reviews-Quais_de_Kamouraska-Kamouraska_Bas_Saint_Laurent_Quebec.html' },
    'd3-lunch': { source: 'TripAdvisor', rating: 4.2, reviews: 488, url: 'https://www.tripadvisor.ca/Restaurant_Review-g182149-d772494-Reviews-L_estaminet-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html' },
    'd3-hartland': { source: 'TripAdvisor', rating: 4.4, reviews: 290, url: 'https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html' },
    'd3-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 943, url: 'https://www.tripadvisor.ca/Hotel_Review-g154957-d182691-Reviews-Delta_Hotels_by_Marriott_Fredericton-Fredericton_New_Brunswick.html' },
    'd3-dinner': { source: 'TripAdvisor', rating: 4.6, reviews: 992, url: 'https://www.tripadvisor.com/Restaurant_Review-g154957-d3153443-Reviews-Wolastoq_Wharf-Fredericton_New_Brunswick.html' },
    'd4-magnetic': { source: 'TripAdvisor', rating: 3.7, reviews: 661, url: 'https://www.tripadvisor.ca/Attraction_Review-g154958-d183715-Reviews-Magnetic_Hill_Park-Moncton_New_Brunswick.html' },
    'd4-lunch': { source: 'TripAdvisor', rating: 4.6, reviews: 417, url: 'https://www.tripadvisor.com/Restaurant_Review-g154958-d1007362-Reviews-Tony_s_Bistro_Patisserie-Moncton_New_Brunswick.html' },
    'd4-cape': { source: 'TripAdvisor', rating: 4.3, reviews: 78, url: 'https://www.tripadvisor.ca/Attraction_Review-g4332393-d4431312-Reviews-Cape_Jourimain_Nature_Centre-Bayfield_New_Brunswick.html' },
    'd4-hotel': { source: 'TripAdvisor', rating: 4.4, reviews: 154, url: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d17675210-Reviews-Hampton_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
    'd4-dinner': { source: 'TripAdvisor', rating: 4.2, reviews: 1105, url: 'https://www.tripadvisor.ca/Restaurant_Review-g1800168-d770333-Reviews-New_Glasgow_Lobster_Supper-New_Glasgow_Prince_Edward_Island.html' },
    'd4-victoria': { source: 'TripAdvisor', rating: 4.2, reviews: 531, url: 'https://www.tripadvisor.com/Attraction_Review-g155023-d6949138-Reviews-Victoria_Row-Charlottetown_Prince_Edward_Island.html' },
    'd5-green-gables': { source: 'TripAdvisor', rating: 4.3, reviews: 1657, url: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186971-Reviews-Green_Gables-Cavendish_Prince_Edward_Island.html' },
    'd5-lunch': { source: 'TripAdvisor', rating: 4.6, reviews: 1747, url: 'https://www.tripadvisor.com/Restaurant_Review-g23064095-d1112725-Reviews-Blue_Mussel_Cafe-North_Rustico_Harbour_Prince_Edward_Island.html' },
    'd5-beach': { source: 'TripAdvisor', rating: 4.5, reviews: 955, url: 'https://www.tripadvisor.ca/Attraction_Review-g499311-d186975-Reviews-Cavendish_Beach-Cavendish_Prince_Edward_Island.html' },
    'd5-rain': { source: 'TripAdvisor', rating: null, reviews: null, url: 'https://www.tripadvisor.com/Attraction_Review-g499311-d3404275-Reviews-Ripley_s_Believe_it_or_Not-Cavendish_Prince_Edward_Island.html' },
    'd5-hotel': { source: 'TripAdvisor', rating: 3.6, reviews: 331, url: 'https://www.tripadvisor.ca/Hotel_Review-g155023-d226269-Reviews-Canadas_Best_Value_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html' },
    'd5-dinner': { source: 'TripAdvisor', rating: 4.5, reviews: 117, url: 'https://www.tripadvisor.ca/Restaurant_Review-g155023-d19503722-Reviews-Slaymaker_Nichols_Gastro_House-Charlottetown_Prince_Edward_Island.html' },
    'd6-marine-rail': { source: 'TripAdvisor', rating: null, reviews: null, url: 'https://www.tripadvisor.com/Attraction_Review-g1507275-d4916327-Reviews-Marine_Rail_Historical_Park-Borden_Carleton_Prince_Edward_Island.html' },
    'd6-sackville-rest': { source: 'TripAdvisor', rating: 4.7, reviews: 172, url: 'https://www.tripadvisor.ca/Attractions-g154956-Activities-c57-New_Brunswick.html' },
    'd6-hopewell': { source: 'TripAdvisor', rating: 4.6, reviews: 322, url: 'https://www.tripadvisor.ca/AttractionProductReview-g499179-d11991515-Hopewell_Rocks_Admission-Hopewell_Cape_Albert_County_New_Brunswick.html' },
    'd6-lunch': { source: 'TripAdvisor', rating: 3.6, reviews: 126, url: 'https://www.tripadvisor.com/Restaurant_Review-g499179-d7144614-Reviews-High_Tide_Cafe-Hopewell_Cape_Albert_County_New_Brunswick.html' },
    'd6-hotel': { source: 'TripAdvisor', rating: 4.0, reviews: 656, url: 'https://www.tripadvisor.com/Hotel_Review-g154958-d281344-Reviews-Best_Western_Plus_Moncton-Moncton_New_Brunswick.html' },
    'd6-dinner': { source: 'TripAdvisor', rating: 4.1, reviews: 1041, url: 'https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html' },
    'd7-edmundston': { source: 'TripAdvisor', rating: 3.8, reviews: 264, url: 'https://www.tripadvisor.com/Restaurant_Review-g182168-d4586743-Reviews-Frank_s_Bar_Grill-Edmundston_New_Brunswick.html' },
    'd7-hotel': { source: 'TripAdvisor', rating: 4.0, reviews: 157, url: 'https://www.tripadvisor.com/Hotel_Review-g155033-d575089-Reviews-DoubleTree_by_Hilton_Quebec_Resort-Quebec_City_Quebec.html' },
    'd7-dinner': { source: 'TripAdvisor', rating: 4.0, reviews: 97, url: 'https://www.tripadvisor.com/Restaurant_Review-g155033-d3486867-Reviews-Le_Dijon-Quebec_City_Quebec.html' },
    'd8-chambly': { source: 'TripAdvisor', rating: 4.5, reviews: 219, url: 'https://www.tripadvisor.com/Attraction_Review-g183734-d183936-Reviews-Fort_Chambly_National_Historic_Site-Chambly_Quebec.html' },
    'd8-restaurant-lunch': { source: 'TripAdvisor', rating: 3.9, reviews: 55, url: 'https://www.tripadvisor.ca/Restaurant_Review-g182198-d770803-Reviews-Restaurant_Scores-Boucherville_Quebec.html' },
    'd8-big-apple': { source: 'TripAdvisor', rating: 3.5, reviews: 951, url: 'https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html' }
  };
  // d7-hartland and d6-magnetic are the same Hartland Bridge / Magnetic Hill
  // venues as d3-hartland / d4-magnetic above; point them at the same record.
window.TripData.STOP_RATINGS['d7-hartland'] = window.TripData.STOP_RATINGS['d3-hartland'];
window.TripData.STOP_RATINGS['d6-magnetic'] = window.TripData.STOP_RATINGS['d4-magnetic'];

// Coordinates (OpenStreetMap Nominatim) for the Plan B stops that are NOT the
// same physical place as an existing operational stop or route-side idea —
// e.g. Green Gables, Hopewell Rocks and Cape Jourimain are already numbered
// Plan A pins, so only genuinely new alternates get a map entry here. A couple
// of restaurants Nominatim couldn't resolve use their same-town neighbour's
// coordinates, nudged slightly so they don't sit exactly on an existing pin.
// Three Plan B rows are deliberately left out here because they're the same
// physical place as an existing routeOptionsByDay idea: Parc des Chutes
// (= "Parc des Chutes de Rivière-du-Loup"), Prince Edward Island Preserve
// Company (= "Gardens of Hope & Butterfly House", same New Glasgow parking
// lot), and Albert County Museum (= "Albert County Museum & RB Bennett
// Centre").
window.TripData.PLAN_B_IDEA_COORDS = {
    '1000 Islands Restaurant & Pizzeria': [44.5873, -75.6888],
    'Les Cafes de Julie': [46.8878, -71.1502],
    'Grand Falls Gorge': [47.0453, -67.7360],
    'Pump House Brewpub': [46.0897, -64.7745],
    'Pizza Le Patrimoine': [47.3652, -68.3290],
    'Fromagerie Victoria': [46.6781, -71.3488]
  };
