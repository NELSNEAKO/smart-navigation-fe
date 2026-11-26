// Leaflet-Geoman is a classic script: it expects the global `L` and hooks into maps as they are
// created. Import this module *before* '@geoman-io/leaflet-geoman-free' (ES modules run in order).
import L from 'leaflet'

window.L = L
export default L
