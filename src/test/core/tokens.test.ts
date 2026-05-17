import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import {
  estimateTokenCountFromBytes,
  estimateTokenCountFromTextLength,
  formatEstimatedTokenCount,
  formatTokenCost,
  getTokenEstimateProfile,
} from '../../core/tokens/TokenEstimateProfiles'

test('tree token helpers estimate and format compact labels', () => {
  assert.equal(estimateTokenCountFromBytes(0), 0)
  assert.equal(estimateTokenCountFromBytes(1), 1)
  assert.equal(estimateTokenCountFromBytes(16), 5)
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenEstimateProfile('claude'), 'shape.ts'),
    326_395,
  )
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenEstimateProfile('openai'), 'shape.ts'),
    305_262,
  )
  assert.equal(
    estimateTokenCountFromBytes(67_469, getTokenEstimateProfile('gemini'), 'shape.dat'),
    60_241,
  )
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenEstimateProfile('gemini'), 'shape.ts'),
    370_041,
  )
  assert.equal(formatEstimatedTokenCount(842), '~842')
  assert.equal(formatEstimatedTokenCount(1800), '~1.8k')
  assert.equal(formatEstimatedTokenCount(1200000), '~1.2m')
})

test('token profiles estimate calibrated sample counts and input costs', () => {
  const numericText = '1234.5678 -9012.3456\n'.repeat(3_300).slice(0, 67_469)
  const lupinumSourceContextChars = 'x'.repeat(1_272_939)

  assert.equal(
    estimateTokenCountFromTextLength(numericText, getTokenEstimateProfile('claude')),
    40_401,
  )
  assert.equal(
    estimateTokenCountFromTextLength(numericText, getTokenEstimateProfile('openai')),
    37_693,
  )
  assert.equal(
    estimateTokenCountFromTextLength(numericText, getTokenEstimateProfile('gemini')),
    60_241,
  )
  assert.equal(
    estimateTokenCountFromTextLength(lupinumSourceContextChars, getTokenEstimateProfile('claude')),
    326_395,
  )
  assert.equal(
    estimateTokenCountFromTextLength(lupinumSourceContextChars, getTokenEstimateProfile('openai')),
    305_262,
  )
  assert.equal(
    estimateTokenCountFromTextLength(lupinumSourceContextChars, getTokenEstimateProfile('gemini')),
    370_041,
  )

  assert.equal(formatTokenCost(40_406, getTokenEstimateProfile('claude')), '$0.6061')
  assert.equal(formatTokenCost(370_041, getTokenEstimateProfile('gemini')), '$0.1110')
})
