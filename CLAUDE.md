# Smart Campus Navigator: Frontend (smart-navigation-fe)

Capstone project: a mobile-first web app (PWA) for navigating the TCC campus (about 2 ha, 7 buildings plus the Home Management buildings across the road). Visitors scan a QR code, see their location on a campus map, search a building or room, and follow the shortest walking route. Only admins log in.

This repo is the **Vue frontend only**. The Express + Prisma API lives in the sibling repo `smart-navigation-be` (hosted on Render).

Budget is zero: free tiers only, no paid map API, no AI features. Routing is a plain shortest-path algorithm (Dijkstra) that runs in the browser.

## Stack
- Vue 3 (Vite, `<script setup>`), Tailwind CSS v4 (`@tailwindcss/vite`), Vue Router, Pinia, Leaflet, `vite-plugin-pwa`
- Hosted on **Vercel** (free). JavaScript ES modules, no TypeScript unless asked.

## How the frontend reaches the API
Live: frontend https://smart-navigation-fe-tau.vercel.app · backend https://smart-navigation-be.onrender.com
- All calls go to `API_BASE` in `src/lib/api.js`: relative `/api` by default.
- **`npm run dev`:** Vite proxies `/api` to your local backend, `http://localhost:3001` (run `npm run dev` in `smart-navigation-be`).
- **`npm run dev:live`:** Vite proxies `/api` to the deployed Render backend (address in `vite.config.js`; no env files are committed). Use it to test the frontend on your PC against live data.
- **On Vercel:** `vercel.json` rewrites `/api/:path*` to the Render service. Same origin for the browser, so no CORS.
- `VITE_API_URL` (optional, see `.env.example`) makes the browser call a backend directly; that backend then needs `CORS_ORIGIN`.
- **`/status` page:** checks frontend → backend → database on any environment and shows the reason if one link fails.
- Render's free tier sleeps when idle, so the first request can take ~30-60 s. Show a clear loading state; the service worker caches `/api/map` so the app also works offline and for returning visitors.

## Layout
```
src/
  main.js, App.vue, router.js, index.css (only `@import "tailwindcss"`)
  views/            MapView, SearchView, RouteView, ArrivedView
  views/admin/      LoginView, BuildingsView, NodesView, EventsView, ReportsView
  components/       MapCanvas, SearchBar, RouteSteps, BuildingCard
  components/admin/ AdminLayout, LocationPicker, FloorsEditor
  stores/           map.js (campus data, start location, search, routing), auth.js (JWT)
  lib/              api.js, dijkstra.js, geo.js (haversine; same file as the backend's lib/geo.js)
public/icon.svg
vercel.json         /api rewrite to Render + SPA fallback
```

## Commands
- `npm run dev`: Vite dev server against the local backend (localhost:3001)
- `npm run dev:live`: Vite dev server against the Render backend
- `npm run build` / `npm run preview` / `npm run preview:live`

## Visitor screens
- `/` **HomeView**: "Where do you want to go?" search (inline results), Browse by category (only categories that have buildings), Popular places (`GET /api/popular`, falls back to all buildings), events, link to the map.
- `/place/:buildingId` **PlaceView**: destination card (category, description, searched room highlighted, walk time/distance, floors and rooms) with **Start navigation** (→ `/route/:id?go=1`).
- `/map` **MapView**: the full campus map (secondary). `/route/:id` route preview (Leaflet), `/arrived/:id`.
- **Live navigation** (`components/nav/LiveNavigation.vue`, lazy-loaded from RouteView because MapLibre is ~290 KB gz): full-screen MapLibre GL map with OpenFreeMap styles (`liberty` by day, `dark` 18:00–06:00, no API key), tilted 55° and rotated to the walking direction; blue arrow + facing cone; maneuver banner with turn icon, distance, "Then …"; "just ahead" under 15 m; bottom bar with minutes · metres · arrival time; compass (heading-up / north-up), re-center, voice (Web Speech API, off by default, remembered in localStorage); reroute after 2 good readings > 20 m off the route; precise arrival rule from the store; Simulate walk for demos.
  - Turn-by-turn engine: `lib/maneuvers.js` (`buildManeuvers`, `snapToRoute`, `pointAlong`); route points carry `label` so named points become landmarks ("Turn left at Canteen corner").
  - Heading: `composables/useHeading.js` (compass via deviceorientation / iOS `webkitCompassHeading`; `askCompassPermission()` must be called inside the Start tap on iPhone). While walking, GPS `heading` (speed > 0.7 m/s) wins; otherwise compass; otherwise route direction.
  - Store: `routeFrom(point, buildingId)` reroutes from any position; `gps` also has `heading` and `speed`.
  - MapLibre sets `position: relative` on its container, so the map div must fill a positioned wrapper.
  - Dev hooks: `window.__navDebug.gps(lat, lng, acc, heading, speed)`, `window.__navMap`.
