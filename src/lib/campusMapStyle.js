// MapLibre style for the drawn campus map (no street tiles): land, areas, roads, crossings,
// walkways and flat building blocks with names. Used by the live navigation screen.
import { CAMPUS_COLORS, CAMPUS_COLORS_DARK, WALKWAY_WIDTH_M, DEFAULT_ROAD_WIDTH_M, DEFAULT_CROSSING_WIDTH_M, centroid } from './campusStyle'

const fc = (features) => ({ type: 'FeatureCollection', features })
const ring = (pts) => {
  const r = pts.map((p) => [p.lng, p.lat])
  const [a, b] = [r[0], r[r.length - 1]]
  if (a[0] !== b[0] || a[1] !== b[1]) r.push(a) // close the ring
  return r
}
const line = (pts) => pts.map((p) => [p.lng, p.lat])

/** A line width that stays `prop` metres wide on the ground at every zoom. */
function metres(lat, prop, fallback) {
  const k = (z) => 2 ** z / (156543.03392 * Math.cos((lat * Math.PI) / 180))
  const w = ['coalesce', ['get', prop], fallback]
  return ['interpolate', ['exponential', 2], ['zoom'], 10, ['*', w, k(10)], 22, ['*', w, k(22)]]
}

/**
 * @param {object} data { campus, buildings, features, edges, nodeById }
 * @param {object} opts { dark, activeBuildingId }
 */
export function campusMapStyle({ campus, buildings, features, edges, nodeById }, { dark = false, activeBuildingId = null } = {}) {
  const P = dark ? CAMPUS_COLORS_DARK : CAMPUS_COLORS
  const shaped = buildings.filter((b) => b.shape?.points?.length >= 3)
  const of = (kind) => features.filter((f) => f.kind === kind && Array.isArray(f.points))

  const sources = {
    areas: { type: 'geojson', data: fc(of('area').filter((f) => f.points.length >= 3).map((f) => ({ type: 'Feature', properties: { name: f.name || '' }, geometry: { type: 'Polygon', coordinates: [ring(f.points)] } }))) },
    roads: { type: 'geojson', data: fc(of('road').map((f) => ({ type: 'Feature', properties: { widthM: f.widthM || DEFAULT_ROAD_WIDTH_M }, geometry: { type: 'LineString', coordinates: line(f.points) } }))) },
    crossings: { type: 'geojson', data: fc(of('crossing').map((f) => ({ type: 'Feature', properties: { widthM: f.widthM || DEFAULT_CROSSING_WIDTH_M }, geometry: { type: 'LineString', coordinates: line(f.points) } }))) },
    walkways: {
      type: 'geojson',
      data: fc(
        edges
          .map((e) => [nodeById.get(e.fromId), nodeById.get(e.toId)])
          .filter(([a, b]) => a && b)
          .map(([a, b]) => ({ type: 'Feature', properties: { widthM: WALKWAY_WIDTH_M }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } })),
      ),
    },
    buildings: { type: 'geojson', data: fc(shaped.map((b) => ({ type: 'Feature', properties: { name: b.name, active: b.id === activeBuildingId }, geometry: { type: 'Polygon', coordinates: [ring(b.shape.points)] } }))) },
    labels: { type: 'geojson', data: fc(shaped.map((b) => ({ type: 'Feature', properties: { name: b.name, active: b.id === activeBuildingId }, geometry: { type: 'Point', coordinates: [centroid(b.shape.points).lng, centroid(b.shape.points).lat] } }))) },
  }

  const lat = campus.lat
  const butt = { 'line-cap': 'butt', 'line-join': 'round' }
  return {
    version: 8,
    name: 'Campus',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', // free, no key
    sources,
    layers: [
      // No circle: the whole ground is campus land (the camera is kept on campus by maxBounds).
      { id: 'ground', type: 'background', paint: { 'background-color': P.land } },
      { id: 'areas', type: 'fill', source: 'areas', paint: { 'fill-color': P.area, 'fill-outline-color': P.areaStroke } },
      { id: 'roads', type: 'line', source: 'roads', layout: butt, paint: { 'line-color': P.road, 'line-width': metres(lat, 'widthM', DEFAULT_ROAD_WIDTH_M) } },
      { id: 'road-center', type: 'line', source: 'roads', layout: butt, paint: { 'line-color': P.roadCenter, 'line-width': 1.5, 'line-dasharray': [4, 3] } },
      { id: 'walkways', type: 'line', source: 'walkways', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': P.walkway, 'line-width': metres(lat, 'widthM', WALKWAY_WIDTH_M) } },
      { id: 'crossings', type: 'line', source: 'crossings', layout: butt, paint: { 'line-color': P.crossing, 'line-width': metres(lat, 'widthM', DEFAULT_CROSSING_WIDTH_M), 'line-dasharray': [0.45, 0.45] } },
      { id: 'buildings', type: 'fill', source: 'buildings', paint: { 'fill-color': ['case', ['get', 'active'], P.buildingActive, P.building] } },
      { id: 'buildings-outline', type: 'line', source: 'buildings', paint: { 'line-color': ['case', ['get', 'active'], P.buildingActiveStroke, P.buildingStroke], 'line-width': ['case', ['get', 'active'], 3, 1.5] } },
      {
        id: 'building-labels',
        type: 'symbol',
        source: 'labels',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': false, 'text-pitch-alignment': 'viewport' },
        paint: { 'text-color': P.buildingLabel, 'text-halo-color': P.land, 'text-halo-width': 1.2 },
      },
    ],
  }
}
