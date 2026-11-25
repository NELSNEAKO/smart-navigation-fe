// GPS helpers for the admin: averaged single points and continuous walk recording.
import { averageFixes } from './pathTools'

const OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

export function gpsAvailable() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

function gpsError(err) {
  if (err?.code === 1) return new Error('Location permission was denied. Allow location access for this site.')
  if (err?.code === 3) return new Error('GPS took too long. Move to an open area and try again.')
  return new Error('Could not get your location.')
}

/**
 * Collect GPS readings for `durationMs` (or until `maxSamples`) and average them.
 * onProgress({ count, accuracy }) is called after each reading.
 * Resolves { lat, lng, accuracy, count }.
 */
export function sampleGps({ durationMs = 8000, maxSamples = 12, maxAccuracy = 40, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!gpsAvailable()) return reject(new Error('Location is not available on this device.'))
    const fixes = []
    let done = false
    const finish = () => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(watchId)
      clearTimeout(timer)
      const avg = averageFixes(fixes)
      if (avg) resolve({ ...avg, count: fixes.length })
      else reject(new Error('No usable GPS reading. Move to an open area away from buildings and try again.'))
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        if (f.accuracy <= maxAccuracy) fixes.push(f)
        onProgress?.({ count: fixes.length, accuracy: averageFixes(fixes)?.accuracy ?? f.accuracy })
        if (fixes.length >= maxSamples) finish()
      },
      (err) => {
        if (done) return
        done = true
        navigator.geolocation.clearWatch(watchId)
        clearTimeout(timer)
        reject(gpsError(err))
      },
      OPTIONS,
    )
    const timer = setTimeout(finish, durationMs)
  })
}

/**
 * Continuous recording while the admin walks a walkway.
 * onFix({ lat, lng, accuracy, accepted }) for every reading.
 * Returns stop() which ends the watch.
 */
export function watchWalk({ maxAccuracy = 25, onFix, onError }) {
  if (!gpsAvailable()) {
    onError?.(new Error('Location is not available on this device.'))
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, t: pos.timestamp }
      onFix?.({ ...f, accepted: f.accuracy <= maxAccuracy })
    },
    (err) => onError?.(gpsError(err)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
