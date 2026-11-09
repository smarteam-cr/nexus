/**
 * lib/casos-de-uso/lectura-del-consultor.ts — «La lectura del consultor» del paso «Casos de uso» de la preventa. PURO y
 * client-safe (lo usan el paso, el agente y sus pruebas).
 *
 * Pedido de Marco y Elías (2026-11-09): antes de generar, Nexus le pregunta al consultor «¿Qué casos de uso crees que
 * necesita el cliente?», con ejemplos de un clic sacados de lo que sabe del cliente y la opción de dictar. Al generar,
 * ordena lo que dijo por departamento y le avisa si se le pasó algo que sí aparece en las transcripciones, con la cita.
 * Marco: «si el consultor no puede dictar los casos en general, probablemente no entendió al cliente».
 *
 * Reemplaza a las «Instrucciones adicionales» de este paso y vive en la MISMA nota (`instrucciones:casos` en
 * `contenido.notas`): lo que ya estaba escrito se lee igual, sin migrar nada y sin SQL.
 */

export const PREGUNTA_DE_LA_LECTURA = "¿Qué casos de uso crees que necesita el cliente?";

/** Cuántos ejemplos de un clic, y cuántas palabras como mucho cada uno. */
export const MAX_EJEMPLOS = 6;
const MAX_PALABRAS_DEL_EJEMPLO = 8;
const MIN_PALABRAS_DEL_EJEMPLO = 3;

/** Lo que el agente dejó al generar: lo dicho por departamento y lo que se le pasó, con su cita. */
export interface LecturaDelConsultor {
  en: string;
  corridaId: string;
  /** La huella del texto que leyó: si el consultor lo cambió después, la lectura quedó vieja. */
  huella: string;
  /** Lo que dijo, ordenado por departamento (en sus palabras, corto). `areaId` null: no es de un área en juego. */
  porArea: { areaId: string | null; casos: string[] }[];
  /** Lo que no dijo y sí aparece en las reuniones, con la cita tal cual de la transcripción. */
  seLePaso: SeLePaso[];
}

export interface SeLePaso {
  /** El caso de uso, en pocas palabras. */
  que: string;
  areaId: string | null;
  /** La frase de la reunión, como quedó en la transcripción. */
  cita: string;
  /** Qué reunión («Reunión del 6 nov: Diagnóstico de ventas»). */
  reunion: string;
}

