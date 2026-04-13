import {
  countTokens,
  encode,
  setMergeCacheSize,
} from "gpt-tokenizer";
import type { ChatMessage } from "gpt-tokenizer/GptEncoding";

const TOKENIZER_MERGE_CACHE_SIZE = 100_000;

let tokenizerCacheConfigured = false;

export function configureTokenizerCache(): void {
  if (tokenizerCacheConfigured) {
    return;
  }

  setMergeCacheSize(TOKENIZER_MERGE_CACHE_SIZE);
  tokenizerCacheConfigured = true;
}

export function countTextTokens(text: string): number {
  configureTokenizerCache();
  return countTokens(text);
}

export function countChatTokens(messages: ChatMessage[]): number {
  configureTokenizerCache();
  return countTokens(messages);
}

export function countTextTokensLegacy(text: string): number {
  configureTokenizerCache();
  return encode(text).length;
}
