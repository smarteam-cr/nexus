/**
 * lib/sessions/duenio-manual.ts — EL ÚNICO LUGAR QUE ESCRIBE «DE QUIÉN ES ESTA REUNIÓN».
 *
 * ── EL INCIDENTE QUE LO MOTIVÓ ───────────────────────────────────────────────
 * En un demo en vivo, una reunión se agregó a un proyecto interno desde el modal. Ese gesto
 * estampa `manualClientId` (la ADOPCIÓN: así deja de ser huérfana). Después se borró el proyecto
 * —que no lo deshace, porque el sello vive en la sesión, no en el vínculo— y más tarde el cliente,
 * con lo cual el sello quedó apuntando a un id muerto. La reunión desapareció del buscador y **no
 * volvió nunca**.
 *
 * Lo que faltaba para rescatarla no era código: era **el dato**. `manualClientId` lo escriben dos
 * gestos que en la base se ven idénticos —una persona eligiendo el cliente, y la adopción
 * automática— y un «deshacer» sin saber cuál fue estaría adivinando, con riesgo de pisar una
 * decisión deliberada.
 *
 * ── POR QUÉ UN CHOKEPOINT Y NO UN CAMPO MÁS ──────────────────────────────────
 * Porque la procedencia solo sirve si SIEMPRE se escribe junto al sello. Un escritor que ponga
 * `manualClientId` sin `manualClientSource` produce una fila indistinguible de las históricas, y
 * el rescate vuelve a ser imposible para esa sesión — en silencio. Por eso los dos datos se
 * escriben en el MISMO `data:`, acá, y una guarda fs-scan prohíbe hacerlo en otro lado.
 *
 * ⚠ `manualClientSource: null` (filas anteriores a 2026-08-16) se trata como HUMANO: no se
 * auto-deshace. Suponer «adopción» para poder limpiarlas sería exactamente el error que este
 * módulo existe para no cometer.
 */
import { prisma } from "@/lib/db/prisma";

/** Cómo llegó el sello. `null` en la base = fila histórica = se trata como `"humano"`. */
export type OrigenDelDuenio = "humano" | "adopcion";

/**
 * Estampa el dueño manual de una sesión, con su procedencia.
 *
 * @param actorEmail quién lo hizo. `null` para escrituras de sistema (la adopción corre dentro de
 *   un POST con usuario, así que en la práctica siempre viene; queda nullable para no inventar).
 */
export async function asignarDuenioManual(
  sessionId: string,
  clientId: string | null,
  opts: { origen: OrigenDelDuenio; actorEmail: string | null },
): Promise<void> {
  await prisma.firefliesSession.update({
    where: { id: sessionId },
    data: {
      manualClientId: clientId,
      // Los tres van juntos SIEMPRE. Separarlos es cómo se pierde la procedencia.
      manualClientSource: clientId ? opts.origen : null,
      manualClientBy: clientId ? opts.actorEmail : null,
      manualClientAt: clientId ? new Date() : null,
    },
  });
}

/**
 * ¿Esta sesión se puede devolver a «sin dueño» automáticamente?
 *
 * Solo lo adoptado. Una asignación humana —o una fila histórica, que no se puede distinguir de
 * una— se deshace a mano desde la pantalla de sesiones, que es donde se tomó la decisión.
 */
export function esDeshacibleAutomaticamente(source: string | null | undefined): boolean {
  return source === "adopcion";
}
