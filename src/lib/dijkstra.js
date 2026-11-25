// Plain Dijkstra shortest path over the campus walkway graph.
// Edges are walkable both ways. The graph is small (hundreds of nodes), so a simple
// array scan for the next closest node is fast enough and easy to follow.

/** Adjacency list: nodeId -> [{ to, distance }] */
export function buildGraph(edges) {
  const graph = new Map()
  const add = (a, b, d) => {
    if (!graph.has(a)) graph.set(a, [])
    graph.get(a).push({ to: b, distance: d })
  }
  for (const e of edges) {
    add(e.fromId, e.toId, e.distanceM)
    add(e.toId, e.fromId, e.distanceM)
  }
  return graph
}

/**
 * Shortest path from startId to the closest of targetIds.
 * Returns { path: [nodeId...], distance } or null when no target is reachable.
 */
export function shortestPath(graph, startId, targetIds) {
  const targets = new Set(targetIds)
  if (targets.has(startId)) return { path: [startId], distance: 0 }

  const dist = new Map([[startId, 0]])
  const prev = new Map()
  const done = new Set()
  const frontier = new Set([startId])

  while (frontier.size) {
    // Pick the unvisited node with the smallest known distance.
    let current = null
    for (const id of frontier) {
      if (current === null || dist.get(id) < dist.get(current)) current = id
    }
    frontier.delete(current)
    done.add(current)

    if (targets.has(current)) {
      const path = [current]
      while (prev.has(path[0])) path.unshift(prev.get(path[0]))
      return { path, distance: dist.get(current) }
    }

    for (const { to, distance } of graph.get(current) ?? []) {
      if (done.has(to)) continue
      const candidate = dist.get(current) + distance
      if (candidate < (dist.get(to) ?? Infinity)) {
        dist.set(to, candidate)
        prev.set(to, current)
        frontier.add(to)
      }
    }
  }
  return null
}
