import test from 'node:test'
import assert from 'node:assert/strict'
import { getAnnounceEndpoint } from '../startos/dependencies'

test('getAnnounceEndpoint parses host and VPNPort correctly', () => {
  const conf = `[Interface]
PrivateKey = secret
Address = 10.0.0.1/32
# VPNPort: 24556

[Peer]
PublicKey = pubkey
Endpoint = ch1.tunnelsats.com:51820
`
  assert.equal(getAnnounceEndpoint(conf), 'ch1.tunnelsats.com:24556')
})

test('getAnnounceEndpoint handles Port Forwarding comment variation', () => {
  const conf = `[Interface]
PrivateKey = secret
Address = 10.0.0.1/32
# Port Forwarding: 12345

[Peer]
PublicKey = pubkey
Endpoint = 1.2.3.4:51820
`
  assert.equal(getAnnounceEndpoint(conf), '1.2.3.4:12345')
})

test('getAnnounceEndpoint returns null for missing or invalid inputs', () => {
  assert.equal(getAnnounceEndpoint(null), null)
  assert.equal(getAnnounceEndpoint(''), null)
  assert.equal(
    getAnnounceEndpoint(`[Interface]\nPrivateKey = secret\n[Peer]\nEndpoint = ch1.tunnelsats.com:51820`),
    null,
  )
})

test('getAnnounceEndpoint rejects IPv6 endpoints', () => {
  const conf = `[Interface]
PrivateKey = secret
Address = fd00::1/128
# VPNPort: 24556

[Peer]
PublicKey = pubkey
Endpoint = [2001:db8::1]:51820
`
  assert.equal(getAnnounceEndpoint(conf), null)
})
