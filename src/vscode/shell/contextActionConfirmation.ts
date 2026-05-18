import * as vscode from 'vscode'
import {
  findLargeContextWarning,
  formatLargeContextActionWarning,
  type ContextAction,
} from '../../app/ContextWarnings'

export async function confirmLargeContextAction(
  action: ContextAction,
  warnings: Parameters<typeof findLargeContextWarning>[0],
): Promise<boolean> {
  const warning = findLargeContextWarning(warnings)
  if (!warning) {
    return true
  }

  const label =
    action === 'copy' ? 'Copy anyway' : action === 'save' ? 'Save anyway' : 'Create anyway'
  const selected = await vscode.window.showWarningMessage(
    formatLargeContextActionWarning(action, warning),
    { modal: true },
    label,
  )
  return selected === label
}
