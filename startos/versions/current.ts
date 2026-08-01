import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:1',
  releaseNotes: {
    en_US:
      'Adds 1-Click UI Tasks to advertise TunnelSats endpoints on LND and Core Lightning, implements dynamic reactive dependency resolution, and updates documentation for StartOS 0.4.0+.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
