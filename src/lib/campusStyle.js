// Look of the drawn campus map (matches the "Campus Navigator Mockup"): soft green land,
// grey-green building blocks with names, white walkways, grey roads with a dashed centre line,
// zebra crossings. Shared by Leaflet (MapCanvas, admin editor) and MapLibre (LiveNavigation).

export const CAMPUS_COLORS = {
  outside: '#f3f5f2', // beyond the campus area
  land: '#e3ebe2', // campus ground
  area: '#d4e4cf', // drawn areas (field, garden, parking…)
  areaStroke: '#bcd1b6',
  building: '#cad7cc',
  buildingStroke: '#9db3a5',
  buildingLabel: '#2c4a3c',
  buildingActive: '#bfe3d4', // destination / selected building
  buildingActiveStroke: '#1f6f5c',
  walkway: '#ffffff',
  road: '#d2d6db',
  roadCenter: '#ffffff',
  crossing: '#ffffff',
}

// Dark variant for the night-time navigation screen.
export const CAMPUS_COLORS_DARK = {
  ...CAMPUS_COLORS,
  outside: '#0b1220',
  land: '#16241d',
  area: '#1d3227',
  areaStroke: '#27412f',
  building: '#2b3d33',
  buildingStroke: '#41594a',
  buildingLabel: '#d5e5da',
  buildingActive: '#1f5c49',
  buildingActiveStroke: '#5eead4',
  walkway: '#cbd5e1',
  road: '#334155',
  roadCenter: '#94a3b8',
  crossing: '#e2e8f0',
}

export const WALKWAY_WIDTH_M = 3 // drawn width of walkway paths
export const DEFAULT_ROAD_WIDTH_M = 6
export const DEFAULT_CROSSING_WIDTH_M = 3

/** Metres per screen pixel at a latitude and Web-Mercator zoom. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/** Centre of a polygon (average of its corners; good enough for labels on campus blocks). */
export function centroid(points) {
  const n = points.length
  return { lat: points.reduce((s, p) => s + p.lat, 0) / n, lng: points.reduce((s, p) => s + p.lng, 0) / n }
}