export const MAX_CASOS_POR_AREA_EN_LA_LECTURA = 8;
export const MAX_SE_LE_PASO = 5;
export const MAX_LARGO_DE_UN_CASO_EN_LA_LECTURA = 140;
export const MAX_LARGO_DE_LA_CITA = 400;

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La huella del texto del consultor: sin mayúsculas ni espacios de más (cambiar una coma no la vuelve vieja). */
export function huellaDeLaLectura(texto: string): string {
  const t = normal(texto).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

// ── Los ejemplos de un clic ─────────────────────────────────────────────────────────────────────────

/** Lo que se quita del principio de un plan para que quede como caso: «Quieren migrar…» → «Migrar…». */
const ARRANQUE = /^(quieren|quiere|buscan|busca|planean|planea|piensan|piensa|esperan|espera|necesitan|necesita|van a|desean|desea)\s+/i;
/** Dónde se corta un plan largo: lo que sigue explica para qué, no qué. */
const CORTE = /^(para|porque|que|con el fin|y|e|sin|donde|cuando|mediante|vía|via|a fin)$/i;

/**
 * Un plan del cliente como ejemplo corto: sin «Quieren…», hasta la coma, los dos puntos o el «para…», de 3 a 8 palabras.
 * null si no queda algo que se sostenga.
 */
export function ejemploDeUnPlan(plan: string): string | null {
  const limpio = plan.replace(/\s+/g, " ").trim().replace(ARRANQUE, "");
  const palabras = limpio.split(" ").filter(Boolean);
  const fuera: string[] = [];
  for (const p of palabras) {
    const sola = p.replace(/[^\p{L}\p{N}-]/gu, "");
    if (fuera.length >= MIN_PALABRAS_DEL_EJEMPLO && CORTE.test(sola)) break;
    if (/^\(/.test(p)) break;
    fuera.push(p);
    if (/[,;:.)]$/.test(p) || fuera.length >= MAX_PALABRAS_DEL_EJEMPLO) break;
  }
  const texto = fuera.join(" ").replace(/[\s,;:.()]+$/, "");
  if (texto.split(" ").length < MIN_PALABRAS_DEL_EJEMPLO) return null;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Los ejemplos de un clic para la lectura: primero los planes del cliente (lo que dijo que quiere hacer, en sus
 * palabras), después lo que la escala sugiere para cada área; sin repetir y sin lo que ya escribió el consultor.
 */
export function ejemplosParaLaLectura(o: { planes: readonly string[]; porLaEscala: readonly string[]; yaEscrito?: string }): string[] {
  const escrito = normal(o.yaEscrito ?? "");
  const fuera: string[] = [];
  const vistos = new Set<string>();
  const sumar = (t: string | null) => {
    if (!t || fuera.length >= MAX_EJEMPLOS) return;
    const k = normal(t);
    if (vistos.has(k) || escrito.includes(k)) return;
    vistos.add(k);
    fuera.push(t);
  };
  for (const p of o.planes) sumar(ejemploDeUnPlan(p));
  for (const t of o.porLaEscala) sumar(t.trim() || null);
  return fuera;
}

/** El texto de la lectura con un ejemplo más, como renglón con guion (sin repetirlo si ya está). */
export function sumarEjemplo(texto: string, ejemplo: string): string {
  if (normal(texto).includes(normal(ejemplo))) return texto;
  const base = texto.replace(/\s+$/, "");
  return `${base}${base ? "\n" : ""}- ${ejemplo}`;
}

// ── Los renglones de lo que escribió o dictó ────────────────────────────────────────────────────────

export const MAX_RENGLONES = 30;

/**
 * Lo que escribió el consultor, un renglón por idea: cada línea (sin su viñeta) y, en una línea larga como la de un
 * dictado, cada frase. Cada uno lleva su id (R1…) para que el agente no pierda ninguno (medido con Centauro el 9 nov: sin
 * ids, dejó afuera dos de tres).
 */
export function renglonesDeLaLectura(texto: string): { id: string; texto: string }[] {
  return texto
    .split(/\r?\n/)
    .flatMap((l) => l.split(/(?<=[.!?;])\s+(?=\p{Lu})/u))
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim())
    /* Revisión del 2026-11-09: una lista de palabras sueltas («Cotizaciones», «WhatsApp») también son casos; lo que no
       entra es un encabezado solo («En ventas:»), que no dice ningún caso, ni lo que no trae letras. */
    .filter((l) => /\p{L}{2}/u.test(l) && !/:$/.test(l))
    .slice(0, MAX_RENGLONES)
    .map((t, i) => ({ id: `R${i + 1}`, texto: t }));
}

/** Las palabras de un área, para ubicar un renglón que el agente no ubicó. */
const PALABRAS_DEL_AREA: Record<string, RegExp> = {
  "1": /\b(ventas?|vender|comercial(es)?|prospect\w*|cotiza\w*|pipeline|negocios?|asesor(es)?|vendedor(es)?|leads?)\b/,
  "2": /\b(marketing|mercadeo|campañas?|contenido|seo|redes|formularios?|marca)\b/,
  "3": /\b(servicio|soporte|atenci[oó]n|ayuda|tickets?|tiquetes?|casos|customer success|cs|postventa|clientes actuales|bajas|churn)\b/,
};

/** El área de un renglón por sus palabras, entre las que están en juego; null si no se sabe o calza con varias. */
export function areaPorPalabras(texto: string, areas: readonly { id: string }[]): string | null {
  const t = normal(texto);
  const calzan = areas.filter((a) => PALABRAS_DEL_AREA[a.id]?.test(t));
  return calzan.length === 1 ? calzan[0].id : null;
}

/** Las raíces de las palabras con contenido (5 letras o más, sus primeras 5): para saber si dos frases hablan de lo mismo. */
const raices = (t: string) => new Set(normal(t).split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 5).map((p) => p.slice(0, 5)));

/** ¿El renglón ya dice eso? Dos tercios de las palabras de «que» están en un mismo renglón. */
export function yaLoDijo(que: string, renglones: readonly { texto: string }[]): boolean {
  const deQue = [...raices(que)];
  if (!deQue.length) return false;
  return renglones.some((r) => {
    const delRenglon = raices(r.texto);
    return deQue.filter((p) => delRenglon.has(p)).length / deQue.length >= 2 / 3;
  });
}

// ── La cita: que esté de verdad en la transcripción ─────────────────────────────────────────────────

