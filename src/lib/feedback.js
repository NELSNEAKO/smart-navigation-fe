// Toasts and confirm dialogs for the admin, without window.alert / window.confirm.
import { reactive } from 'vue'

export const toasts = reactive([])
let nextId = 1

export function toast(message, type = 'success') {
  const id = nextId++
  toasts.push({ id, message, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i !== -1) toasts.splice(i, 1)
  }, type === 'error' ? 5000 : 3000)
}
toast.error = (message) => toast(message, 'error')

export const confirmState = reactive({ open: false, title: '', message: '', confirmLabel: 'Delete', danger: true, resolve: null })

/** await confirmAction({ title, message }) -> true | false */
export function confirmAction({ title, message = '', confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    Object.assign(confirmState, { open: true, title, message, confirmLabel, danger, resolve })
  })
}

export function settleConfirm(value) {
  confirmState.resolve?.(value)
  Object.assign(confirmState, { open: false, resolve: null })
}
