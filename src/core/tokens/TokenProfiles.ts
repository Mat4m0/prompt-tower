export type TokenProfileId = 'claude' | 'openai' | 'gemini'

export interface TokenProfile {
  id: TokenProfileId
  label: string
  charsPerToken: number
  numericCharsPerToken?: number
  inputPricePerMTok: number
}

export const DEFAULT_TOKEN_PROFILE_ID: TokenProfileId = 'claude'

export const TOKEN_PROFILES: readonly TokenProfile[] = [
  {
    id: 'claude',
    label: 'Claude',
    charsPerToken: 3.9,
    numericCharsPerToken: 1.67,
    inputPricePerMTok: 15,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    charsPerToken: 4.17,
    numericCharsPerToken: 1.79,
    inputPricePerMTok: 2.5,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    charsPerToken: 3.44,
    numericCharsPerToken: 1.12,
    inputPricePerMTok: 0.3,
  },
]

export function getTokenProfile(profileId: string | undefined): TokenProfile {
  return TOKEN_PROFILES.find((profile) => profile.id === profileId) ?? TOKEN_PROFILES[0]
}

export function isTokenProfileId(value: string): value is TokenProfileId {
  return TOKEN_PROFILES.some((profile) => profile.id === value)
}

export function estimateTokensFromText(text: string, profile: TokenProfile): number {
  return estimateTokensFromLength(text.length, profile, getTextCharsPerToken(text, profile))
}

export function estimateTokensFromBytes(
  bytes: number,
  profile: TokenProfile,
  fileName?: string,
): number {
  return estimateTokensFromLength(bytes, profile, getFileCharsPerToken(fileName, profile))
}

export function estimateTokenCost(tokens: number, profile: TokenProfile): number {
  return (tokens / 1_000_000) * profile.inputPricePerMTok
}

export function formatTokenCost(tokens: number, profile: TokenProfile): string {
  const cost = estimateTokenCost(tokens, profile)
  if (cost === 0) {
    return '$0.00'
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(5)}`
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

function estimateTokensFromLength(
  length: number,
  profile: TokenProfile,
  charsPerToken: number,
): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 0
  }

  return Math.ceil(length / charsPerToken)
}

function getTextCharsPerToken(text: string, profile: TokenProfile): number {
  if (profile.numericCharsPerToken === undefined) {
    return profile.charsPerToken
  }

  return isNumericHeavyText(text) ? profile.numericCharsPerToken : profile.charsPerToken
}

function getFileCharsPerToken(fileName: string | undefined, profile: TokenProfile): number {
  if (
    profile.numericCharsPerToken !== undefined &&
    fileName !== undefined &&
    /\.(dat|csv|tsv)$/i.test(fileName)
  ) {
    return profile.numericCharsPerToken
  }

  return profile.charsPerToken
}

function isNumericHeavyText(text: string): boolean {
  const sample = text.length > 20_000 ? text.slice(0, 20_000) : text
  if (sample.length === 0) {
    return false
  }

  let numericLikeChars = 0
  let digitChars = 0
  let alphaChars = 0

  for (let index = 0; index < sample.length; index++) {
    const char = sample.charCodeAt(index)
    if (char >= 48 && char <= 57) {
      digitChars += 1
      numericLikeChars += 1
      continue
    }

    if (
      char === 10 ||
      char === 13 ||
      char === 32 ||
      char === 9 ||
      char === 43 ||
      char === 45 ||
      char === 46 ||
      char === 69 ||
      char === 101
    ) {
      numericLikeChars += 1
      continue
    }

    if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122)) {
      alphaChars += 1
    }
  }

  return (
    digitChars / sample.length >= 0.25 &&
    numericLikeChars / sample.length >= 0.85 &&
    alphaChars / sample.length <= 0.1
  )
}
