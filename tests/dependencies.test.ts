import test from 'node:test'
import assert from 'node:assert/strict'
import { getDependenciesForConfig } from '../startos/dependencies'

test('getDependenciesForConfig returns empty object when disabled or unconfigured', () => {
  assert.deepEqual(getDependenciesForConfig(null), {})
  assert.deepEqual(getDependenciesForConfig({ enabled: false }), {})
  assert.deepEqual(getDependenciesForConfig({ enabled: false, 'target-node': 'cln' }), {})
  assert.deepEqual(getDependenciesForConfig({ enabled: false, 'target-node': 'lnd' }), {})
})

test('getDependenciesForConfig returns LND dependency when enabled and target-node is lnd', () => {
  const res = getDependenciesForConfig({ enabled: true, 'target-node': 'lnd' })
  assert.deepEqual(res, {
    lnd: {
      kind: 'running',
      versionRange: '>=0.15.5:0',
      healthChecks: ['lnd'],
    },
  })
})

test('getDependenciesForConfig returns c-lightning dependency when enabled and target-node is cln', () => {
  const res = getDependenciesForConfig({ enabled: true, 'target-node': 'cln' })
  assert.deepEqual(res, {
    'c-lightning': {
      kind: 'running',
      versionRange: '>=23.2.2:0',
      healthChecks: ['lightningd'],
    },
  })
})
