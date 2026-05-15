export interface PromptPreset {
  id: string
  name: string
  currentVersionId: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  versions: PromptPresetVersion[]
}

export interface PromptPresetVersion {
  id: string
  text: string
  note?: string
  createdAt: string
  checksum: string
}
