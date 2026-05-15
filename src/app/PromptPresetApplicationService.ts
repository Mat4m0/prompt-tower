import type { PromptPreset } from "../core/prompts/PromptPresetTypes";
import { PromptPresetStore } from "../core/prompts/PromptPresetStore";
import {
  createPromptPreset,
  duplicatePromptPreset,
  getCurrentPromptPresetVersion,
  restorePromptPresetVersion,
  savePromptPresetVersion,
  softDeletePromptPreset,
} from "../core/prompts/PromptPresetVersioning";

const PRESETS_KEY = "promptLupinum.promptPresets";
const ACTIVE_PRESET_KEY = "promptLupinum.activePromptPresetId";
const INLINE_PREFIX_KEY = "promptLupinum.inlinePrefixText";
const MIGRATION_KEY = "promptLupinum.promptPresetMigrationComplete";
const OLD_PREFIX_HISTORY_KEY = "promptTower.prefixHistory";

export interface AppStorage {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export class PromptPresetApplicationService {
  private store: PromptPresetStore;

  constructor(
    private globalStorage: AppStorage,
    private workspaceStorage: AppStorage
  ) {
    this.store = new PromptPresetStore(globalStorage, PRESETS_KEY);
  }

  async migrateOldPrefixHistory(): Promise<void> {
    if (this.globalStorage.get<boolean>(MIGRATION_KEY, false)) {
      return;
    }
    const oldHistory = this.globalStorage.get<Array<{ text?: string }>>(
      OLD_PREFIX_HISTORY_KEY,
      []
    );
    const uniqueTexts = [...new Set(oldHistory.map((entry) => entry.text).filter(Boolean))] as string[];
    const existing = this.store.list(true);
    const migrated = uniqueTexts.map((text, index) =>
      createPromptPreset(`Imported Prefix ${index + 1}`, text)
    );
    await this.store.saveAll([...existing, ...migrated]);
    await this.globalStorage.update(MIGRATION_KEY, true);
  }

  listPresets(): PromptPreset[] {
    return this.store.list(false);
  }

  getActivePresetId(): string | null {
    return this.workspaceStorage.get<string | null>(ACTIVE_PRESET_KEY, null);
  }

  async setActivePreset(presetId: string | null): Promise<void> {
    await this.workspaceStorage.update(ACTIVE_PRESET_KEY, presetId);
  }

  getInlinePrefix(): string {
    return this.workspaceStorage.get<string>(INLINE_PREFIX_KEY, "");
  }

  async setInlinePrefix(text: string): Promise<void> {
    await this.workspaceStorage.update(INLINE_PREFIX_KEY, text);
  }

  getEffectivePrefix(): string {
    const activePreset = this.getActivePreset();
    return activePreset
      ? getCurrentPromptPresetVersion(activePreset).text
      : this.getInlinePrefix();
  }

  getActivePreset(): PromptPreset | null {
    const id = this.getActivePresetId();
    return id ? this.listPresets().find((preset) => preset.id === id) ?? null : null;
  }

  async createPreset(name: string, text: string): Promise<PromptPreset> {
    const preset = createPromptPreset(name, text);
    await this.store.upsert(preset);
    await this.setActivePreset(preset.id);
    return preset;
  }

  async saveVersion(
    presetId: string,
    text: string,
    note?: string
  ): Promise<PromptPreset> {
    const preset = this.requirePreset(presetId);
    const updated = savePromptPresetVersion(preset, text, note);
    await this.store.upsert(updated);
    return updated;
  }

  async restoreVersion(presetId: string, versionId: string): Promise<PromptPreset> {
    const updated = restorePromptPresetVersion(this.requirePreset(presetId), versionId);
    await this.store.upsert(updated);
    return updated;
  }

  async duplicatePreset(presetId: string): Promise<PromptPreset> {
    const duplicated = duplicatePromptPreset(this.requirePreset(presetId));
    await this.store.upsert(duplicated);
    await this.setActivePreset(duplicated.id);
    return duplicated;
  }

  async deletePreset(presetId: string): Promise<void> {
    await this.store.upsert(softDeletePromptPreset(this.requirePreset(presetId)));
    if (this.getActivePresetId() === presetId) {
      await this.setActivePreset(null);
    }
  }

  private requirePreset(presetId: string): PromptPreset {
    const preset = this.store.list(true).find((candidate) => candidate.id === presetId);
    if (!preset) {
      throw new Error("Prompt preset not found.");
    }
    return preset;
  }
}
