import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const settings = window.PEI_FIREBASE_SYNC || {};
const storageBridge = window.PeiFirebaseSyncStorage;
const CLIENT_KEY = 'pei-foodie-road-trip/firebase-client/v1';
const STORAGE_FIELDS = {
  state: 'pei-foodie-road-trip/state/v3',
  picks: 'pei-foodie-road-trip/picks/v1',
  packing: 'pei-foodie-road-trip/packing/v1',
  expenses: 'pei-foodie-road-trip/expenses/v1',
  theme: 'pei-foodie-road-trip/theme'
};
const isConfigured = Boolean(
  settings.enabled &&
  settings.tripId &&
  settings.firebaseConfig &&
  settings.firebaseConfig.apiKey &&
  !String(settings.firebaseConfig.apiKey).startsWith('PASTE_')
);

let auth = null;
let db = null;
let currentUser = null;
let tripRef = null;
let unsubscribe = null;
let pushTimer = null;
let applyingRemote = false;
let firstRemoteLoad = true;
let panel = null;
let titleText = null;
let statusText = null;
let accountText = null;
let signInButton = null;
let signOutButton = null;

function randomClientId() {
  try {
    const existing = sessionStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const value = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(CLIENT_KEY, value);
    return value;
  } catch (error) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const clientId = randomClientId();

function localSnapshot() {
  const snapshot = {};
  Object.entries(STORAGE_FIELDS).forEach(([field, key]) => {
    snapshot[field] = localStorage.getItem(key);
  });
  return snapshot;
}

function legacyRemoteSnapshot(data) {
  // The first Firebase version stored only state and picks. During the
  // one-time upgrade, keep this device's newer packing, expenses, and theme
  // values instead of treating their absence as an instruction to delete them.
  const local = localSnapshot();
  return {
    state: data.state == null ? local.state : JSON.stringify(data.state),
    picks: data.picks == null ? local.picks : JSON.stringify(data.picks),
    packing: local.packing,
    expenses: local.expenses,
    theme: local.theme
  };
}

function remoteSnapshot(data) {
  if (data && data.appData && typeof data.appData === 'object') {
    const snapshot = {};
    Object.keys(STORAGE_FIELDS).forEach(field => {
      snapshot[field] = typeof data.appData[field] === 'string' ? data.appData[field] : null;
    });
    return snapshot;
  }
  return legacyRemoteSnapshot(data || {});
}

function snapshotsEqual(a, b) {
  return Object.keys(STORAGE_FIELDS).every(field => (a && a[field] || null) === (b && b[field] || null));
}

function setStatus(message, kind = '') {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.dataset.kind = kind;
}

function setAccount(user) {
  if (!accountText) return;
  accountText.textContent = user ? user.email || user.displayName || 'Signed in' : 'Not signed in';
}

function updatePresentation(user) {
  if (!panel) return;
  panel.classList.toggle('is-signed-in', Boolean(user));
  panel.classList.toggle('needs-sign-in', !user);
  titleText.textContent = user ? 'Trip cloud sync' : 'Sign in to sync your whole trip';
  signInButton.hidden = Boolean(user);
  signOutButton.hidden = !user;
}

function mountPanel() {
  if (panel) return;
  const style = document.createElement('style');
  style.textContent = `
    .firebase-sync-panel{position:fixed;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:1000;width:min(720px,calc(100% - 24px));border:1px solid rgba(255,255,255,.22);border-left:5px solid #4fd1d9;background:rgba(18,31,39,.96);color:#fff;border-radius:18px;padding:14px 16px;box-shadow:0 18px 52px -18px rgba(0,0,0,.72);backdrop-filter:blur(14px) saturate(1.25)}
    .firebase-sync-panel.is-signed-in{top:auto;bottom:calc(12px + env(safe-area-inset-bottom));left:auto;right:12px;transform:none;width:auto;max-width:min(460px,calc(100% - 24px));padding:10px 12px;border-left-width:3px;opacity:.94}
    .firebase-sync-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.firebase-sync-copy{min-width:0;flex:1}
    .firebase-sync-title{font-weight:850;margin:0;font-size:16px;line-height:1.25}.firebase-sync-status{margin:4px 0 0;font-size:13px;color:#d5e3e8;line-height:1.35}
    .firebase-sync-status[data-kind="ok"]{color:#86efc1}.firebase-sync-status[data-kind="warn"]{color:#ffd28a}.firebase-sync-status[data-kind="error"]{color:#ff9b91}
    .firebase-sync-account{font-size:12px;color:#aebfc7;margin:3px 0 0;overflow-wrap:anywhere}
    .firebase-sync-actions{display:flex;gap:8px;flex-wrap:wrap}.firebase-sync-actions button{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .firebase-sync-actions button.primary{background:#55cbd2;border-color:#55cbd2;color:#102128}.firebase-sync-actions button:disabled{opacity:.55;cursor:not-allowed}
    @media(max-width:560px){.firebase-sync-panel{top:max(8px,env(safe-area-inset-top));width:calc(100% - 16px);padding:12px}.firebase-sync-actions,.firebase-sync-actions button{width:100%}.firebase-sync-panel.is-signed-in{right:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:calc(100% - 16px)}}
    @media(prefers-reduced-motion:no-preference){.firebase-sync-panel{animation:firebaseSyncIn .28s cubic-bezier(.16,1,.3,1)}@keyframes firebaseSyncIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}.firebase-sync-panel.is-signed-in{animation:none}}
  `;
  document.head.appendChild(style);

  panel = document.createElement('aside');
  panel.className = 'firebase-sync-panel needs-sign-in';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="firebase-sync-row">
      <div class="firebase-sync-copy">
        <p class="firebase-sync-title">Sign in to sync your whole trip</p>
        <p class="firebase-sync-status" data-kind="warn">Your itinerary progress, choices, packing, expenses, picks, and theme are currently saved only on this device.</p>
        <p class="firebase-sync-account">Not signed in</p>
      </div>
      <div class="firebase-sync-actions">
        <button type="button" class="primary" data-sync-sign-in>Sign in with Google</button>
        <button type="button" data-sync-sign-out hidden>Sign out</button>
      </div>
    </div>`;

  titleText = panel.querySelector('.firebase-sync-title');
  statusText = panel.querySelector('.firebase-sync-status');
  accountText = panel.querySelector('.firebase-sync-account');
  signInButton = panel.querySelector('[data-sync-sign-in]');
  signOutButton = panel.querySelector('[data-sync-sign-out]');
  document.body.prepend(panel);

  signInButton.addEventListener('click', handleSignIn);
  signOutButton.addEventListener('click', async () => {
    if (auth) await signOut(auth);
  });

  if (!isConfigured) {
    setStatus('Cloud sync needs a valid Firebase Web API key before sign-in can work.', 'error');
    signInButton.disabled = true;
  }
}

async function handleSignIn() {
  if (!auth) return;
  setStatus('Opening Google sign-in…', '');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (error && error.code !== 'auth/popup-closed-by-user') {
      const message = error.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.'
        ? 'Firebase rejected the Web API key. Copy it directly from Google Cloud Credentials.'
        : 'Google sign-in failed: ' + (error.message || error.code || 'unknown error');
      setStatus(message, 'error');
    } else {
      setStatus('Sign-in cancelled. Your changes remain only on this device.', 'warn');
    }
  }
}

function applyRemoteSnapshot(remote) {
  const local = localSnapshot();
  if (snapshotsEqual(local, remote)) return false;
  applyingRemote = true;
  try {
    storageBridge.runSilently(() => {
      Object.entries(STORAGE_FIELDS).forEach(([field, key]) => {
        if (typeof remote[field] === 'string') storageBridge.setSilently(key, remote[field]);
        else storageBridge.removeSilently(key);
      });
    });
  } finally {
    applyingRemote = false;
  }
  return true;
}

async function pushLocalSnapshot(reason = 'change') {
  if (!currentUser || !tripRef || applyingRemote || !navigator.onLine) {
    if (!navigator.onLine) setStatus('Offline — changes are safe on this device and will sync when connected.', 'warn');
    return;
  }
  const snapshot = localSnapshot();
  setStatus('Syncing the whole trip…', '');
  try {
    await setDoc(tripRef, {
      version: 2,
      tripId: settings.tripId,
      appData: snapshot,
      updatedAt: serverTimestamp(),
      updatedByClient: clientId,
      updatedByEmail: currentUser.email || '',
      updateReason: reason
    }, { merge: true });
    setStatus('Everything is synced across devices.', 'ok');
  } catch (error) {
    console.error('Firebase sync write failed.', error);
    setStatus('Could not sync. Check Firestore rules and your connection.', 'error');
  }
}

function schedulePush(reason = 'change') {
  if (!currentUser || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushLocalSnapshot(reason), 450);
}

async function connectTrip() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  tripRef = doc(db, 'trips', settings.tripId);
  setStatus('Loading the shared trip…', '');

  try {
    const initial = await getDoc(tripRef);
    if (!initial.exists()) {
      await pushLocalSnapshot('first-device-seed');
    } else {
      const data = initial.data() || {};
      const legacyDocument = !(data.appData && typeof data.appData === 'object');
      const changed = applyRemoteSnapshot(remoteSnapshot(data));
      if (legacyDocument) {
        // Upgrade the checklist-only document after merging it with this
        // device's packing, expenses, and theme.
        await pushLocalSnapshot('migrate-full-app-data');
      }
      if (changed) {
        setStatus('Downloaded the shared trip. Refreshing…', 'ok');
        setTimeout(() => location.reload(), 250);
        return;
      }
      setStatus('Everything is synced across devices.', 'ok');
    }

    firstRemoteLoad = false;
    unsubscribe = onSnapshot(tripRef, snapshot => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};
      if (data.updatedByClient === clientId) {
        setStatus('Everything is synced across devices.', 'ok');
        return;
      }
      const changed = applyRemoteSnapshot(remoteSnapshot(data));
      if (changed && !firstRemoteLoad) {
        setStatus('Updated from another device. Refreshing…', 'ok');
        setTimeout(() => location.reload(), 300);
      }
      firstRemoteLoad = false;
    }, error => {
      console.error('Firebase sync listener failed.', error);
      setStatus('Live sync stopped. Check Firestore rules.', 'error');
    });
  } catch (error) {
    console.error('Firebase sync connection failed.', error);
    setStatus('Could not open the shared trip. Check Firebase setup and rules.', 'error');
  }
}

function disconnectTrip() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  tripRef = null;
  setStatus('Your changes are currently saved only on this device. Sign in to sync the entire trip.', 'warn');
}

window.addEventListener('pei-firebase-local-change', event => {
  if (!event.detail || !storageBridge.trackedKeys.includes(event.detail.key)) return;
  schedulePush('local-app-change');
});

window.addEventListener('storage', event => {
  if (storageBridge.trackedKeys.includes(event.key)) schedulePush('another-browser-tab');
});

window.addEventListener('online', () => schedulePush('back-online'));
window.addEventListener('offline', () => setStatus('Offline — changes are safe on this device and will sync when connected.', 'warn'));

document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
if (document.readyState !== 'loading') mountPanel();

if (isConfigured) {
  try {
    const app = initializeApp(settings.firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    try { await getRedirectResult(auth); } catch (error) { console.warn('Redirect sign-in result failed.', error); }

    onAuthStateChanged(auth, user => {
      currentUser = user;
      setAccount(user);
      updatePresentation(user);
      if (user) connectTrip();
      else disconnectTrip();
    });
  } catch (error) {
    console.error('Firebase initialization failed.', error);
    const message = error && String(error.code || error.message || '').includes('api-key')
      ? 'Firebase rejected the Web API key. Copy it directly from Google Cloud Credentials.'
      : 'Firebase initialization failed. Recheck firebase-config.js.';
    setStatus(message, 'error');
  }
}
