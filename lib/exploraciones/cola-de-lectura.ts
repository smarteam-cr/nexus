/**
 * lib/exploraciones/cola-de-lectura.ts — las sesiones que esperan al agente para leerse. PURO.
 *
 * Pedido de Elías (2026-11-17): con varias sesiones nuevas, «Leer» en una dejaba las demás con el botón apagado y
 * «Leyendo…», porque el agente hace una corrida a la vez por preventa. Ahora pedir otra mientras lee la deja EN COLA en
 * la corrida viva (`AgentRun.filters.cola`), y al terminar cada corrida arranca la siguiente
 * (lib/exploraciones/agente.ts › `seguirLaCola`). Una reunión por corrida, como siempre: leerlas en bloque no cambia
 * cómo se lee cada una.
 *
 * Cada una recuerda quién la pidió (`por`; null = la pidió el sistema, una reunión que llegó sola): la corrida que la
 * lea se cobra a esa persona o al presupuesto automático, no al de quien lanzó la corrida anterior.
 * `colaTomada`: el servidor ya lanzó la siguiente; mientras no, la pantalla sigue esperando aunque la anterior terminó.
 */
import { MAX_SESIONES } from "./guia";

/** Cuántas pueden esperar a la vez: tantas como sesiones admite una preventa. */
export const MAX_EN_LA_COLA = MAX_SESIONES;

/** Una sesión en la cola: su reunión de Meet y quién pidió leerla (null: el sistema). */
export type EnCola = { id: string; por: string | null };

/** Lo que dice una corrida de la cola: qué reunión lee, cuáles esperan y si la cola ya se tomó. */
export function colaDeLaCorrida(filters: unknown): { sesionId: string | null; cola: EnCola[]; tomada: boolean } {
  const f = (filters && typeof filters === "object" ? filters : {}) as { sesionId?: unknown; cola?: unknown; colaTomada?: unknown };
  const sesionId = typeof f.sesionId === "string" && f.sesionId ? f.sesionId : null;
  const cola: EnCola[] = [];
  for (const x of Array.isArray(f.cola) ? f.cola : []) {
    if (typeof x === "string" && x) cola.push({ id: x, por: null });
    else if (x && typeof x === "object" && typeof (x as EnCola).id === "string" && (x as EnCola).id) {
      const por = (x as EnCola).por;
      cola.push({ id: (x as EnCola).id, por: typeof por === "string" && por ? por : null });
    }
  }
  return { sesionId, cola, tomada: f.colaTomada === true };
}

/** La cola con las nuevas al final: sin repetidas, sin la que ya se está leyendo, y hasta el máximo. */
export function sumarALaCola(actual: { sesionId: string | null; cola: readonly EnCola[] }, nuevas: readonly EnCola[]): EnCola[] {
  const out = [...actual.cola];
  for (const n of nuevas) {
    if (n.id === actual.sesionId || out.some((x) => x.id === n.id)) continue;
    if (out.length >= MAX_EN_LA_COLA) break;
    out.push(n);
  }
  return out;
}

/** Un pedido de varias: la primera se lee ya y el resto espera (sin repetidas, en el orden pedido). */
export function partirElPedido(items: readonly EnCola[]): { primera: EnCola; resto: EnCola[] } | null {
  const unicas = items.filter((x, i) => x.id && items.findIndex((y) => y.id === x.id) === i);
  if (!unicas.length) return null;
  return { primera: unicas[0], resto: unicas.slice(1, 1 + MAX_EN_LA_COLA) };
}

/**
 * Lo que hereda una lectura nueva de una corrida que murió con un reinicio: la reunión que estaba leyendo (a nombre de
 * quien la lanzó) y las que esperaban. Sin esto, un deploy a mitad de la cola perdía la que decía «Leyendo…».
 */
export function heredarDeLaColgada(filters: unknown, lanzadaPor: string | null): EnCola[] {
  const c = colaDeLaCorrida(filters);
  return [...(c.sesionId ? [{ id: c.sesionId, por: lanzadaPor }] : []), ...c.cola];
}

/**
 * Al tomar la cola, la siguiente que se lee: se saltan las que el agente ya leyó entretanto (con transcripción o solo con
 * notas: volver a leerlas gasta IA y repite lo propuesto).
 */
export function siguienteDeLaCola(cola: readonly EnCola[], yaLeidas: ReadonlySet<string>): { primera: EnCola; resto: EnCola[] } | null {
  return partirElPedido(cola.filter((x) => !yaLeidas.has(x.id)));
}

/** A nombre de quién se lanza una lectura de la cola: de quien la pidió, o del sistema (presupuesto automático). */
export function aNombreDe(x: EnCola): { triggeredByEmail: string | null; automatica?: true } {
  return x.por === null ? { triggeredByEmail: null, automatica: true } : { triggeredByEmail: x.por };
}
