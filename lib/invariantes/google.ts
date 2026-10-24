/**
 * lib/invariantes/google.ts — los invariantes de la integración con Google Workspace (U1, 2026-10-25).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { CLAVE_DEL_TURNO, ultimaCopiaBuenaDe } from "@/lib/google/auto-sync";

/** Cuánto puede tener la última copia buena de Meet antes de dar rojo. El job corre cada 10 minutos. */
export const HORAS_MAXIMAS_DE_LA_COPIA_DE_MEET = 1;

/**
 * INV49 · La copia de Google Meet tuvo una corrida BUENA en la última hora. Mismo molde que INV31 (el espejo de Odoo):
 * lo que importa es la frescura de la última copia que terminó bien, no que la última corrida haya existido.
 *
 * Hasta U1 la copia corría solo cuando alguien abría Nexus: el sábado 2026-10-24 a media tarde la última copia buena
 * tenía casi dos horas, y nada lo decía. Ahora la corre el job `google-meet-sync` cada 10 minutos.
 *
 * Lee la fila del turno compartido (`CronJobState` «google-auto-sync»): la escriben el job y la vuelta atrás (el
 * disparo al abrir la app), así que vale para los dos. `ultimaBuena` sobrevive a los fallos; una fila de antes de U1
 * cuenta por su `at` si terminó bien.
 * ⚠ Con GOOGLE_MEET_SYNC_ENABLED=0 da rojo cuando nadie abre la app por una hora: es la vuelta atrás, y lo dice.
 * Sin ninguna corrida en esta base (la local, un servidor sin Google) cumple: no hay copia vieja de la que avisar.
 */
export const INV49: Invariante = {
  id: "49",
  nombre: `la copia de Google Meet tuvo una corrida buena en la última ${HORAS_MAXIMAS_DE_LA_COPIA_DE_MEET === 1 ? "hora" : `${HORAS_MAXIMAS_DE_LA_COPIA_DE_MEET} horas`}`,
  async correr(db, ahora) {
    const fila = await db.cronJobState.findUnique({ where: { id: CLAVE_DEL_TURNO }, select: { lastResult: true } });
    const remedio =
      `\n    Remedio: Integraciones › Jobs del servidor dice si google-meet-sync está apagado y por qué, y el error de su última corrida.` +
      `\n    Con GOOGLE_MEET_SYNC_ENABLED=0 la copia corre solo al abrir la app. Pasos en docs/RUNBOOK.md, «Jobs del scheduler».`;
    if (!fila) return cumple("✓ INV49: la copia de Google Meet no corrió nunca en esta base: no hay copia vieja de la que avisar.");

    const ultima = ultimaCopiaBuenaDe(fila.lastResult);
    if (!ultima) {
      return viola(`✗ INV49 VIOLADO: la copia de Google Meet corrió y ninguna corrida anotada terminó bien: las reuniones nuevas no están entrando.${remedio}`);
    }
    const minutos = Math.floor((ahora.getTime() - ultima.getTime()) / 60_000);
    const cuando = `${ultima.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    const hace = minutos < 120 ? `hace ${minutos} min` : minutos < 48 * 60 ? `hace ${Math.floor(minutos / 60)} h` : `hace ${Math.floor(minutos / 1440)} días`;
    if (minutos <= HORAS_MAXIMAS_DE_LA_COPIA_DE_MEET * 60) {
      return cumple(`✓ INV49: la última copia buena de Google Meet es del ${cuando} (${hace}).`);
    }
    return viola(
      `✗ INV49 VIOLADO: la última copia buena de Google Meet es del ${cuando} (${hace}): las reuniones, sus Docs y sus cancelaciones de después no están en Nexus.${remedio}`,
    );
  },
};
