import type { ProjectTreeMode } from './ContextFormat'

export interface ContextCharacterEstimateInput {
  prefix: string
  suffix: string
  selectedFileBlockChars: number
  selectedFileCount: number
  selectedGitDiffChars?: number
  projectTree: string
  treeType: ProjectTreeMode
  minify: boolean
}

export function estimateContextCharacters(input: ContextCharacterEstimateInput): number {
  const treeChars =
    input.treeType !== 'none' && input.projectTree.length > 0
      ? input.minify
        ? `<project_tree>${input.projectTree}</project_tree>`.length
        : `<project_tree>\n${input.projectTree}\n</project_tree>\n`.length
      : 0
  const separatorChars =
    input.selectedFileCount > 1 && !input.minify ? input.selectedFileCount - 1 : 0
  const fileSectionChars =
    input.selectedFileBlockChars > 0
      ? input.minify
        ? `<project_files></project_files>`.length + input.selectedFileBlockChars + separatorChars
        : `<project_files>\n\n</project_files>`.length +
          input.selectedFileBlockChars +
          separatorChars
      : 0
  const wrapperChars =
    treeChars > 0 || fileSectionChars > 0 || (input.selectedGitDiffChars ?? 0) > 0
      ? input.minify
        ? '<context></context>'.length
        : '<context>\n</context>'.length
      : 0
  const prefixChars = input.prefix ? input.prefix.length + 1 : 0
  const suffixChars = input.suffix ? input.suffix.length + 1 : 0

  return (
    prefixChars +
    suffixChars +
    wrapperChars +
    treeChars +
    fileSectionChars +
    (input.selectedGitDiffChars ?? 0)
  )
}
