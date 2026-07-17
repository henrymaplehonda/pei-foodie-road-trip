import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs", "tripadvisor-plan-b-20260717");
const outputFile = path.join(outputDir, "henry-family-tripadvisor-plan-b.xlsx");

const trip = {
  title: "Henry Family Road Trip - TripAdvisor Plan B",
  subtitle:
    "Top-rated and strategically useful alternatives along the booked-hotel route. Hotels remain fixed and safe.",
  assumption:
    "Built July 17, 2026 from current TripAdvisor pages/search snippets plus the existing booked hotel itinerary. Recheck hours and tickets before travel."
};

const hotels = [
  ["2026-08-14", "Montreal", "Montreal Marriott Chateau Champlain", "1050 De La Gauchetiere W, Montreal, QC H3B 4C9", 4.1, 2617, "Booked - fixed", "https://www.tripadvisor.ca/Hotel_Review-g155032-d185746-Reviews-Montreal_Marriott_Chateau_Champlain-Montreal_Quebec.html"],
  ["2026-08-15", "Quebec City", "Hotel Cofortel", "6500 Boul. Wilfrid-Hamel, L'Ancienne-Lorette, QC G2E 2J1", 4.4, 897, "Booked - fixed", "https://www.tripadvisor.ca/Hotel_Review-g10850433-d1309009-Reviews-Hotel_Cofortel-L_Ancienne_Lorette_Quebec.html"],
  ["2026-08-16", "Fredericton", "Delta Hotels by Marriott Fredericton", "225 Woodstock Rd, Fredericton, NB E3B 2H8", 4.4, 943, "Booked - fixed", "https://www.tripadvisor.ca/Hotel_Review-g154957-d182691-Reviews-Delta_Hotels_by_Marriott_Fredericton-Fredericton_New_Brunswick.html"],
  ["2026-08-17", "Charlottetown", "Hampton Inn & Suites Charlottetown", "300 Capital Dr, Charlottetown, PE C1E 1E8", 4.4, 154, "Booked - fixed", "https://www.tripadvisor.ca/Hotel_Review-g155023-d17675210-Reviews-Hampton_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html"],
  ["2026-08-18", "Charlottetown", "Canadas Best Value Inn & Suites Charlottetown", "20 Capital Dr, Charlottetown, PE C1E 1E7", 3.6, 331, "Booked - fixed", "https://www.tripadvisor.ca/Hotel_Review-g155023-d226269-Reviews-Canadas_Best_Value_Inn_Suites_Charlottetown-Charlottetown_Prince_Edward_Island.html"],
  ["2026-08-19", "Moncton", "Best Western Plus Moncton", "300 Lewisville Rd, Moncton, NB E1A 5Y4", null, null, "Booked - fixed; rating not captured in current snippet", "https://www.tripadvisor.ca/Hotel_Review-g154958-d281344-Reviews-Best_Western_Plus_Moncton-Moncton_New_Brunswick.html"],
  ["2026-08-20", "Quebec City", "DoubleTree by Hilton Quebec Resort", "7900 Rue du Marigot, Quebec City, QC G1G 6T8", null, 152, "Booked - fixed; page/reviews found, rating not captured in current snippet", "https://www.tripadvisor.ca/Hotel_Review-g155033-d575089-Reviews-DoubleTree_by_Hilton_Quebec_Resort-Quebec_City_Quebec.html"]
];