/**
 * Quienes hablan en una transcripción: el nombre que abre un turno («Emiley Calvo Jiménez: …», con o sin la hora antes).
 * Solo esos se sacan de una cita: una palabra con dos puntos dentro de una frase («Necesitamos: tener…») no es un nombre.
 */
export function quienesHablan(fuente: string): Set<string> {
  const fuera = new Set<string>();
  for (const m of fuente.matchAll(/(?:^|\n)\s*(?:\d{1,2}:\d{2}(?::\d{2})?\s+)?(\p{Lu}[\p{L}'.-]*(?:\s+\p{Lu}[\p{L}'.-]*){0,3}):\s/gu)) fuera.add(m[1]);
  return fuera;
}

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La cita como se muestra: sin las horas de la transcripción («00:11:44») ni el nombre de quien habla (`hablantes`, los
 * de esa transcripción), y sin los turnos de una o dos palabras de otro («Marco Salas: Okay.») que quedaron en medio. Lo
 * que se saca va como «…».
 */
export function limpiarCita(cita: string, hablantes: ReadonlySet<string>): string {
  const sinHoras = cita.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b\s*/g, "");
  if (!hablantes.size) return sinHoras.replace(/\s+/g, " ").trim();
  const nombres = [...hablantes].sort((a, b) => b.length - a.length).map(escaparRegex).join("|");
  const tramos = sinHoras.split(new RegExp(`(?:^|\\s)(?:${nombres}):\\s`, "u")).map((t) => t.trim());
  const conPeso = tramos.filter((t) => t.split(/\s+/).filter(Boolean).length >= 4);
  return (conPeso.length ? conPeso : tramos.filter(Boolean)).join(" … ").replace(/\s+/g, " ").trim();
}

/** Muletillas que el modelo suele quitar al copiar una frase hablada (KNOWN-ERRORS: la cita exacta descartaba citas ciertas). */
const MULETILLAS = new Set(["eh", "ehh", "em", "mm", "mmm", "este", "o", "sea", "pues", "bueno", "digamos", "verdad", "ajá", "aja"]);

interface Palabra {
  norm: string;
  inicio: number;
  fin: number;
}
function palabrasCon(t: string): Palabra[] {
  const fuera: Palabra[] = [];
  for (const m of t.matchAll(/[\p{L}\p{N}]+/gu)) fuera.push({ norm: normal(m[0]), inicio: m.index!, fin: m.index! + m[0].length });
  return fuera;
}

/**
 * La cita tal cual aparece en la fuente, o null si no aparece. Palabra por palabra y en orden: tolera las muletillas,
 * las palabras repetidas y la puntuación que el modelo cambia al copiar, y hasta un tercio de palabras de más en la fuente
 * entre la primera y la última. Menos de 5 palabras no prueba nada.
 */
export function citaEnLaFuente(cita: string, fuente: string): string | null {
  const buscadas = palabrasCon(cita)
    .map((p) => p.norm)
    .filter((p, i, xs) => !MULETILLAS.has(p) && p !== xs[i - 1]);
  if (buscadas.length < 5) return null;
  const texto = palabrasCon(fuente);
  const holgura = Math.max(3, Math.ceil(buscadas.length / 3));
  for (let i = 0; i < texto.length; i++) {
    if (texto[i].norm !== buscadas[0]) continue;
    let j = 1;
    let k = i + 1;
    let saltadas = 0;
    while (j < buscadas.length && k < texto.length && saltadas <= holgura) {
      if (texto[k].norm === buscadas[j]) j++;
      else if (!MULETILLAS.has(texto[k].norm) && texto[k].norm !== texto[k - 1].norm) saltadas++;
      k++;
    }
    if (j === buscadas.length && saltadas <= holgura) return fuente.slice(texto[i].inicio, texto[k - 1].fin).replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_DE_LA_CITA);
  }
  return null;
}

// ── Lo que devolvió el agente ───────────────────────────────────────────────────────────────────────

const recortar = (t: unknown, max: number) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/**
 * Lo que devolvió el agente, validado: las áreas, solo las que están en juego (o ninguna); lo que se le pasó, solo con una
 * cita que de verdad está en esa reunión (la de la transcripción, no la que escribió el modelo) y sin repetir lo que el
 * consultor ya dijo. null si no hay texto que leer.
 */
