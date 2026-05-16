<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ContextPanelState, WebviewToExtensionMessage } from '../../shared/messages'

const props = defineProps<{
  state: ContextPanelState
  send: (message: WebviewToExtensionMessage) => void
}>()

const presetName = ref('')
const selectedVersionId = ref('')

const activePreset = computed(
  () =>
    props.state.promptPresets.find((preset) => preset.id === props.state.activePresetId) ?? null,
)

const versionsReversed = computed(() =>
  activePreset.value ? [...activePreset.value.versions].reverse() : [],
)

watch(
  activePreset,
  (preset) => {
    if (!preset) {
      selectedVersionId.value = ''
      return
    }
    const current = preset.versions.find((v) => v.current)
    selectedVersionId.value = current?.id ?? preset.currentVersionId
  },
  { immediate: true },
)

function versionLabel(version: { id: string; current: boolean; createdAt: string }): string {
  const date = new Date(version.createdAt)
  const label = Number.isNaN(date.valueOf()) ? version.createdAt : date.toLocaleString()
  return (version.current ? 'current · ' : '') + label
}

function onPresetChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  props.send({
    type: 'prefix.selectPreset',
    presetId: value === '' ? null : value,
  })
}

function onInlineInput(event: Event) {
  props.send({
    type: 'prefix.inlineChanged',
    text: (event.target as HTMLTextAreaElement).value,
  })
}

function onCreatePreset() {
  const name = presetName.value.trim()
  if (!name) {
    return
  }
  props.send({
    type: 'prefix.createPreset',
    name,
    text: props.state.inlinePrefix,
  })
  presetName.value = ''
}

function onSaveVersion() {
  const presetId = props.state.activePresetId
  if (!presetId) {
    return
  }
  props.send({
    type: 'prefix.saveVersion',
    presetId,
    text: props.state.inlinePrefix,
  })
}

function onRestoreVersion() {
  const presetId = props.state.activePresetId
  if (!presetId || !selectedVersionId.value) {
    return
  }
  props.send({
    type: 'prefix.restoreVersion',
    presetId,
    versionId: selectedVersionId.value,
  })
}

function onDuplicate() {
  const presetId = props.state.activePresetId
  if (!presetId) {
    return
  }
  props.send({ type: 'prefix.duplicatePreset', presetId })
}

function onDelete() {
  const presetId = props.state.activePresetId
  if (!presetId) {
    return
  }
  if (!window.confirm('Delete this prefix preset?')) {
    return
  }
  props.send({ type: 'prefix.deletePreset', presetId })
}
</script>

<template>
  <div class="panel">
    <div class="row">
      <label>Prefix</label>
      <select :value="state.activePresetId ?? ''" @change="onPresetChange">
        <option value="">Inline prefix</option>
        <option v-for="preset in state.promptPresets" :key="preset.id" :value="preset.id">
          {{ preset.name }}
        </option>
      </select>
      <input
        v-model="presetName"
        class="name-input"
        placeholder="New preset name"
        spellcheck="false"
      />
      <button class="secondary" @click="onCreatePreset">New</button>
      <button class="secondary" :disabled="!activePreset" @click="onSaveVersion">
        Save Version
      </button>
      <button class="secondary" :disabled="!activePreset" @click="onDuplicate">Duplicate</button>
      <button class="secondary danger" :disabled="!activePreset" @click="onDelete">Delete</button>
    </div>
    <div class="row">
      <textarea
        :value="state.inlinePrefix"
        placeholder="Write a reusable prefix or select a preset"
        @input="onInlineInput"
      />
    </div>
    <div v-if="activePreset" class="row subtle-row">
      <label>Versions</label>
      <select v-model="selectedVersionId">
        <option v-for="version in versionsReversed" :key="version.id" :value="version.id">
          {{ versionLabel(version) }}
        </option>
      </select>
      <button class="secondary" @click="onRestoreVersion">Restore</button>
    </div>
  </div>
</template>
