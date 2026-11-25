// All HTTP calls live here. Components and stores call these functions, never fetch() directly.

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
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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
export const getEvents = () => request('/events')
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
}
