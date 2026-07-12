# PEI Foodie Road Trip 2026

A self-contained, interactive family road-trip itinerary for a Vaughan, Ontario to Prince Edward Island trip, August 14–21, 2026.

## Open the itinerary

Open [index.html](index.html) in a modern web browser. The dashboard works as a single local file; external map, photo, booking, road-condition, and source links require an internet connection.

Live public site: https://henrymaplehonda.github.io/pei-foodie-road-trip/

## Contents

- `index.html` — interactive itinerary dashboard, live trip controls, checklist, and offline pack
- `manifest.webmanifest`, `sw.js`, `icon.svg` — optional hosted PWA/offline-cache support
- `roadtrip-html-master-prompt.txt` — original planning and generation brief

## Food & attraction picker

The Food and Attractions tabs show every idea as a photo card with an approximate Google rating, ranked best-first. Alongside the 17 planned meals and 13 routed attractions, there are 14 extra food ideas and 17 extra attraction ideas along the route (Montréal, Québec City, Bay of Fundy, and PEI). Use **☆ Pick** to pin favourites to the top and **✕ Remove** to hide anything you are not doing — both are stored only in the browser and can be undone anytime via *View removed* / *Restore all*. Photos load from Wikimedia Commons when online; the offline photo mode hides them without losing any addresses or links.

## Trip tools

- **Countdown & reconfirm schedule** — the Overview tab counts down to departure and lists dated verification milestones (tickets, reservations, hotels, week-before checks) that mirror the checklist.
- **Weather links** — every day card, the Trip control tab, and the Offline pack link to the Environment Canada forecast for that night's city, plus the hurricane/tropical outlook (August is Maritimes remnant season).
- **Dark mode** — follows the phone's light/dark setting automatically; the ◐ button at the end of the tab bar cycles Auto → Dark → Light.
- **Packing checklist** — route-specific packing groups (tide-day shoes, boardwalk bug spray, two-driver kit) at the bottom of the Checklist tab.
- **Phone-to-phone sync** — the Offline pack tab can copy a sync code on one phone and paste it on the other to transfer picks, checklist progress, packing, and expenses without a file.
- **Trip spend tracker** — quick expense log with optional budget on the Trip control tab, stored only in the browser.
- **Offline photos** — an opt-in button on the Offline pack tab stores the Wikimedia card photos on-device so Food/Attraction cards keep photos with no signal (hosted HTTPS copy only).
- **Emergency card** — offline-safe tap-to-call numbers (911, 811, CAA, and all five hotels) on the Offline pack tab.
- **Route map** — a stylized offline SVG map of the loop (with the Hopewell tide window) on the Overview tab.
- **Keep screen awake** — a wake-lock toggle on Trip control for the navigator's phone while driving.
- **Tab deep links** — every tab has a `#hash` URL (back button works); the PWA exposes Trip control / Checklist / Offline pack shortcuts, and the Checklist tab shows a red badge when dated tasks are overdue.
- **Reservation call list** — tap-to-call numbers for the five reservation-priority restaurants at the top of the Checklist tab (verified against current listings).
- **Expense CSV export** — download the spend log as a spreadsheet-ready CSV from Trip control.
- **Print pack** — printing (or Save as PDF from the Offline pack) always comes out in light colours with buttons and forms stripped, even from dark mode.

## Development

`npm install && npx playwright install chromium && npm test` runs a headless smoke test (`test/smoke.js`) that loads the dashboard at phone width and checks every tab, the tide-anchored Aug 19 plan, dark mode, deep links, and layout overflow. The same test runs in GitHub Actions on every pull request.

## Before traveling

Confirm operating hours, attraction admissions, reservations, road conditions, fuel availability, tides, and weather before departure. Card ratings are approximate Google review scores recorded at planning time; several seaside spots (Richard's, Malpeque Oyster Barn, Point Prim Chowder House) are seasonal, so verify hours the week before.

The August 19 Hopewell Rocks tide window is set from official Canadian Hydrographic Service predictions (station 00170, Hopewell Cape, ADT): high 5:23 AM (11.33 m), low 11:52 AM (2.48 m), high 5:45 PM (11.32 m). Ocean-floor walking runs roughly 9:00 AM–2:45 PM, so the day rolls out of Charlottetown at 7:45 AM, targets a 10:45 AM park arrival for a floor walk over the midday low, and opens up a relaxed Moncton afternoon (pool, optional Magnetic Hill) with dinner at 6:00 PM. Re-verify the official table 24–48 hours before the visit.

The active itinerary now follows a family-driving cadence: roughly every two hours or less, the route includes a real stop such as an attraction, park, beach, boardwalk, or scenic photo break. Several of those breaks are adapted from the original spreadsheet plan.

Attraction-style stops include a 4.0+ Google Maps review gate plus a nearby kid-friendly fallback with a map link, so there is always a low-friction backup if a main stop is crowded, closed, or not matching the kid mood.

Fuel planning is now minimized: start full, then target fills only around the 10% remaining trigger, which is roughly 80 km remaining on the conservative 800 km highway range. Verify premium-fuel availability in each low-fuel corridor before travel, and skip comfort top-ups unless weather, closures, or station availability make waiting unsafe.

Daily timing assumes a 6:30 AM wake-up. Long-drive days use a two-driver rotation so one adult can drive while the other manages navigation, snacks, and kid rhythm.

This repository contains personal travel plans. Because the repository and GitHub Pages site are public, avoid sharing real-time locations during the trip and use a redacted export if anything needs to be shared more widely.
