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
const STATE_KEY = 'pei-foodie-road-trip/state/v3';
const PICKS_KEY = 'pei-foodie-road-trip/picks/v1';
const CLIENT_KEY = 'pei-foodie-road-trip/firebase-client/v1';
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

function parseStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function localSnapshot() {
  return {
    state: parseStoredJson(STATE_KEY),
    picks: parseStoredJson(PICKS_KEY)
  };
}

function stableStringify(value) {
  try { return JSON.stringify(value == null ? null : value); } catch (error) { return 'null'; }
}

function snapshotsEqual(a, b) {
  return stableStringify(a && a.state) === stableStringify(b && b.state) &&
    stableStringify(a && a.picks) === stableStringify(b && b.picks);
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

function updateButtons(user) {
  if (signInButton) signInButton.hidden = Boolean(user);
  if (signOutButton) signOutButton.hidden = !user;
}

function mountPanel() {
  if (panel) return;
  const style = document.createElement('style');
  style.textContent = `
    .firebase-sync-panel{border:1px solid var(--line,#ddd);border-left:5px solid var(--accent2,#0b6b72);background:var(--panel,#fff);border-radius:16px;padding:14px 16px;margin:0 0 16px;box-shadow:0 8px 24px -18px rgba(0,0,0,.35)}
    .firebase-sync-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .firebase-sync-title{font-weight:800;margin:0}.firebase-sync-status{margin:3px 0 0;font-size:13px;color:var(--muted,#666)}
    .firebase-sync-status[data-kind="ok"]{color:var(--ok,#1f8f6e)}.firebase-sync-status[data-kind="warn"]{color:var(--warn,#b5721f)}.firebase-sync-status[data-kind="error"]{color:#b42318}
    .firebase-sync-account{font-size:12px;color:var(--muted,#666);margin-top:3px}
    .firebase-sync-actions{display:flex;gap:8px;flex-wrap:wrap}.firebase-sync-actions button{border:1px solid var(--line,#ddd);background:#fff;border-radius:12px;padding:8px 11px;font-weight:700;cursor:pointer}
    .firebase-sync-actions button.primary{background:var(--accent2,#0b6b72);border-color:var(--accent2,#0b6b72);color:#fff}
  `;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.className = 'firebase-sync-panel';
  panel.innerHTML = `
    <div class="firebase-sync-row">
      <div>
        <p class="firebase-sync-title">Cloud checklist sync</p>
        <p class="firebase-sync-status" data-kind="warn">Checking setup…</p>
        <p class="firebase-sync-account">Not signed in</p>
      </div>
      <div class="firebase-sync-actions">
        <button type="button" class="primary" data-sync-sign-in>Sign in with Google</button>
        <button type="button" data-sync-sign-out hidden>Sign out</button>
      </div>
    </div>`;

  statusText = panel.querySelector('.firebase-sync-status');
  accountText = panel.querySelector('.firebase-sync-account');
  signInButton = panel.querySelector('[data-sync-sign-in]');
  signOutButton = panel.querySelector('[data-sync-sign-out]');

  const checklist = document.getElementById('checklist');
  if (checklist) checklist.insertBefore(panel, checklist.firstChild);
  else document.querySelector('main')?.insertBefore(panel, document.querySelector('main').firstChild);

  signInButton.addEventListener('click', handleSignIn);
  signOutButton.addEventListener('click', async () => {
    if (auth) await signOut(auth);
  });

  if (!isConfigured) {
    setStatus('Firebase is not configured yet. Complete FIREBASE_SETUP.md first.', 'warn');
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
      setStatus('Google sign-in failed: ' + (error.message || error.code || 'unknown error'), 'error');
    } else {
      setStatus('Sign-in cancelled.', 'warn');
    }
  }
}

function applyRemoteSnapshot(remote) {
  const local = localSnapshot();
  if (snapshotsEqual(local, remote)) return false;
  applyingRemote = true;
  try {
    storageBridge.runSilently(() => {
      if (remote.state) storageBridge.setSilently(STATE_KEY, JSON.stringify(remote.state));
      else storageBridge.removeSilently(STATE_KEY);
      if (remote.picks) storageBridge.setSilently(PICKS_KEY, JSON.stringify(remote.picks));
      else storageBridge.removeSilently(PICKS_KEY);
    });
  } finally {
    applyingRemote = false;
  }
  return true;
}

async function pushLocalSnapshot(reason = 'change') {
  if (!currentUser || !tripRef || applyingRemote || !navigator.onLine) {
    if (!navigator.onLine) setStatus('Offline — changes are safe here and will sync when connected.', 'warn');
    return;
  }
  const snapshot = localSnapshot();
  setStatus('Syncing…', '');
  try {
    await setDoc(tripRef, {
      version: 1,
      tripId: settings.tripId,
      state: snapshot.state,
      picks: snapshot.picks,
      updatedAt: serverTimestamp(),
      updatedByClient: clientId,
      updatedByEmail: currentUser.email || '',
      updateReason: reason
    }, { merge: true });
    setStatus('Synced across devices.', 'ok');
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

async function connectTrip(user) {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  tripRef = doc(db, 'trips', settings.tripId);
  setStatus('Loading shared checklist…', '');

  try {
    const initial = await getDoc(tripRef);
    if (!initial.exists()) {
      await pushLocalSnapshot('first-device-seed');
    } else {
      const data = initial.data() || {};
      const changed = applyRemoteSnapshot({ state: data.state || null, picks: data.picks || null });
      if (changed) {
        setStatus('Downloaded the shared checklist. Refreshing…', 'ok');
        setTimeout(() => location.reload(), 250);
        return;
      }
      setStatus('Synced across devices.', 'ok');
    }

    firstRemoteLoad = false;
    unsubscribe = onSnapshot(tripRef, snapshot => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() || {};
      if (data.updatedByClient === clientId) {
        setStatus('Synced across devices.', 'ok');
        return;
      }
      const changed = applyRemoteSnapshot({ state: data.state || null, picks: data.picks || null });
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
    setStatus('Could not open the shared checklist. Check setup and rules.', 'error');
  }
}

function disconnectTrip() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  tripRef = null;
  setStatus('Sign in to sync this checklist across devices.', 'warn');
}

window.addEventListener('pei-firebase-local-change', event => {
  if (!event.detail || !storageBridge.trackedKeys.includes(event.detail.key)) return;
  schedulePush('local-checklist-change');
});

window.addEventListener('storage', event => {
  if (storageBridge.trackedKeys.includes(event.key)) schedulePush('another-browser-tab');
});

window.addEventListener('online', () => schedulePush('back-online'));
window.addEventListener('offline', () => setStatus('Offline — changes are safe here and will sync when connected.', 'warn'));

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
      updateButtons(user);
      if (user) connectTrip(user);
      else disconnectTrip();
    });
  } catch (error) {
    console.error('Firebase initialization failed.', error);
    setStatus('Firebase initialization failed. Recheck firebase-config.js.', 'error');
  }
}
