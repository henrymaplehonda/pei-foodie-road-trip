// Meal contracts and the per-day flexible meal options.
// Trip content, split out of app.js so the plan can be edited without
// reading the application code. Loaded as a plain script before app.js.
// The exported factory takes the URL/stop builders it needs from app.js,
// so this file stays free of application logic.
window.TripData = window.TripData || {};

window.TripData.mealContracts = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
  var mealContracts = {
    '2026-08-14': {
      breakfast: { style: 'Departure breakfast', title: 'Breakfast before leaving Vaughan', detail: 'Aug 14 starts from home before the first hotel night; all following breakfasts are at the hotel.', backup: 'Leave 15 minutes later rather than skipping breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Tata’s House of Pizza & Pasta', detail: '11:40–12:35 · the day’s full seated restaurant meal.', backup: 'Boston Pizza Brockville.' },
      dinner: { style: 'Light meal', title: 'Time Out Market Montréal', detail: '17:45–18:15 · one simple vendor meal, then walk back.', backup: 'One light plate at Lloyd inside the Marriott.' }
    },
    '2026-08-15': {
      breakfast: { style: 'Hotel breakfast', title: 'Lloyd at the Marriott', detail: '06:30–07:10 · eat at the hotel before checkout.', backup: 'Use the hotel’s quickest breakfast option and shift departure if needed.' },
      lunch: { style: 'Substantial dine', title: 'Restaurant-terrasse du Manoir', detail: '12:45 · the day’s full seated restaurant meal at Montmorency.', backup: 'Cochon Dingue Beauport.' },
      dinner: { style: 'Light meal', title: 'La Bûche', detail: '18:15 · share a starter and one main; keep the Old Québec dinner intentionally small.', backup: 'A light order at Cochon Dingue Champlain.' }
    },
    '2026-08-16': {
      breakfast: { style: 'Hotel breakfast', title: 'Hôtel Cofortel breakfast', detail: '06:15–06:40 · included hotel breakfast before departure.', backup: 'If service is disrupted, ask the hotel for its available breakfast option.' },
      lunch: { style: 'Substantial dine', title: 'L’Estaminet', detail: '10:15–11:00 · early proper lunch and the day’s full restaurant meal.', backup: 'A full lunch at St-Hubert Rivière-du-Loup.' },
      dinner: { style: 'Light meal', title: 'STMR.36 at Delta', detail: '18:45 · one small BBQ plate or shareable bites on site.', backup: 'A light order at the Delta lobby bar or Drift if open.' }
    },
    '2026-08-17': {
      breakfast: { style: 'Hotel breakfast', title: 'Delta hotel breakfast', detail: '06:30–07:20 at STMR.36 or Grove before checkout.', backup: 'Use Grove’s quickest hotel breakfast and shift departure if needed.' },
      lunch: { style: 'Light meal', title: 'Tony’s Bistro', detail: '10:40–11:25 · soup, sandwich or one savoury bakery plate.', backup: 'A simple Moncton café lunch.' },
      dinner: { style: 'Substantial dine', title: 'New Glasgow Lobster Suppers', detail: '16:50 walk-in · the day’s full restaurant experience.', backup: 'Lobster on the Wharf in Charlottetown.' }
    },
    '2026-08-18': {
      breakfast: { style: 'Hotel breakfast', title: 'Hampton hot breakfast', detail: 'Eat the included hotel breakfast before checkout.', backup: 'Shift the morning departure to the confirmed breakfast opening.' },
      lunch: { style: 'Light meal', title: 'Blue Mussel Café', detail: '11:30 · chowder or shared mussels plus a simple child plate.', backup: 'A light order at Fisherman’s Wharf.' },
      dinner: { style: 'Substantial dine', title: 'Slaymaker & Nichols', detail: '18:30 reservation · the day’s full restaurant meal.', backup: 'Lobster on the Wharf.' }
    },
    '2026-08-19': {
      breakfast: { style: 'Hotel breakfast', title: 'Canadas Best Value Inn breakfast', detail: 'Use the included hot hotel breakfast before the tide drive.', backup: 'Confirm an early service time with the hotel; keep the meal concise.' },
      lunch: { style: 'Substantial dine', title: 'High Tide Restaurant', detail: '13:30 · the day’s full restaurant meal after the ocean-floor walk.', backup: 'Gusto Italian Grill & Bar in Moncton.' },
      dinner: { style: 'Light meal', title: 'Tide & Boar', detail: '18:00 · soup, salad or one shared appetizer with a child plate.', backup: 'A light order at Gusto Italian Grill & Bar.' }
    },
    '2026-08-20': {
      breakfast: { style: 'Hotel breakfast', title: 'Best Western full breakfast', detail: 'Eat the included hotel breakfast, then leave around 07:15.', backup: 'Confirm opening at check-in and shift departure to finish breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Frank’s Bar & Grill', detail: '12:45–13:40 · the day’s full restaurant meal and driver reset.', backup: 'Boston Pizza Edmundston.' },
      dinner: { style: 'Light meal', title: 'Le Dijon at DoubleTree', detail: '19:00 · soup, salad or the lightest current plate on site.', backup: 'A light plate at Normandin Charlesbourg.' }
    },
    '2026-08-21': {
      breakfast: { style: 'Hotel breakfast', title: 'DoubleTree hotel breakfast', detail: 'Eat at Le Dijon, then target a 07:15 departure.', backup: 'Confirm opening the night before and shift departure to finish breakfast.' },
      lunch: { style: 'Substantial dine', title: 'Scores Restaurant Boucherville', detail: '11:30–12:20 · the day’s full seated restaurant meal.', backup: 'La Cage Boucherville.' },
      dinner: { style: 'Light meal', title: 'Light dinner after the final drive', detail: 'A simple meal at home, or a light order en route if arriving very late.', backup: 'Grab a quick bite at a westbound service stop if needed.' }
    }
  };
  return mealContracts;
};

