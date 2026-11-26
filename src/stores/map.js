import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../lib/api'
import { buildGraph, shortestPath } from '../lib/dijkstra'
import { compass, distanceBetween, nearest } from '../lib/geo'
import { categoryById } from '../lib/categories'

const FROM_KEY = 'campusnav.from'
// A GPS fix farther than this from every walkway point is treated as "not on campus".
const MAX_SNAP_M = 300
// ---- Arrival rule (see RouteView) ----
// Phone GPS is ±5–15 m outdoors and worse near walls, so one reading is never trusted alone.
export const ARRIVE_BASE_M = 6 // radius around the destination with a perfect reading
export const ARRIVE_CAP_M = 12 // radius never grows beyond this
export const ARRIVE_MAX_ACCURACY_M = 20 // readings worse than this are ignored for arrival
export const ARRIVE_ARM_M = 10 // must move this far (or be this far outside the radius) before auto-arrival
export const ARRIVE_CONFIRM_READINGS = 2 // consecutive good readings inside the radius

/** Arrival radius for a reading with this accuracy (metres): 6–12 m. */
export function arrivalRadius(accuracy = 0) {
  return Math.min(ARRIVE_CAP_M, ARRIVE_BASE_M + Math.max(0, accuracy) / 2)
}

function readFrom() {
  try {
    return sessionStorage.getItem(FROM_KEY)
  } catch {
    return null
  }
}