const stops = [
  ["2026-08-14", "Fri", "08:30", "Vaughan to Montreal", "The Big Apple", "Attraction / child break", "Strategic only", 3.5, 951, "Useful washroom and kid stretch just off 401, but not a top-rated destination.", "Use if the child needs an early reward stop.", "Skip if GTA traffic is slow; protect Brockville lunch and Montreal arrival.", "20-25 min", "Snack only; do not make this lunch.", "On-site visitor parking, 262 Orchard Rd, Colborne, ON", "https://www.google.com/maps/search/?api=1&query=The+Big+Apple+Colborne", "https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html"],
  ["2026-08-14", "Fri", "11:30", "Vaughan to Montreal", "1000 Islands Restaurant & Pizzeria", "Food", "Top food Plan B", 4.6, 361, "Higher TripAdvisor lunch option in Brockville than the current pizza fallback.", "Use if you want a stronger rated sit-down lunch near the route.", "Skip if it adds downtown parking stress or timing slips past 12:45.", "45-60 min", "Proper lunch: pizza, pasta, Greek comfort food.", "Downtown Brockville street/lot parking nearby; confirm live map.", "https://www.google.com/maps/search/?api=1&query=1000+Islands+Restaurant+%26+Pizzeria+Brockville", "https://www.tripadvisor.ca/Restaurant_Review-g181758-d765948-Reviews-1000_Islands_Restaurant_Pizzeria-Brockville_Ontario.html"],
  ["2026-08-14", "Fri", "12:40", "Vaughan to Montreal", "Brockville Railway Tunnel", "Attraction", "Top short attraction", 4.6, 637, "Free, short, memorable movement break by the waterfront.", "Use only if lunch finishes early and Montreal ETA remains comfortable.", "Skip first if anyone is tired or traffic is heavy.", "20-35 min", "No meal; pair with Brockville lunch.", "Waterfront/downtown parking near Market St W.", "https://www.google.com/maps/search/?api=1&query=Brockville+Railway+Tunnel", "https://www.tripadvisor.ca/Attraction_Review-g181758-d1236724-Reviews-Brockville_Railway_Tunnel-Brockville_Ontario.html"],
  ["2026-08-14", "Fri", "17:45", "Montreal evening", "Time Out Market Montreal", "Food", "Easy family dinner", 3.9, 162, "Not the highest-rated food, but very practical with choices, seating and indoor comfort.", "Use when the family wants easy food after check-in.", "Skip for Lloyd if arrival is late or everyone is cooked.", "45-75 min", "Light dinner: everyone picks simple food.", "Walk from Marriott; do not move the car.", "https://www.google.com/maps/search/?api=1&query=Time+Out+Market+Montreal", "https://www.tripadvisor.ca/Restaurant_Review-g155032-d19271060-Reviews-Time_Out_Market_Montreal-Montreal_Quebec.html"],

  ["2026-08-15", "Sat", "11:30", "Montreal to Quebec City", "Parc de la Chute-Montmorency", "Attraction", "Priority", null, null, "Major scenic stop before the Quebec City hotel, with strong traveler feedback and easy child appeal.", "Use as Plan A unless weather or construction makes it unpleasant.", "Skip cable car/extra walking before skipping the whole stop.", "75-120 min", "Lunch at or near the park.", "Lower-site P1/P2 visitor parking, 5300 Boulevard Sainte-Anne.", "https://www.google.com/maps/search/?api=1&query=Parc+de+la+Chute-Montmorency+P1+P2", "https://www.tripadvisor.ca/Attraction_Review-g155033-d155582-Reviews-Parc_de_la_Chute_Montmorency-Quebec_City_Quebec.html"],
  ["2026-08-15", "Sat", "12:45", "Montreal to Quebec City", "Les Cafes de Julie", "Food", "Top light food Plan B", 4.8, 44, "Much stronger TripAdvisor score than the Manoir restaurant nearby; better if you want a quick light lunch.", "Use if Manoir feels too slow or you want more attraction time.", "Skip if you need guaranteed seated lunch inside the park.", "35-45 min", "Light lunch: soup, sandwich, coffee, sweets.", "Near Montmorency; verify live parking before detouring.", "https://www.google.com/maps/search/?api=1&query=Les+Cafes+de+Julie+Quebec+City", "https://www.tripadvisor.ca/Restaurant_Review-g155033-d6702385-Reviews-Les_Cafes_de_Julie-Quebec_City_Quebec.html"],
  ["2026-08-15", "Sat", "17:10", "Quebec City evening", "Terrasse Dufferin", "Attraction", "Top easy walk", null, null, "Classic Old Quebec view walk that stays short and scenic.", "Use if everyone has energy after Cofortel check-in.", "Skip if parking looks difficult or child needs hotel downtime.", "30-45 min", "Pair with light dinner nearby.", "Park once at Stationnement De Beaucours or Hotel-de-Ville garage.", "https://www.google.com/maps/search/?api=1&query=Terrasse+Dufferin+Quebec+City", "https://www.tripadvisor.ca/Attraction_Review-g155033-d155589-Reviews-Terrasse_Dufferin-Quebec_City_Quebec.html"],
  ["2026-08-15", "Sat", "18:15", "Quebec City evening", "La Buche", "Food", "Strong local dinner", 4.3, 2383, "Very popular Quebecois dinner near Old Quebec sights.", "Use with a reservation and an early dinner time.", "Skip if the wait is long; choose a simpler nearby meal.", "60-75 min", "Light or proper dinner depending on lunch size.", "Walk from Old Quebec parking.", "https://www.google.com/maps/search/?api=1&query=La+Buche+Quebec+City", "https://www.tripadvisor.ca/Restaurant_Review-g155033-d8330527-Reviews-La_Buche-Quebec_City_Quebec.html"],

  ["2026-08-16", "Sun", "09:10", "Quebec City to Fredericton", "Quais de Kamouraska / Kamouraska Quai Miller", "Attraction", "Requested scenic stop", null, null, "Requested waterfront stop; TripAdvisor lists Quais de Kamouraska as a local attraction.", "Use as a short St. Lawrence reset before lunch.", "Skip only for severe weather or if departure slips badly.", "20-25 min", "No meal; scenic walk only.", "Public parking around Avenue LeBlanc / Rue du Quai.", "https://www.google.com/maps/search/?api=1&query=Quais+de+Kamouraska+Avenue+LeBlanc", "https://www.tripadvisor.ca/Attraction_Review-g1172165-d8536022-Reviews-Quais_de_Kamouraska-Kamouraska_Bas_Saint_Laurent_Quebec.html"],
  ["2026-08-16", "Sun", "10:30", "Quebec City to Fredericton", "L'Estaminet", "Food", "Substantial lunch", 4.2, 488, "Reliable rated lunch in Riviere-du-Loup before the long NB stretch.", "Use as the day's proper meal.", "Skip only if service wait threatens Fredericton arrival; use quick fallback nearby.", "50-60 min", "Proper lunch: pasta, burgers, salads, pub plates.", "Street/nearby parking in Riviere-du-Loup; confirm live map.", "https://www.google.com/maps/search/?api=1&query=L%27estaminet+Riviere-du-Loup", "https://www.tripadvisor.ca/Restaurant_Review-g182149-d772494-Reviews-L_estaminet-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html"],
  ["2026-08-16", "Sun", "11:45", "Quebec City to Fredericton", "Parc des Chutes", "Attraction", "Top stretch Plan B", 4.3, 347, "Waterfall and trails; best if lunch is fast and legs need movement.", "Use only if you leave Riviere-du-Loup on time.", "Skip if Fredericton arrival would pass 18:00.", "25-45 min", "No meal; washroom/stretch if available.", "Park near Rue Frontenac access.", "https://www.google.com/maps/search/?api=1&query=Parc+des+Chutes+Riviere-du-Loup", "https://www.tripadvisor.ca/ShowUserReviews-g182149-d3370299-r690514046-Parc_des_Chutes-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html"],
  ["2026-08-16", "Sun", "13:30", "Quebec City to Fredericton", "Grand Falls Gorge", "Attraction", "Optional scenic reset", null, 328, "TripAdvisor ranks it No.1 in Grand Falls; a strong scenic break but adds time.", "Use only if drivers feel fresh and hotel ETA remains safe.", "Skip for any fatigue; this is a long driving day.", "35-50 min", "No meal; quick scenic walk.", "Visitor parking around 25 Madawaska Rd.", "https://www.google.com/maps/search/?api=1&query=Grand+Falls+Gorge+25+Madawaska+Road", "https://www.tripadvisor.ca/Attraction_Review-g212305-d1237726-Reviews-Grand_Falls_Gorge-Grand_Falls_New_Brunswick.html"],
  ["2026-08-16", "Sun", "15:20", "Quebec City to Fredericton", "Hartland Covered Bridge", "Attraction", "Fast photo stop", null, 290, "World's longest covered bridge; useful low-effort driver reset.", "Use instead of Grand Falls if you want a quicker stop.", "Skip if anyone wants straight hotel recovery.", "15-25 min", "No meal; photo/stretch only.", "Hartland visitor parking near bridge / Highway 105 side.", "https://www.google.com/maps/search/?api=1&query=Hartland+Covered+Bridge+visitor+parking", "https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html"],
  ["2026-08-16", "Sun", "18:45", "Fredericton evening", "STMR.36 BBQ & Social", "Food", "Strategic hotel dinner", 3.7, 68, "Convenient on-site dinner after the longest outbound drive, but TripAdvisor score is not strong.", "Use only when the family needs zero extra driving.", "If energy remains, consider Isaac's Way instead after checking live hours.", "45-60 min", "Light dinner: small BBQ plate, soup, salad, kids option.", "On-site at Delta Fredericton.", "https://www.google.com/maps/search/?api=1&query=STMR.36+BBQ+Fredericton", "https://www.tripadvisor.ca/Restaurant_Review-g154957-d21316892-Reviews-STMR_36_BBQ_Social-Fredericton_New_Brunswick.html"],

  ["2026-08-17", "Mon", "09:45", "Fredericton to Charlottetown", "Magnetic Hill Park", "Attraction", "Kid-friendly quick stop", null, null, "Fun optical illusion, close to route, low walking.", "Use if staffed access and timing are confirmed.", "Skip if closed, crowded or Cape Jourimain becomes the better stop.", "25-40 min", "No meal; nearby washrooms if open.", "Magnetic Hill visitor area, Mountain Road.", "https://www.google.com/maps/search/?api=1&query=Magnetic+Hill+Park+Moncton", "https://www.tripadvisor.ca/Attraction_Review-g154958-d183715-Reviews-Magnetic_Hill_Park-Moncton_New_Brunswick.html"],
  ["2026-08-17", "Mon", "12:15", "Before Confederation Bridge", "Cape Jourimain Nature Centre", "Attraction", "Top rest stop before bridge", null, null, "Clean facilities, bridge view, beach and lighthouse trail; good family reset.", "Use if you want a calmer stop before PEI.", "Skip if you already used Magnetic Hill and Hampton arrival would slip.", "35-60 min", "Light lunch/snack only if cafe is open; keep dinner as proper meal.", "Cape Jourimain visitor parking.", "https://www.google.com/maps/search/?api=1&query=Cape+Jourimain+Nature+Centre", "https://www.tripadvisor.ca/Attraction_Review-g4332393-d4431312-Reviews-Cape_Jourimain_Nature_Centre-Bayfield_New_Brunswick.html"],
  ["2026-08-17", "Mon", "16:50", "PEI dinner", "New Glasgow Lobster Suppers", "Food", "Proper dinner", 4.2, 1105, "Classic PEI family lobster supper with many reviews.", "Use as the day's substantial meal.", "Skip only if the wait is too long; use The Mill or PEI Preserve Company nearby.", "75-100 min", "Proper dinner: lobster supper or seafood/comfort plates.", "On-site restaurant parking.", "https://www.google.com/maps/search/?api=1&query=New+Glasgow+Lobster+Suppers", "https://www.tripadvisor.ca/Restaurant_Review-g1800168-d770333-Reviews-New_Glasgow_Lobster_Supper-New_Glasgow_Prince_Edward_Island.html"],
  ["2026-08-17", "Mon", "18:30", "Charlottetown evening", "Victoria Park / Prince Edward Battery", "Attraction", "Easy sunset add-on", null, null, "Low-pressure waterfront walk/playground near hotel after check-in.", "Use only if the child still has energy.", "Skip first; hotel pool/rest beats another outing.", "20-40 min", "Dessert or snack only.", "Victoria Park parking around 45-51 Victoria Park Roadway.", "https://www.google.com/maps/search/?api=1&query=Prince+Edward+Battery+Charlottetown", "https://www.tripadvisor.ca/Attractions-g155023-Activities-Charlottetown_Prince_Edward_Island.html"],

  ["2026-08-18", "Tue", "08:30", "Charlottetown / Cavendish loop", "Green Gables", "Attraction", "Priority", null, 1657, "Signature PEI stop with house, grounds and short Haunted Woods walk.", "Use early to avoid crowds.", "Shorten the trail before skipping the site.", "75-120 min", "Hotel breakfast before leaving; lunch later.", "Green Gables Heritage Place visitor parking.", "https://www.google.com/maps/search/?api=1&query=Green+Gables+Heritage+Place+Cavendish", "https://www.tripadvisor.ca/Attraction_Review-g499311-d186971-Reviews-Green_Gables-Cavendish_Prince_Edward_Island.html"],
  ["2026-08-18", "Tue", "10:45", "Cavendish coast", "Cavendish Beach", "Attraction", "Top family beach", null, null, "TripAdvisor reviews call it family-friendly with good amenities and parking.", "Use if weather is good and the child wants beach time.", "Skip for rain, wind, or tiredness.", "45-90 min", "No full meal; beach snack only.", "Cavendish Beach lot in PEI National Park.", "https://www.google.com/maps/search/?api=1&query=Cavendish+Beach+PEI+parking", "https://www.tripadvisor.ca/Attraction_Review-g499311-d186975-Reviews-Cavendish_Beach-Cavendish_Prince_Edward_Island.html"],
  ["2026-08-18", "Tue", "12:30", "New Glasgow / North Rustico", "Prince Edward Island Preserve Company", "Food", "Top lunch Plan B", 4.4, 1002, "Strong rated, scenic lunch alternative near New Glasgow.", "Use for proper lunch if dinner will be light.", "Skip if buses/crowds are heavy; use a quicker North Rustico stop.", "50-75 min", "Proper lunch: chowder, sandwiches, preserves dessert.", "On-site parking at New Glasgow.", "https://www.google.com/maps/search/?api=1&query=Prince+Edward+Island+Preserve+Company+New+Glasgow", "https://www.tripadvisor.ca/Restaurant_Review-g1800168-d1873580-Reviews-Prince_Edward_Island_Preserve_Company-New_Glasgow_Prince_Edward_Island.html"],
  ["2026-08-18", "Tue", "18:00", "Charlottetown dinner", "Slaymaker & Nichols Gastro House", "Food", "Memorable dinner", 4.5, 117, "High-rated Charlottetown dinner; good for the one proper meal if lunch was light.", "Reserve and use if everyone can handle downtown parking.", "Skip for simple food if Old Home Week traffic is rough.", "75-90 min", "Proper dinner: gastropub/seafood dishes; order light if lunch was heavy.", "Downtown paid parking; walk from selected garage.", "https://www.google.com/maps/search/?api=1&query=Slaymaker+%26+Nichols+Charlottetown", "https://www.tripadvisor.ca/Restaurant_Review-g155023-d19503722-Reviews-Slaymaker_Nichols_Gastro_House-Charlottetown_Prince_Edward_Island.html"],

  ["2026-08-19", "Wed", "09:00", "Charlottetown to Hopewell / Moncton", "Sackville Waterfowl Park", "Attraction / rest", "Top rest before Hopewell", 4.7, 172, "Best quality rest stop before Hopewell: boardwalk, washrooms nearby, nature reset.", "Use as the controlled 20-minute pre-Hopewell break.", "Skip only if tide timing is at risk; then go straight to Hopewell.", "15-25 min", "No meal; snack/washroom only.", "Sackville Waterfowl Park parking.", "https://www.google.com/maps/search/?api=1&query=Sackville+Waterfowl+Park", "https://www.tripadvisor.ca/Attractions-g154956-Activities-c57-New_Brunswick.html"],
  ["2026-08-19", "Wed", "10:15", "Hopewell tide window", "Hopewell Rocks", "Attraction", "Priority", 4.6, 322, "The main tide experience; TripAdvisor admission page shows strong recommendation rate.", "Use exactly inside the tide plan.", "Do not replace this with optional stops unless weather/fatigue cancels the day.", "2-3 h", "Lunch at/near park after ocean floor.", "Hopewell Rocks visitor parking, 131 Discovery Rd.", "https://www.google.com/maps/search/?api=1&query=Hopewell+Rocks+visitor+parking", "https://www.tripadvisor.ca/AttractionProductReview-g499179-d11991515-Hopewell_Rocks_Admission-Hopewell_Cape_Albert_County_New_Brunswick.html"],
  ["2026-08-19", "Wed", "14:15", "Hopewell to Moncton", "Albert County Museum", "Attraction", "Optional only", null, null, "Logical short indoor/outdoor add-on near Hopewell if you finish early.", "Use only if Hopewell ends early and Moncton ETA stays easy.", "Skip for pool/rest at Best Western.", "30-45 min", "No meal; snack only.", "On-site visitor parking, 3940 Route 114.", "https://www.google.com/maps/search/?api=1&query=Albert+County+Museum+Hopewell+Cape", "https://www.tripadvisor.ca/AttractionsNear-g499179-d217959-Hopewell_Rocks-Hopewell_Cape_Albert_County_New_Brunswick.html"],
  ["2026-08-19", "Wed", "18:00", "Moncton dinner", "Tide & Boar Gastropub", "Food", "Dinner option", 4.1, 1041, "Reliable Moncton gastropub choice with many reviews.", "Use if lunch was light and family wants proper dinner.", "Skip if everyone needs simple food near hotel.", "60-75 min", "Proper dinner or light shared plates.", "Downtown Moncton parking; check live availability.", "https://www.google.com/maps/search/?api=1&query=Tide+%26+Boar+Gastropub+Moncton", "https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html"],
  ["2026-08-19", "Wed", "18:10", "Moncton dinner backup", "Pump House Brewpub", "Food", "Higher-rated backup", 4.2, 1223, "Slightly higher-rated casual Moncton backup; good with kids if available.", "Use if Tide & Boar is full or too slow.", "Skip if downtown parking is poor.", "60-75 min", "Casual dinner: pub food, pizza, salads.", "Downtown Moncton parking; verify live map.", "https://www.google.com/maps/search/?api=1&query=Pump+House+Brewpub+Moncton", "https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html"],

  ["2026-08-20", "Thu", "10:45", "Moncton to Quebec City", "Hartland Covered Bridge", "Attraction", "Fast photo stop", null, 290, "Efficient stop near the highway on a long return drive.", "Use if you skipped it outbound or need a movement break.", "Skip if anyone wants an earlier DoubleTree arrival.", "15-25 min", "No meal.", "Hartland visitor parking near bridge.", "https://www.google.com/maps/search/?api=1&query=Hartland+Covered+Bridge+visitor+parking", "https://www.tripadvisor.ca/Attraction_Review-g1093799-d1229394-Reviews-Hartland_Covered_Bridge-Hartland_New_Brunswick.html"],
  ["2026-08-20", "Thu", "12:45", "Moncton to Quebec City", "Frank's Bar & Grill", "Food", "Route lunch placeholder", null, null, "Existing route lunch; keep only if live reviews/hours still look acceptable.", "Use if you need a proper lunch in Edmundston without detour.", "If TripAdvisor/live reviews look weak, switch to a simple chain meal.", "45-60 min", "Proper lunch or simple family meal.", "Edmundston area parking; verify live.", "https://www.google.com/maps/search/?api=1&query=Frank%27s+Bar+%26+Grill+Edmundston", "https://www.tripadvisor.ca/Restaurants-g182159-Edmundston_New_Brunswick.html"],
  ["2026-08-20", "Thu", "14:15", "Moncton to Quebec City", "Parc des Chutes", "Attraction", "Stretch Plan B", 4.3, 347, "Good nature break if the long return day is running ahead.", "Use only if arrival at DoubleTree remains before dinner.", "Skip first; hotel recovery matters more.", "25-40 min", "No meal.", "Park near Rue Frontenac access.", "https://www.google.com/maps/search/?api=1&query=Parc+des+Chutes+Riviere-du-Loup", "https://www.tripadvisor.ca/ShowUserReviews-g182149-d3370299-r690514046-Parc_des_Chutes-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html"],

  ["2026-08-21", "Fri", "10:00", "Quebec City to Vaughan", "Fromagerie Victoria", "Food / quick stop", "Strategic poutine stop", 3.9, 74, "Convenient Quebec food stop near the route; not destination-grade by rating.", "Use for a quick cheese curd/poutine break if breakfast was early.", "Skip if you want to protect lunch farther west.", "20-30 min", "Snack/light food only.", "Levis area parking; confirm exact location live.", "https://www.google.com/maps/search/?api=1&query=Fromagerie+Victoria+Levis", "https://www.tripadvisor.ca/Restaurant_Review-g182163-d6913530-Reviews-Fromagerie_Victoria-Levis_Chaudiere_Appalaches_Quebec.html"],
  ["2026-08-21", "Fri", "11:30", "Quebec City to Vaughan", "Scores Boucherville", "Food", "Simple proper lunch", null, null, "Simple family lunch near the route with chicken/salad options.", "Use as the day's proper lunch if the family wants predictable food.", "Skip if traffic around Montreal is bad; push to a highway-area alternative.", "45-60 min", "Proper lunch: rotisserie chicken/salad bar.", "Restaurant parking in Boucherville.", "https://www.google.com/maps/search/?api=1&query=Restaurant+Scores+Boucherville", "https://www.tripadvisor.ca/Restaurant_Review-g182198-d770803-Reviews-Restaurant_Scores-Boucherville_Quebec.html"],
  ["2026-08-21", "Fri", "14:30", "401 westbound", "ONroute Mallorytown North", "Fuel / washroom only", "Do not eat here", 2.2, 6, "TripAdvisor feedback is weak; use only for fuel, washroom or fatigue safety.", "Use only as a safety/fuel stop.", "Do not use for lunch or dinner unless absolutely necessary.", "10-20 min", "No meal; emergency snack only.", "ONroute Mallorytown North westbound.", "https://www.google.com/maps/search/?api=1&query=ONroute+Mallorytown+North", "https://www.tripadvisor.ca/Restaurant_Review-g1174591-d20471594-Reviews-ONroute_Mallorytown_North-Mallorytown_Ontario.html"],
  ["2026-08-21", "Fri", "18:00", "401 westbound", "The Big Apple", "Attraction / snack", "Strategic return break", 3.5, 951, "Final kid-friendly stretch before the last drive home.", "Use only if it helps prevent late-day meltdown.", "Skip if traffic is heavy or home ETA is already late.", "15-25 min", "Snack/dessert only.", "On-site visitor parking.", "https://www.google.com/maps/search/?api=1&query=The+Big+Apple+Colborne", "https://www.tripadvisor.ca/Attraction_Review-g5414486-d586711-Reviews-The_Big_Apple-Colborne_Ontario.html"]
];

