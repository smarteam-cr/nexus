/**
 * lib/asistente/arrastre.ts — DESMARCAR UNA COSA ARRASTRA LO QUE COLGABA DE ELLA.
 *
 * PURO y client-safe. Sin Prisma, sin red, sin React.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ ES GENÉRICO ───────────────────────────────────────────────────
 * La cajita del chat deja desmarcar operaciones antes de aplicar. Si se desmarca la que CREA algo
 * y quedan vivas las que lo llenan, esas nombran algo que no existe: el ejecutor las rechaza, y
 * **un rechazo puede tumbar el lote entero**. La persona desmarca UNA cosa y no se aplica ninguna.
 *
 * ⛔ El panel resolvía esto importando la cascada del CRONOGRAMA y casteando las operaciones a las
 * de allá. Sobre operaciones de DOCUMENTO esa función devuelve cero dependencias —busca
 * `fase.crear` y `phaseId`— así que la protección existía solo para uno de los dos carriles, y en
 * el otro fallaba en silencio.
 *
 * La cascada no es del cronograma ni del documento: es del ACUERDO. Cada carril calcula sus
 * dependencias en el servidor —del mismo objeto que se va a ejecutar, igual que las líneas en
 * castellano— y la pantalla corre este punto fijo sin saber de qué vocabulario vino.
 */

/**
 * Cierra el conjunto de desmarcadas: si algo requiere una operación que quedó fuera, también sale.
 *
 * `dependencias[i]` = los índices que la operación `i` NECESITA para poder aplicarse.
 *
 * ⚠ Se recalcula desde cero en cada clic, también al RE-marcar: si lo que la bloqueaba volvió,
 * vuelve ella también. Recalcular es más barato que llevar un historial de por qué salió.
 */
export function arrastreDeDesmarcadas(
  dependencias: readonly (readonly number[])[],
  desmarcadas: ReadonlySet<number>,
): Set<number> {
  const fuera = new Set(desmarcadas);
  let cambio = true;
  while (cambio) {
    cambio = false;
    dependencias.forEach((requiere, i) => {
      if (fuera.has(i)) return;
      if (requiere.some((r) => fuera.has(r))) {
        fuera.add(i);
        cambio = true;
      }
    });
  }
  return fuera;
}
