/**
 * lib/sessions/ocurridas.ts
 *
 * UNA reunión que todavía no ocurrió NO es evidencia de nada.
 *
 * ── EL DEFECTO QUE ESTE ARCHIVO CIERRA (2026-08-18) ──────────────────────────
 * `FirefliesSession` guarda la agenda entera, no solo lo que ya pasó: la sincronización
 * de Google Meet trae los eventos hasta el día siguiente y las series recurrentes se
 * expanden hacia adelante. Medido contra producción: **468 sesiones futuras** sobre 7.161.
 *
 * Eso, por sí solo, no molesta a nadie — hasta que un lector arma contexto para un
 * modelo ordenando `date: desc` y recortando a las N más recientes. Ahí las futuras van
 * PRIMERAS, y hacen dos daños a la vez:
 *
 *   1. **Desplazan material real.** Ocupan el cupo (y el presupuesto de caracteres) de
 *      reuniones que sí ocurrieron y sí tienen transcripción.
 *   2. **Se le describen al modelo como si hubieran pasado.** El prompt recibe
 *      `[fecha] Título` de algo que no sucedió; el modelo no tiene forma de saberlo.
 *
 * Lo medido por cliente, sobre la ventana de 200 del análisis:
 *
 *   | 42 % | 19/45  | Multiquimica |
 *   | 35 % | 29/82  | SmartAgro    |
 *   | 24 % | 47/200 | Smarteam     |
 *   | 17 % | 11/63  | Ministerio de Economía |
 *   (18 clientes con al menos una; la lista completa quedó en el mensaje del commit)
 *
 * Casi la mitad del contexto de Multiquímica eran reuniones que no habían ocurrido.
 *
 * ── POR QUÉ UN ARCHIVO Y NO UN `where` MÁS ───────────────────────────────────
 * La regla YA estaba escrita, y bien, en `lib/sessions/project-sessions.ts:33-35`
 * («solo sesiones con date <= now — las futuras no son avance») y en tres lectores más
 * (`lib/cs/load-account.ts`, `lib/projects/project-brief.ts`, `lib/hubspot/cs-signals.ts`,
 * este último con la constante ya bautizada `ocurridas`). Lo que faltaba no era la idea:
 * era que viviera en un solo lugar con nombre propio, para que el próximo lector la
 * herede en vez de tener que acordarse. Es el modo de falla favorito de este repo — la
 * protección que es propiedad de un llamador y no del camino.
 *
 * ⛔ NO usar esto en superficies de AGENDA. «La próxima reunión» del GPS, el buscador de
 * candidatas del modal (que marca las futuras a propósito, ver `candidatas-internas`) y
 * la pantalla `/sessions` NECESITAN el futuro: ahí una reunión agendada es exactamente
 * lo que la persona vino a ver. El censo de `ocurridas.test.ts` deja por escrito cuál es
 * cuál, y falla si aparece un lector sin clasificar.
 */

/** Fila mínima con fecha — sirve tanto para `Date` como para epoch ms. */
export interface ConFecha {
  date: Date | number;
}

function ms(d: Date | number): number {
  return typeof d === "number" ? d : d.getTime();
}

/**
 * ¿Esta reunión ya ocurrió? El borde (`date === ahora`) cuenta como ocurrida: una
 * reunión que arranca en este instante ya empezó, y el caso solo se alcanza con una
 * igualdad exacta de milisegundos.
 */
export function yaOcurrio(date: Date | number, ahora: Date | number = Date.now()): boolean {
  return ms(date) <= ms(ahora);
}

/** Filtro en memoria, para las listas que ya se trajeron de la base. */
export function soloOcurridas<T extends ConFecha>(
  filas: readonly T[],
  ahora: Date | number = Date.now(),
): T[] {
  return filas.filter((f) => yaOcurrio(f.date, ahora));
}

/**
 * Fragmento de `where` de Prisma para `FirefliesSession.date`. Se compone con spread:
 *
 *   where: { ...whereBelongsToClient(clientId), ...whereYaOcurrio() }
 *
 * ⚠ Devuelve `{ date: { lte } }`, así que NO se puede spreadear junto a otro `date:` —
 * el segundo pisa al primero en silencio. Cuando hace falta un piso además del techo,
 * escribí el rango completo a mano y dejá el `lte` a la vista.
 */
export function whereYaOcurrio(ahora: Date = new Date()): { date: { lte: Date } } {
  return { date: { lte: ahora } };
}
