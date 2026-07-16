# PEI Foodie Road Trip 2026

A self-contained, interactive family road-trip itinerary for a Vaughan, Ontario to Prince Edward Island trip, August 14–21, 2026.

## Open the itinerary

Open [index.html](index.html) in a modern web browser. The dashboard works as a single local file; external map, photo, booking, road-condition, and source links require an internet connection.

Live public site: https://henrymaplehonda.github.io/pei-foodie-road-trip/

## Contents

- `index.html` — interactive itinerary dashboard, live trip controls, checklist, and offline pack
- `manifest.webmanifest`, `sw.js`, `icon.svg` — optional hosted PWA/offline-cache support
- `roadtrip-html-master-prompt.txt` — original planning and generation brief

## Phone-first interface

The primary app has four focused views:

- **Today** — next stop, navigation, trip progress, and schedule status.
- **Plan** — a hotel-anchored daily timeline with recognizable destination names, parking-target navigation, one clear breakfast/lunch/dinner plan, recovery blocks, and late-mode cutoffs.
- **Prep** — seven booked hotels, unfinished confirmation tasks, calls, and packing.
- **Safety** — emergency numbers, the 91-AKI fuel rule, road and weather links, and offline exports.

The larger food, attraction, hotel, and overview catalogues stay out of the primary navigation and are loaded only when an existing deep link requests them. This keeps normal startup fast and the phone view easy to scan.

## Trip tools

- Schedule controls stay synchronized between **Today** and **Plan**.
- The booked-hotel summary keeps check-in/out times and action flags visible while storing room, address, cancellation, and official-link details in expandable rows.
- **Prep** puts unfinished and high-priority tasks first and keeps completed items collapsed.
- **Safety** keeps 911, 811, CAA, hotel contacts, premium-fuel guidance, and offline/print exports together.
- Dark mode follows the phone automatically and can be changed from the header.
- Progress, packing, and schedule choices are stored only in the browser; import/export and phone sync remain available under advanced controls.
- Direct links such as `#food`, `#attractions`, `#overview`, and `#hotels` remain available as reference pages.

## Development

`npm install && npx playwright install chromium && npm test` runs a headless smoke test (`test/smoke.js`) that checks the four-tab phone layout, first-viewport next action, booked hotels, tide-anchored Aug 19 plan, dark mode, legacy deep links, and horizontal overflow. The same test runs in GitHub Actions on every pull request.

## Before traveling

The seven hotel nights are booked. Reconfirm each property directly before travel, with special attention to the Cofortel, Canadas Best Value Inn, and Best Western confirmations that currently show only two adults; also confirm the child sleeping setup in the DoubleTree one-bedroom suite. Arrange an early bag drop at Canadas Best Value Inn or a same-day post-checkout hold at Hampton for the August 18 Charlottetown hotel switch.

The active route uses the directional plazas that match travel: ONroute Odessa eastbound on August 14 and ONroute Mallorytown North westbound on August 21. Upper Canada Village and the Morrisburg detour are removed; August 14 now uses a proper seated lunch at Tata’s in Brockville. The requested Kamouraska Quai Miller visit is a required August 16 waterfront stop before the proper Rivière-du-Loup lunch, and its route link targets named public parking on Avenue LeBlanc. The August 18 lunch uses Blue Mussel Café's new 5033 Rustico Road location and treats its live waitlist as a same-service tool only. Charlottetown is hosting Old Home Week August 14–22, so the Slaymaker dinner includes extra downtown parking time and Victoria Row is no longer part of Plan A.

Hotel breakfast is preferred whenever its confirmed service window protects the departure time. Every day also has a proper lunch and a seated dinner plan with a named fallback; room service and self-catered lunches are not used as meal plans. The itinerary protects one priority experience per day and treats every other attraction as optional or easy to skip.

Save a cancellable Kingston safety overnight before departure. Hampton Inn Kingston at 125 Innovation Drive is the primary candidate and Holiday Inn Express Kingston West at 205 Resource Road is the backup; make the go/stop decision at westbound Mallorytown North based on fatigue, weather, traffic, and the child's condition.

Confirm operating hours, attraction admissions, reservations, road conditions, fuel availability, tides, and weather before departure. Restaurant and attraction cards link to official or local tourism sources where available; several seaside spots are seasonal, so verify hours the week before.

The August 19 Hopewell Rocks tide window is set from official Canadian Hydrographic Service predictions (station 00170, Hopewell Cape, ADT): high 5:23 AM (11.33 m), low 11:52 AM (2.48 m), high 5:45 PM (11.32 m). Ocean-floor walking runs roughly 9:00 AM–2:45 PM, so the day rolls out of Charlottetown at 7:30 AM, targets the entrance by 10:15–10:30 AM and the beach stairs by 10:45 AM, then opens up a relaxed Moncton afternoon (4:00 PM guaranteed hotel check-in, pool, optional Magnetic Hill) with dinner at 6:00 PM. Re-verify the official table 24–48 hours before the visit.

The active itinerary now follows a family-driving cadence: every 1.5–2.5 hours, the route includes a named restaurant, service centre, attraction, waterfront, beach or short scenic break. Attraction directions target the closest practical parking instead of an unexplained street address. August 20 no longer repeats Kamouraska, preserving an earlier DoubleTree arrival and a real recovery block.

Attraction-style stops include a nearby child-friendly fallback with a map link, so there is always a low-friction backup if a main stop is crowded, closed, or not matching the child’s mood.

Fuel planning uses a family-safe buffer: start full with 91 AKI minimum, then refuel by a quarter tank remaining—or sooner when the live range approaches 120–150 km, weather is poor, or the next reliable premium station is uncertain. The car’s live range and safe station access override fixed-distance estimates.

Wake times are day-specific: 6:00 AM on Aug 14 and 18, 6:15 AM on Aug 17 and 19, 5:30–5:45 AM on Aug 20, and 5:15–5:30 AM on Aug 21. Every listed departure is a wheels-moving target. Long-drive days use a two-driver rotation so one adult can drive while the other manages navigation, snacks, and kid rhythm.

This repository contains personal travel plans. Because the repository and GitHub Pages site are public, avoid sharing real-time locations during the trip and use a redacted export if anything needs to be shared more widely.
