(function () {
  'use strict';

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
  import('./firebase-sync.js?v=20260803-2331').catch(function (error) {
    console.error('Firebase sync could not load.', error);
    window.dispatchEvent(new CustomEvent('pei-firebase-sync-error', {
      detail: { message: 'Cloud sync could not load.' }
    }));
  });
})();