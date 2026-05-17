import { estimateTokensFromBytes, getTokenProfile, type TokenProfile } from './TokenProfiles'

export function estimateTokenCountFromBytes(
  byteSize: number,
  profile: TokenProfile = getTokenProfile(undefined),
  fileName?: string,
): number {
  return estimateTokensFromBytes(byteSize, profile, fileName)
}

export function formatTreeTokenCount(tokenCount: number): string {
  const normalizedCount = Math.max(0, Math.round(tokenCount))
  const prefix = '~'

  if (normalizedCount >= 1_000_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000_000)}m`
  }

  if (normalizedCount >= 1_000) {
    return `${prefix}${formatCompactNumber(normalizedCount / 1_000)}k`
  }

  return `${prefix}${normalizedCount}`
}

function formatCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