window.TripData.mealFlexByDay = function (helpers) {
  var mapSearchUrl = helpers.mapSearchUrl;
  var mealFlexByDay = {
    '2026-08-14': {
      rule: 'Call ahead and use this only if Boboli can have the order ready within 30 minutes. It replaces Tata’s lunch; the seated lunch remains Plan A.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Boboli',
        foodAddress: '32 King Street West, Brockville, ON K6V 3P6',
        order: 'Fresh sandwich or soup, prepared and eaten at the café.',
        window: '25–35 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Boboli, 32 King Street West, Brockville, ON K6V 3P6'),
        foodSource: 'https://brockvilletourism.com/directory/boboli/',
        experience: 'Brockville Railway Tunnel — south portal',
        experienceDetail: 'Walk 20–30 minutes inside the free, stroller-friendly tunnel. Public washrooms are on nearby Blockhouse Island, not inside the tunnel.',
        parking: 'Blockhouse Island / Water Street public parking, 1 Water Street, Brockville, ON',
        experienceMap: mapSearchUrl('Brockville Railway Tunnel south portal parking, 1 Water Street, Brockville, ON'),
        experienceSource: 'https://brockvilletourism.com/things-to-do/brockville-railway-tunnel/'
      }]
    },
    '2026-08-15': {
      rule: 'Use the shortcut at Montmorency, then add the funicular only after the Cofortel room and luggage are secure.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Station Sandwicherie at La Manufacture',
        foodAddress: '5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1',
        order: 'Fresh sandwich, bakery item and drink at the falls; eat on site.',
        window: '25–35 min',
        saved: 'Estimated 25–35 min saved',
        foodMap: mapSearchUrl('Station Sandwicherie La Manufacture, 5300 Boulevard Sainte-Anne, Québec, QC G1C 1S1'),
        foodSource: 'https://www.sepaq.com/destinations/parc-chute-montmorency/quoi-faire/restaurants-repas.dot?language_id=1',
        experience: 'Old Québec Funicular + Petit-Champlain',
        experienceDetail: 'Add one funicular ride and a short lower-town look, about 25–35 minutes total. Verify the posted fare and operating status that day.',
        parking: 'Stationnement De Beaucours garage, 39 Rue Saint-Louis, Québec, QC G1R 3Z2',
        experienceMap: mapSearchUrl('Stationnement De Beaucours, 39 Rue Saint-Louis, Québec, QC G1R 3Z2'),
        experienceSource: 'https://www.funiculaire.ca/'
      }]
    },
    '2026-08-16': {
      rule: 'This is a high-driving day. A simpler dinner protects recovery; the separate on-route garden option is allowed only when its strict ETA gate passes.',
      options: [{
        meal: 'Dinner shortcut',
        foodName: 'Drift Pool + Patio at Delta Fredericton',
        foodAddress: '225 Woodstock Road, Fredericton, NB E3B 2H8',
        order: 'Choose a simple poolside plate; if the patio is weather-closed, make a quick light order in STMR.36.',
        window: '35–45 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Delta Hotels Fredericton, 225 Woodstock Road, Fredericton, NB E3B 2H8'),
        foodSource: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/dining/',
        experience: 'Delta indoor pool + early bedtime',
        experienceDetail: 'Use the saved time for a short swim or immediate sleep. Do not add any off-site sightseeing.',
        parking: 'Delta Hotels Fredericton registered guest parking, 225 Woodstock Road, Fredericton, NB E3B 2H8',
        experienceMap: mapSearchUrl('Delta Hotels Fredericton, 225 Woodstock Road, Fredericton, NB E3B 2H8'),
        experienceSource: 'https://www.marriott.com/en-us/hotels/yfcdf-delta-hotels-fredericton/overview/'
      }]
    },
    '2026-08-17': {
      rule: 'Choose this instead of New Glasgow Lobster Suppers, not in addition to it. Keep the food-hall arrival before its 19:00 close.',
      options: [{
        meal: 'Dinner shortcut',
        foodName: 'Founders Food Hall & Market',
        foodAddress: '6 Prince Street, Charlottetown, PE C1A 4P5',
        order: 'Let each person choose one simple vendor meal; sit inside and leave dessert for later.',
        window: '35–45 min',
        saved: 'Estimated 45–70 min plus less rural driving',
        foodMap: mapSearchUrl('Founders Food Hall & Market, 6 Prince Street, Charlottetown, PE C1A 4P5'),
        foodSource: 'https://foundersfoodhall.com/visit-us/hours/',
        experience: 'Victoria Park playground + harbour boardwalk',
        experienceDetail: 'Use 30–40 minutes for the accessible playground and a short waterfront walk, then return to Hampton.',
        parking: 'Victoria Park playground / pool parking, 51 Victoria Park Roadway, Charlottetown, PE',
        experienceMap: mapSearchUrl('Victoria Park playground parking, 51 Victoria Park Roadway, Charlottetown, PE'),
        experienceSource: 'https://www.charlottetown.ca/leisure___recreation/parks_and_trails/parks_and_playgrounds'
      }]
    },
    '2026-08-18': {
      rule: 'This replaces Blue Mussel lunch. Use the saved time inside Avonlea or at the beach; do not add another distant PEI stop.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Avonlea Village eateries',
        foodAddress: '8779 Route 6, Cavendish, PE C0A 1N0',
        order: 'Choose one quick-service lunch from the on-site eateries; everyone can choose separately.',
        window: '30–40 min',
        saved: 'Estimated 35–50 min saved',
        foodMap: mapSearchUrl('Avonlea Village, 8779 Route 6, Cavendish, PE C0A 1N0'),
        foodSource: 'https://avonlea.ca/info/',
        experience: 'Avonlea Village historic buildings and shops',
        experienceDetail: 'Admission is free. Spend 30–40 minutes exploring the village after lunch, or transfer that time to Cavendish Beach.',
        parking: 'Avonlea Village on-site visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0',
        experienceMap: mapSearchUrl('Avonlea Village visitor parking, 8779 Route 6, Cavendish, PE C0A 1N0'),
        experienceSource: 'https://avonlea.ca/'
      }]
    },
    '2026-08-19': {
      rule: 'Use this only after the ocean-floor walk. The saved time makes Magnetic Hill possible, but it replaces the hotel pool block.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'Low Tide Café at Hopewell Rocks',
        foodAddress: '131 Discovery Road, Hopewell Cape, NB E4H 4Z5',
        order: 'Use the staffed barbecue for a simple hot lunch; if the weather-dependent barbecue is closed, keep High Tide Restaurant. Snacks and ice cream alone are not lunch.',
        window: '25–35 min',
        saved: 'Estimated 20–30 min saved',
        foodMap: mapSearchUrl('Low Tide Cafe, Hopewell Rocks, 131 Discovery Road, Hopewell Cape, NB E4H 4Z5'),
        foodSource: 'https://www.thehopewellrocks.ca/en/parks/33/hopewell-rocks-provincial-park/entities',
        experience: 'Magnetic Hill Illusion',
        experienceDetail: 'Allow 30–40 minutes and confirm staffed access. Choose Magnetic Hill or the Best Western pool—never both before dinner.',
        parking: 'Magnetic Hill Illusion entrance / visitor parking, 2846 Mountain Road, Moncton, NB E1G 2W7',
        experienceMap: mapSearchUrl('Magnetic Hill Illusion entrance, 2846 Mountain Road, Moncton, NB E1G 2W7'),
        experienceSource: 'https://www.moncton.ca/en/magnetic-hill-illusion'
      }]
    },
    '2026-08-20': {
      rule: 'This is the longest drive. The shortcut protects the DoubleTree recovery block; use the separate park option only as a short movement-break swap when its strict ETA gate passes.',
      options: [{
        meal: 'Lunch shortcut',
        foodName: 'St-Hubert Express Edmundston',
        foodAddress: '10 Mahsus Court, Edmundston, NB E7C 0B6',
        order: 'Counter-service rotisserie chicken, wrap, sandwich or child meal; eat inside and use the washroom.',
        window: '30–35 min',
        saved: 'Estimated 20–25 min saved',
        foodMap: mapSearchUrl('St-Hubert Express, 10 Mahsus Court, Edmundston, NB E7C 0B6'),
        foodSource: 'https://www.st-hubert.com/en/restaurants/nb/edmundston/10-mahsus-court',
        experience: 'DoubleTree pool / quiet room recovery',
        experienceDetail: 'Default to the planned 16:30–17:15 recovery period. The separate République park option replaces a movement break; do not add Grand Falls or Old Québec.',
        parking: 'DoubleTree guest parking, 7900 Rue du Marigot, Québec City, QC G1G 6T8',
        experienceMap: mapSearchUrl('DoubleTree Quebec Resort, 7900 Rue du Marigot, Québec City, QC G1G 6T8'),
        experienceSource: 'https://www.hilton.com/en/hotels/yqbqcdt-doubletree-quebec-resort/'
      }]
    },
    '2026-08-21': {
      rule: 'Use this only if everyone is comfortable with an early substantial meal. The saved time supports the safety plan and final movement stop.',
      options: [{
        meal: 'Early lunch shortcut',
        foodName: 'Fromagerie Lemaire — Saint-Cyrille',
        foodAddress: '2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9',
        order: 'Share a poutine and add a chicken sandwich or children’s plate; eat inside, then skip Scores Boucherville.',
        window: '30–35 min at about 09:15',
        saved: 'Estimated 35–50 min saved',
        foodMap: mapSearchUrl('Fromagerie Lemaire, 2095 Route 122, Saint-Cyrille-de-Wendover, QC J1Z 1B9'),
        foodSource: 'https://www.fromagerie-lemaire.ca/menu-restaurant-fromagerie-lemaire/',
        experience: 'The Big Apple final movement stop',
        experienceDetail: 'Keep the existing 20–25 minute play-and-washroom stop only if both drivers remain safe and rested.',
        parking: 'The Big Apple visitor parking, 262 Orchard Road, Colborne, ON K0K 1S0',
        experienceMap: mapSearchUrl('The Big Apple visitor parking, 262 Orchard Road, Colborne, ON K0K 1S0'),
        experienceSource: 'https://thebigapple.ca/'
      }]
    }
  };
  // Structured replacement metadata shared by Today, the route resolver and
  // wait-time pivots. Credits intentionally use the low end of the stated
  // savings so the Calm Bank stays conservative.
  var mealEffects = {
    '2026-08-14': {
      replace: ['d1-lunch'], credit: 20,
      foodCity: 'Brockville, ON',
      foodLeg: 'About 105 km / 1 h 05-1 h 15 from ONroute Odessa; about 210 km / 2 h 15 to Montreal before city traffic',
      foodTime: '11:40-12:15',
      experienceEffect: { insertAfterStopId: 'meal-quick-2026-08-14', totalImpactMin: 30 }
    },
    '2026-08-15': {
      replace: ['d2-lunch'], credit: 25,
      foodCity: 'Quebec City, QC',
      foodLeg: 'Inside Parc de la Chute-Montmorency after the falls visit; before Hotel Cofortel',
      foodTime: '12:45-13:20',
      experienceEffect: { activateStopId: 'd2-old-quebec', totalImpactMin: 35 }
    },
    '2026-08-16': {
      replace: ['d3-stmr-dinner'], credit: 20,
      foodCity: 'Fredericton, NB',
      foodLeg: 'On site at Delta Hotels Fredericton, immediately after check-in',
      foodTime: '18:45-19:30',
      experienceEffect: { mergeWithStopId: 'd3-hotel', totalImpactMin: 0 }
    },
    '2026-08-17': {
      replace: ['d4-dinner'], credit: 45,
      foodCity: 'Charlottetown, PE',
      foodLeg: 'About 10-15 min from Hampton; replaces the rural New Glasgow dinner drive',
      foodTime: '16:50-17:35',
      experienceEffect: { insertAfterStopId: 'meal-quick-2026-08-17', totalImpactMin: 40 }
    },
    '2026-08-18': {
      replace: ['d5-lunch'], credit: 35,
      foodCity: 'Cavendish, PE',
      foodLeg: 'About 5 min from Green Gables, on site at Avonlea Village; before the Cavendish afternoon',
      foodTime: '11:30-12:10',
      experienceEffect: { insertAfterStopId: 'meal-quick-2026-08-18', totalImpactMin: 40 }
    },
    '2026-08-19': {
      replace: ['d6-lunch'], credit: 20,
      foodCity: 'Hopewell Cape, NB',
      foodLeg: 'On site at Hopewell Rocks after the ocean-floor walk',
      foodTime: '13:30-14:05',
      experienceEffect: { activateStopId: 'd6-magnetic', totalImpactMin: 40 }
    },
    '2026-08-20': {
      replace: ['d7-edmundston'], credit: 20,
      foodCity: 'Edmundston, NB',
      foodLeg: 'About 150 km / 1 h 35 from Hartland; before the Quebec-bound driving block',
      foodTime: '12:15-12:50',
      experienceEffect: { mergeWithStopId: 'd7-hotel', totalImpactMin: 0 }
    },
    '2026-08-21': {
      replace: ['d8-restaurant-lunch'], before: 'd8-chambly', credit: 35,
      foodCity: 'Saint-Cyrille-de-Wendover, QC',
      foodLeg: 'About 145 km / 1 h 25 from DoubleTree; about 105 km / 1 h 10 to Fort Chambly',
      foodTime: 'About 09:15',
      experienceEffect: { activateStopId: 'd8-big-apple', totalImpactMin: 25 }
    }
  };
  var optionId = function (value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  Object.keys(mealFlexByDay).forEach(function (dayId) {
    var meta = mealEffects[dayId];
    (mealFlexByDay[dayId].options || []).forEach(function (option) {
      option.id = optionId(option.foodName);
      option.effect = {
        insertBeforeStopId: meta.before || '',
        replaceStopIds: meta.replace.slice()
      };
      option.timing = { bankDeltaMin: meta.credit, savedMin: meta.credit };
      option.foodCity = meta.foodCity;
      option.foodLeg = meta.foodLeg;
      if (meta.foodTime) option.foodTime = meta.foodTime;
      option.experienceEffect = Object.assign({}, meta.experienceEffect);
      option.triggerWaitMin = 25;
    });
  });
  return mealFlexByDay;
};
