import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:4',
  releaseNotes: {
    en_US:
      'Adds automated # inbound: yes marker injection for native StartOS gateway auto-classification (Start9 PR #3893), updates setup instructions, and refactors configuration handling.',
    es_ES:
      'Añade inyección automática del marcador # inbound: yes para la autoclasificación de pasarelas en StartOS (Start9 PR #3893), actualiza las instrucciones y optimiza la configuración.',
    de_DE:
      'Fügt automatische # inbound: yes Marker-Injektion für die StartOS-Gateway-Autoklassifizierung hinzu (Start9 PR #3893), aktualisiert Einrichtungsanweisungen und optimiert die Konfiguration.',
    pl_PL:
      'Dodaje automatyczne wstrzykiwanie znacznika # inbound: yes do automatycznej klasyfikacji bramki StartOS (Start9 PR #3893), aktualizuje instrukcje i usprawnia konfigurację.',
    fr_FR:
      'Ajoute l’injection automatique du marqueur # inbound: yes pour l’auto-classification de la passerelle StartOS (Start9 PR #3893), met à jour les instructions et optimise la configuration.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
