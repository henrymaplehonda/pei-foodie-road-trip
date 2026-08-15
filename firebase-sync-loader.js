(function () {
  'use strict';

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
