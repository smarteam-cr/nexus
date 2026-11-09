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
- De 4 a 10 palabras (70 caracteres como mucho). Una sola idea: sin comas y sin una «y» que junte dos frases; si necesitas juntar dos cosas, elige la que importa.
- Sin metáforas, sin juegos de palabras, sin promesas vagas («transforma», «potencia», «lleva al siguiente nivel», «que no se olvida»). Tampoco el nombre técnico del trabajo de Smarteam («Configuración de secuencias»).
- Puede tener vida, pero gana lo claro: entre un título ingenioso y uno que se entiende, el que se entiende.
Buenos:
- «Seguimiento a prospectos con la misma cadencia para todos»
- «Las conversaciones de WhatsApp quedan registradas en HubSpot»
- «Saber por qué se ganan y se pierden los negocios»
Malos (y cómo quedarían):
- «Vende con el mismo guion y un seguimiento que no se olvida» → metáfora y dos ideas: «Seguimiento a prospectos con la misma cadencia para todos».
- «Integra WhatsApp y unifica tus conversaciones en HubSpot» → dos verbos para lo mismo: «Las conversaciones de WhatsApp quedan registradas en HubSpot».
- «Reactiva el HubSpot que ya pagas» → no dice qué cambia: «El equipo vuelve a trabajar en el HubSpot que ya paga».
- «Cada asesor vende en el CRM y ves en qué va cada negocio» → dos ideas unidas con «y»: «Tu equipo comercial vende con un mismo proceso en HubSpot».`;

/** El largo máximo de un título claro (el de las reglas, con aire para los acentos y las comillas). */
export const MAX_LARGO_DEL_TITULO = 90;

/** Lo mínimo para que un título se sostenga solo (las reglas piden de 4 a 10 palabras). */
const MIN_PALABRAS_DE_UNA_IDEA = 4;

const palabrasDe = (t: string): string[] => t.split(/\s+/).filter(Boolean);
const sinSignos = (p: string): string => p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const conMayuscula = (p: string | undefined): boolean => !!p && /^\p{Lu}/u.test(p);

/**
 * Dónde se parte un título que junta dos ideas: el índice de la palabra donde empieza la segunda (la coma, o la «y»/«e»
 * que une dos frases). -1 si es una sola idea. Pedido de Elías (2026-11-08): «Cada asesor vende en el CRM y ves en qué
 * va cada negocio» son dos títulos en uno.
 *
 * Prefiere dejar pasar una dudosa a partir una buena (revisión del 2026-11-08: «Tus vendedores registran llamadas y
 * correos en HubSpot» se cortaba en «llamadas»). Una «y» une dos frases cuando hay al menos 3 palabras de cada lado y
 * no es una pareja dentro de la misma idea:
 *   - dos nombres propios o una herramienta y lo que sigue («Marketing y Ventas», «WhatsApp y el correo»);
 *   - dos plurales («llamadas y correos», «ferias y eventos»);
 *   - otro complemento de lo mismo («rápido y con la historia», «en Google y en los asistentes»);
 *   - la forma de lo de antes repetida («se ganan y se pierden»).
 * Una coma parte, salvo en una enumeración («Ventas, Marketing y Servicio»); «, y» también parte.
 */
function dondeEmpiezaLaSegundaIdea(titulo: string): number {
  const palabras = palabrasDe(titulo);
  for (let i = 0; i < palabras.length; i++) {
    if (/[,;]$/.test(palabras[i]) && i < palabras.length - 1) {
      // Enumeración: una «y» o una «o» llega 2 o 3 palabras después de la coma («Ventas, Marketing y Servicio»).
      const siguen = palabras.slice(i + 2, i + 4).map(sinSignos);
      const enumera = !palabras[i].endsWith(";") && !Y_U_O.has(sinSignos(palabras[i + 1])) && siguen.some((s) => Y_U_O.has(s));
      if (!enumera) return i + 1;
      continue;
    }
    const p = sinSignos(palabras[i]);
    if (p !== "y" && p !== "e") continue;
    const antes = palabras.slice(0, i);
    const despues = palabras.slice(i + 1);
    if (antes.length < 3 || despues.length < 3) continue;
    const ultima = antes[antes.length - 1];
    const primera = sinSignos(despues[0]);
    // El sustantivo de después, sin su artículo («y el correo» → «correo»).
    const nucleo = DETERMINANTES.has(primera) ? despues[1] : despues[0];
    if (conMayuscula(ultima) && (conMayuscula(despues[0]) || ARTICULOS.has(primera))) continue;
    if (/s$/.test(sinSignos(ultima)) && !!nucleo && /s$/.test(sinSignos(nucleo)) && !DETERMINANTES.has(sinSignos(ultima))) continue;
    if (PREPOSICIONES.has(primera)) continue;
    if (antes.slice(-3, -1).map(sinSignos).includes(primera)) continue;
    return i;
  }
  return -1;
}

const Y_U_O = new Set(["y", "e", "o", "u"]);
const ARTICULOS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas"]);
const DETERMINANTES = new Set([...ARTICULOS, "tu", "tus", "su", "sus"]);
const PREPOSICIONES = new Set(["a", "al", "con", "de", "del", "desde", "en", "entre", "hacia", "hasta", "para", "por", "según", "sin", "sobre"]);

/** ¿El título junta dos ideas (con coma, o con una «y» entre dos frases)? Las reglas piden una sola. */
export function juntaDosIdeas(titulo: string): boolean {
  return dondeEmpiezaLaSegundaIdea(titulo) >= 0;
}

/**
 * La primera idea de un título que junta dos, si se sostiene sola (4 palabras o más); null si no. Con una sola idea,
 * el título tal cual. «Cada asesor vende en el CRM y ves en qué va cada negocio» → «Cada asesor vende en el CRM».
 */
export function primeraIdea(titulo: string): string | null {
  const limpio = titulo.replace(/\s+/g, " ").trim();
  const corte = dondeEmpiezaLaSegundaIdea(limpio);
  if (corte < 0) return limpio || null;
  const primera = palabrasDe(limpio).slice(0, corte).join(" ").replace(/[\s,;:.]+$/, "");
  return palabrasDe(primera).length >= MIN_PALABRAS_DE_UNA_IDEA ? primera : null;
}
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
    // Uno que junta dos ideas no vale: queda el del catálogo, que cumple las reglas (catalogo.test.ts).
    const valeElTitulo = !!titulo && titulo !== c.titulo && tituloSoloDelCaso(titulo, c) && !juntaDosIdeas(titulo);
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
