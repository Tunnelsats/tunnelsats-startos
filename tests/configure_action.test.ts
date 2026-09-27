import test from 'node:test'
import assert from 'node:assert/strict'
import { configure } from '../startos/actions/configure'
import { configJson } from '../startos/fileModels/config.json'
import { tunnelsatsConf } from '../startos/fileModels/tunnelsatsConf'
import { getTargetVpnConfig } from '../startos/dependencies'
import { buildOnTaskInput } from '../startos/vpnHandoff'

const CLEAN_CONF = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`

// A config stored by an earlier version, which injected the classification
// markers of the retired StartOS gateway model.
const LEGACY_MARKED_CONF = `[Interface]
# StartTunnel
# inbound: yes
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`

/** Runs the production Configure handler with the file writes captured. */
async function runConfigure(conf: string) {
  const origMerge = configJson.merge
  const origWrite = tunnelsatsConf.write
  let merged: any = null
  let written: string | null = null
  configJson.merge = (async (_effects: unknown, data: unknown) => {
    merged = data
  }) as any
  tunnelsatsConf.write = (async (_effects: unknown, data: string) => {
    written = data
  }) as any
  try {
    const response = await (configure as any).runFn({
      effects: {},
      input: {
        enabled: true,
        'target-node': 'lnd',
        'tunnelsats-conf': conf,
        'allow-ipv6': false,
      },
    })
    return { response, merged, written }
  } finally {
    configJson.merge = origMerge
    tunnelsatsConf.write = origWrite
  }
}

test('Configure stores a pasted config without gateway markers', async () => {
  const { response, merged, written } = await runConfigure(CLEAN_CONF)
  assert.equal(merged['tunnelsats-conf'], CLEAN_CONF)
  assert.equal(written, CLEAN_CONF)
  assert.equal(response.result.value, CLEAN_CONF)
  for (const stored of [merged['tunnelsats-conf'], written]) {
    assert.doesNotMatch(stored, /# StartTunnel/i)
    assert.doesNotMatch(stored, /# inbound: yes/i)
  }
})

test('Configure passes an already-marked stored config through byte-identical', async () => {
  // Stripping the markers would change the string the node task accepts
  // and re-raise the clearnet-vpn task on every upgraded box.
  const { merged, written } = await runConfigure(LEGACY_MARKED_CONF)
  assert.equal(merged['tunnelsats-conf'], LEGACY_MARKED_CONF)
  assert.equal(written, LEGACY_MARKED_CONF)
})

test('the node task accepts an already-marked stored config byte-identical', () => {
  const vpn = getTargetVpnConfig({
    enabled: true,
    'target-node': 'lnd',
    'tunnelsats-conf': LEGACY_MARKED_CONF,
  })
  assert.ok(vpn)
  assert.equal(vpn.wgConf, LEGACY_MARKED_CONF)
  const input = buildOnTaskInput(vpn.wgConf, vpn.announceEndpoint!)
  assert.deepEqual(input.accept, [
    { config: LEGACY_MARKED_CONF, announce: 'ch1.tunnelsats.com:24556' },
  ])
})
