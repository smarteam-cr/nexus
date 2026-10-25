/**
 * lib/invariantes/google.ts — los invariantes de la integración con Google Workspace (U1, 2026-10-25).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { CLAVE_DEL_TURNO, ultimaCopiaBuenaDe } from "@/lib/google/auto-sync";
import { esquemaDesactualizado } from "@/lib/db/esquema";

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

/** INV53 mira las reuniones de hasta 25 días: Google borra las frases a los 30, y quedan 5 de margen para arreglarlo. */
export const DIAS_MAXIMOS_SIN_CERRAR_LA_CONFERENCIA = 25;
/** Y desde los 3 días: una reunión se cierra sola a las 48 horas de su fin aunque no lleguen sus archivos. */
export const DIAS_MINIMOS_SIN_CERRAR_LA_CONFERENCIA = 3;
/** La fila del job de la revisión (lib/google/conferencias-por-job.ts › CLAVE_DEL_JOB). */
const JOB_DE_LAS_CONFERENCIAS = "google-meet-conferencias";

/**
 * INV53 · Ninguna reunión con código de Meet de entre 3 y 25 días queda sin cerrar la revisión de su conferencia (U3,
 * 2026-10-25). Lo que se pierde si no: las frases, con quién habló y cuándo, que Google borra a los 30 días, y saber si
 * la reunión ocurrió. La revisión (job `google-meet-conferencias`) cierra cada reunión cuando ya no hay nada que
 * esperar, o a las 48 horas de su fin: una abierta a los 3 días es una que el job no está mirando.
 *
 * Sin ninguna corrida del job en esta base (la local, o antes del deploy) cumple: no hay revisión atrasada de la que
 * avisar. Sin las columnas (el SQL 2026-10-25-google-meet-api.sql sin aplicar) cumple con un aviso: es la ventana del
 * deploy, y `/api/health` ya responde 503 si el código nuevo corre sin el SQL.
 */
export const INV53: Invariante = {
  id: "53",
  nombre: `ninguna reunión con código de Meet de entre ${DIAS_MINIMOS_SIN_CERRAR_LA_CONFERENCIA} y ${DIAS_MAXIMOS_SIN_CERRAR_LA_CONFERENCIA} días queda sin revisar su conferencia`,
  async correr(db, ahora) {
    const job = await db.cronJobState.findUnique({ where: { id: JOB_DE_LAS_CONFERENCIAS }, select: { id: true } });
    if (!job) return cumple("✓ INV53: la revisión de las conferencias de Meet no corrió nunca en esta base: no hay revisión atrasada de la que avisar.");
    const where = {
      source: "google_meet",
      conferenceId: { not: null },
      conferenciaCerradaEn: null,
      date: {
        gte: new Date(ahora.getTime() - DIAS_MAXIMOS_SIN_CERRAR_LA_CONFERENCIA * 86_400_000),
        lte: new Date(ahora.getTime() - DIAS_MINIMOS_SIN_CERRAR_LA_CONFERENCIA * 86_400_000),
      },
    };
    let abiertas: { id: string; title: string; date: Date }[];
    let total: number;
    try {
      [total, abiertas] = await Promise.all([
        db.firefliesSession.count({ where }),
        db.firefliesSession.findMany({ where, select: { id: true, title: true, date: true }, orderBy: { date: "asc" }, take: 5 }),
      ]);
    } catch (e) {
      if (esquemaDesactualizado(e)) return cumple("⚠ INV53: la base no tiene todavía las columnas de U3 (scripts/sql/2026-10-25-google-meet-api.sql sin aplicar).");
      throw e;
    }
    if (total === 0) return cumple(`✓ INV53: todas las reuniones con código de Meet de entre ${DIAS_MINIMOS_SIN_CERRAR_LA_CONFERENCIA} y ${DIAS_MAXIMOS_SIN_CERRAR_LA_CONFERENCIA} días tienen su conferencia revisada.`);
    return viola(
      `✗ INV53 VIOLADO: ${total} reunión(es) con código de Meet de entre ${DIAS_MINIMOS_SIN_CERRAR_LA_CONFERENCIA} y ${DIAS_MAXIMOS_SIN_CERRAR_LA_CONFERENCIA} días sin revisar su conferencia: Google borra sus frases a los 30 días.`,
      ...abiertas.map((a) => `    · ${a.date.toISOString().slice(0, 10)} «${a.title}» (${a.id})`),
      `    Remedio: Integraciones › Jobs del servidor dice si google-meet-conferencias está apagado y el error de su última corrida.` +
        `
    A mano: npx tsx scripts/revisar-conferencias-de-meet.ts (simulacro) y con --apply.`,
    );
  },
};
