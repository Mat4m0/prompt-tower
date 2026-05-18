import type { ContextWarning } from '../core/context/ContextFormat'

export type ContextAction = 'copy' | 'create' | 'save'

export function findLargeContextWarning(
  warnings: readonly ContextWarning[],
): Extract<ContextWarning, { type: 'largeContext' }> | undefined {
  return warnings.find(
    (warning): warning is Extract<ContextWarning, { type: 'largeContext' }> =>
      warning.type === 'largeContext',
  )
}

export function formatLargeContextActionWarning(
  action: ContextAction,
  warning: Extract<ContextWarning, { type: 'largeContext' }>,
): string {
  const verb = action
  return `${warning.message} Continue and ${verb} it?`
}
