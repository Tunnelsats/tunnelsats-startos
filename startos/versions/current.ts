import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.4.0:5',
  releaseNotes: {
    en_US:
      'Adds dual inbound gateway markers (# StartTunnel and # inbound: yes), documents full setup flow with Peer Interface firewall activation, Outbound Gateway policy routing for full egress privacy, multi-node port 9735 allocation, and enhanced WAN ingress diagnostics.',
    es_ES:
      'Añade marcadores de puerta de enlace dual (# StartTunnel e # inbound: yes), documenta el flujo de configuración con activación de firewall en Interfaz de Pares, enrutamiento de puerta de enlace de salida para privacidad total de egreso, asignación del puerto 9735 y diagnósticos WAN mejorados.',
    de_DE:
      'Fügt duale Inbound-Gateway-Marker (# StartTunnel und # inbound: yes) hinzu, dokumentiert den vollständigen Einrichtungsablauf inkl. Peer-Interface-Firewall-Aktivierung, Outbound-Gateway-Routing für vollständigen Egress-Datenschutz, Multi-Node-Port-9735-Zuweisung und erweiterte WAN-Ingress-Diagnose.',
    pl_PL:
      'Dodaje podwójne znaczniki bramki wejściowej (# StartTunnel i # inbound: yes), dokumentuje pełny proces konfiguracji z przełącznikiem zapory Interfejsu Peerów, routing bramki wyjściowej dla pełnej prywatności egress, alokację portu 9735 i ulepszoną diagnostykę WAN.',
    fr_FR:
      'Ajoute les marqueurs de passerelle entrants doubles (# StartTunnel et # inbound: yes), documente le flux de configuration complet avec pare-feu de l’Interface Peer, routage de passerelle sortante pour une confidentialité totale du trafic sortant, allocation du port 9735 et diagnostics WAN améliorés.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
