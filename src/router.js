import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useMapStore } from './stores/map'
import HomeView from './views/HomeView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/map', name: 'map', component: () => import('./views/MapView.vue') },
  { path: '/place/:buildingId', name: 'place', component: () => import('./views/PlaceView.vue') },
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue') },
  { path: '/route/:buildingId', name: 'route', component: () => import('./views/RouteView.vue') },
  { path: '/arrived/:buildingId', name: 'arrived', component: () => import('./views/ArrivedView.vue') },
  { path: '/status', name: 'status', component: () => import('./views/StatusView.vue') },

  { path: '/admin/login', name: 'admin-login', component: () => import('./views/admin/LoginView.vue') },
  {
    path: '/admin',
    component: () => import('./components/admin/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: '', redirect: '/admin/overview' },
      { path: 'overview', name: 'admin-overview', component: () => import('./views/admin/OverviewView.vue') },
      { path: 'buildings', name: 'admin-buildings', component: () => import('./views/admin/BuildingsView.vue') },
      { path: 'nodes', name: 'admin-nodes', component: () => import('./views/admin/NodesView.vue') },
      { path: 'events', name: 'admin-events', component: () => import('./views/admin/EventsView.vue') },
      { path: 'reports', name: 'admin-reports', component: () => import('./views/admin/ReportsView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  // QR codes link to the app with ?from=<node code>; remember it for this visit.
  if (typeof to.query.from === 'string' && to.query.from.trim()) {
    useMapStore().setFromCode(to.query.from.trim().toLowerCase())
  }
  if (to.matched.some((r) => r.meta.admin) && !useAuthStore().isLoggedIn) {
    return { name: 'admin-login', query: { next: to.fullPath } }
  }
})

export default router