const food = stops.filter((row) => row[5].toLowerCase().includes("food")).map((row) => [
  row[0], row[4], row[7], row[8], row[10], row[13], row[15], row[16]
]);

function starText(rating) {
  if (typeof rating !== "number") return "TA page linked";
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const roundedFull = rating - full >= 0.75 ? full + 1 : full;
  return "★".repeat(Math.min(5, roundedFull)) + (half ? "½" : "") + " " + rating.toFixed(1);
}

function withStarColumn(rows, ratingIndex) {
  return rows.map((row) => {
    const copy = [...row];
    copy.splice(ratingIndex + 1, 0, starText(row[ratingIndex]));
    return copy;
  });
}

function safeRange(sheet, row, col, rows, cols) {
  return sheet.getRangeByIndexes(row, col, rows, cols);
}

function writeBlock(sheet, startRow, startCol, matrix) {
  const range = safeRange(sheet, startRow, startCol, matrix.length, matrix[0].length);
  range.values = matrix;
  return range;
}

function styleHeader(range) {
  range.format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "outside", style: "thin", color: "#0B5F59" },
    wrapText: true
  };
}

function styleTitle(range) {
  range.format = {
    fill: "#12343B",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    wrapText: true
  };
}

function styleNote(range) {
  range.format = {
    fill: "#E6FFFA",
    font: { color: "#134E4A" },
    borders: { preset: "outside", style: "thin", color: "#99F6E4" },
    wrapText: true
  };
}

