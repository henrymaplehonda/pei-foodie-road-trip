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

The Food and Attractions tabs show every idea as a photo card with an approximate Google rating, ranked best-first. Alongside the 17 planned meals and routed attractions, there are 14 extra food ideas and 18 extra attraction ideas along the route (Montréal, Québec City, the Aug 16 New Brunswick drive, Bay of Fundy, and PEI). Operational photo and scenery stops are also mirrored automatically into the Attractions tab on each applicable day. Use **☆ Pick** to pin favourites to the top and **✕ Remove** to hide anything you are not doing — both are stored only in the browser and can be undone anytime via *View removed* / *Restore all*. Photos load from Wikimedia Commons when online; the offline photo mode hides them without losing any addresses or links.

## Trip tools

- **Countdown & reconfirm schedule** — the Overview tab counts down to departure and lists dated verification milestones (tickets, reservations, hotels, week-before checks) that mirror the checklist.
- **Weather links** — every day card, the Trip control tab, and the Offline pack link to the Environment Canada forecast for that night's city, plus the hurricane/tropical outlook (August is Maritimes remnant season).
- **Dark mode** — follows the phone's light/dark setting automatically; the ◐ button at the end of the tab bar cycles Auto → Dark → Light.
- **Packing checklist** — route-specific packing groups (tide-day shoes, boardwalk bug spray, two-driver kit) at the bottom of the Checklist tab.
- **Phone-to-phone sync** — the Offline pack tab can copy a sync code on one phone and paste it on the other to transfer picks, checklist progress, packing, and expenses without a file.
- **Trip spend tracker** — quick expense log with optional budget on the Trip control tab, stored only in the browser.
- **Plan-state controls** — preview, on-time, 30-minute-late, and 60-minute-late modes stay synchronized between Trip control and the day plan; delay modes remove only stops with explicit cutoffs.
- **Offline photos** — an opt-in button on the Offline pack tab stores the Wikimedia card photos on-device so Food/Attraction cards keep photos with no signal (hosted HTTPS copy only).
- **Booked-hotel ledger** — all seven confirmed stays, confirmation-supplied check-in/out windows, room and guest details, cancellation notes, property links, and clearly marked unresolved items. Private Expedia itinerary numbers and the reservation holder’s name are not published.
- **Emergency card** — offline-safe tap-to-call numbers (911, 811, CAA, and all seven hotels) on the Offline pack tab.
- **Route map** — a stylized offline SVG map of the loop (with the Hopewell tide window) on the Overview tab.
- **Keep screen awake** — a wake-lock toggle on Trip control for the navigator's phone while driving.
- **Tab deep links** — every tab has a `#hash` URL (back button works); the PWA exposes Trip control / Checklist / Offline pack shortcuts, and the Checklist tab shows a red badge when dated tasks are overdue.
- **Reservation call list** — tap-to-call numbers for the four restaurant calls that still matter: three bookings plus New Glasgow’s walk-in-hours check.
- **Expense CSV export** — download the spend log as a spreadsheet-ready CSV from Trip control.
- **Print pack** — printing (or Save as PDF from the Offline pack) always comes out in light colours with buttons and forms stripped, even from dark mode.

## Development

`npm install && npx playwright install chromium && npm test` runs a headless smoke test (`test/smoke.js`) that loads the dashboard at phone width and checks every tab, the tide-anchored Aug 19 plan, dark mode, deep links, and layout overflow. The same test runs in GitHub Actions on every pull request.

## Before traveling

The seven hotel nights are booked. Reconfirm each property directly before travel, with special attention to the Cofortel, Canadas Best Value Inn, and Best Western confirmations that currently show only two adults; also confirm the child sleeping setup in the DoubleTree one-bedroom suite. Arrange an early bag drop at Canadas Best Value Inn or a same-day post-checkout hold at Hampton for the August 18 Charlottetown hotel switch.

The active route uses the directional plazas that match travel: ONroute Odessa eastbound on August 14 and ONroute Mallorytown North westbound on August 21. The August 18 lunch uses Blue Mussel Café's new 5033 Rustico Road location and treats its live waitlist as a same-service tool only. Charlottetown is hosting Old Home Week August 14–22, so the Slaymaker dinner includes extra downtown parking time and Victoria Row is no longer part of Plan A.

Save a cancellable Kingston safety overnight before departure. Hampton Inn Kingston at 125 Innovation Drive is the primary candidate and Holiday Inn Express Kingston West at 205 Resource Road is the backup; make the go/stop decision at westbound Mallorytown North based on fatigue, weather, traffic, and the child's condition.

Confirm operating hours, attraction admissions, reservations, road conditions, fuel availability, tides, and weather before departure. Card ratings are approximate Google review scores recorded at planning time; several seaside spots (Richard's, Malpeque Oyster Barn, Point Prim Chowder House) are seasonal, so verify hours the week before.

The August 19 Hopewell Rocks tide window is set from official Canadian Hydrographic Service predictions (station 00170, Hopewell Cape, ADT): high 5:23 AM (11.33 m), low 11:52 AM (2.48 m), high 5:45 PM (11.32 m). Ocean-floor walking runs roughly 9:00 AM–2:45 PM, so the day rolls out of Charlottetown at 7:30 AM, targets the entrance by 10:15–10:30 AM and the beach stairs by 10:45 AM, then opens up a relaxed Moncton afternoon (4:00 PM guaranteed hotel check-in, pool, optional Magnetic Hill) with dinner at 6:00 PM. Re-verify the official table 24–48 hours before the visit.

The active itinerary now follows a family-driving cadence: roughly every two hours or less, the route includes a real stop such as an attraction, park, beach, boardwalk, or scenic photo break. Several of those breaks are adapted from the original spreadsheet plan.

Attraction-style stops include a 4.0+ Google Maps review gate plus a nearby kid-friendly fallback with a map link, so there is always a low-friction backup if a main stop is crowded, closed, or not matching the kid mood.

Fuel planning uses a family-safe buffer: start full with 91 AKI minimum, then refuel by a quarter tank remaining—or sooner when the live range approaches 120–150 km, weather is poor, or the next reliable premium station is uncertain. The car’s live range and safe station access override fixed-distance estimates.

Wake times are day-specific: 6:00 AM on Aug 14 and 18, 6:15 AM on Aug 17 and 19, 5:30–5:45 AM on Aug 20, and 5:15–5:30 AM on Aug 21. Every listed departure is a wheels-moving target. Long-drive days use a two-driver rotation so one adult can drive while the other manages navigation, snacks, and kid rhythm.

This repository contains personal travel plans. Because the repository and GitHub Pages site are public, avoid sharing real-time locations during the trip and use a redacted export if anything needs to be shared more widely.
