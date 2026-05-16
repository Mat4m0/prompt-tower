<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ContextPanelState, WebviewToExtensionMessage } from '../../shared/messages'

const props = defineProps<{
  state: ContextPanelState
  send: (message: WebviewToExtensionMessage) => void
}>()

const popoverOpen = ref(false)
const settingsButton = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLDivElement | null>(null)

function togglePopover() {
  popoverOpen.value = !popoverOpen.value
}

function handleClickOutside(event: MouseEvent) {
  if (!popoverOpen.value) {
    return
  }
  const target = event.target as Node | null
  if (popover.value && popover.value.contains(target)) {
    return
  }
  if (settingsButton.value && settingsButton.value.contains(target)) {
    return
  }
  popoverOpen.value = false
}

onMounted(() => window.addEventListener('click', handleClickOutside))
onUnmounted(() => window.removeEventListener('click', handleClickOutside))

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return (Math.round(value / 10_000) / 100).toLocaleString() + 'M'
  }
  if (value >= 1000) {
    return Math.round(value / 1000).toLocaleString() + 'k'
  }
  return value.toLocaleString()
}

const chips = computed(() =>
  props.state.tokenSummaries.map((summary) => ({
    id: summary.id,
    label: summary.label,
    display: '~' + formatCompactNumber(summary.tokens),
  })),
)

function onProfileToggle(profileId: string, checked: boolean) {
  const current = new Set(props.state.visibleTokenProfileIds)
  if (checked) {
    current.add(profileId)
  } else {
    current.delete(profileId)
  }
  props.send({
    type: 'tokenSummary.setProfiles',
    profileIds: Array.from(current),
  })
}
</script>

<template>
  <div class="bar">
    <div class="token-summary">
      <div class="token-chips">
        <span v-for="chip in chips" :key="chip.id" class="token-chip">
          <span class="token-label">{{ chip.label }}</span>
          <span class="token-value">{{ chip.display }}</span>
        </span>
      </div>
      <button
        ref="settingsButton"
        class="icon-button"
        title="Token summary settings"
        aria-label="Token summary settings"
        @click="togglePopover"
      >
        ⚙
      </button>
      <div v-if="popoverOpen" ref="popover" class="popover">
        <div class="popover-title">Token summary</div>
        <div class="check-list">
          <label v-for="profile in state.tokenProfiles" :key="profile.id" class="popover-check">
            <input
              type="checkbox"
              :value="profile.id"
              :checked="state.visibleTokenProfileIds.includes(profile.id)"
              @change="onProfileToggle(profile.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ profile.label }}
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