function styleBody(range) {
  range.format = {
    font: { color: "#111827", size: 10 },
    wrapText: true,
    borders: { insideHorizontal: { style: "thin", color: "#E5E7EB" } }
  };
}

function applyRatingConditional(sheet, rangeA1) {
  const range = sheet.getRange(rangeA1);
  range.conditionalFormats.add("cellIs", {
    operator: "greaterThanOrEqual",
    formula: 4.5,
    format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } }
  });
  range.conditionalFormats.add("cellIs", {
    operator: "between",
    formula: [4.0, 4.49],
    format: { fill: "#FEF9C3", font: { color: "#854D0E", bold: true } }
  });
  range.conditionalFormats.add("cellIs", {
    operator: "lessThan",
    formula: 4.0,
    format: { fill: "#FEE2E2", font: { color: "#991B1B", bold: true } }
  });
}

function finishSheet(sheet, usedRangeA1, freezeRows = 1) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(freezeRows);
  sheet.getRange(usedRangeA1).format.autofitRows();
}

const workbook = Workbook.create();

const overview = workbook.worksheets.add("Start Here");
overview.getRange("A1:H1").merge();
overview.getRange("A1").values = [[trip.title]];
styleTitle(overview.getRange("A1:H1"));
overview.getRange("A2:H2").merge();
overview.getRange("A2").values = [[trip.subtitle]];
styleNote(overview.getRange("A2:H2"));
const overviewRows = [
  ["Rule", "Recommendation"],
  ["Hotel anchors", "All seven hotels are already booked and fixed. Plan B changes stops and meals only."],
  ["Food rhythm", "Hotel breakfast when in a hotel. No brunch. Pick one proper dine per day; keep the other meal light/simple."],
  ["TripAdvisor use", "Ratings and review counts are included where current TripAdvisor snippets exposed them. Every Plan B stop links to TripAdvisor."],
  ["How to choose", "Use only one or two Plan B upgrades per day. If delayed, keep the hotel, meal rhythm and child energy first."],
  ["Ratings", "Green = 4.5+ standout, yellow = 4.0-4.4 solid, red = below 4.0 strategic only."],
  ["Audit note", "Rows are arranged in route order. Low-rated service stops are kept only when they are useful for fuel/washroom safety."]
];
writeBlock(overview, 4, 0, overviewRows);
styleHeader(overview.getRange("A5:B5"));
styleBody(overview.getRange("A6:B11"));
overview.getRange("A:B").format.columnWidth = 35;

