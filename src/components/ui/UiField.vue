<script setup>
// Label + control + hint/error. Put an <input class="ui-input"> style control in the default slot,
// or use the `as` prop for the common cases (input | textarea | select).
import { useId } from 'vue'

const model = defineModel({ type: [String, Number, null], default: '' })
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  as: { type: String, default: 'input' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  maxlength: { type: [Number, String], default: undefined },
  rows: { type: [Number, String], default: 3 },
  options: { type: Array, default: () => [] }, // for select: [{ value, label }]
})
defineOptions({ inheritAttrs: false })

const id = useId()
const control =
  'block w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-muted shadow-xs transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-canvas'
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-medium text-ink-soft">
      {{ label }}<span v-if="required" class="text-danger-600"> *</span>
    </label>
    <slot :id="id" :control-class="control">
      <textarea
        v-if="as === 'textarea'"
        :id="id"
        v-model="model"
        :rows="rows"
        :placeholder="placeholder"
        :required="required"
        :maxlength="maxlength"
        :class="[control, 'py-2']"
        v-bind="$attrs"
      />
      <select v-else-if="as === 'select'" :id="id" v-model="model" :required="required" :class="[control, 'h-10']" v-bind="$attrs">
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input
        v-else
        :id="id"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :required="required"
        :maxlength="maxlength"
        :class="[control, 'h-10']"
        v-bind="$attrs"
      />
    </slot>
    <p v-if="error" class="mt-1.5 text-sm text-danger-600">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-sm text-ink-muted">{{ hint }}</p>
  </div>
</template>
