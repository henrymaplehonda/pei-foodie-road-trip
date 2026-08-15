(function () {
  'use strict';

  // Curate the "New ideas" restaurant list from current Tripadvisor city
  // rankings before app.js reads the embedded trip-data JSON. Planned meals
  // stay untouched; only flexible restaurant suggestions are replaced.
  (function applyTripadvisorRestaurantSuggestions() {
    var dataNode = document.getElementById('trip-data');
    if (!dataNode) return;

    function maps(name, city) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ', ' + city);
    }

    var taPages = {
      brockville: 'https://www.tripadvisor.ca/Restaurants-g181758-Brockville_Ontario.html',
      montreal: 'https://www.tripadvisor.ca/Restaurants-g155032-Montreal_Quebec.html',
      quebecCity: 'https://www.tripadvisor.ca/Restaurants-g155033-Quebec_City_Quebec.html',
      riviereDuLoup: 'https://www.tripadvisor.ca/Restaurants-g182149-Riviere_du_Loup_Bas_Saint_Laurent_Quebec.html',
      fredericton: 'https://www.tripadvisor.ca/Restaurants-g154957-Fredericton_New_Brunswick.html',
      moncton: 'https://www.tripadvisor.ca/Restaurants-g154958-Moncton_New_Brunswick.html',
      monctonLocal: 'https://www.tripadvisor.ca/Restaurants-g154958-zft10613-Moncton_New_Brunswick.html',
      charlottetown: 'https://www.tripadvisor.ca/Restaurants-g155023-Charlottetown_Prince_Edward_Island.html',
      edmundston: 'https://www.tripadvisor.ca/Restaurants-g182168-Edmundston_New_Brunswick.html',
      boucherville: 'https://www.tripadvisor.ca/Restaurants-g182198-Boucherville_Quebec.html'
    };

    var restaurants = [
      {
        id: 'ta-brockville-noshery',
        name: 'The Noshery',
        meal: 'Lunch',
        city: 'Brockville, ON',
        rating: 4.7,
        fitsDay: '2026-08-14',
        region: 'Brockville',
        why: 'Tripadvisor #1 in Brockville · 4.7/5 from 283 reviews. Steakhouse and seafood; strongest high-confidence sit-down alternative on the first travel day.',
        order: 'Choose from the current steakhouse/seafood menu; verify the day’s lunch service before diverting from Plan A.',
        tip: 'Best used only if it fits the Brockville lunch window without delaying Montréal.',
        address: '',
        source: taPages.brockville,
        photo: '',
        mapUrl: maps('The Noshery', 'Brockville, ON'),
        menuRank: []
      },
      {
        id: 'ta-brockville-1000-islands',
        name: '1000 Islands Restaurant & Pizzeria',
        meal: 'Lunch',
        city: 'Brockville, ON',
        rating: 4.6,
        fitsDay: '2026-08-14',
        region: 'Brockville',
        why: 'Tripadvisor #2 in Brockville · 4.6/5 from 362 reviews. Italian and pizza with a family-friendly profile.',
        order: 'Pizza or Italian comfort food; confirm current menu and wait time on arrival.',
        tip: 'A practical family alternative if the planned Brockville restaurant has a long wait.',
        address: '',
        source: taPages.brockville,
        photo: '',
        mapUrl: maps('1000 Islands Restaurant & Pizzeria', 'Brockville, ON'),
        menuRank: []
      },
      {
        id: 'ta-montreal-terrasse-auberge',
        name: "Terrasse Sur l'Auberge",
        meal: 'Dinner',
        city: 'Montréal, QC',
        rating: 4.7,
        fitsDay: '2026-08-14',
        region: 'Old Montréal',
        why: 'Tripadvisor #1 in Montréal · 4.7/5 from 515 reviews. A rooftop meal option with strong traveller feedback and Old Montréal views.',
        order: 'Use the current menu; this recommendation is based on Tripadvisor ranking rather than a guessed signature dish.',
        tip: 'Only choose it if the family still has energy after Marriott check-in; reserve if possible.',
        address: '',
        source: taPages.montreal,
        photo: '',
        mapUrl: maps("Terrasse Sur l'Auberge", 'Montréal, QC'),
        menuRank: []
      },
      {
        id: 'ta-montreal-jacopo',
        name: 'Jacopo',
        meal: 'Dinner',
        city: 'Montréal, QC',
        rating: 4.7,
        fitsDay: '2026-08-14',
        region: 'Old Montréal',
        why: 'Tripadvisor #3 in Montréal · 4.7/5 from 1,108 reviews. Italian and seafood with a large review base.',
        order: 'Choose from the current Italian/seafood menu; verify availability before leaving the hotel area.',
        tip: 'Higher-review-count alternative when you want a proper sit-down dinner instead of the food hall.',
        address: '',
        source: taPages.montreal,
        photo: '',
        mapUrl: maps('Jacopo', 'Montréal, QC'),
        menuRank: []
      },
      {
        id: 'ta-quebec-rioux-pettigrew',
        name: 'Chez Rioux & Pettigrew',
        meal: 'Dinner',
        city: 'Québec City, QC',
        rating: 4.7,
        fitsDay: '2026-08-15',
        region: 'Old Québec',
        why: 'Tripadvisor #2 in Québec City · 4.7/5 from 2,344 reviews. French-Canadian cooking with one of the strongest rating-plus-review-count combinations in the city.',
        order: 'Use the current seasonal menu; reserve before replacing the simpler Old Québec dinner plan.',
        tip: 'A higher-end alternative; use only if the timing works after Montmorency and hotel check-in.',
        address: '',
        source: taPages.quebecCity,
        photo: '',
        mapUrl: maps('Chez Rioux & Pettigrew', 'Québec City, QC'),
        menuRank: []
      },
      {
        id: 'ta-quebec-lapin-saute',
        name: 'Le Lapin Sauté',
        meal: 'Dinner',
        city: 'Québec City, QC',
        rating: 4.4,
        fitsDay: '2026-08-15',
        region: 'Petit-Champlain / Old Québec',
        why: 'Tripadvisor #4 in Québec City · 4.4/5 from 3,493 reviews. Very large review base and a location that fits an Old Québec walking evening.',
        order: 'Choose from the current French-Canadian menu; verify reservation availability.',
        tip: 'Useful when you want a highly established Old Québec restaurant without adding another driving leg.',
        address: '',
        source: taPages.quebecCity,
        photo: '',
        mapUrl: maps('Le Lapin Sauté', 'Québec City, QC'),
        menuRank: []
      },
      {
        id: 'ta-rdl-innocent',
        name: "L'Innocent",
        meal: 'Lunch',
        city: 'Rivière-du-Loup, QC',
        rating: 4.6,
        fitsDay: '2026-08-16',
        region: 'Rivière-du-Loup',
        why: 'Tripadvisor #1 in Rivière-du-Loup · 4.6/5 from 542 reviews. Fusion/Canadian and the strongest ranked alternative to the planned lunch.',
        order: 'Use the current menu and keep the lunch stop within the long-transfer-day time budget.',
        tip: 'Choose it only if service timing protects the New Brunswick drive.',
        address: '',
        source: taPages.riviereDuLoup,
        photo: '',
        mapUrl: maps("L'Innocent", 'Rivière-du-Loup, QC'),
        menuRank: []
      },
      {
        id: 'ta-rdl-porte-arriere',
        name: 'La Porte Arrière',
        meal: 'Lunch',
        city: 'Rivière-du-Loup, QC',
        rating: 4.8,
        fitsDay: '2026-08-16',
        region: 'Rivière-du-Loup',
        why: 'Tripadvisor #3 in Rivière-du-Loup · 4.8/5 from 62 reviews. Excellent score, but a smaller review base than L’Innocent.',
        order: 'Check current menu, opening time and seating before making it the transfer-day lunch.',
        tip: 'High score, lower sample size; L’Innocent remains the safer confidence pick.',
        address: '',
        source: taPages.riviereDuLoup,
        photo: '',
        mapUrl: maps('La Porte Arrière', 'Rivière-du-Loup, QC'),
        menuRank: []
      },
      {
        id: 'ta-fredericton-claudines',
        name: "Claudine's Eatery",
        meal: 'Dinner',
        city: 'Fredericton, NB',
        rating: 4.7,
        fitsDay: '2026-08-16',
        region: 'Fredericton',
        why: 'Tripadvisor #1 in Fredericton · 4.7/5 from 672 reviews. Seafood and Canadian dishes with strong traveller feedback.',
        order: 'Use the current menu; call or reserve before leaving the Delta after the long drive.',
        tip: 'Off-site alternative only if arrival is early enough; hotel recovery remains the lower-friction Plan A.',
        address: '',
        source: taPages.fredericton,
        photo: '',
        mapUrl: maps("Claudine's Eatery", 'Fredericton, NB'),
        menuRank: []
      },
      {
        id: 'ta-fredericton-wolastoq',
        name: 'Wolastoq Wharf',
        meal: 'Dinner',
        city: 'Fredericton, NB',
        rating: 4.6,
        fitsDay: '2026-08-16',
        region: 'Fredericton',
        why: 'Tripadvisor #2 in Fredericton · 4.6/5 from 993 reviews. Seafood/Canadian with nearly one thousand reviews.',
        order: 'Use the current seafood menu and confirm Sunday hours before leaving the hotel.',
        tip: 'Strong review volume; only use if the family still has energy after the 620 km transfer day.',
        address: '',
        source: taPages.fredericton,
        photo: '',
        mapUrl: maps('Wolastoq Wharf', 'Fredericton, NB'),
        menuRank: []
      },
      {
        id: 'ta-moncton-gusto',
        name: 'Gusto Italian Grill & Bar',
        meal: 'Lunch',
        city: 'Moncton, NB',
        rating: 4.5,
        fitsDay: '2026-08-17',
        region: 'Moncton',
        why: 'Tripadvisor #1 in Moncton · 4.5/5 from 1,363 reviews. Italian/pizza with the largest review base among the top-ranked Moncton options.',
        order: 'Use the current Italian menu; confirm lunch hours before substituting it for the planned Moncton stop.',
        tip: 'High-confidence alternative when you want a fuller sit-down meal in Moncton.',
        address: '',
        source: taPages.moncton,
        photo: '',
        mapUrl: maps('Gusto Italian Grill & Bar', 'Moncton, NB'),
        menuRank: []
      },
      {
        id: 'ta-moncton-little-louis',
        name: "Little Louis' Oyster Bar",
        meal: 'Dinner',
        city: 'Moncton, NB',
        rating: 4.8,
        fitsDay: '2026-08-19',
        region: 'Moncton',
        why: 'Tripadvisor Local Eats #1 in Moncton · 4.8/5 from 317 reviews. Seafood/Canadian and a strong special-dinner alternative.',
        order: 'Use the current seafood menu; reserve before replacing the simpler post-Hopewell dinner plan.',
        tip: 'Best for a deliberate dinner, not a quick stop; protect the hotel check-in and child bedtime.',
        address: '',
        source: taPages.monctonLocal,
        photo: '',
        mapUrl: maps("Little Louis' Oyster Bar", 'Moncton, NB'),
        menuRank: []
      },
      {
        id: 'ta-charlottetown-claddagh',
        name: 'Claddagh Oyster House',
        meal: 'Dinner',
        city: 'Charlottetown, PE',
        rating: 4.6,
        fitsDay: '2026-08-18',
        region: 'Charlottetown',
        why: 'Tripadvisor #1 in Charlottetown · 4.6/5 from 1,033 reviews. Seafood/Canadian and the highest-ranked full restaurant in the city.',
        order: 'Use the current seafood menu; reserve before changing the planned dinner.',
        tip: 'Best high-confidence downtown alternative when you want a proper seafood dinner.',
        address: '',
        source: taPages.charlottetown,
        photo: '',
        mapUrl: maps('Claddagh Oyster House', 'Charlottetown, PE'),
        menuRank: []
      },
      {
        id: 'ta-charlottetown-leonhards',
        name: "Leonhard's Cafe & Restaurant",
        meal: 'Breakfast / lunch',
        city: 'Charlottetown, PE',
        rating: 4.5,
        fitsDay: '2026-08-18',
        region: 'Charlottetown',
        why: 'Tripadvisor #3 in Charlottetown · 4.5/5 from 661 reviews. Café/European with consistently strong breakfast feedback.',
        order: 'Use the current breakfast/lunch menu; keep the hotel breakfast unless this stop improves the day.',
        tip: 'A strong daytime choice, but avoid creating a second breakfast just because it ranks well.',
        address: '',
        source: taPages.charlottetown,
        photo: '',
        mapUrl: maps("Leonhard's Cafe & Restaurant", 'Charlottetown, PE'),
        menuRank: []
      },
      {
        id: 'ta-edmundston-chantals',
        name: "Chantal's Steak House",
        meal: 'Lunch',
        city: 'Edmundston, NB',
        rating: 4.8,
        fitsDay: '2026-08-20',
        region: 'Edmundston',
        why: 'Tripadvisor #1 in Edmundston · 4.8/5 from 420 reviews. French/steakhouse and the strongest rating-plus-review-count option in town.',
        order: 'Confirm lunch service and choose from the current menu before replacing the faster transfer-day meal.',
        tip: 'Excellent rating, but the Aug 20 drive is long; use only if the schedule can absorb a proper sit-down lunch.',
        address: '',
        source: taPages.edmundston,
        photo: '',
        mapUrl: maps("Chantal's Steak House", 'Edmundston, NB'),
        menuRank: []
      },
      {
        id: 'ta-edmundston-patrimoine',
        name: 'Pizza Le Patrimoine',
        meal: 'Lunch',
        city: 'Edmundston, NB',
        rating: 4.7,
        fitsDay: '2026-08-20',
        region: 'Edmundston',
        why: 'Tripadvisor #2 in Edmundston · 4.7/5 from 353 reviews. Italian/pizza with strong family fit and substantial review volume.',
        order: 'Pizza or Italian comfort food from the current menu; confirm wait time before committing.',
        tip: 'More family-friendly and potentially faster than a steakhouse while still staying near the top of Tripadvisor.',
        address: '',
        source: taPages.edmundston,
        photo: '',
        mapUrl: maps('Pizza Le Patrimoine', 'Edmundston, NB'),
        menuRank: []
      },
      {
        id: 'ta-boucherville-nourri',
        name: 'Nourri Au Beurre',
        meal: 'Lunch',
        city: 'Boucherville, QC',
        rating: 4.6,
        fitsDay: '2026-08-21',
        region: 'Boucherville',
        why: 'Tripadvisor #1 in Boucherville · 4.6/5 from 53 reviews. French/Canadian and the current top-ranked restaurant in the city.',
        order: 'Check current lunch hours and menu before replacing the planned Boucherville stop.',
        tip: 'Top rank but modest review count; use when timing and opening hours align.',
        address: '',
        source: taPages.boucherville,
        photo: '',
        mapUrl: maps('Nourri Au Beurre', 'Boucherville, QC'),
        menuRank: []
      },
      {
        id: 'ta-boucherville-sushi-hamachi',
        name: 'Sushi Hamachi',
        meal: 'Lunch',
        city: 'Boucherville, QC',
        rating: 4.7,
        fitsDay: '2026-08-21',
        region: 'Boucherville',
        why: 'Tripadvisor 4.7/5 from 93 reviews and listed among Boucherville’s top restaurants. A higher-score alternative when sushi fits the final travel day.',
        order: 'Use the current sushi menu and verify lunch opening before diverting.',
        tip: 'Good score, smaller review base; compare live ETA with the planned Boucherville lunch before switching.',
        address: '',
        source: taPages.boucherville,
        photo: '',
        mapUrl: maps('Sushi Hamachi', 'Boucherville, QC'),
        menuRank: []
      }
    ];

    try {
      var data = JSON.parse(dataNode.textContent);
      data.foodExtras = restaurants;
      dataNode.textContent = JSON.stringify(data);
    } catch (error) {
      console.error('Tripadvisor restaurant suggestions could not be applied.', error);
    }
  })();

  // Keep personal itinerary additions separate from the large operational plan
  // file while still applying them before app.js builds the rendered trip.
  if (window.TripData && typeof window.TripData.operationalPlan === 'function') {
    var baseOperationalPlanFactory = window.TripData.operationalPlan;
    window.TripData.operationalPlan = function (helpers) {
      var plan = baseOperationalPlanFactory(helpers);
      var saturday = plan && Array.isArray(plan.days)
        ? plan.days.find(function (day) { return day.id === '2026-08-15'; })
        : null;

      if (saturday && !saturday.stops.some(function (stop) { return stop.id === 'd2-shared-map-stop'; })) {
        var savedMapStop = helpers.customStop({
          id: 'd2-shared-map-stop',
          dayId: '2026-08-15',
          time: 'Saturday · flexible',
          zone: 'ET',
          title: 'Saved Google Maps stop',
          locationName: 'Saved Google Maps stop',
          kind: 'Saved place / flexible stop',
          priority: 'optional',
          routeEligible: false,
          notes: 'Shared Google Maps place added for Saturday. Tap Map to open the exact saved location; timing stays flexible until you decide where it fits.',
          mapUrl: 'https://maps.app.goo.gl/mv6AbqsY51aE7aGz7?g_st=ac',
          sourceUrl: 'https://maps.app.goo.gl/mv6AbqsY51aE7aGz7?g_st=ac'
        });
        var dinnerIndex = saturday.stops.findIndex(function (stop) { return stop.id === 'd2-dinner'; });
        if (dinnerIndex >= 0) saturday.stops.splice(dinnerIndex, 0, savedMapStop);
        else saturday.stops.push(savedMapStop);
        saturday.stops.forEach(function (stop, index) { stop.order = index + 1; });
      }

      return plan;
    };
  }

  // Every user-editable value stored by the trip app. Keeping the raw browser
  // values means cloud sync covers itinerary progress, choices, packing,
  // expenses, saved picks, and the selected theme without coupling Firebase to
  // app.js's internal data shapes.
  var TRACKED_KEYS = new Set([
    'pei-foodie-road-trip/state/v3',
    'pei-foodie-road-trip/picks/v1',
    'pei-foodie-road-trip/packing/v1',
    'pei-foodie-road-trip/expenses/v1',
    'pei-foodie-road-trip/theme'
  ]);
  var nativeSetItem = Storage.prototype.setItem;
  var nativeRemoveItem = Storage.prototype.removeItem;
  var suppressEvents = 0;

  function isTrackedStorage(storage, key) {
    return storage === window.localStorage && TRACKED_KEYS.has(String(key));
  }

  function notify(key, value, action) {
    window.dispatchEvent(new CustomEvent('pei-firebase-local-change', {
      detail: { key: String(key), value: value, action: action }
    }));
  }

  Storage.prototype.setItem = function (key, value) {
    var tracked = isTrackedStorage(this, key);
    var before = tracked ? this.getItem(key) : null;
    nativeSetItem.call(this, key, value);
    if (tracked && !suppressEvents && before !== String(value)) {
      notify(key, String(value), 'set');
    }
  };

  Storage.prototype.removeItem = function (key) {
    var tracked = isTrackedStorage(this, key);
    var before = tracked ? this.getItem(key) : null;
    nativeRemoveItem.call(this, key);
    if (tracked && !suppressEvents && before !== null) {
      notify(key, null, 'remove');
    }
  };

  window.PeiFirebaseSyncStorage = {
    trackedKeys: Array.from(TRACKED_KEYS),
    runSilently: function (callback) {
      suppressEvents += 1;
      try { return callback(); } finally { suppressEvents -= 1; }
    },
    setSilently: function (key, value) {
      suppressEvents += 1;
      try { nativeSetItem.call(window.localStorage, key, value); } finally { suppressEvents -= 1; }
    },
    removeSilently: function (key) {
      suppressEvents += 1;
      try { nativeRemoveItem.call(window.localStorage, key); } finally { suppressEvents -= 1; }
    }
  };

  // The signed-in status panel is useful on desktop, but on a phone it covers
  // trip controls. Keep the sign-in prompt visible while signed out, then remove
  // the panel completely after authentication succeeds.
  var mobileSyncStyle = document.createElement('style');
  mobileSyncStyle.textContent = '@media(max-width:560px){.firebase-sync-panel.is-signed-in{display:none!important}}';
  document.head.appendChild(mobileSyncStyle);

  // Version the module URL so browsers and the service worker cannot keep using
  // an older Firebase configuration or sign-in implementation after deployment.
  import('./firebase-sync.js?v=20260805-1454').catch(function (error) {
    console.error('Firebase sync could not load.', error);
    window.dispatchEvent(new CustomEvent('pei-firebase-sync-error', {
      detail: { message: 'Cloud sync could not load.' }
    }));
  });
})();