const daySummary = [
  ["Date", "Booked overnight", "Plan B focus", "Best upgrade if ahead", "First thing to skip"],
  ["Aug 14", "Montreal Marriott Chateau Champlain", "Better Brockville lunch; optional tunnel", "Brockville Railway Tunnel", "The Big Apple / tunnel if traffic slips"],
  ["Aug 15", "Hotel Cofortel", "Montmorency + Old Quebec, but lighter food if needed", "Les Cafes de Julie instead of slow Manoir lunch", "Old Quebec evening walk"],
  ["Aug 16", "Delta Fredericton", "Kamouraska + real lunch + efficient scenic breaks", "Parc des Chutes or Hartland, not both", "Grand Falls Gorge"],
  ["Aug 17", "Hampton Charlottetown", "Bridge-side rest + lobster supper", "Cape Jourimain", "Victoria Park evening add-on"],
  ["Aug 18", "Canadas Best Value Inn Charlottetown", "Green Gables / beach / strong Charlottetown dinner", "Cavendish Beach", "Beach time if weather poor"],
  ["Aug 19", "Best Western Plus Moncton", "Sackville rest before Hopewell, then Moncton", "Albert County Museum only after Hopewell", "Any post-Hopewell museum"],
  ["Aug 20", "DoubleTree Quebec Resort", "Long return drive; keep stops short", "Hartland if skipped earlier", "Parc des Chutes"],
  ["Aug 21", "Home", "Safe return day, no weak food stops", "Fromagerie Victoria snack if on time", "The Big Apple return stop"]
];
writeBlock(overview, 13, 0, daySummary);
styleHeader(overview.getRange("A14:E14"));
styleBody(overview.getRange("A15:E22"));
overview.getRange("C:E").format.columnWidth = 32;
finishSheet(overview, "A1:H22", 14);

