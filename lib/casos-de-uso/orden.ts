/**
 * lib/casos-de-uso/orden.ts — los títulos claros y el ORDEN de todos los casos del paso «Casos de uso» de la preventa.
 * PURO y client-safe (lo usan el paso, el agente que ordena y sus pruebas).
 *
 * Pedido de Elías (2026-11-08, décima vuelta, con Centauro Solutions):
 *   1. Los títulos son para compradores con muchas reuniones y muchos temas: sencillos y descriptivos, que se entiendan a
 *      la primera, sin ser aburridos. «Vende con el mismo guion y un seguimiento que no se olvida» no se entendía.
 *      `REGLAS_DEL_TITULO` las comparten el agente que sugiere y el que ordena (este último titula los casos de la
 *      biblioteca que llegan por la escala, que traen el título del catálogo).
 *   2. Todos los casos (los del agente, los de la escala y los elegidos) van en UNA lista, uno por fila, en un solo orden
 *      priorizado que sugiere el agente con todo lo que Nexus sabe de la empresa. La etiqueta dice de dónde viene cada uno.
 *
 * El orden se guarda por id del caso (`cat-…` o el id de un caso propio): aceptar un sugerido no le cambia el lugar. Lo
 * que no está en el orden (llegó después de la última vuelta del agente) va al final, en el orden de antes.
 */

/** Las reglas del título de un caso, con ejemplos buenos y malos. Las lee el agente tal cual. */
export const REGLAS_DEL_TITULO = `El TÍTULO lo lee un comprador con muchas reuniones y muchos temas en la cabeza: tiene que entenderse a la primera, leído solo, sin contexto.
- Dice en palabras simples QUÉ cambia en el trabajo de su equipo: lo concreto que van a tener, nombrando la herramienta o el canal si eso lo hace concreto (HubSpot, WhatsApp, el correo).
- De 4 a 10 palabras (70 caracteres como mucho). Una sola idea: si necesitas una «y» para juntar dos cosas, elige la que importa.
- Sin metáforas, sin juegos de palabras, sin promesas vagas («transforma», «potencia», «lleva al siguiente nivel», «que no se olvida»). Tampoco el nombre técnico del trabajo de Smarteam («Configuración de secuencias»).
- Puede tener vida, pero gana lo claro: entre un título ingenioso y uno que se entiende, el que se entiende.
Buenos:
- «Seguimiento a prospectos con la misma cadencia para todos»
- «Las conversaciones de WhatsApp quedan registradas en HubSpot»
- «Saber por qué se ganan y se pierden los negocios»
Malos (y cómo quedarían):
- «Vende con el mismo guion y un seguimiento que no se olvida» → metáfora y dos ideas: «Seguimiento a prospectos con la misma cadencia para todos».
- «Integra WhatsApp y unifica tus conversaciones en HubSpot» → dos verbos para lo mismo: «Las conversaciones de WhatsApp quedan registradas en HubSpot».
- «Reactiva el HubSpot que ya pagas» → no dice qué cambia: «El equipo vuelve a trabajar en el HubSpot que ya paga».`;

/** El largo máximo de un título claro (el de las reglas, con aire para los acentos y las comillas). */
export const MAX_LARGO_DEL_TITULO = 90;
/** El porqué de su lugar en la lista: para el vendedor, corto. */
export const MAX_LARGO_DEL_PORQUE_DEL_ORDEN = 240;
/** Cuántos casos ordena como mucho (los elegidos, los sugeridos y los de la escala de dos o tres áreas). */
export const MAX_CASOS_EN_EL_ORDEN = 40;

/** De dónde viene un caso de la lista: la etiqueta de su fila. */
export type OrigenDelCaso = "elegido" | "agente" | "escala";

/** Un caso de la lista para el agente que ordena. */
export interface CandidatoAlOrden {
  id: string;
  titulo: string;
  origen: OrigenDelCaso;
  /** El nombre del área (o null). */
  area: string | null;
  /** Qué resuelve, en una frase: el porqué del agente o la razón de la escala. */
  queResuelve: string;
}

