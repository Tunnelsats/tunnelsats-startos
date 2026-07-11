import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.3.0:0',
  releaseNotes: {
    en_US:
      "Fixes StartOS status page configuration loop ('Needs Config') via dynamic dependency tracking; adds multiple resolution browser favicons; ports GitHub issue templates.",
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
