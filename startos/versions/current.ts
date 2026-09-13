import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:5',
  releaseNotes: {
    en_US:
      'Adds dual inbound gateway markers (# StartTunnel and # inbound: yes), documents 3-step setup flow with Peer Interface firewall guidance and StartOS port check resolution, clarifies multi-node port 9735 allocation, and enhances WAN ingress diagnostics.',
    es_ES:
      'Añade marcadores de puerta de enlace dual (# StartTunnel e # inbound: yes), documenta el flujo de configuración de 3 pasos con activación de firewall en Interfaz de Pares y resolución de verificación de puertos, aclara la asignación del puerto 9735 y mejora el diagnóstico WAN.',
    de_DE:
      'Fügt duale Inbound-Gateway-Marker (# StartTunnel und # inbound: yes) hinzu, dokumentiert den 3-Schritte-Einrichtungsablauf inkl. Peer-Interface-Firewall-Aktivierung und Port-Check-Hinweisen, klärt die Multi-Node-Port-9735-Zuweisung und erweitert die WAN-Ingress-Diagnose.',
    pl_PL:
      'Dodaje podwójne znaczniki bramki wejściowej (# StartTunnel i # inbound: yes), dokumentuje 3-etapowy proces konfiguracji z przełącznikiem zapory Interfejsu Peerów i wskazówkami dotyczącymi testu portów, wyjaśnia alokację portu 9735 i ulepsza diagnostykę WAN.',
    fr_FR:
      'Ajoute les marqueurs de passerelle entrants doubles (# StartTunnel et # inbound: yes), documente le flux de configuration en 3 étapes avec le basculement du pare-feu de l’Interface Peer et les indications de test de port, clarifie l’allocation du port 9735 et améliore le diagnostic WAN.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