/** El lugar de un caso en la lista. */
export interface CasoEnElOrden {
  id: string;
  /** Para el vendedor: por qué va en ese lugar, en una frase. */
  porQue: string;
  /** Solo en los de la escala: el título claro (el del catálogo queda al lado). */
  titulo?: string;
}

/** El orden que propuso el agente en su última vuelta («Sugerir» o «Revisar»). */
export interface OrdenDeLosCasos {
  en: string;
  corridaId: string;
  casos: CasoEnElOrden[];
}

const recortar = (t: unknown, max: number): string => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/** Los nombres propios que un título puede traer aunque no estén en el caso: herramientas y canales. */
const NOMBRES_PERMITIDOS = new Set(["hubspot", "whatsapp", "crm", "erp", "ia"]);

/**
 * ¿El título claro de un caso de la escala sale solo de lo que dice el caso? Lo puede ver el cliente (si se elige, va a
 * su propuesta) y el agente que lo escribe lee lo interno y las minutas (revisión del 2026-11-08). Sin cifras, y toda
 * palabra con mayúscula (salvo la primera) tiene que estar en el caso o ser una herramienta: así no se cuela el nombre
 * de una persona, de un competidor o de algo que solo se dijo puertas adentro.
 */
export function tituloSoloDelCaso(titulo: string, c: Pick<CandidatoAlOrden, "titulo" | "queResuelve" | "area">): boolean {
  if (/\d/.test(titulo)) return false;
  const delCaso = new Set(`${c.titulo} ${c.queResuelve} ${c.area ?? ""}`.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  const palabras = titulo.split(/[^\p{L}]+/u).filter(Boolean);
  return palabras.slice(1).every((p) => p[0] === p[0].toLowerCase() || NOMBRES_PERMITIDOS.has(p.toLowerCase()) || delCaso.has(p.toLowerCase()));
}

/**
 * Lo que devolvió el agente, validado: solo ids de la lista, sin repetir, con su porqué; el título solo en los de la
 * escala. Los que no ordenó van al final, en el orden en que llegaron (nadie se pierde). null si no ordenó ninguno.
 */
export function validarOrdenDelAgente(raw: unknown, candidatos: readonly CandidatoAlOrden[], corridaId: string, ahora = new Date()): OrdenDeLosCasos | null {
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const vistos = new Set<string>();
  const casos: CasoEnElOrden[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const c = porId.get(id);
    if (!c || vistos.has(id)) continue;
    vistos.add(id);
    const titulo = c.origen === "escala" ? recortar(r.titulo, MAX_LARGO_DEL_TITULO) : "";
    const valeElTitulo = !!titulo && titulo !== c.titulo && tituloSoloDelCaso(titulo, c);
    casos.push({ id, porQue: recortar(r.porQue, MAX_LARGO_DEL_PORQUE_DEL_ORDEN), ...(valeElTitulo ? { titulo } : {}) });
  }
  if (!casos.length) return null;
  for (const c of candidatos) if (!vistos.has(c.id)) casos.push({ id: c.id, porQue: "" });
  return { en: ahora.toISOString(), corridaId, casos: casos.slice(0, MAX_CASOS_EN_EL_ORDEN) };
}

/**
 * Las filas en el orden del agente: primero las que están en él, por su lugar; después las demás, en el orden en que
 * llegaron (estable). Sin orden, tal cual.
 */
export function enElOrden<T>(filas: readonly T[], idDe: (t: T) => string, orden: Pick<OrdenDeLosCasos, "casos"> | null | undefined): T[] {
  if (!orden?.casos.length) return [...filas];
  const lugar = new Map(orden.casos.map((c, i) => [c.id, i]));
  return filas
    .map((f, i) => ({ f, i, l: lugar.get(idDe(f)) }))
    .sort((a, b) => (a.l ?? Infinity) - (b.l ?? Infinity) || a.i - b.i)
    .map((x) => x.f);
}
