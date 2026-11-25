import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../lib/api'
import { buildGraph, shortestPath } from '../lib/dijkstra'
import { distanceBetween, nearest } from '../lib/geo'

const FROM_KEY = 'campusnav.from'
// A GPS fix farther than this from every walkway point is treated as "not on campus".
const MAX_SNAP_M = 300
// Within this distance of the destination entrance the visitor counts as arrived.
export const ARRIVE_M = 20

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

  // ---- Start location: QR code (?from=gate1) wins over GPS ----
  const fromCode = ref(readFrom())
  const gps = ref(null) // { lat, lng, accuracy }
  const gpsError = ref(null)
  let watchId = null

  function setFromCode(code) {
    fromCode.value = code || null
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

  /** { node, source: 'qr' | 'gps', label } or null. */
  const start = computed(() => {
    if (qrNode.value) {
      return { node: qrNode.value, source: 'qr', label: qrNode.value.label || qrNode.value.code }
    }
    if (gps.value && nodes.value.length) {
      const hit = nearest(nodes.value, gps.value)
      if (hit && hit.distance <= MAX_SNAP_M) return { node: hit.item, source: 'gps', label: 'Your location' }
    }
    return null
  })

  const offCampus = computed(() => {
    if (qrNode.value || !gps.value || !nodes.value.length) return false
    const hit = nearest(nodes.value, gps.value)
    return !hit || hit.distance > MAX_SNAP_M
  })

  /** Building the visitor is closest to. Building level only, never indoors. */
  const nearestBuilding = computed(() => {
    const point = qrNode.value ?? gps.value
    if (!point || !buildings.value.length) return null
    return nearest(buildings.value, point)
  })

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
   * Shortest walking route to a building (to whichever entrance is closest by path).
   * Returns { points, steps, distance, entrance } or { error }.
   * error === 'no-start' means there is no QR code or usable GPS yet.
   */
  function routeTo(buildingId) {
    const building = buildingById.value.get(buildingId)
    if (!building) return { error: 'Building not found.' }
    if (!start.value) return { error: 'no-start' }

    const entrances = entrancesOf(buildingId)
    if (!entrances.length) return { error: 'This building is not connected to the walkway map yet.' }

    const result = shortestPath(graph.value, start.value.node.id, entrances.map((n) => n.id))
    if (!result) return { error: 'No walking path found. The admin may still be mapping this area.' }

    const pathNodes = result.path.map((id) => nodeById.value.get(id))
    const points = pathNodes.map((n) => ({ lat: n.lat, lng: n.lng }))
    let distance = result.distance

    // From GPS, also draw (and count) the short walk to the first walkway point.
    if (start.value.source === 'gps' && gps.value) {
      const lead = distanceBetween(gps.value, pathNodes[0])
      if (lead > 3) {
        points.unshift({ lat: gps.value.lat, lng: gps.value.lng })
        distance += lead
      }
    }

    return {
      points,
      distance,
      entrance: pathNodes[pathNodes.length - 1],
      steps: buildSteps(pathNodes, building, start.value),
    }
  }

  // Unlabelled walkway points are merged; labelled ones ("Canteen", "Gate 1") become steps.
  function buildSteps(pathNodes, building, from) {
    const steps = [{ text: from.source === 'qr' ? `Start at ${from.label}` : 'Start from your location', distance: null }]
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
        haystack: `${b.name} ${b.description || ''}`.toLowerCase(),
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
    fromCode, setFromCode, gps, gpsError, startGps, start, offCampus, nearestBuilding,
    entrancesOf, routeTo, search, findRoom,
  }
})
