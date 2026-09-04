/**
 * lib/ventas/oportunidades.ts — «OPORTUNIDADES DETECTADAS» de /sales. PURO, sin imports.
 *
 * D-11 (2026-09-04). Dos cosas que el equipo ya escribía y que nadie de Ventas leía:
 *  · la SUGERENCIA que el CSE deja al marcar «Entrega realizada» (ProjectStageGate.note) — el
 *    panel de ciclo de vida la vendía como «sugerencia para Ventas (cross-selling)» y Ventas no
 *    tenía ninguna pantalla donde verla: el traspaso que prometía no existía;
 *  · la sección «Se conversó y no se vendió» del handoff (`fuera_de_alcance`): lo que el cliente
 *    pidió en la venta y quedó fuera del alcance — la lista más directa de qué ofrecerle después.
 *
 * Este módulo solo AGRUPA y RECORTA lo que el cargador (`./cargar-oportunidades.ts`) trae. Es
 * SOLO LECTURA: nada de acá escribe, ni en Nexus ni en HubSpot; una oportunidad se vuelve un
 * trato cuando Ventas lo decide, allá.
 *
 * ⛔ Lo que muestra es INTERNO. La sección «se conversó y no se vendió» tiene una guarda propia
 * (lib/canvas/fuera-de-alcance.test.ts) que impide que cruce al cliente por cualquier documento;
 * este módulo lo lee para una pantalla gateada por `ventas.read`, y por eso no importa prisma:
 * lo consume un componente de cliente.
 */

export type FuenteDeOportunidad = "entrega" | "handoff";

export interface OportunidadDetectada {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  fuente: FuenteDeOportunidad;
  /** Ya recortado con `recortarTexto`. */
  texto: string;
  /** ISO. La nota de entrega tiene fecha cierta; el handoff, la de su última generación. */
  fecha: string | null;
  /** Quién marcó la entrega (email del CSE). null para el handoff: lo escribió el agente. */
  autor: string | null;
}

export interface OportunidadesDeCliente {
  clientId: string;
  clientName: string;
  items: OportunidadDetectada[];
  /** La fecha más reciente entre sus ítems, o null si ninguno la tiene. */
  ultima: string | null;
}

/** Rótulo de cada fuente, para la pantalla. Un solo dueño: el componente no los redacta. */
export const ROTULO_DE_FUENTE: Record<FuenteDeOportunidad, string> = {
  entrega: "Sugerencia del CSE al entregar",
  handoff: "Se conversó y no se vendió",
};

/** La sugerencia de un humano va antes que la lista del agente: es la señal más curada. */
const ORDEN_DE_FUENTE: Record<FuenteDeOportunidad, number> = { entrega: 0, handoff: 1 };

/** Tope por ítem. /sales lista a toda la cartera: una sección de handoff entera por fila no es una lista. */
export const TOPE_DE_TEXTO = 700;

/** Normaliza saltos y espacios y corta con «…» por encima del tope. Nunca devuelve más que el tope. */
export function recortarTexto(texto: string, tope: number = TOPE_DE_TEXTO): string {
  const limpio = texto.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (limpio.length <= tope) return limpio;
  return `${limpio.slice(0, Math.max(0, tope - 1)).trimEnd()}…`;
}

/**
 * Agrupa por cliente. Adentro de cada cliente: primero las sugerencias de entrega, después el
 * handoff; a igual fuente, lo más reciente primero (sin fecha al final). Los clientes, por su
 * ítem más reciente (los que no tienen fecha, al final) y a igual fecha por nombre.
 */
export function agruparPorCliente(items: readonly OportunidadDetectada[]): OportunidadesDeCliente[] {
  const porCliente = new Map<string, OportunidadesDeCliente>();
  for (const it of items) {
    const g = porCliente.get(it.clientId) ?? { clientId: it.clientId, clientName: it.clientName, items: [], ultima: null };
    g.items.push(it);
    if (it.fecha && (!g.ultima || it.fecha > g.ultima)) g.ultima = it.fecha;
    porCliente.set(it.clientId, g);
  }
  const porFechaDesc = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? 1 : -1;
  };
  for (const g of porCliente.values()) {
    g.items.sort((a, b) => ORDEN_DE_FUENTE[a.fuente] - ORDEN_DE_FUENTE[b.fuente] || porFechaDesc(a.fecha, b.fecha));
  }
  return [...porCliente.values()].sort(
    (a, b) => porFechaDesc(a.ultima, b.ultima) || a.clientName.localeCompare(b.clientName),
  );
}