export function validarLecturaDelAgente(
  raw: unknown,
  ctx: { texto: string; areas: readonly { id: string }[]; fuentes: readonly { id: string; etiqueta: string; texto: string }[] },
  corridaId: string,
  ahora = new Date(),
): LecturaDelConsultor | null {
  if (!ctx.texto.trim()) return null;
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const areas = new Set(ctx.areas.map((a) => a.id));
  const areaDe = (x: unknown) => (typeof x === "string" && areas.has(x) ? x : null);
  const renglones = renglonesDeLaLectura(ctx.texto);
  const porArea = new Map<string | null, string[]>();
  const sumar = (id: string | null, casos: string[]) => {
    const juntos = [...(porArea.get(id) ?? []), ...casos].filter((c, i, xs) => xs.findIndex((x) => normal(x) === normal(c)) === i);
    porArea.set(id, juntos.slice(0, MAX_CASOS_POR_AREA_EN_LA_LECTURA));
  };
  // Cada renglón, con el área y los casos que dijo el agente.
  const ubicados = new Set<string>();
  for (const x of Array.isArray(r.porRenglon) ? r.porRenglon : []) {
    if (typeof x !== "object" || x === null) continue;
    const a = x as Record<string, unknown>;
    const renglon = renglones.find((g) => g.id === (typeof a.renglon === "string" ? a.renglon.trim() : ""));
    const casos = (Array.isArray(a.casos) ? a.casos : []).map((c) => recortar(c, MAX_LARGO_DE_UN_CASO_EN_LA_LECTURA)).filter(Boolean);
    if (!renglon || !casos.length) continue;
    ubicados.add(renglon.id);
    sumar(areaDe(a.areaId), casos);
  }
  // Ninguno se pierde: el que el agente no ubicó va tal cual, al área que dicen sus palabras.
  for (const g of renglones) {
    if (ubicados.has(g.id)) continue;
    // Sin el rótulo de adelante («Ventas: …»); si no queda nada, el renglón entero. Nunca un caso vacío: la lectura no se guardaría.
    const caso = recortar(g.texto.replace(/^[^:]{1,25}:\s*/, ""), MAX_LARGO_DE_UN_CASO_EN_LA_LECTURA) || recortar(g.texto, MAX_LARGO_DE_UN_CASO_EN_LA_LECTURA);
    if (caso) sumar(areaPorPalabras(g.texto, ctx.areas), [caso]);
  }
  const fuentes = new Map(ctx.fuentes.map((f) => [f.id, f]));
  const seLePaso: SeLePaso[] = [];
  for (const x of Array.isArray(r.seLePaso) ? r.seLePaso : []) {
    if (typeof x !== "object" || x === null || seLePaso.length >= MAX_SE_LE_PASO) continue;
    const s = x as Record<string, unknown>;
    const que = recortar(s.que, MAX_LARGO_DE_UN_CASO_EN_LA_LECTURA);
    const f = fuentes.get(typeof s.fuente === "string" ? s.fuente.trim() : "");
    const enLaFuente = f ? citaEnLaFuente(recortar(s.cita, MAX_LARGO_DE_LA_CITA * 2), f.texto) : null;
    // Lo que el consultor ya dijo con otras palabras no se le pasó (con Centauro, «Centralizar WhatsApp de soporte»).
    if (!que || !f || !enLaFuente || yaLoDijo(que, renglones) || seLePaso.some((p) => normal(p.que) === normal(que))) continue;
    seLePaso.push({ que, areaId: areaDe(s.areaId), cita: limpiarCita(enLaFuente, quienesHablan(f.texto)), reunion: f.etiqueta.slice(0, 200) });
  }
  const ordenDeArea = (id: string | null) => (id === null ? Number.POSITIVE_INFINITY : ctx.areas.findIndex((a) => a.id === id));
  return {
    en: ahora.toISOString(),
    corridaId,
    huella: huellaDeLaLectura(ctx.texto),
    porArea: [...porArea].sort((a, b) => ordenDeArea(a[0]) - ordenDeArea(b[0])).map(([areaId, casos]) => ({ areaId, casos })),
    seLePaso,
  };
}

/**
 * Lo que la lectura le dice al consultor antes de generar (Marco): sin nada escrito, la invitación; con muy poco (una
 * línea de dos o tres palabras), que trate de decir los casos en general.
 */
export function avisoDeLaLectura(texto: string): string | null {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).length;
  if (palabras === 0) return "Es opcional, pero ayuda: si no puedes decir en general qué casos necesita, quizás falta entender al cliente.";
  if (palabras < 5) return "Trata de decir los casos en general: qué área, qué cambia y para qué.";
  return null;
}
