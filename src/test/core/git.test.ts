import assert from 'node:assert/strict'
import { test } from 'vite-plus/test'
import { GitSelection } from '../../core/git/GitSelection'
import type { GitCommit } from '../../core/git/GitTypes'

test('GitSelection keeps selected commits as derived state', () => {
  const selection = new GitSelection()
  const commits = [commit('a1', 'First'), commit('b2', 'Second'), commit('c3', 'Third')]

  selection.setCommits(commits)
  selection.selectLatest(2)

  assert.deepEqual(
    selection.getSnapshot().selectedCommits.map((selected) => selected.shortHash),
    ['a1', 'b2'],
  )
})

test('GitSelection drops selected commits that disappear after refresh', () => {
  const selection = new GitSelection()
  selection.setCommits([commit('a1', 'First'), commit('b2', 'Second')])
  selection.setCommitSelected('b2', true)

  selection.setCommits([commit('a1', 'First')])

  assert.deepEqual(selection.getSnapshot().selectedCommitIds, [])
})

function commit(hash: string, subject: string): GitCommit {
  return {
    id: `demo:${hash}`,
    workspaceId: 'demo',
    workspaceName: 'demo',
    rootPath: '/repo/demo',
    hash,
    shortHash: hash,
    authorName: 'Ada',
    authorDate: '2026-05-16T10:00:00.000Z',
    subject,
  }
}
