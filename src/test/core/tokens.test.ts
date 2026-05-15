import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import {
  estimateTokenCountFromBytes,
  formatTreeTokenCount,
  recomputeTreeTokenCounts,
  updateLeafTreeTokenCounts,
  type TreeTokenNode,
} from '../../core/tokens/TokenEstimator'
import {
  estimateTokensFromText,
  formatTokenCost,
  getTokenProfile,
} from '../../core/tokens/TokenProfiles'

interface TestTreeTokenNode extends TreeTokenNode<TestTreeTokenNode> {
  name: string
}

function createTokenNode(
  name: string,
  estimatedTokenCount: number,
  exactTokenCount?: number,
): TestTreeTokenNode {
  return {
    name,
    estimatedTokenCount,
    exactTokenCount,
    displayTokenCount: 0,
    tokenCountStatus: 'estimated',
  }
}

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
  assert.equal(formatTreeTokenCount(842, 'estimated'), '~842')
  assert.equal(formatTreeTokenCount(842, 'exact'), '842')
  assert.equal(formatTreeTokenCount(1800, 'estimated'), '~1.8k')
  assert.equal(formatTreeTokenCount(1200000, 'estimated'), '~1.2m')
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

test('tree token aggregation sums nested folders and marks mixed counts estimated', () => {
  const exactFile = createTokenNode('exact.ts', 40, 25)
  const estimatedFile = createTokenNode('estimated.ts', 80)
  const folder: TestTreeTokenNode = {
    name: 'src',
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: 'estimated',
    children: [exactFile, estimatedFile],
  }
  const root: TestTreeTokenNode = {
    name: 'root',
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: 'estimated',
    children: [folder],
  }
  exactFile.parent = folder
  estimatedFile.parent = folder
  folder.parent = root

  recomputeTreeTokenCounts(root)

  assert.equal(folder.estimatedTokenCount, 120)
  assert.equal(folder.displayTokenCount, 105)
  assert.equal(folder.tokenCountStatus, 'estimated')
  assert.equal(root.displayTokenCount, 105)
  assert.equal(root.tokenCountStatus, 'estimated')
})

test('tree token exact replacement updates ancestor totals by delta', () => {
  const file = createTokenNode('file.ts', 100)
  const folder: TestTreeTokenNode = {
    name: 'src',
    estimatedTokenCount: 0,
    displayTokenCount: 0,
    tokenCountStatus: 'estimated',
    children: [file],
  }
  file.parent = folder
  recomputeTreeTokenCounts(folder)

  updateLeafTreeTokenCounts(file, { exactTokenCount: 70 })

  assert.equal(file.displayTokenCount, 70)
  assert.equal(file.tokenCountStatus, 'exact')
  assert.equal(folder.estimatedTokenCount, 100)
  assert.equal(folder.displayTokenCount, 70)
  assert.equal(folder.tokenCountStatus, 'exact')

  updateLeafTreeTokenCounts(file, {
    estimatedTokenCount: 120,
    exactTokenCount: undefined,
  })

  assert.equal(file.displayTokenCount, 120)
  assert.equal(file.tokenCountStatus, 'estimated')
  assert.equal(folder.estimatedTokenCount, 120)
  assert.equal(folder.displayTokenCount, 120)
  assert.equal(folder.tokenCountStatus, 'estimated')
})
