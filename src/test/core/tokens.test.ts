import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { estimateTokenCountFromBytes, formatTreeTokenCount } from '../../core/tokens/TokenEstimator'
import {
  estimateTokensFromText,
  formatTokenCost,
  getTokenProfile,
} from '../../core/tokens/TokenProfiles'

test('tree token helpers estimate and format compact labels', () => {
  assert.equal(estimateTokenCountFromBytes(0), 0)
  assert.equal(estimateTokenCountFromBytes(1), 1)
  assert.equal(estimateTokenCountFromBytes(16), 5)
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile('claude'), 'shape.ts'),
    326_395,
  )
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile('openai'), 'shape.ts'),
    305_262,
  )
  assert.equal(estimateTokenCountFromBytes(67_469, getTokenProfile('gemini'), 'shape.dat'), 60_241)
  assert.equal(
    estimateTokenCountFromBytes(1_272_939, getTokenProfile('gemini'), 'shape.ts'),
    370_041,
  )
  assert.equal(formatTreeTokenCount(842), '~842')
  assert.equal(formatTreeTokenCount(1800), '~1.8k')
  assert.equal(formatTreeTokenCount(1200000), '~1.2m')
})

test('token profiles estimate calibrated sample counts and input costs', () => {
  const numericText = '1234.5678 -9012.3456\n'.repeat(3_300).slice(0, 67_469)
  const lupinumSourceContextChars = 'x'.repeat(1_272_939)

  assert.equal(estimateTokensFromText(numericText, getTokenProfile('claude')), 40_401)
  assert.equal(estimateTokensFromText(numericText, getTokenProfile('openai')), 37_693)
  assert.equal(estimateTokensFromText(numericText, getTokenProfile('gemini')), 60_241)
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile('claude')),
    326_395,
  )
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile('openai')),
    305_262,
  )
  assert.equal(
    estimateTokensFromText(lupinumSourceContextChars, getTokenProfile('gemini')),
    370_041,
  )

  assert.equal(formatTokenCost(40_406, getTokenProfile('claude')), '$0.6061')
  assert.equal(formatTokenCost(370_041, getTokenProfile('gemini')), '$0.1110')
})
