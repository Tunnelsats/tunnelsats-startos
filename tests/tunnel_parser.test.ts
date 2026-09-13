import test from "node:test"
import assert from "node:assert/strict"
import { validateWireguardConfig, parseWireguardTunnelInfo, ensureInboundMarker } from "../startos/utils"

test("validateWireguardConfig accepts valid WireGuard configuration", () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
AllowedIPs = 0.0.0.0/0
`
  const result = validateWireguardConfig(conf)
  assert.equal(result.valid, true)
  assert.equal(result.error, undefined)
})

test("validateWireguardConfig rejects missing PrivateKey", () => {
  const conf = `[Interface]
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const result = validateWireguardConfig(conf)
  assert.equal(result.valid, false)
  assert.match(result.error || "", /PrivateKey/i)
})

test("validateWireguardConfig rejects missing Address", () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const result = validateWireguardConfig(conf)
  assert.equal(result.valid, false)
  assert.match(result.error || "", /Address/i)
})

test("validateWireguardConfig rejects missing Endpoint", () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
`
  const result = validateWireguardConfig(conf)
  assert.equal(result.valid, false)
  assert.match(result.error || "", /Endpoint/i)
})

test("validateWireguardConfig rejects missing port forwarding metadata", () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const result = validateWireguardConfig(conf)
  assert.equal(result.valid, false)
  assert.match(result.error || "", /port/i)
})

test("parseWireguardTunnelInfo extracts metadata accurately", () => {
  const conf = `[Interface]
# Server: ch1.tunnelsats.com
# Port Forwarding: 24556
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
AllowedIPs = 0.0.0.0/0
`
  const info = parseWireguardTunnelInfo(conf)
  assert.equal(info.address, "10.9.0.102/32")
  assert.equal(info.endpoint, "ch1.tunnelsats.com:51820")
  assert.equal(info.serverDomain, "ch1.tunnelsats.com")
  assert.equal(info.vpnPort, 24556)
  assert.equal(info.publicKey, "DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=")
})

test("parseWireguardTunnelInfo extracts bracketed and raw IPv6 serverDomain when server comment missing", () => {
  const confBracketed = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = fd00::1/128
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = [2001:db8::1]:51820
`
  const confRaw = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = fd00::1/128
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = 2001:db8::1:51820
`
  const infoBracketed = parseWireguardTunnelInfo(confBracketed)
  const infoRaw = parseWireguardTunnelInfo(confRaw)
  assert.equal(infoBracketed.serverDomain, "2001:db8::1")
  assert.equal(infoRaw.serverDomain, "2001:db8::1")
})

test("ensureInboundMarker injects both # StartTunnel and # inbound: yes under [Interface] when missing", () => {
  const conf = `[Interface]
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const updated = ensureInboundMarker(conf)
  assert.match(updated, /\[Interface\]\r?\n# StartTunnel\r?\n# inbound: yes/i)
  assert.equal(updated.split(/# StartTunnel/gi).length - 1, 1)
  assert.equal(updated.split(/# inbound: yes/gi).length - 1, 1)
})

test("ensureInboundMarker preserves both existing markers without duplicating", () => {
  const conf = `[Interface]
# StartTunnel
# inbound: yes
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556

[Peer]
PublicKey = DUMMY_TEST_PUBLIC_KEY_FOR_TESTING_123456=
Endpoint = ch1.tunnelsats.com:51820
`
  const updated = ensureInboundMarker(conf)
  assert.equal(updated, conf)
})

test("ensureInboundMarker injects # StartTunnel when incidental starttunnel text is present elsewhere", () => {
  const conf = `[Interface]
# inbound: yes
# Comment: this is a starttunnel note
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
`
  const updated = ensureInboundMarker(conf)
  const lines = updated.split(/\r?\n/).map((l) => l.trim().toLowerCase())
  assert.ok(lines.includes("# starttunnel"))
  assert.ok(lines.includes("# inbound: yes"))
})

test("ensureInboundMarker injects missing # StartTunnel when only # inbound: yes is present", () => {
  const conf = `[Interface]
# inbound: yes
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
`
  const updated = ensureInboundMarker(conf)
  assert.match(updated, /# StartTunnel/i)
  assert.match(updated, /# inbound: yes/i)
  assert.equal(updated.split(/# inbound: yes/gi).length - 1, 1)
  assert.equal(updated.split(/# StartTunnel/gi).length - 1, 1)
})

test("ensureInboundMarker injects missing # inbound: yes when only # StartTunnel is present", () => {
  const conf = `[Interface]
# StartTunnel
PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
`
  const updated = ensureInboundMarker(conf)
  assert.match(updated, /# StartTunnel/i)
  assert.match(updated, /# inbound: yes/i)
  assert.equal(updated.split(/# StartTunnel/gi).length - 1, 1)
  assert.equal(updated.split(/# inbound: yes/gi).length - 1, 1)
})

test("ensureInboundMarker prepends both markers if [Interface] header is absent", () => {
  const conf = `PrivateKey = DUMMY_TEST_PRIVATE_KEY_FOR_TESTING_123456=
Address = 10.9.0.102/32
# VPNPort: 24556
`
  const updated = ensureInboundMarker(conf)
  assert.ok(updated.startsWith("# StartTunnel\n# inbound: yes\n"))
})

test("ensureInboundMarker handles empty or whitespace input gracefully", () => {
  assert.equal(ensureInboundMarker(""), "")
  assert.equal(ensureInboundMarker("   "), "   ")
})
