// Campus map settings.
// Map bounds normally come from the buildings and walkway points in the database.
// This center is only used before any data exists. Replace it with the TCC campus
// coordinates (right-click the campus in Google Maps to copy them).
export const FALLBACK_CENTER = [14.5995, 120.9842]
export const FALLBACK_ZOOM = 17

// Extra room around the campus data (about 0.0015 deg ≈ 150 m) so the edges stay reachable.
export const BOUNDS_PADDING_DEG = 0.0015

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
