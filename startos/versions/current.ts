import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:3',
  releaseNotes: {
    en_US:
      'Overhauls diagnostics tool (verify.sh) with live target reachability and egress checks, adds dedicated FAQ Q10 with interactive CLI verification recipes, and syncs StartOS 0.4.0 native gateway architecture documentation.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
