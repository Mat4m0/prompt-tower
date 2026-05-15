export type TokenProfileId =
  | "claude"
  | "openai"
  | "gemini";

export interface TokenProfile {
  id: TokenProfileId;
  label: string;
  charsPerToken: number;
  inputPricePerMTok: number;
}

export const DEFAULT_TOKEN_PROFILE_ID: TokenProfileId = "claude";

export const TOKEN_PROFILES: readonly TokenProfile[] = [
  {
    id: "claude",
    label: "Claude",
    charsPerToken: 1.67,
    inputPricePerMTok: 15,
  },
  {
    id: "openai",
    label: "OpenAI",
    charsPerToken: 1.79,
    inputPricePerMTok: 2.5,
  },
  {
    id: "gemini",
    label: "Gemini",
    charsPerToken: 1.12,
    inputPricePerMTok: 0.3,
  },
];

export function getTokenProfile(profileId: string | undefined): TokenProfile {
  return (
    TOKEN_PROFILES.find((profile) => profile.id === profileId) ??
    TOKEN_PROFILES[0]
  );
}

export function isTokenProfileId(value: string): value is TokenProfileId {
  return TOKEN_PROFILES.some((profile) => profile.id === value);
}

export function estimateTokensFromText(
  text: string,
  profile: TokenProfile
): number {
  return estimateTokensFromLength(text.length, profile);
}

export function estimateTokensFromBytes(
  bytes: number,
  profile: TokenProfile
): number {
  return estimateTokensFromLength(bytes, profile);
}

export function estimateTokenCost(tokens: number, profile: TokenProfile): number {
  return (tokens / 1_000_000) * profile.inputPricePerMTok;
}

export function formatTokenCost(tokens: number, profile: TokenProfile): string {
  const cost = estimateTokenCost(tokens, profile);
  if (cost === 0) {
    return "$0.00";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(5)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function estimateTokensFromLength(length: number, profile: TokenProfile): number {
  if (!Number.isFinite(length) || length <= 0) {
    return 0;
  }

  return Math.ceil(length / profile.charsPerToken);
}
