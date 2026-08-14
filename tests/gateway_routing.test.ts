import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTargetGatewayConfig,
  getGatewayTaskDetails,
} from '../startos/dependencies'

test('getTargetGatewayConfig returns null when disabled or unconfigured', () => {
  assert.equal(getTargetGatewayConfig(null), null)
  assert.equal(getTargetGatewayConfig({ enabled: false }), null)
  assert.equal(
    getTargetGatewayConfig({ enabled: false, 'target-node': 'lnd' }),
    null,
  )
})

test('getTargetGatewayConfig returns LND target and cleans up c-lightning when target is lnd', () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const result = getTargetGatewayConfig({
    enabled: true,
    'target-node': 'lnd',
    'tunnelsats-conf': conf,
  })

  assert.deepEqual(result, {
    targetPackage: 'lnd',
    clearPackage: 'c-lightning',
    gatewayName: 'tunnelsats',
    announceEndpoint: 'ch1.tunnelsats.com:24556',
  })
})

test('getTargetGatewayConfig returns c-lightning target and cleans up lnd when target is cln', () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const result = getTargetGatewayConfig({
    enabled: true,
    'target-node': 'cln',
    'tunnelsats-conf': conf,
  })

  assert.deepEqual(result, {
    targetPackage: 'c-lightning',
    clearPackage: 'lnd',
    gatewayName: 'tunnelsats',
    announceEndpoint: 'ch1.tunnelsats.com:24556',
  })
})

test('getGatewayTaskDetails provides clear reasons and target actions', () => {
  const lndDetails = getGatewayTaskDetails('lnd', 'ch1.tunnelsats.com:24556')
  assert.equal(lndDetails.targetPackage, 'lnd')
  assert.equal(lndDetails.clearTaskKey, 'c-lightning:config')
  assert.match(lndDetails.reason, /Advertise TunnelSats VPN endpoint/i)

  const clnDetails = getGatewayTaskDetails(
    'c-lightning',
    'ch1.tunnelsats.com:24556',
  )
  assert.equal(clnDetails.targetPackage, 'c-lightning')
  assert.equal(clnDetails.clearTaskKey, 'lnd:custom-external-host-config')
  assert.match(clnDetails.reason, /Advertise TunnelSats VPN endpoint/i)
})
