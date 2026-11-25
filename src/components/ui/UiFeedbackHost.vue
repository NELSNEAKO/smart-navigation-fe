<script setup>
// Renders toasts and the confirm dialog. Mounted once in AdminLayout.
import { toasts, confirmState, settleConfirm } from '../../lib/feedback'
import AppIcon from './AppIcon.vue'
import UiButton from './UiButton.vue'
</script>

<template>
  <Teleport to="body">
    <!-- Toasts -->
    <div class="pointer-events-none fixed inset-x-4 bottom-20 z-[3000] flex flex-col items-center gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end" aria-live="polite">
      <TransitionGroup enter-from-class="translate-y-2 opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl"
        >
          <AppIcon :name="t.type === 'error' ? 'alert' : 'check'" :size="18" :class="t.type === 'error' ? 'text-red-300' : 'text-emerald-300'" />
          <span>{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>

    <!-- Confirm dialog -->
    <div v-if="confirmState.open" class="fixed inset-0 z-[3001] flex items-end justify-center bg-ink/40 p-4 sm:items-center" @click.self="settleConfirm(false)">
      <div role="alertdialog" aria-modal="true" :aria-label="confirmState.title" class="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <div class="flex gap-3">
          <span v-if="confirmState.danger" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
            <AppIcon name="alert" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-ink">{{ confirmState.title }}</h2>
            <p v-if="confirmState.message" class="mt-1 text-sm text-ink-soft">{{ confirmState.message }}</p>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <UiButton variant="secondary" @click="settleConfirm(false)">Cancel</UiButton>
          <UiButton :variant="confirmState.danger ? 'danger' : 'primary'" @click="settleConfirm(true)">{{ confirmState.confirmLabel }}</UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
