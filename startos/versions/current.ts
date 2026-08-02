import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:2',
  releaseNotes: {
    en_US:
      'Adds IPv6 guardrails and opt-in coexistence setting, 1-Click UI Tasks for LND and Core Lightning, reactive dependency resolution, and dashboard privacy warnings.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
