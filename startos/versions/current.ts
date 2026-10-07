import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.0.1:0',
  releaseNotes: {
    en_US:
      "Fixes the Pay Invoice task not showing on your Lightning node for a first purchase on StartOS 0.4.0.2: while a Buy, Renew or Reset Bandwidth payment is pending, the paying node is now declared as a dependency, which StartOS requires to show the task. The node's VPN activation task now clears once you accept it; one left over from 1.0.0 clears by itself after the update. The instructions now explain uninstalling (export your WireGuard configuration first; the tunnel keeps running in your Lightning node) and correct the dashboard description: it can also start Buy, Renew and Reset Bandwidth requests.",
    es_ES:
      'Corrige que la tarea Pay Invoice no apareciera en tu nodo Lightning en una primera compra en StartOS 0.4.0.2: mientras un pago de Comprar, Renovar o Restablecer ancho de banda está pendiente, el nodo que paga se declara ahora como dependencia, algo que StartOS exige para mostrar la tarea. La tarea del nodo para activar el túnel VPN ahora desaparece en cuanto la aceptas; si quedó una de la 1.0.0, desaparece sola tras la actualización. Las instrucciones explican ahora la desinstalación (exporta antes tu configuración de WireGuard; el túnel sigue funcionando en tu nodo Lightning) y corrigen la descripción del panel: también puede iniciar solicitudes de Comprar, Renovar y Restablecer ancho de banda.',
    de_DE:
      'Behebt, dass die Pay-Invoice-Aufgabe bei einem Erstkauf unter StartOS 0.4.0.2 nicht auf Ihrem Lightning-Knoten erschien: Solange eine Zahlung für Kauf, Verlängerung oder Bandbreiten-Reset aussteht, wird der zahlende Knoten jetzt als Abhängigkeit deklariert, was StartOS zum Anzeigen der Aufgabe voraussetzt. Die Aufgabe des Knotens zum Aktivieren des VPN-Tunnels verschwindet jetzt, sobald Sie sie annehmen; eine aus 1.0.0 verbliebene verschwindet nach dem Update von selbst. Die Anleitung erklärt jetzt die Deinstallation (zuerst die WireGuard-Konfiguration exportieren; der Tunnel läuft in Ihrem Lightning-Knoten weiter) und korrigiert die Beschreibung des Dashboards: Es kann auch Kauf, Verlängerung und Bandbreiten-Reset anstoßen.',
    pl_PL:
      'Naprawia brak zadania Pay Invoice na Twoim węźle Lightning przy pierwszym zakupie w StartOS 0.4.0.2: gdy płatność za zakup, odnowienie lub reset transferu oczekuje na rozliczenie, węzeł płacący jest teraz deklarowany jako zależność, czego StartOS wymaga, aby pokazać zadanie. Zadanie węzła dotyczące aktywacji tunelu VPN znika teraz, gdy je zaakceptujesz; zadanie pozostałe po wersji 1.0.0 zniknie samo po aktualizacji. Instrukcja wyjaśnia teraz odinstalowanie (najpierw wyeksportuj konfigurację WireGuard; tunel nadal działa w Twoim węźle Lightning) i poprawia opis panelu: może on także uruchamiać zakup, odnowienie i reset transferu.',
    fr_FR:
      "Corrige l'absence de la tâche Pay Invoice sur votre nœud Lightning lors d'un premier achat sous StartOS 0.4.0.2 : tant qu'un paiement Acheter, Renouveler ou Réinitialiser la bande passante est en attente, le nœud payeur est désormais déclaré comme dépendance, ce que StartOS exige pour afficher la tâche. La tâche d'activation du tunnel VPN sur le nœud disparaît désormais dès que vous l'acceptez ; une tâche restée depuis la 1.0.0 disparaît d'elle-même après la mise à jour. Les instructions expliquent désormais la désinstallation (exportez d'abord votre configuration WireGuard ; le tunnel continue de fonctionner dans votre nœud Lightning) et corrigent la description du tableau de bord : il peut aussi lancer des demandes Acheter, Renouveler et Réinitialiser la bande passante.",
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
