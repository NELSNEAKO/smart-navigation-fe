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
  const features = ref([]) // roads, crossings, areas drawn on the campus map
  const campus = ref(null) // { name, lat, lng, radiusM } set by the admin, or null
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
      campus.value = data.campus ?? null
      features.value = data.features ?? []
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
  const gpsErrorCode = ref(null) // 1 blocked, 2 location off / unavailable, 3 timed out
  // Browser permission for this site: 'granted' | 'prompt' | 'denied' | 'unknown' (no Permissions API, e.g. old iPhones)
  const locationPermission = ref('unknown')
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

  function onFix(pos) {
    gps.value = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null, // direction of travel, degrees
      speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null, // m/s
    }
    gpsError.value = null
    gpsErrorCode.value = null
    locationPermission.value = 'granted'
  }
  function onGpsError(err) {
    gpsErrorCode.value = err.code
    gpsError.value = err.code === 1 ? 'Location is blocked for this site.' : err.code === 2 ? "Your phone's location is turned off." : 'Could not get a GPS signal yet.'
    if (err.code === 1) locationPermission.value = 'denied'
    // Stop this watch so the next request starts a fresh one (a blocked watch never recovers).
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    watchId = null
  }

  /** Follow the phone's position. Asks for permission if the site doesn't have it yet. */
  function startGps() {
    if (watchId !== null) return
    if (!('geolocation' in navigator)) {
      gpsError.value = 'Location is not available on this device.'
      gpsErrorCode.value = 2
      return
    }
    watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
  }

  /**
   * Called when a visitor page opens: follow the GPS only if the site already has permission,
   * so visitors are never hit by a location pop-up before they know why (askLocation does that).
   */
  let permissionWatched = false
  async function initLocation() {
    if (!permissionWatched && navigator.permissions?.query) {
      permissionWatched = true
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' })
        locationPermission.value = p.state
        p.onchange = () => {
          locationPermission.value = p.state
          if (p.state === 'granted') startGps() // turned on in the browser settings: pick it up at once
        }
      } catch {
        /* Permissions API without geolocation support: stay 'unknown' */
      }
    }
    if (locationPermission.value === 'granted') startGps()
  }

  /** One location reading now (shows the browser's permission pop-up if needed). Resolves true on success. */
  function requestFix(timeoutMs = 15000) {
    if (!('geolocation' in navigator)) {
      gpsErrorCode.value = 2
      return Promise.resolve(false)
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onFix(pos)
          startGps() // keep following
          resolve(true)
        },
        (err) => {
          onGpsError(err)
          resolve(false)
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: timeoutMs },
      )
    })
  }

  // ---- "Use your location?" sheet (components/LocationSheet.vue, mounted once in App.vue) ----
  const locationAsk = ref(null) // { resolve } while the sheet is open
  /**
   * Make sure we know where the visitor is before navigation.
   * Resolves 'gps' (we have a fix on campus), 'start' (a QR/tapped start is already set),
   * 'pick' (they want to tap their start on the map) or 'cancel'.
   */
  function askLocation({ allowChosenStart = true } = {}) {
    if (allowChosenStart && (qrNode.value || manualStart.value)) return Promise.resolve('start')
    if (gps.value && !gpsOffCampus.value) return Promise.resolve('gps')
    locationAsk.value?.resolve('cancel')
    return new Promise((resolve) => {
      locationAsk.value = {
        resolve: (r) => {
          locationAsk.value = null
          resolve(r)
        },
      }
    })
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
  // The GPS fix itself (not a chosen start) is more than 1 km from every building.
  const gpsOffCampus = computed(() => !!gps.value && buildings.value.length > 0 && nearest(buildings.value, gps.value).distance > 1000)

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
    return routeWith(start.value, buildingId)
  }

  /** Reroute from any position (live navigation when the visitor leaves the route). */
  function routeFrom(point, buildingId) {
    const hit = nodes.value.length ? nearest(nodes.value, point) : null
    const node = hit && hit.distance <= MAX_SNAP_M ? hit.item : null
    return routeWith({ point, node, source: 'gps', label: 'your location' }, buildingId)
  }

  function routeWith(from, buildingId) {
    const building = buildingById.value.get(buildingId)
    if (!building) return { error: 'Building not found.' }
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
    const points = pathNodes.map((n) => ({ lat: n.lat, lng: n.lng, id: n.id, label: n.label || null }))
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
        { lat: target.lat, lng: target.lng, label: target.label || null },
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
    buildings, nodes, edges, campus, features, events, status, error, load,
    nodeById, buildingById,
    fromCode, setFromCode, manualStart, setManualStart, useLiveGps,
    gps, gpsError, gpsErrorCode, locationPermission, startGps, initLocation, requestFix, locationAsk, askLocation,
    start, offCampus, gpsOffCampus, nearestBuilding,
    entrancesOf, routeTo, routeFrom, search, findRoom,
  }
})
