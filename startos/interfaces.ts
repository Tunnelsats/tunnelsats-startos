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

  return receipts
})
