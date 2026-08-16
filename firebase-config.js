window.PEI_FIREBASE_SYNC = {
  enabled: true,
  tripId: 'pei-2026',
  firebaseConfig: {
    apiKey: 'AIzaSyDbYtn8lWXUEiNq_x_Zzq56lIiOYSmKA5w',
    authDomain: 'pei-road-trip-sync.firebaseapp.com',
    projectId: 'pei-road-trip-sync',
    storageBucket: 'pei-road-trip-sync.firebasestorage.app',
    messagingSenderId: '319172064576',
    appId: '1:319172064576:web:5a6237a144c30c5f16b6a5',
    measurementId: 'G-NNVYDNDCCE'
  }
};

// Montmorency daily access is already purchased. Override the generic
// pre-purchase guidance before app.js reads it so the attraction card shows a
// one-tap ticket/account button instead of asking to buy admission again.
if (window.TripData && typeof window.TripData.ticketGuidance === 'function') {
  var purchasedMontmorencyBaseGuidance = window.TripData.ticketGuidance;
  window.TripData.ticketGuidance = function (helpers) {
    var guidance = purchasedMontmorencyBaseGuidance(helpers);
    if (guidance && guidance.montmorency) {
      guidance.montmorency = Object.assign({}, guidance.montmorency, {
        label: 'Daily access purchased ✓',
        cta: 'Open tickets',
        url: 'https://www.sepaq.com/en/account',
        note: 'Purchased for Saturday, Aug 15, 2026 · C$31.96 total. Open Sépaq to access the booking. Keep the confirmation email and arrival code available on your phone; the code must be presented on arrival.',
        required: true
      });
    }
    return guidance;
  };
}

// The shared Google Maps place on Saturday is a hard itinerary anchor.
// firebase-sync-loader.js adds the stop after this file runs, so wrap the
// stop builder here and force that one stop to stay required when it is built.
if (window.TripData && typeof window.TripData.operationalPlan === 'function') {
  var mandatorySaturdayBasePlan = window.TripData.operationalPlan;
  window.TripData.operationalPlan = function (helpers) {
    if (helpers && typeof helpers.customStop === 'function' && !helpers.__mandatorySaturdayMapStop) {
      var originalCustomStop = helpers.customStop;
      helpers.customStop = function (details) {
        if (details && details.id === 'd2-shared-map-stop') {
          details = Object.assign({}, details, {
            time: 'Saturday · mandatory',
            title: 'Mandatory Google Maps stop',
            locationName: 'Mandatory Google Maps stop',
            kind: 'Mandatory saved place',
            priority: 'required',
            conditional: false,
            choiceGated: false,
            replaceable: false,
            notes: 'Mandatory Saturday stop. Do not skip this location. Tap Map to open the exact shared Google Maps place; fit the rest of the Saturday schedule around this stop.'
          });
        }
        return originalCustomStop(details);
      };
      helpers.__mandatorySaturdayMapStop = true;
    }
    return mandatorySaturdayBasePlan(helpers);
  };
}

// Load the live Aug 17/Aug 19 route correction synchronously before app.js.
// document.write is intentional here because this config file executes while
// the HTML parser is still loading scripts, which keeps the override ordered.
if (document.readyState === 'loading') {
  document.write('<script src="data/aug17-live-override.js?v=20260816"><\\/script>');
}
