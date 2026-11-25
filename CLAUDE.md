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
- **`npm run dev:live`:** Vite proxies `/api` to the deployed Render backend (`.env.live`). Use it to test the frontend on your PC against live data.
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

## Key behaviour
- The client loads `GET /api/map` once. Search (text match), nearest building and Dijkstra all run in the browser.
- Map: Leaflet + OpenStreetMap tiles, locked to the campus (`maxBounds` from the data, limited zoom). Plan to use a campus image overlay later.
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

## Conventions
- Mobile-first UI (design for a 390px width first). Tailwind utility classes; avoid custom CSS files.
- Keep components small. Put API calls in `src/lib/api.js`, not inside components.
