# Firebase checklist sync setup

The site code is ready, but cloud sync stays disabled until the Firebase web configuration is pasted into `firebase-config.js` and the Firestore rules are published.

## 1. Create the Firebase project

1. Open the Firebase console and choose **Create a project**.
2. Suggested project name: `pei-road-trip-sync`.
3. Google Analytics is not required for this checklist.
4. Finish creating the project.

## 2. Register the website

1. On the project overview, select the **Web** icon (`</>`).
2. App nickname: `PEI Road Trip`.
3. Do not enable Firebase Hosting; the site remains on GitHub Pages.
4. Select **Register app**.
5. Copy the displayed `firebaseConfig` values.

## 3. Turn on Google sign-in

1. Open **Security → Authentication**.
2. Select **Get started** if shown.
3. Open **Sign-in method** and enable **Google**.
4. Select a support email and save.
5. Open Authentication **Settings → Authorized domains**.
6. Add `henrymaplehonda.github.io`.

## 4. Create Cloud Firestore

1. Open **Build / Databases & Storage → Firestore Database**.
2. Select **Create database**.
3. Choose **Production mode**.
4. Choose a North American location close to Ontario. The location cannot be changed later.
5. Finish creating the database.

## 5. Publish the private security rules

1. In Firestore, open the **Rules** tab.
2. Copy all contents of `firestore.rules` into the rules editor.
3. Replace `REPLACE_WITH_WIFE_GOOGLE_EMAIL` with the exact Google-account email your wife will use.
4. Select **Publish**.

Only the two listed, verified Google accounts can read or change the `trips/pei-2026` document. Everyone else is denied.

## 6. Paste the Firebase web configuration

1. In GitHub, open `firebase-config.js`.
2. Select the pencil icon to edit it.
3. Replace every `PASTE_...` value using the `firebaseConfig` object from Firebase.
4. Change `enabled: false` to `enabled: true`.
5. Commit the change.

Firebase's browser configuration is an identifier, not an administrator password. The Firestore rules are what protect the checklist. Never add a Firebase Admin SDK private key or service-account JSON file to this repository.

## 7. Test on two devices

1. Open the checklist on your phone and computer.
2. Select **Sign in with Google** on both devices.
3. Use an email listed in the Firestore rules.
4. Check one checklist item on the phone.
5. The computer should refresh automatically and show the same checked item.

The first signed-in device seeds Firestore with its current browser progress. After that, the Firestore version is the shared source of truth.