const plan = workbook.worksheets.add("Plan B Stops");
const stopHeaders = [
  "Date", "Day", "Time", "Route segment", "Stop name", "Type", "Priority", "TA rating",
  "Review stars", "Reviews", "Why it is here", "Use if", "Skip if", "Duration", "Food plan",
  "Parking / arrival", "Google Maps", "TripAdvisor page"
];
const stopData = withStarColumn(stops, 7);
writeBlock(plan, 0, 0, [stopHeaders, ...stopData]);
styleHeader(plan.getRange("A1:R1"));
styleBody(plan.getRange(`A2:R${stopData.length + 1}`));
plan.getRange("A:A").format.columnWidth = 12;
plan.getRange("B:C").format.columnWidth = 10;
plan.getRange("D:F").format.columnWidth = 22;
plan.getRange("G:J").format.columnWidth = 14;
plan.getRange("K:P").format.columnWidth = 33;
plan.getRange("Q:R").format.columnWidth = 45;
plan.getRange(`H2:H${stopData.length + 1}`).format.numberFormat = "0.0";
plan.getRange(`J2:J${stopData.length + 1}`).format.numberFormat = "#,##0";
applyRatingConditional(plan, `H2:H${stopData.length + 1}`);
plan.tables.add(`A1:R${stopData.length + 1}`, true, "PlanBStopsTable");
finishSheet(plan, `A1:R${stopData.length + 1}`);

