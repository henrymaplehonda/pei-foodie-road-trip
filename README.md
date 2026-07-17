# PEI Foodie Road Trip 2026

A self-contained, interactive family road-trip itinerary for a Vaughan, Ontario to Prince Edward Island trip, August 14–21, 2026.

## Open the itinerary

Open [index.html](index.html) in a modern web browser. The dashboard works as a single local file; external map, photo, booking, road-condition, and source links require an internet connection.

Live public site: https://henrymaplehonda.github.io/pei-foodie-road-trip/

## Contents

- `index.html` — page shell, styles, and compact trip reference data
- `app.js` — interactive itinerary renderer, live trip controls, checklist, and offline pack
- `manifest.webmanifest`, `sw.js`, `icon.svg` — optional hosted PWA/offline-cache support
- `roadtrip-html-master-prompt.txt` — original planning and generation brief

## Phone-first interface

The primary app has four focused views:

- **Today** — next stop, navigation, Done/Skip controls, trip progress, schedule status, meal pace, freshness checks, and one safe extra-attraction suggestion when ahead.
- **Plan** — a hotel-anchored daily timeline with recognizable destination names, parking-target navigation, one clear breakfast/lunch/dinner plan, collapsed along-the-way options, recovery blocks, ahead suggestions, and late-mode cutoffs.
- **Prep** — all seven booked-safe hotels, unfinished reservations and verification tasks, offline readiness, calls, and packing.
- **Safety** — emergency numbers, the 91-AKI fuel rule, road and weather links, and offline exports.

The larger food, attraction, hotel, and overview catalogues stay out of the primary navigation and are loaded only when an existing deep link requests them. This keeps normal startup fast and the phone view easy to scan.

## Trip tools

- Schedule controls stay synchronized between **Today** and **Plan**, including 30/60-minute ahead and late modes.
- The booked-hotel summary keeps all seven safe stays, check-in/out times, rooms, addresses, cancellation details, and official links available without false booking alarms.
- Proper meals remain Plan A; the meal-pace switch can select one quick-food alternative and shows the extra experience it unlocks.
- Today and Prep share a four-item offline-readiness checklist, and each trip day shows when its live weather/road/service recheck is due.
- **Prep** puts unfinished and high-priority tasks first and keeps completed items collapsed.
- **Safety** keeps 911, 811, CAA, hotel contacts, premium-fuel guidance, and offline/print exports together.
- Dark mode follows the phone automatically and can be changed from the header.
- Progress, packing, and schedule choices are stored only in the browser; import/export and phone sync remain available under advanced controls.
- Direct links such as `#food`, `#attractions`, `#overview`, and `#hotels` remain available as reference pages.

## Development

`npm install && npx playwright install chromium && npm test` runs a headless smoke test (`test/smoke.js`) that checks the four-tab phone layout, first-viewport next action, booked hotels, tide-anchored Aug 19 plan, dark mode, legacy deep links, and horizontal overflow. The same test runs in GitHub Actions on every pull request.

## Before traveling

All seven hotel nights are booked and safe. Keep the private confirmations available offline and at check-in. On August 18, an early bag drop at Canadas Best Value Inn or a same-day post-checkout hold at Hampton is an optional convenience, not a booking requirement.

The active route uses the directional plazas that match travel: ONroute Odessa eastbound on August 14 and ONroute Mallorytown North westbound on August 21. August 14 uses a proper seated lunch at Tata’s in Brockville. The requested Kamouraska Quai Miller visit is a required August 16 waterfront stop before the proper Rivière-du-Loup lunch, and its route link targets named public parking on Avenue LeBlanc. The August 18 lunch uses Blue Mussel Café's new 5033 Rustico Road location and treats its live waitlist as a same-service tool only. Charlottetown is hosting Old Home Week August 14–22, so the Slaymaker dinner includes extra downtown parking time and Victoria Row is no longer part of Plan A.

Hotel breakfast is preferred whenever its confirmed service window protects the departure time. Every day keeps a proper restaurant lunch and seated dinner as Plan A, while a compact “Simple food + extra time” switch offers one named quick meal and the best nearby use of the saved time. A separate collapsed “Along-the-way options” panel provides route-side attractions with visit length, route impact, a strict go/no-go gate, the closest named parking target, and official information. Choose no more than one; on the longest driving days, it replaces a break and is allowed only when the live hotel ETA remains protected.

Save a cancellable Kingston safety overnight before departure. Hampton Inn Kingston at 125 Innovation Drive is the primary candidate and Holiday Inn Express Kingston West at 205 Resource Road is the backup; make the go/stop decision at westbound Mallorytown North based on fatigue, weather, traffic, and the child's condition.

Confirm operating hours, attraction admissions, reservations, road conditions, fuel availability, tides, and weather before departure. Restaurant and attraction cards link to official or local tourism sources where available; several seaside spots are seasonal, so verify hours the week before.

The August 19 Hopewell Rocks tide window is set from official Canadian Hydrographic Service predictions (station 00170, Hopewell Cape, ADT): high 5:23 AM (11.33 m), low 11:52 AM (2.48 m), high 5:45 PM (11.32 m). Ocean-floor walking runs roughly 9:00 AM–2:45 PM, so the day rolls out of Charlottetown at 7:15 AM, uses a controlled 9:00–9:20 AM washroom/boardwalk reset at Sackville Waterfowl Park, targets the entrance by 10:15–10:30 AM and the beach stairs by 10:45 AM, then opens up a relaxed Moncton afternoon (4:00 PM guaranteed hotel check-in, pool, optional Magnetic Hill) with dinner at 6:00 PM. Marine Rail Historical Park is the earlier fallback instead of Sackville, never an added stop. Re-verify the official table and visitor-centre hours 24–48 hours before the visit.

The active itinerary now follows a family-driving cadence: every 1.5–2.5 hours, the route includes a named restaurant, service centre, attraction, waterfront, beach or short scenic break. Attraction directions target the closest practical parking instead of an unexplained street address. August 20 no longer repeats Kamouraska, preserving an earlier DoubleTree arrival and a real recovery block.

Attraction-style stops include a nearby child-friendly fallback with a map link, so there is always a low-friction backup if a main stop is crowded, closed, or not matching the child’s mood.

Fuel planning uses a family-safe buffer: start full with 91 AKI minimum, then refuel by a quarter tank remaining—or sooner when the live range approaches 120–150 km, weather is poor, or the next reliable premium station is uncertain. The car’s live range and safe station access override fixed-distance estimates.

Wake times are day-specific: 6:00 AM on Aug 14 and 18, 6:15 AM on Aug 17 and 19, 5:30–5:45 AM on Aug 20, and 5:15–5:30 AM on Aug 21. Every listed departure is a wheels-moving target. Long-drive days use a two-driver rotation so one adult can drive while the other manages navigation, snacks, and kid rhythm.

This repository contains personal travel plans. Because the repository and GitHub Pages site are public, avoid sharing real-time locations during the trip and use a redacted export if anything needs to be shared more widely.
