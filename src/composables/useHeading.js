// Which way the phone is facing (compass), smoothed.
// - iPhone: needs DeviceOrientationEvent.requestPermission() from a tap; uses webkitCompassHeading.
// - Android Chrome: 'deviceorientationabsolute' gives an absolute alpha.
// Free browser APIs only. While walking, the GPS direction of travel is steadier;
// the navigation screen prefers that and uses the compass when standing still.
import { onBeforeUnmount, ref } from 'vue'
import { turnAngle } from '../lib/maneuvers'

/** Move angle `prev` toward `next` by factor k (0..1), the short way round. */
export function smoothAngle(prev, next, k = 0.25) {
  if (prev == null) return next
  return (prev + turnAngle(prev, next) * k + 360) % 360
}

let permissionGranted = false
// The answer to the last permission request, while it is still pending. The navigation screen
// mounts right after the Start tap, before the visitor has answered the iPhone prompt, so it
// waits for this instead of asking again (asking again outside a tap fails).
let pendingPermission = null

/**
 * Ask for compass access. On iPhone this must run directly inside a tap handler
 * (call it from the "Start navigation" button before opening the navigation screen).
 * Resolves 'granted' | 'denied' | 'error' (not called from a tap) | 'not-needed' | 'unsupported'.
 */
export function askCompassPermission() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return Promise.resolve('unsupported')
  const ask = window.DeviceOrientationEvent.requestPermission
  if (typeof ask !== 'function') return Promise.resolve('not-needed')
  // Must be called synchronously here (not in a .then) so it still counts as part of the tap.
  let request
  try {
    request = Promise.resolve(ask.call(window.DeviceOrientationEvent))
  } catch (e) {
    request = Promise.reject(e)
  }
  pendingPermission = request
    .then((res) => {
      permissionGranted = res === 'granted'
      return permissionGranted ? 'granted' : 'denied'
    })
    .catch(() => 'error')
  return pendingPermission
}

export function useHeading() {
  const heading = ref(null) // degrees clockwise from north, or null
  const accuracy = ref(null) // iOS only: ± degrees
  const status = ref('idle') // idle | active | needs-permission | denied | unsupported
  let lastEvent = 0
  let watchdog = null

  function onOrientation(e) {
    let h = null
    if (typeof e.webkitCompassHeading === 'number') {
      h = e.webkitCompassHeading
      accuracy.value = typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null
    } else if (e.absolute && typeof e.alpha === 'number') {
      h = (360 - e.alpha) % 360
    }
    if (h == null || Number.isNaN(h)) return
    const screenAngle = (typeof screen !== 'undefined' && screen.orientation?.angle) || 0
    heading.value = smoothAngle(heading.value, (h + screenAngle) % 360, 0.2)
    lastEvent = Date.now()
    status.value = 'active'
  }

  function listen() {
    window.addEventListener('deviceorientationabsolute', onOrientation, true)
    window.addEventListener('deviceorientation', onOrientation, true)
    // No compass readings after a few seconds (desktop, some phones): report unsupported.
    clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      if (!lastEvent && status.value !== 'denied') status.value = 'unsupported'
    }, 3000)
  }

  /** Call from a tap (required on iPhone). Safe to call more than once. */
  async function start() {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      status.value = 'unsupported'
      return
    }
    const ask = window.DeviceOrientationEvent.requestPermission
    // A request from the Start tap may still be waiting for the visitor's answer.
    if (typeof ask === 'function' && !permissionGranted && pendingPermission) {
      const res = await pendingPermission
      pendingPermission = null
      if (res === 'denied') {
        status.value = 'denied'
        return
      }
    }
    if (typeof ask === 'function' && !permissionGranted) {
      try {
        const res = await ask.call(window.DeviceOrientationEvent)
        if (res !== 'granted') {
          status.value = 'denied'
          return
        }
      } catch {
        // Not called from a tap: show an "Enable compass" button instead.
        status.value = 'needs-permission'
        return
      }
    }
    listen()
  }

  function stop() {
    window.removeEventListener('deviceorientationabsolute', onOrientation, true)
    window.removeEventListener('deviceorientation', onOrientation, true)
    clearTimeout(watchdog)
  }

  onBeforeUnmount(stop)
  return { heading, accuracy, status, start, stop }
}
