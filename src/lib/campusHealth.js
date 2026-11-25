// Checks the admin's campus data for problems visitors would hit. Pure functions, no API calls.
import { buildGraph } from './dijkstra'
import { distanceBetween } from './geo'

const OUTLIER_M = 2000

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Node ids reachable from any of the start ids along edges. */
function reachableFrom(graph, startIds) {
  const seen = new Set(startIds)
  const queue = [...startIds]
  while (queue.length) {
    const id = queue.shift()
    for (const { to } of graph.get(id) ?? []) {
      if (!seen.has(to)) {
        seen.add(to)
        queue.push(to)
      }
    }
  }
  return seen
}

/**
 * Returns { issues: [{ level, buildingId?, nodeId?, title, text, fix }], perBuilding: Map(id -> { entrances, reachable, floors, rooms }) }
 */
export function campusHealth({ buildings, nodes, edges }) {
  const issues = []
  const graph = buildGraph(edges)
  const qrIds = nodes.filter((n) => n.code).map((n) => n.id)
  const reachable = qrIds.length ? reachableFrom(graph, qrIds) : new Set()
  const perBuilding = new Map()

  // Buildings far from the rest were probably saved in the wrong place.
  const mid = buildings.length ? { lat: median(buildings.map((b) => b.lat)), lng: median(buildings.map((b) => b.lng)) } : null

  for (const b of buildings) {
    const entrances = nodes.filter((n) => n.buildingId === b.id)
    const floors = b.floors?.length ?? 0
    const rooms = (b.floors ?? []).reduce((n, f) => n + (f.rooms?.length ?? 0), 0)
    const isReachable = entrances.some((n) => reachable.has(n.id))
    perBuilding.set(b.id, { entrances: entrances.length, reachable: isReachable, floors, rooms })

    if (mid && buildings.length > 2 && distanceBetween(b, mid) > OUTLIER_M) {
      issues.push({
        level: 'warning',
        buildingId: b.id,
        title: `${b.name} is far from the other buildings`,
        text: `About ${Math.round(distanceBetween(b, mid) / 1000)} km away. Its pin may be in the wrong place.`,
        fix: 'Move pin',
      })
      continue
    }
    if (!entrances.length) {
      issues.push({ level: 'warning', buildingId: b.id, title: `${b.name} has no entrance`, text: 'Mark an entrance point on the Paths map so routes end at the door.', fix: 'Add entrance' })
    } else if (qrIds.length && !isReachable) {
      issues.push({ level: 'warning', buildingId: b.id, title: `${b.name} can't be reached`, text: 'No path connects a QR start point to its entrance.', fix: 'Connect paths' })
    }
  }

  // Points that touch no path are dead ends for routing.
  const linked = new Set(edges.flatMap((e) => [e.fromId, e.toId]))
  const loose = nodes.filter((n) => !linked.has(n.id))
  if (loose.length) {
    issues.push({ level: 'info', title: `${loose.length} path point${loose.length > 1 ? 's are' : ' is'} not connected`, text: 'Connect them to a path, or delete them.', fix: 'Open paths' })
  }

  // Wrong locations first, then unreachable/missing entrances, then info.
  const rank = (i) => (i.fix === 'Move pin' ? 0 : i.level === 'warning' ? 1 : 2)
  issues.sort((a, b) => rank(a) - rank(b))
  return { issues, perBuilding }
}