const foodSheet = workbook.worksheets.add("Food Shortlist");
const foodHeaders = ["Date", "Place", "TA rating", "Review stars", "Reviews", "Use if", "Food plan", "Google Maps", "TripAdvisor page"];
const foodData = withStarColumn(food, 2);
writeBlock(foodSheet, 0, 0, [foodHeaders, ...foodData]);
styleHeader(foodSheet.getRange("A1:I1"));
styleBody(foodSheet.getRange(`A2:I${foodData.length + 1}`));
foodSheet.getRange("A:A").format.columnWidth = 12;
foodSheet.getRange("B:B").format.columnWidth = 32;
foodSheet.getRange("C:E").format.columnWidth = 14;
foodSheet.getRange("F:G").format.columnWidth = 42;
foodSheet.getRange("H:I").format.columnWidth = 45;
foodSheet.getRange(`C2:C${foodData.length + 1}`).format.numberFormat = "0.0";
foodSheet.getRange(`E2:E${foodData.length + 1}`).format.numberFormat = "#,##0";
applyRatingConditional(foodSheet, `C2:C${foodData.length + 1}`);
foodSheet.tables.add(`A1:I${foodData.length + 1}`, true, "FoodShortlistTable");
finishSheet(foodSheet, `A1:I${foodData.length + 1}`);

