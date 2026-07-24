import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:0',
  releaseNotes: {
    en_US:
      'Initial release for StartOS 0.4.0+. Migrated package architecture to StartOS TypeScript SDK with reactive configuration, container isolation, and automated diagnostic tools.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
