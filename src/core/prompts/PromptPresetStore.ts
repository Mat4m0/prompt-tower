import type { PromptPreset } from './PromptPresetTypes'
import { parsePromptPresets } from './parsePromptPresets'

export interface PromptPresetStorage {
  get<T>(key: string, fallback: T): T
  update(key: string, value: unknown): Promise<void> | Thenable<void>
}

export class PromptPresetStore {
  constructor(
    private storage: PromptPresetStorage,
    private storageKey: string,
  ) {}

  list(includeDeleted: boolean = false): PromptPreset[] {
    const presets = parsePromptPresets(this.storage.get<unknown>(this.storageKey, []))
    return includeDeleted ? presets : presets.filter((preset) => preset.deletedAt === undefined)
  }

  async saveAll(presets: readonly PromptPreset[]): Promise<void> {
    await this.storage.update(this.storageKey, presets)
  }

  async upsert(preset: PromptPreset): Promise<void> {
    const presets = this.list(true)
    const index = presets.findIndex((candidate) => candidate.id === preset.id)
    if (index >= 0) {
      presets[index] = preset
    } else {
      presets.push(preset)
    }
    await this.saveAll(presets)
  }
}
