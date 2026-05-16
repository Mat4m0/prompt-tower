<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TokenBar from './components/TokenBar.vue'
import PromptPanel from './components/PromptPanel.vue'
import ContextOptionsPanel from './components/ContextOptionsPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import { applyExtensionMessage, useContextState } from './composables/useContextState'
import { useVsCodeBridge } from './composables/useVsCodeBridge'

type ToastLevel = 'info' | 'warning' | 'error'

interface Toast {
  id: number
  level: ToastLevel
  message: string
}

const { state, previewText } = useContextState()
const toasts = ref<Toast[]>([])
let nextToastId = 1

function pushToast(level: ToastLevel, message: string) {
  const id = nextToastId++
  toasts.value.push({ id, level, message })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 4000)
}

const { send } = useVsCodeBridge((message) => applyExtensionMessage(message, pushToast))

function onCopyPreview() {
  send({ type: 'context.copyPreview', text: previewText.value })
}

onMounted(() => {
  send({ type: 'ready' })
})
</script>

<template>
  <h1>Lupinum Context</h1>
  <TokenBar :state="state" :send="send" />
  <PromptPanel :state="state" :send="send" />
  <ContextOptionsPanel :state="state" :send="send" @copy-preview="onCopyPreview" />
  <PreviewPanel :text="previewText" />
  <div v-if="toasts.length > 0" class="toast-stack">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.level">
      {{ toast.message }}
    </div>
  </div>
</template>