- **Photos:** `lib/photos.js` (`shrinkImage` → 1280 px JPEG in the browser, `photosOf` / `coverOf` for display; old `photoUrl` links still show). Admin: `components/admin/PhotosEditor.vue` (v-model photo ids; camera or gallery, remove, Cover) in the building Details tab, on each floor (camera button in the Floors tab: floor plan, hallway) and in the room forms (rooms also have **description** and notes = "How to find it"). Visitor: `components/PhotoGallery.vue` (swipe, dots, full-screen viewer) on PlaceView (building at the top, floor photos inside each floor), and `components/RoomSheet.vue` (tap a room: photos, description, how to find it). The service worker keeps `/api/photos/*` (CacheFirst).
- Home "Popular places" uses `components/CardSlider.vue` (swipe, mouse drag, arrows from `sm`, dots per slide position).
- Categories: `src/lib/categories.js` (ids match the backend list); search also matches category names.

## Campus area
- Admin → **Campus** (`views/admin/CampusView.vue`): centre (paste coordinates or a Google Maps link, tap the map, drag the pin, or phone GPS) + radius slider, live preview, warning for buildings/points outside. Saved via `PUT /api/campus`; the store exposes it as `campus`.
- Every map is limited to that circle: it fits to it and locks pan/zoom (MapLibre `maxBounds` in navigation). There is **no cover/overlay** over the map: with a campus area the maps show the drawn campus map; only Admin → Campus (street map) draws a thin dashed outline (pane `campusMask`) so the admin sees the radius. Helpers in `lib/campusArea.js`. With no campus area set, maps fall back to fitting the buildings.
- MapCanvas moves to the campus first, then locks (`setMaxBounds` before the map is positioned/sized drags the view off-centre).

## Drawn campus map (no street tiles)
- Once a campus area is set, every map shows the **drawn campus** (mockup style): the whole background is campus green (no circle; the view is locked to the campus area), building shapes with names, white walkways (from paths), roads with a dashed centre, zebra crossings, areas. Colours/helpers: `lib/campusStyle.js`. Street tiles only before a campus area exists, and on Admin → Campus (`basemap="street"`) to find the campus.
- `MapCanvas` panes: `campusBase` (z 250: land, areas, roads, walkways, crossings), overlay (buildings, routes), `campusLabels` (z 450). Ground widths are in metres and redrawn on zoom. Quarter-step zoom so the campus fills the screen.
- Admin → **Map** (`views/admin/CampusMapView.vue`) has a **Street map guide** toggle (on by default, remembered): `MapCanvas basemap="guide"` draws the campus on top of OpenStreetMap for tracing; shapes are drawn see-through. Visitors never see it.
- Admin → **Map**: Leaflet-Geoman (MIT, pinned 2.20.6) to draw buildings (rectangle = two opposite corners, or corner-by-corner shape), roads, crossings, areas; select to edit corners / move / rotate; new building shapes become a new building or are assigned to an existing one. Geoman is a classic script: import `lib/leafletGlobal.js` before it so maps get `map.pm`.
- Live navigation uses `lib/campusMapStyle.js` (a MapLibre style built from the same data: flat buildings, no street tiles; glyphs from OpenFreeMap fonts) when a campus area exists.

