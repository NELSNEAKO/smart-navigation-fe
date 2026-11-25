// Building categories. Keep ids in sync with BUILDING_CATEGORIES in
// smart-navigation-be/src/routes/buildings.js.
export const CATEGORIES = [
  { id: 'academic', label: 'Academic', plural: 'Academic buildings', icon: 'graduation' },
  { id: 'administration', label: 'Administration', plural: 'Offices & admin', icon: 'briefcase' },
  { id: 'library', label: 'Library', plural: 'Library', icon: 'book' },
  { id: 'food', label: 'Food', plural: 'Food & canteen', icon: 'utensils' },
  { id: 'health', label: 'Health', plural: 'Clinic & health', icon: 'health' },
  { id: 'sports', label: 'Sports', plural: 'Sports & gym', icon: 'trophy' },
  { id: 'services', label: 'Services', plural: 'Services', icon: 'wrench' },
  { id: 'home-management', label: 'Home Management', plural: 'Home Management', icon: 'home' },
]

export const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
