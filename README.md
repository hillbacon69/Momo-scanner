# Truck Navigation

A mobile app for oversize/overweight load drivers: scan the QR code on a permit,
review the parsed route, and get real turn-by-turn navigation that follows the
*exact* road sequence the permit specifies - instead of whatever a generic
driving-directions algorithm would pick.

> **Safety disclaimer.** This app is a driving aid, not a substitute for the
> printed permit. Automated parsing of a legal document can and will get
> things wrong. **Always verify the on-screen route against your printed
> permit before and during the trip.** You are responsible for following the
> permit's designated route exactly - not the app.

## How it works

Real LA DOTD and TX DMV permits (see below) taught us two important things
that shaped this design:

1. **The QR code is just a lookup code**, not the route itself. It links to a
   state verification page or encodes a permit/control number. The actual
   "Driving Instructions" live in a table further down the permit PDF.
2. **The route is printed as a table of legs** (`distance | road`, or
   `miles | route | turn instruction | cumulative distance`), not narrative
   sentences like "turn left onto Main St."

Pipeline:

1. **Scan** - `expo-camera` reads the QR code. If it's a URL, the app fetches
   the page and strips it to text. If it's a PDF, automatic extraction isn't
   supported yet (see Limitations) - use **Paste Route Text** instead, after
   opening the PDF yourself and copying the route/dimensions section.
2. **Parse** - a regex-based parser (`src/services/permitParser.ts`) reads the
   route table: road identifiers (including TxDMV's concatenated codes like
   `US0080`, normalized to `US-80`), leg distances, exit numbers, turn
   instructions, and any coordinates printed directly on the permit (Louisiana
   prints exact `[lat,lng]` for the route's start/end points - those are used
   as-is, no geocoding needed). Every line the parser isn't confident about is
   still surfaced, color-coded, for manual review - a dropped line is a missed
   turn, so nothing is silently discarded.
3. **Review** - an editable screen shows the parsed permit header (dimensions,
   weight, origin/destination) and every route step, so you can fix anything
   the parser got wrong before it's used to build a route.
4. **Geocode + Route** - each step is geocoded via HERE (skipped entirely for
   steps with a printed coordinate), then HERE's Routing API (`transportMode
   =truck`, with the permit's height/width/length/weight applied when known)
   calculates a route forced through every waypoint **in order** - this is
   what keeps the calculated path on the permitted roads instead of letting
   the routing engine pick its own.
5. **Navigate** - a GPS-driven turn-by-turn engine
   (`src/services/navigationEngine.ts`) tracks your position against the
   calculated route, gives voice prompts (`expo-speech`) at distance
   thresholds, and flags if you drift off-route. It does **not**
   auto-reroute on deviation - silently recalculating a "convenient" path for
   an oversize load could put you on a road the permit doesn't cover, so
   going off-route just raises a warning; recalculating is an explicit,
   driver-initiated action.
6. A **secondary "Open in Google Maps"** option is always available, passing
   the same waypoints as a deep link - useful as a backup, but Google Maps
   recalculates its own path between waypoints and is not truck-aware, so
   it's not the primary navigation path.

## Setup

```bash
npm install
```

You need a **free HERE developer API key** (routing + geocoding):
<https://platform.here.com/> → create an app → grab the API key → paste it
into the app's Settings screen (stored on-device only, via `expo-secure-store`).

### Running it

- `npx expo start` → works in **Expo Go** for everything except the map
  screen (QR scanning, parsing, review, geocoding/routing, and voice
  turn-by-turn all work in Expo Go - `expo-camera`, `expo-location`, and
  `expo-speech` are bundled Expo SDK modules).
- **The map view uses `react-native-maps`**, which is *not* bundled in Expo
  Go. To see the map (route preview + live navigation screen), build a
  development client:
  ```bash
  npx expo run:android   # or: npx expo run:ios (macOS only)
  # or, without a local Android/iOS toolchain:
  eas build --profile development
  ```
- On Android, the map needs a Google Maps SDK key in `app.json` →
  `expo.android.config.googleMaps.apiKey` (separate from the HERE key - this
  one is just for rendering the map tiles). iOS uses Apple Maps natively, no
  key needed.

## Project layout

```
src/
  types/permit.ts          Domain types (RouteStep, ParsedPermit, RoutePlan, ...)
  services/
    permitFetch.ts          QR payload -> raw text (URL fetch + HTML stripping)
    permitParser.ts          raw text -> ParsedPermit (the regex heuristics)
    geocode.ts                ParsedPermit -> geocoded waypoints (HERE)
    hereRouting.ts             waypoints -> RoutePlan (HERE Routing v8, truck mode)
    googleMapsLink.ts           waypoints -> Google Maps deep link (fallback)
    navigationEngine.ts          GPS position -> turn-by-turn state + voice prompts
    history.ts                    on-device permit/route history (AsyncStorage)
    config.ts                      HERE API key storage (expo-secure-store)
  utils/
    geo.ts                    haversine distance, nearest-point-on-polyline, etc.
    flexiblePolyline.ts        decodes HERE's route geometry (wraps the official
                                 @here/flexpolyline package rather than a hand-rolled
                                 decoder, since a wrong bit-packing implementation
                                 would silently corrupt the on-screen route)
  screens/                   Scanner, ManualEntry, PermitReview, RoutePreview,
                              Navigation, Settings, History
  components/RouteMapView.tsx  shared map (polyline + waypoint markers)
  navigation/                 React Navigation stack + param types
__tests__/                  permitParser + geo unit tests, using real LA/TX
                             permit text as fixtures (see below)
```

## Testing

```bash
npx jest        # unit tests (parser + geo utils - the only parts testable
                 # without a device)
npx tsc --noEmit # typecheck
```

The parser tests (`__tests__/permitParser.test.ts`) are built from real
Louisiana DOTD and Texas DMV permit samples (hand-transcribed from photos),
covering both states' actual table formats - this is meant to be extended
with more real samples as they come up, since permit formats vary by state
and by permitting system.

## Known limitations / next steps

- **PDF route extraction isn't implemented.** If the QR code links to a PDF
  (common), the app tells you to open it yourself and paste the route text.
  A future version could add on-device or cloud OCR (e.g. Google Cloud
  Vision) for permits that are scanned images rather than text PDFs.
- **The parser is tuned against two real samples (LA, TX).** New Mexico and
  Oklahoma permit formats haven't been seen yet - send samples and the
  regex patterns in `permitParser.ts` can be extended. The Review screen is
  the safety net in the meantime: nothing is silently dropped, everything
  low-confidence is flagged.
- **HERE's exact `vehicle[...]` truck-parameter names/units** (height in cm,
  weight in kg) were inferred from search results, not verified against live
  HERE docs (offline while building this). If HERE rejects them, the app
  automatically retries the routing request without them and just warns that
  truck-profile constraints weren't double-checked - it still routes using
  the permit's exact waypoints either way.
- **Recalculation after going off-route is intentionally limited**: it
  routes from your current position straight to the final destination only
  (not back through the remaining permitted waypoints), and says so on
  screen. Silently trying to rejoin the original route from an arbitrary
  point isn't something to guess at for a legal document.