## Key behaviour
- The client loads `GET /api/map` once. Search (text match), nearest building and Dijkstra all run in the browser.
- Map: Leaflet + OpenStreetMap tiles, locked to the campus (`maxBounds` from the data, limited zoom). Plan to use a campus image overlay later.
- **Location permission flow** (`components/LocationSheet.vue`, mounted once in App.vue): visitor pages call `map.initLocation()`, which follows GPS only if the site already has permission (Permissions API), so there is no pop-up on page load. **Start navigation** (PlaceView and RouteView) awaits `map.askLocation()` → `gps` | `start` (QR/tapped start already set) | `pick` (→ `/route/:id?pick=1`, tap your start) | `cancel`. The sheet explains why, then `requestFix()` shows the browser pop-up; outcomes: blocked (code 1), phone location off (code 2, retries every 4 s and when the tab becomes visible again), no signal (code 3), or off campus (>1 km). Steps are tailored for iPhone / Android / computer. `askCompassPermission()` is called before the await (iPhone needs it inside the tap). StartStatus shows a **Turn on** / **Fix** button that opens the same sheet.
- Start location: GPS dot, or `?from=<node code>` from a QR code (remembered for the visit in sessionStorage). QR wins over GPS.
- GPS gives the building only. Floors and rooms are text the admin types in. Never claim indoor positioning.
- Admin "Use my current location" uses `navigator.geolocation`, plus a draggable pin to fine-tune.
- Auth: JWT from `POST /api/auth/login` kept in the Pinia store and localStorage; a router guard sends `/admin/*` to `/admin/login` without a valid token. Visitors are anonymous; never add user accounts.

## Admin UI
- Follow `DESIGN.md`. Colours, font and other tokens live in `src/index.css` (`@theme`); use token classes (`bg-primary-600`, `text-ink-muted`, `border-line`), never raw hex.
- Shared pieces in `src/components/ui/`: `AppIcon` (Lucide-style icons, no emoji), `UiButton`, `UiField`, `UiDrawer` (forms open in a drawer), `UiBadge`, `UiEmpty`, `PageHeader`, `UiFeedbackHost`.
- Feedback via `src/lib/feedback.js`: `toast()` / `toast.error()` and `await confirmAction({ title, message })`. Never `alert`/`confirm`.
- `src/lib/campusHealth.js` finds data problems (no entrance, unreachable, misplaced pin) for the Overview page and the building status badges.
- Layout: sidebar on desktop (≥1024px), top bar + bottom tabs on phones.
- Building drawer tabs: Details · **Entrances** (`components/admin/EntrancesEditor.vue`: place door points just outside the door by tapping the map or with averaged GPS; new doors auto-join the nearest walkway point within 60 m; list shows "On the walkway" / "Not connected" with a Join button) · Floors. Overview's "Add entrance" deep-links to `/admin/buildings?edit=<id>&tab=entrances`.
- **Settings** (`views/admin/SettingsView.vue`, sidebar; gear in the phone top bar): the campus **QR code** (`qrcode` npm, MIT, generated in the browser). It only opens the visitor website; location comes from GPS. Link defaults to this site (the live Vercel URL when run on localhost; localhost links are rejected), poster title/subtitle/footer, live A4 preview, **Print poster** (new window, A4), downloads. Print quality lives in `lib/qrPoster.js`: error correction **H**, pure black on white, 4-module quiet zone, modules drawn on whole pixels. Downloads: **Banner design** PNG (3600×5400 = 2×3 ft at 150 dpi; falls back to 2400 px where the canvas limit is lower), QR-only **SVG** (crispEdges) and PNG 6000 px / 1200 px, plus the A4 print poster. Text is remembered per device (localStorage `campusnav.qr`).
- Paths editor (`views/admin/NodesView.vue`): Select / Point / Draw / Connect modes, **Record walk** (GPS track → `simplify` + `enforceSpacing` + `snapToNetwork` in `lib/pathTools.js` → one `POST /api/paths`), averaged **Add point here** (`sampleGps` in `lib/gps.js`), auto-join to points within 6 m / 14 px, and an in-memory **Undo** (Ctrl+Z). In dev, `window.__pathsDebug.feed(lat, lng, accuracy)` feeds fake GPS readings to the recorder.

## Conventions
- Mobile-first UI (design for a 390px width first). Tailwind utility classes; avoid custom CSS files.
- Keep components small. Put API calls in `src/lib/api.js`, not inside components.