const hotelSheet = workbook.worksheets.add("Booked Hotels");
const hotelHeaders = ["Date", "City", "Booked hotel", "Address", "TA rating", "Review stars", "Reviews", "Status", "TripAdvisor page"];
const hotelData = withStarColumn(hotels, 4);
writeBlock(hotelSheet, 0, 0, [hotelHeaders, ...hotelData]);
styleHeader(hotelSheet.getRange("A1:I1"));
styleBody(hotelSheet.getRange(`A2:I${hotelData.length + 1}`));
hotelSheet.getRange("A:B").format.columnWidth = 16;
hotelSheet.getRange("C:D").format.columnWidth = 42;
hotelSheet.getRange("E:G").format.columnWidth = 14;
hotelSheet.getRange("H:H").format.columnWidth = 34;
hotelSheet.getRange("I:I").format.columnWidth = 50;
hotelSheet.getRange(`E2:E${hotelData.length + 1}`).format.numberFormat = "0.0";
hotelSheet.getRange(`G2:G${hotelData.length + 1}`).format.numberFormat = "#,##0";
applyRatingConditional(hotelSheet, `E2:E${hotelData.length + 1}`);
hotelSheet.tables.add(`A1:I${hotelData.length + 1}`, true, "BookedHotelsTable");
finishSheet(hotelSheet, `A1:I${hotelData.length + 1}`);

const sourceSheet = workbook.worksheets.add("Source Notes");
const sourceRows = [
  ["Topic", "Note"],
  ["TripAdvisor ratings", "Ratings and review counts are snapshots from current TripAdvisor pages/search snippets visible during planning on 2026-07-17. Some pages did not expose a numeric rating in the snippet; those rows keep the TripAdvisor URL but leave rating blank."],
  ["Route logic", "Stops are in driving order and meant as Plan B choices. Pick the best one for time, weather and child energy instead of adding every row."],
  ["Low-rated stops", "Low-rated highway/convenience stops are not recommendations for food; they remain only for safety, washroom, fuel or timing."],
  ["Booked hotels", "Hotels are already booked by the family and are treated as fixed anchors, not shopping recommendations."]
];
writeBlock(sourceSheet, 0, 0, sourceRows);
styleHeader(sourceSheet.getRange("A1:B1"));
styleBody(sourceSheet.getRange("A2:B5"));
sourceSheet.getRange("A:A").format.columnWidth = 24;
sourceSheet.getRange("B:B").format.columnWidth = 100;
finishSheet(sourceSheet, "A1:B5");

await fs.mkdir(outputDir, { recursive: true });
for (const sheetName of ["Start Here", "Plan B Stops", "Food Shortlist", "Booked Hotels", "Source Notes"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${sheetName.replaceAll(" ", "_").toLowerCase()}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const summaryInspect = await workbook.inspect({
  kind: "table",
  sheetId: "Plan B Stops",
  range: "A1:R8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 18,
  maxChars: 5000
});
console.log(summaryInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan"
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputFile);
console.log(outputFile);
