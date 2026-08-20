import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:3',
  releaseNotes: {
    en_US:
      'Implements StartOS 0.4.0 native WireGuard gateway integration, automated subscription expiration tasks, honest subscription health checks, and standardized Start9 package conformance.',
    es_ES:
      'Implementa la integración nativa de puerta de enlace WireGuard de StartOS 0.4.0, tareas automatizadas de caducidad de suscripción, comprobaciones de estado de suscripción y conformidad estandarizada con Start9.',
    de_DE:
      'Implementiert die native StartOS 0.4.0 WireGuard-Gateway-Integration, automatisierte Aufgaben zum Ablauf des Abonnements, ehrliche Abonnement-Integritätsprüfungen und standardisierte Start9-Paketkonformität.',
    pl_PL:
      'Wdraża natywną integrację bramki WireGuard w StartOS 0.4.0, automatyczne zadania wygaśnięcia subskrypcji, rzetelne sprawdzanie stanu subskrypcji oraz standaryzowaną zgodność pakietu Start9.',
    fr_FR:
      'Implémente l’intégration native de la passerelle WireGuard StartOS 0.4.0, les tâches automatisées d’expiration d’abonnement, les contrôles d’état d’abonnement et la conformité standardisée des packages Start9.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
