// All HTTP calls live here. Components and stores call these functions, never fetch() directly.

// '' = same site: Vite's proxy locally, Vercel's rewrite in production.
// Set VITE_API_URL only to call a backend on another domain directly (needs CORS_ORIGIN there).
export const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`

let token = null
let onUnauthorized = () => {}

export function setToken(t) {
  token = t
}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    // no-cache: always ask the server (it may answer 304). Without it the browser can serve a
    // stale copy, so admin edits showed up one change late. Offline use is the service worker's job.
    res = await fetch(`${API_BASE}${path}`, { method, headers, cache: 'no-cache', body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'You appear to be offline.')
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized()
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`)
  }
  return data
}

// ---- Public ----
export const getMap = () => request('/map')
/** Backend + database status, used by the /status page. */
export const getHealth = () =>
  fetch(`${API_BASE}/health?db=1`).then(async (r) => ({ httpStatus: r.status, ...(await r.json().catch(() => ({}))) }))
export const getEvents = () => request('/events')
/** Most searched buildings: [{ buildingId, count }]. Empty list if unavailable. */
export const getPopular = () => request('/popular').catch(() => [])
export const login = (email, password) => request('/auth/login', { method: 'POST', body: { email, password } })

/** Fire-and-forget usage log; never blocks or breaks navigation. */
export function logSearch({ query, fromCode, buildingId }) {
  request('/logs', { method: 'POST', body: { query, fromCode, buildingId } }).catch(() => {})
}

// ---- Admin ----
// resource: 'buildings' | 'floors' | 'rooms' | 'nodes' | 'edges' | 'events'
export const admin = {
  list: (resource) => request(resource === 'events' ? '/events?all=1' : `/${resource}`, { auth: true }),
  create: (resource, data) => request(`/${resource}`, { method: 'POST', body: data, auth: true }),
  update: (resource, id, data) => request(`/${resource}/${id}`, { method: 'PUT', body: data, auth: true }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE', auth: true }),
  reports: (days = 30) => request(`/reports?days=${days}`, { auth: true }),
  /** Set the campus area: { name?, lat, lng, radiusM }. */
  saveCampus: (data) => request('/campus', { method: 'PUT', body: data, auth: true }),
  /** Save a whole walkway: points in order, each { id } (existing) or { lat, lng, label? }. */
  createPath: (points) => request('/paths', { method: 'POST', body: { points }, auth: true }),
  /** Undo: delete these paths and points in one request. */
  deletePath: ({ nodeIds = [], edgeIds = [] }) => request('/paths/delete', { method: 'POST', body: { nodeIds, edgeIds }, auth: true }),
}
