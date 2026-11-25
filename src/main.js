import { createApp } from 'vue'
import { createPinia } from 'pinia'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import './index.css'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './lib/api'
import { useAuthStore } from './stores/auth'

// Leaflet's default marker images break under Vite unless the URLs are set explicitly.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const app = createApp(App)
app.use(createPinia())
app.use(router)

// An expired admin token sends the admin back to the login page.
setUnauthorizedHandler(() => {
  useAuthStore().logout()
  const current = router.currentRoute.value
  if (current.path.startsWith('/admin') && current.name !== 'admin-login') {
    router.push({ name: 'admin-login', query: { next: current.fullPath } })
  }
})

app.mount('#app')
