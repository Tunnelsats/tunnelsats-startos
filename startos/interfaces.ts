import { sdk } from './sdk'
import { i18n } from './i18n'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  // Web Dashboard (HTTP on port 80)
  const uiMulti = sdk.MultiHost.of(effects, 'web')
  const uiOrigin = await uiMulti.bindPort(80, {
    protocol: 'http',
    preferredExternalPort: 80,
  })
  const ui = sdk.createInterface(effects, {
    name: i18n('Web Dashboard'),
    id: 'ui',
    description: i18n(
      'TunnelSats Web Dashboard, connection properties, and setup instructions.',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await uiOrigin.export([ui]))

  // SOCKS5 Proxy (Raw TCP on port 1080)
  const socksMulti = sdk.MultiHost.of(effects, 'socks')
  const socksOrigin = await socksMulti.bindPort(1080, {
    protocol: null,
    preferredExternalPort: 1080,
    addSsl: null,
    secure: { ssl: false },
  })
  const socks = sdk.createInterface(effects, {
    name: i18n('SOCKS5 Proxy'),
    id: 'main',
    description: i18n(
      'Internal SOCKS5 proxy interface for Lightning Node routing.',
    ),
    type: 'p2p',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await socksOrigin.export([socks]))

  return receipts
})