export const useMapStore = defineStore('map', () => {
  // ---- Campus data (loaded once from /api/map) ----
  const buildings = ref([])
  const nodes = ref([])
  const edges = ref([])
  const events = ref([])
  const status = ref('idle') // idle | loading | ready | error
  const error = ref(null)

  async function load(force = false) {
    if (status.value === 'ready' && !force) return
    if (status.value !== 'ready') status.value = 'loading'
    try {
      const data = await api.getMap()
      buildings.value = data.buildings
      nodes.value = data.nodes
      edges.value = data.edges
      status.value = 'ready'
      error.value = null
    } catch (e) {
      if (status.value !== 'ready') status.value = 'error'
      error.value = e.message
    }
    api.getEvents().then((list) => (events.value = list)).catch(() => {})
  }

  const nodeById = computed(() => new Map(nodes.value.map((n) => [n.id, n])))
  const buildingById = computed(() => new Map(buildings.value.map((b) => [b.id, b])))
  const graph = computed(() => buildGraph(edges.value))

  // ---- Start location: QR code (?from=gate1) > point tapped on the map > GPS ----
  const fromCode = ref(readFrom())
  const manualStart = ref(null) // { lat, lng } chosen by tapping the map (handy for testing off campus)
  const gps = ref(null) // { lat, lng, accuracy }
  const gpsError = ref(null)
  let watchId = null

  function setManualStart(point) {
    manualStart.value = point ? { lat: point.lat, lng: point.lng } : null
    if (point) setFromCode(null)
  }

  /** Navigation: follow the live GPS instead of a QR or tapped start point. */
  function useLiveGps() {
    manualStart.value = null
    setFromCode(null)
  }

  function setFromCode(code) {
    fromCode.value = code || null
    if (code) manualStart.value = null
    try {
      if (code) sessionStorage.setItem(FROM_KEY, code)
      else sessionStorage.removeItem(FROM_KEY)
    } catch {
      /* storage blocked: keep it in memory only */
    }
  }

  function startGps() {
    if (watchId !== null) return
    if (!('geolocation' in navigator)) {
      gpsError.value = 'Location is not available on this device.'
      return
    }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        gps.value = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        gpsError.value = null
      },
      (err) => {
        gpsError.value = err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.'
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  const qrNode = computed(() => (fromCode.value ? nodes.value.find((n) => n.code === fromCode.value) ?? null : null))

  /**
   * Where routes start: { point, node, source: 'qr' | 'manual' | 'gps', label } or null.
   * node is the walkway point the start snaps to (null when no path point is close enough).
   */
  const start = computed(() => {
    if (qrNode.value) {
      return { point: qrNode.value, node: qrNode.value, source: 'qr', label: qrNode.value.label || qrNode.value.code }
    }
    const origin = manualStart.value ?? gps.value
    if (!origin) return null
    const hit = nodes.value.length ? nearest(nodes.value, origin) : null
    return {
      point: origin,
      node: hit && hit.distance <= MAX_SNAP_M ? hit.item : null,
      source: manualStart.value ? 'manual' : 'gps',
      label: manualStart.value ? 'the point you chose' : 'your location',
    }
  })

  /** Building the visitor is closest to. Building level only, never indoors. */
  const nearestBuilding = computed(() => {
    const point = start.value?.point
    if (!point || !buildings.value.length) return null
    return nearest(buildings.value, point)
  })

  // More than 1 km from every building: probably not on campus.
  const offCampus = computed(() => !!nearestBuilding.value && nearestBuilding.value.distance > 1000)

  // ---- Destinations ----
  function entrancesOf(buildingId) {
    const list = nodes.value.filter((n) => n.buildingId === buildingId)
    if (list.length) return list
    // No entrance marked yet: fall back to the walkway point closest to the building.
    const b = buildingById.value.get(buildingId)
    const hit = b && nearest(nodes.value, b)
    return hit ? [hit.item] : []
  }

  /**
   * Walking route to a building.
   * 1. Shortest path along the admin's walkway paths (Dijkstra), when the start and the
   *    building are both connected to them.
   * 2. Otherwise a direct straight line, flagged with `direct: true` and a `reason`,
   *    so navigation can be tested before the paths are mapped.
   * Returns { points, steps, distance, target, direct, reason } or { error }.
   * error === 'no-start' means there is no QR code, tapped point or GPS fix yet.
   */
  function routeTo(buildingId) {
    const building = buildingById.value.get(buildingId)
    if (!building) return { error: 'Building not found.' }
    const from = start.value
    if (!from) return { error: 'no-start' }

    const entrances = entrancesOf(buildingId)
    if (from.node && entrances.length) {
      const result = shortestPath(graph.value, from.node.id, entrances.map((n) => n.id))
      if (result) return pathRoute(result, building, from)
    }

    let reason = 'No walkway path reaches this building yet.'
    if (!edges.value.length) reason = 'Walkway paths are not mapped yet.'
    else if (!from.node) reason = 'Your start point is not near any mapped walkway.'
    return directRoute(building, entrances, from, reason)
  }

  function pathRoute(result, building, from) {
    const pathNodes = result.path.map((id) => nodeById.value.get(id))
    const points = pathNodes.map((n) => ({ lat: n.lat, lng: n.lng }))
    let distance = result.distance

    // From GPS or a tapped point, also draw (and count) the walk to the first walkway point.
    if (from.source !== 'qr') {
      const lead = distanceBetween(from.point, pathNodes[0])
      if (lead > 3) {
        points.unshift({ lat: from.point.lat, lng: from.point.lng })
        distance += lead
      }
    }

    const target = pathNodes[pathNodes.length - 1]
    return { points, distance, target, direct: false, steps: buildSteps(pathNodes, building, from) }
  }

  function directRoute(building, entrances, from, reason) {
    // Head for the closest entrance if any are marked, otherwise the building's pin.
    const target = entrances.length ? nearest(entrances, from.point).item : building
    const distance = distanceBetween(from.point, target)
    return {
      points: [
        { lat: from.point.lat, lng: from.point.lng },
        { lat: target.lat, lng: target.lng },
      ],
      distance,
      target,
      direct: true,
      reason,
      steps: [
        { text: startText(from), distance: null },
        { text: `Head toward ${building.name} (${compass(from.point, target)})`, distance },
        { text: `Arrive at ${building.name}`, distance: null },
      ],
    }
  }

  function startText(from) {
    return from.source === 'qr' ? `Start at ${from.label}` : `Start from ${from.label}`
  }

  // Unlabelled walkway points are merged; labelled ones ("Canteen", "Gate 1") become steps.
  function buildSteps(pathNodes, building, from) {
    const steps = [{ text: startText(from), distance: null }]
    if (pathNodes.length === 1) {
      steps.push({ text: `You are at ${building.name}`, distance: 0 })
      return steps
    }
    let pending = 0
    for (let i = 1; i < pathNodes.length; i++) {
      pending += distanceBetween(pathNodes[i - 1], pathNodes[i])
      const n = pathNodes[i]
      if (i === pathNodes.length - 1) {
        steps.push({ text: `Arrive at ${n.label || `${building.name} entrance`}`, distance: pending })
      } else if (n.label) {
        steps.push({ text: `Walk to ${n.label}`, distance: pending })
        pending = 0
      }
    }
    return steps
  }

  // ---- Search (plain text match, in the browser) ----
  const searchIndex = computed(() => {
    const items = []
    for (const b of buildings.value) {
      items.push({
        kind: 'building',
        id: b.id,
        buildingId: b.id,
        title: b.name,
        subtitle: b.description || '',
        category: b.category || null,
        haystack: `${b.name} ${b.description || ''} ${categoryById[b.category]?.label || ''} ${categoryById[b.category]?.plural || ''}`.toLowerCase(),
      })
      for (const f of b.floors ?? []) {
        for (const r of f.rooms ?? []) {
          items.push({
            kind: 'room',
            id: r.id,
            buildingId: b.id,
            title: r.name,
            subtitle: `${b.name} · ${f.label}`,
            type: r.type,
            haystack: `${r.name} ${r.type} ${r.notes || ''} ${b.name} ${f.label}`.toLowerCase(),
          })
        }
      }
    }
    return items
  })

  function search(query) {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const words = q.split(/\s+/)
    return searchIndex.value
      .filter((i) => words.every((w) => i.haystack.includes(w)))
      .map((i) => {
        const t = i.title.toLowerCase()
        const rank = t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3
        return { ...i, score: rank + (i.kind === 'room' ? 0.5 : 0) }
      })
      .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
      .slice(0, 25)
  }

  function findRoom(roomId) {
    for (const b of buildings.value) {
      for (const f of b.floors ?? []) {
        const room = (f.rooms ?? []).find((r) => r.id === roomId)
        if (room) return { room, floor: f, building: b }
      }
    }
    return null
  }

  return {
    buildings, nodes, edges, events, status, error, load,
    nodeById, buildingById,
    fromCode, setFromCode, manualStart, setManualStart, useLiveGps,
    gps, gpsError, startGps, start, offCampus, nearestBuilding,
    entrancesOf, routeTo, search, findRoom,
  }
})
