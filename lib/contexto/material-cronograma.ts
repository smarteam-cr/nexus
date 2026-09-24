/**
 * lib/contexto/material-cronograma.ts — LO QUE EL CSE LE DA AL CRONOGRAMA, LISTO PARA EL AGENTE.
 * Puro: sin Prisma. Lo carga `cargarMaterialDelCronograma` (./cargar.ts) y lo importa también la
 * pantalla (los topes, el informe y sus conteos son los mismos para los dos lados).
 *
 * ── POR QUÉ EXISTE (2026-09-23) ──────────────────────────────────────────────
 * El agente que detalla el cronograma —el que decide las tareas por semana y cuáles son reuniones—
 * no leía NINGUNA reunión: solo las fases, el handoff confirmado, el requerimiento técnico y las
 * instrucciones del CSE. Todo lo que pasó en la implementación le llegaba, como mucho, a través
 * del handoff. El «Contexto del cronograma» le da las reuniones que el CSE ELIGIÓ y las notas que
 * pega a mano, rotuladas.
 *
 * ── UN SOLO MOTOR PARA TODOS LOS QUE LO LEEN (validación del 2026-09-23) ─────
 * Lo leen el detalle, «Pedir cambio con IA», el revisor de fases de «Regenerar todo» y el chat
 * del cronograma. Todos salen de acá: el mismo contenido por reunión, el mismo reparto, el mismo
 * calendario, la misma fecha y la misma frontera. Dos versiones de «qué le llegó a la IA» (una
 * para la pantalla y otra para el prompt) terminan diciendo cosas distintas: por eso el informe
 * que ve el CSE sale del MISMO plan que arma el bloque (`planDelMaterial`).
 *
 * ── QUÉ SE LEE DE CADA REUNIÓN ───────────────────────────────────────────────
 * `resumenDeReunion` arma, en este orden: la minuta revisada por el CSE, las notas de Gemini ENTERAS
 * con Decisiones y Próximos pasos primero, el overview y los compromisos de Fireflies, las
 * secciones, y la minuta en borrador. Al final va la COLA —lo primero que se recorta—: los
 * Detalles de Gemini, los temas clave y los bullets. El transcript entra solo si todo eso queda
 * flaco (`UMBRAL_RESUMEN_FLACO`). Antes se leía con el lector del handoff, que corta el resumen en
 * 1.500 caracteres: en CAV, los «Próximos pasos» de Gemini —lo que más le sirve al cronograma—
 * quedaban afuera siempre, y cada lectura traía el transcript entero (de 7k a 61k) para nada.
 *
 * ── EL REPARTO JUSTO ─────────────────────────────────────────────────────────
 * `repartirEspacio`: piso de 1.000 por reunión (entran por recencia mientras quepa el piso);
 * después todas suben parejo hasta su parte principal; lo que sobra va parejo a las colas. Nunca
 * más de 12.000 por reunión ni más del tope total. La escala del handoff (4.000 a la más reciente,
 * 400 a las viejas) castigaba a la reunión vieja que el CSE eligió a propósito: el kickoff quedaba
 * en dos líneas. Los empates se rompen por id: el mismo material da el mismo texto, byte a byte.
 *
 * ── LA FRONTERA VA ADENTRO DEL RÓTULO ────────────────────────────────────────
 * Las transcripciones y las notas son material INTERNO, y los títulos de las tareas, sus notas y
 * los nombres de fase los lee el cliente. La regla (`FRONTERA_DEL_MATERIAL`) viaja pegada al bloque
 * —no en el prompt sembrado— por dos motivos: los agentes que lo leen la reciben igual sin
 * re-sembrar ninguno, y la procedencia que viaja FUERA del texto se pierde por descuido de un call
 * site (Tanda H). El rótulo es NEUTRAL a propósito: lo leen agentes con trabajos distintos (uno
 * arma tareas, otro revisa fases, el chat conversa con el CSE); lo que cada uno hace con el
 * material va en su propio texto. Por eso «no digas de dónde salió» se limita a títulos, notas y
 * nombres de fase: al CSE, el chat sí le puede decir de qué reunión sacó un cambio.
 *
 * ── EL CALENDARIO (solo lectura) ─────────────────────────────────────────────
 * `calendarioDelCronograma` es EL calendario del plan (uno solo, con opciones para quien necesita
 * ids, estado u «Hoy»). Dice explícito «semana k de la fase (weekIndex k-1)» y «semana N del
 * proyecto»: las tareas se ubican con weekIndex desde 0 y la pantalla muestra semanas desde 1, y
 * sin decirlo el modelo corre todo una semana. Las fechas son para UBICAR lo que dicen las reuniones
 * y las notas, nunca para escribirlas: el sistema las calcula.
 *
 * ── LA FECHA ─────────────────────────────────────────────────────────────────
 * Una sola función (`fechaEnCostaRica`) para los encabezados, el «Hoy» y el «Hoy es…» del chat,
 * con la zona de Costa Rica fija: el VPS corre en UTC y una reunión de las 7 p. m. salía con el
 * día siguiente.
 */
import { MONTHS, computePhaseRanges } from "@/lib/timeline/weeks";

/** Tope total de las reuniones (caracteres de contenido; los encabezados no cuentan). */
export const TOPE_REUNIONES_CRONOGRAMA = 32_000;

/**
 * Tope total de las notas manuales. Lo lee también la pantalla, para avisar cuando lo que se pegó
 * no entra entero: un tope que solo conoce el servidor es texto que el CSE cree que el agente leyó.
 */
export const TOPE_NOTAS_CRONOGRAMA = 12_000;

/** Lo mínimo que se lleva cada reunión que entra: con menos, una reunión es un título y dos líneas. */
export const PISO_POR_REUNION = 1_000;

/** Lo máximo que se lleva una reunión, por más espacio que sobre: ninguna se come el tope sola. */
export const TECHO_POR_REUNION = 12_000;

/** Por debajo de esto el resumen es flaco y se le suma el inicio del transcript. */
export const UMBRAL_RESUMEN_FLACO = 1_500;

/**
 * Cuántas de las reuniones ELEGIDAS se leen como máximo, las más recientes primero. Con el piso
 * de 1.000 no entran más de 32 en 32.000 caracteres: leer más que eso solo cuesta tiempo.
 */
export const MAX_REUNIONES_A_LEER = 40;

/** La zona de TODAS las fechas del material. */
export const ZONA_HORARIA_DEL_CRONOGRAMA = "America/Costa_Rica";

/** Cómo termina una reunión que no entró entera. Va DENTRO de su cota, no se suma afuera. */
export const MARCA_DE_RECORTE = "\n[… sigue, recortado por espacio]";

/**
 * LA FRONTERA, en una sola constante: la llevan los dos rótulos de este archivo y la reusan los
 * agentes que escriben lo que lee el cliente. ⚠ Conserva el literal «NUNCA copies a un título de
 * tarea» (lo fijan los tests del material).
 */
export const FRONTERA_DEL_MATERIAL =
  "⛔ NUNCA copies a un título de tarea, a sus notas ni al nombre de una fase: nombres de personas, " +
  "montos, fechas, plazos, frases textuales ni opiniones internas; y en esos textos no digas de dónde " +
  "salió («según la reunión», «confirmado en el kick-off», «por la nota»). Títulos, notas y nombres " +
  "de fase los lee el cliente: escribe el trabajo, no la fuente.";

/**
 * EL ORDEN DE PESO entre las fuentes (decisión de Elías, 2026-09-23): las instrucciones del CSE
 * mandan; después lo elegido (reuniones y notas, y entre ellas lo más reciente); después el
 * handoff; lo típico del tipo de fase solo rellena.
 */
export const PESO_DE_LAS_FUENTES =
  "Cómo pesan las fuentes: las instrucciones del CSE mandan sobre todo; después, lo acordado o hecho " +
  "en estas reuniones y en las notas del CSE (si se contradicen, gana lo más reciente); después, el " +
  "handoff; lo típico del tipo de fase solo rellena lo que ninguna fuente dice.";

// ─────────────────────────────────────────────────────────────────────────────
// ── LA FECHA ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;
const SEMANA_MS = 7 * DIA_MS;

/**
 * El día de calendario EN COSTA RICA de un instante, como la medianoche UTC de ese día: así se
 * resta contra el ancla del cronograma (que es un día de calendario guardado en UTC, ver
 * lib/timeline/weeks.ts) sin sesgo de zona. El formateador se crea en cada llamada a propósito:
 * uno cacheado conservaría la zona del proceso con que se creó.
 */
export function diaEnCostaRica(ms: number): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA_DEL_CRONOGRAMA,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"));
}

/** «21 sep 2026» de un DÍA de calendario (medianoche UTC), con los meses de weeks.ts. */
function fmtDia(diaUtc: number, conAnio: boolean): string {
  const d = new Date(diaUtc);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${conAnio ? ` ${d.getUTCFullYear()}` : ""}`;
}

/**
 * LA fecha del material: el día en Costa Rica de un instante. «corta» = «22 sep 2026» (encabezados
 * y calendario); «larga» = «martes 22 de septiembre de 2026» (el «Hoy es…» del chat). Las dos salen
 * del mismo `diaEnCostaRica`, así que nunca dicen días distintos.
 */
export function fechaEnCostaRica(ms: number, formato: "corta" | "larga" = "corta"): string {
  const dia = diaEnCostaRica(ms);
  if (formato === "corta") return fmtDia(dia, true);
  return new Date(dia)
    .toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .replace(",", "");
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL CONTENIDO DE CADA REUNIÓN ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** La minuta de la reunión (SessionMinute), si la hay. `status`: DRAFT | REVIEWED | EDITED. */
export interface MinutaDeReunion {
  summary: string | null;
  decisions: unknown;
  agreements: unknown;
  risks: unknown;
  status: string;
}

export interface ContenidoDeReunion {
  texto: string;
  /**
   * Cuántos caracteres del PRINCIPIO de `texto` son lo principal (minuta, decisiones, próximos
   * pasos, resumen). Lo que sigue es la cola, lo primero que se recorta.
   */
  esencial: number;
}

/** string | string[] → string. Copiado de lib/sessions/transcript.ts (que importa Prisma). */
const asText = (v: unknown): string =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n- ") : typeof v === "string" ? v : "";

/** Los ítems de un campo Json de la minuta: [{ text }] o strings. */
function itemsDeMinuta(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === "string" && v.trim() ? [v.trim()] : [];
  return v
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string"
          ? (x as { text: string }).text
          : "",
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

function bloqueDeMinuta(m: MinutaDeReunion, rotulo: string): string {
  const partes: string[] = [];
  if (m.summary?.trim()) partes.push(m.summary.trim());
  for (const [nombre, valor] of [
    ["Decisiones", m.decisions],
    ["Acuerdos", m.agreements],
    ["Riesgos", m.risks],
  ] as const) {
    const items = itemsDeMinuta(valor);
    if (items.length) partes.push(`${nombre}:\n${items.map((i) => `- ${i}`).join("\n")}`);
  }
  return partes.length ? `**${rotulo}:**\n${partes.join("\n")}` : "";
}

/** Minúsculas, sin tildes, sin espacios de más ni «:» final — para comparar encabezados. */
const normalizarLinea = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Las líneas de relleno de las notas de Gemini (medido en las 8 reuniones de CAV). Solo se borran
 * líneas CORTAS que EMPIEZAN así: un párrafo de Detalles que arranque con «Invitado…» no se toca.
 */
const RELLENO_DE_GEMINI: readonly RegExp[] = [
  /^invitad[oa]s?(\s|$)/i,
  /^invited(\s|$)/i,
  /^archivos adjuntos(\s|$)/i,
  /^attachments(\s|$)/i,
  /^registros de la reuni[oó]n/i,
  /^meeting records/i,
  /^actualizamos la secci[oó]n .+ con tus comentarios\.?$/i,
  /^danos tu opini[oó]n/i,
  /^revisa las notas de gemini/i,
  /^¿?c[oó]mo es la calidad de estas notas/i,
];
const LARGO_MAXIMO_DEL_RELLENO = 200;

type Encabezado = "resumen" | "decisiones" | "pasos" | "detalles";
const ENCABEZADOS_DE_GEMINI: Readonly<Record<string, Encabezado>> = {
  resumen: "resumen",
  summary: "resumen",
  decisiones: "decisiones",
  decisions: "decisiones",
  "proximos pasos": "pasos",
  "pasos siguientes": "pasos",
  "next steps": "pasos",
  "suggested next steps": "pasos",
  detalles: "detalles",
  details: "detalles",
};

export interface NotasDeGeminiOrdenadas {
  /** Decisiones → Próximos pasos → Resumen → lo que no tenía encabezado conocido. */
  principal: string;
  /** Los Detalles (la cola). "" si no había. */
  detalle: string;
  /** ¿Trajo una sección de Próximos pasos con contenido? (así los action_items no se duplican) */
  conPasos: boolean;
}

const limpiar = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();

/**
 * LAS NOTAS DE GEMINI, en el orden que le sirve al cronograma. El overview de Gemini llega como
 * «Título / Invitado / Archivos adjuntos / Registros… / Resumen / Decisiones / Próximos pasos /
 * Detalles / Revisa las notas…». Se borra el título repetido y el relleno, y se reordena por
 * encabezados EXACTOS (una línea sola): lo accionable primero, los Detalles al final.
 *
 * Si no reconoce ningún encabezado (Fireflies, u otro formato), devuelve el texto limpio sin
 * reordenar y sin perder nada. Si Google renombra los encabezados se pierde la prioridad, nunca
 * el contenido.
 */
export function ordenarNotasDeGemini(overview: string, title: string): NotasDeGeminiOrdenadas {
  let lineas = overview
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""));
  const primera = lineas.findIndex((l) => l.trim());
  if (primera >= 0 && title.trim() && normalizarLinea(lineas[primera]) === normalizarLinea(title)) {
    lineas.splice(primera, 1);
  }
  lineas = lineas.filter(
    (l) => !(l.trim().length <= LARGO_MAXIMO_DEL_RELLENO && RELLENO_DE_GEMINI.some((re) => re.test(l.trim()))),
  );

  const secciones: { clave: Encabezado | null; rotulo: string; lineas: string[] }[] = [
    { clave: null, rotulo: "", lineas: [] },
  ];
  for (const l of lineas) {
    const clave = ENCABEZADOS_DE_GEMINI[normalizarLinea(l)];
    if (clave) secciones.push({ clave, rotulo: l.trim().replace(/:\s*$/, ""), lineas: [] });
    else secciones[secciones.length - 1].lineas.push(l);
  }
  if (secciones.length === 1) return { principal: limpiar(lineas.join("\n")), detalle: "", conPasos: false };

  const armar = (s: (typeof secciones)[number]) => {
    const cuerpo = limpiar(s.lineas.join("\n"));
    if (!cuerpo) return "";
    return s.clave ? `**${s.rotulo}:**\n${cuerpo}` : cuerpo;
  };
  const de = (clave: Encabezado | null) =>
    secciones
      .filter((s) => s.clave === clave)
      .map(armar)
      .filter(Boolean);
  const pasos = de("pasos");
  return {
    principal: [...de("decisiones"), ...pasos, ...de("resumen"), ...de(null)].join("\n\n"),
    detalle: de("detalles").join("\n\n"),
    conPasos: pasos.length > 0,
  };
}

/**
 * EL CONTENIDO DE UNA REUNIÓN desde su resumen y su minuta, sin transcript (ese lo suma
 * `contenidoDeReunion` solo si esto queda flaco). Nunca agrega el título ni «### Sesión:»: el
 * encabezado lo pone el bloque, una sola vez.
 */
export function resumenDeReunion(input: {
  title: string;
  summary: unknown;
  minuta: MinutaDeReunion | null;
}): ContenidoDeReunion {
  const s = (input.summary && typeof input.summary === "object" ? input.summary : {}) as {
    keywords?: unknown;
    overview?: unknown;
    action_items?: unknown;
    shorthand_bullet?: unknown;
    sections?: unknown;
  };
  const principal: string[] = [];
  const cola: string[] = [];
  const m = input.minuta;
  const revisada = !!m && (m.status === "REVIEWED" || m.status === "EDITED");

  // a) La minuta que el CSE revisó: lo más confiable que hay de la reunión.
  if (m && revisada) principal.push(bloqueDeMinuta(m, "Minuta revisada por el CSE"));

  // b) y c) El overview (Gemini se reordena; Fireflies pasa tal cual) y los compromisos.
  let conPasos = false;
  const overview = asText(s.overview);
  if (overview.trim()) {
    const g = ordenarNotasDeGemini(overview, input.title);
    principal.push(g.principal);
    cola.push(g.detalle);
    conPasos = g.conPasos;
  }
  const compromisos = asText(s.action_items).trim();
  if (compromisos && !conPasos) principal.push(`**Compromisos:**\n${compromisos}`);

  // d) Las secciones de Gemini, completas.
  if (Array.isArray(s.sections)) {
    for (const sec of s.sections as Array<{ title?: unknown; content?: unknown }>) {
      const t = typeof sec?.title === "string" ? sec.title.trim() : "";
      const c = typeof sec?.content === "string" ? sec.content.trim() : "";
      if (t && c) principal.push(`**${t}:**\n${c}`);
    }
  }

  // e) La minuta en borrador: vale menos que las notas de la reunión, pero más que nada.
  if (m && !revisada) principal.push(bloqueDeMinuta(m, "Minuta en borrador, sin revisar"));

  // La COLA: lo primero que se recorta.
  const temas = asText(s.keywords).trim();
  if (temas) cola.push(`**Temas clave:** ${temas}`);
  const bullets = asText(s.shorthand_bullet).trim();
  if (bullets) cola.push(`**Puntos:**\n${bullets}`);

  const cuerpo = principal.filter((p) => p.trim()).join("\n\n");
  const resto = cola.filter((c) => c.trim()).join("\n\n");
  return { texto: [cuerpo, resto].filter(Boolean).join("\n\n"), esencial: cuerpo.length };
}

/**
 * Le suma el INICIO del transcript a un resumen flaco (menos de `UMBRAL_RESUMEN_FLACO`), entre lo
 * principal y la cola. Con un resumen que ya dice lo que pasó, el transcript solo ocupa lugar.
 */
export function contenidoDeReunion(
  resumen: ContenidoDeReunion,
  inicioTranscripcion: string | null | undefined,
): ContenidoDeReunion {
  const inicio = inicioTranscripcion?.trim();
  if (!inicio || resumen.texto.length >= UMBRAL_RESUMEN_FLACO) return resumen;
  const principal = resumen.texto.slice(0, resumen.esencial).trim();
  const cola = resumen.texto.slice(resumen.esencial).trim();
  const conTranscripcion = [principal, `**Transcripción (extracto):**\n${inicio}`].filter(Boolean).join("\n\n");
  return {
    texto: [conTranscripcion, cola].filter(Boolean).join("\n\n"),
    // Lo flaco se completa con el transcript hasta el umbral: esa parte también es principal.
    esencial: Math.min(conTranscripcion.length, Math.max(resumen.esencial, UMBRAL_RESUMEN_FLACO)),
  };
}

/**
 * Recorta a `cota` caracteres CON la marca adentro. Si el corte cae justo en un fin de línea (como
 * al final de lo principal), corta ahí; si no, en el último salto de línea por encima del 70 % (o
 * en el último espacio), para no dejar una frase por la mitad.
 */
export function recortarReunion(texto: string, cota: number): string {
  if (texto.length <= cota) return texto;
  const disponible = cota - MARCA_DE_RECORTE.length;
  if (disponible <= 0) return texto.slice(0, Math.max(0, cota));
  const base = texto.slice(0, disponible);
  const salto = base.lastIndexOf("\n");
  const espacio = base.lastIndexOf(" ");
  const corte = texto[disponible] === "\n"
    ? disponible
    : salto >= disponible * 0.7
      ? salto
      : espacio >= disponible * 0.7
        ? espacio
        : disponible;
  return base.slice(0, corte).trimEnd() + MARCA_DE_RECORTE;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL REPARTO ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface ReunionParaRepartir {
  id: string;
  /** epoch ms */
  date: number;
  /** Largo de lo principal (ver `ContenidoDeReunion.esencial`). */
  esencial: number;
  /** Largo total del contenido. */
  largo: number;
}

export interface TopesDelReparto {
  tope: number;
  piso: number;
  techo: number;
}

export const TOPES_DEL_CRONOGRAMA: TopesDelReparto = {
  tope: TOPE_REUNIONES_CRONOGRAMA,
  piso: PISO_POR_REUNION,
  techo: TECHO_POR_REUNION,
};

/** La más reciente primero; a la misma hora, por id (determinista: el mismo material, el mismo texto). */
const masRecientePrimero = (a: { date: number; id: string }, b: { date: number; id: string }) =>
  b.date - a.date || a.id.localeCompare(b.id);

/**
 * Sube parejo las cotas de `reuniones` hacia `objetivo`, con `restante` caracteres. Devuelve lo
 * que no se usó. Lo que no se puede repartir en partes enteras va de a uno por orden de recencia.
 */
function llenarParejo(
  reuniones: readonly ReunionParaRepartir[],
  cotas: Map<string, number>,
  objetivo: (r: ReunionParaRepartir) => number,
  restante: number,
): number {
  while (restante > 0) {
    const abiertas = reuniones.filter((r) => (cotas.get(r.id) ?? 0) < objetivo(r));
    if (abiertas.length === 0) break;
    const parte = Math.floor(restante / abiertas.length);
    if (parte === 0) {
      for (const r of abiertas.slice(0, restante)) cotas.set(r.id, (cotas.get(r.id) ?? 0) + 1);
      return 0;
    }
    for (const r of abiertas) {
      const actual = cotas.get(r.id) ?? 0;
      const dar = Math.min(parte, objetivo(r) - actual);
      cotas.set(r.id, actual + dar);
      restante -= dar;
    }
  }
  return restante;
}

/**
 * EL REPARTO JUSTO del espacio entre reuniones que YA se sabe que tienen contenido, en tres pasos:
 *  1. entran por recencia mientras quepa el piso de todas (Σ min(largo, piso) ≤ tope); las que no,
 *     quedan afuera enteras — mejor 32 reuniones legibles que 40 de dos líneas;
 *  2. todas suben parejo hasta su parte principal (min(esencial, techo));
 *  3. lo que sobra va parejo a las colas, hasta min(largo, techo).
 *
 * ── POR QUÉ SE REPARTE DESPUÉS DE LEER (revisión adversarial, 2026-09-23) ────
 * Repartir antes de saber qué había adentro le daba el espacio a reuniones vacías —la mitad no
 * deja transcripción— y la que tenía material llegaba recortada. Quien llama lee primero y pasa
 * solo las que tienen contenido.
 *
 * @returns id → cota de caracteres. Una reunión que no aparece no entra.
 */
export function repartirEspacio(
  reuniones: readonly ReunionParaRepartir[],
  topes: TopesDelReparto = TOPES_DEL_CRONOGRAMA,
): Map<string, number> {
  const { tope, piso, techo } = topes;
  const orden = reuniones.filter((r) => r.largo > 0).sort(masRecientePrimero);
  const cotas = new Map<string, number>();

  let restante = tope;
  for (const r of orden) {
    const base = Math.min(r.largo, piso, techo);
    if (base > restante) break;
    cotas.set(r.id, base);
    restante -= base;
  }
  const entraron = orden.filter((r) => cotas.has(r.id));

  restante = llenarParejo(entraron, cotas, (r) => Math.min(Math.max(r.esencial, 0), r.largo, techo), restante);
  llenarParejo(entraron, cotas, (r) => Math.min(r.largo, techo), restante);
  return cotas;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL CALENDARIO ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface FaseDelCalendario {
  /** Solo se escribe con `conIds`. */
  id?: string;
  name: string;
  durationWeeks: number;
  startWeek?: number | null;
  /** PENDING | IN_PROGRESS | DONE | SUSPENDED. Solo se escribe con `conEstado`. */
  status?: string | null;
  /** Tareas hechas y total. Solo se escriben con `conEstado`. */
  hechas?: number;
  total?: number;
}

/**
 * La foto del plan: el ancla y las fases YA ordenadas por `order`. Mismo shape que devuelve
 * `prisma.projectTimeline.findUnique({ select: { anchorStartDate, phases } })`.
 */
export interface FotoDelCronograma {
  anchorStartDate: Date | string | null;
  phases: readonly FaseDelCalendario[];
}

export interface OpcionesDelCalendario {
  /** `[id: …]` de cada fase (para quien propone cambios de fases). */
  conIds?: boolean;
  /** Estado, cómo arranca y tareas hechas de cada fase. */
  conEstado?: boolean;
  /**
   * La línea de «Hoy». ⚠ El detalle va SIN hoy: con él, el modelo vacía las semanas que ya pasaron
   * aunque su trabajo no se haya hecho.
   */
  conHoy?: boolean;
}

const ROTULO_DEL_CALENDARIO =
  "=== CALENDARIO DEL CRONOGRAMA ACTUAL (solo lectura — para ubicar en el tiempo lo que dicen las reuniones y las notas) ===";

const COMO_SE_CUENTAN_LAS_SEMANAS =
  "Cómo se cuentan las semanas: «semana N del proyecto» cuenta desde el arranque, empezando en 1; " +
  "«semana k de la fase» es el weekIndex k-1 de sus tareas (la semana 1 de una fase es weekIndex 0).";

const CIERRE_DEL_CALENDARIO =
  "Úsalo SOLO para decidir en qué fase y semana cae algo que una reunión o una nota ubica en una fecha. " +
  "⛔ No escribas fechas ni plazos en ningún título, nota ni nombre de fase: el sistema las calcula.";

const ESTADOS_DE_FASE: Readonly<Record<string, string>> = {
  PENDING: "pendiente",
  IN_PROGRESS: "en curso",
  DONE: "terminada",
  SUSPENDED: "suspendida",
};

/** El día de calendario del ancla (medianoche UTC). null sin ancla o con un ancla inválida. */
function diaDelAncla(ancla: Date | string | null | undefined): number | null {
  if (!ancla) return null;
  const d = new Date(ancla);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

interface PlanEnSemanas {
  fases: readonly FaseDelCalendario[];
  rangos: { start: number; end: number }[];
  span: number;
}

function planEnSemanas(foto: FotoDelCronograma | null | undefined): PlanEnSemanas | null {
  const fases = foto?.phases ?? [];
  if (fases.length === 0) return null;
  // computePhaseRanges respeta startWeek: una fase fijada arranca ahí (en paralelo), no tras la anterior.
  const rangos = computePhaseRanges(
    fases.map((f) => ({ durationWeeks: f.durationWeeks, startWeek: f.startWeek ?? null })),
  );
  return { fases, rangos, span: rangos.reduce((m, r) => Math.max(m, r.end), 0) };
}

/** «semana N del proyecto: «X», su semana k de d (weekIndex k-1)» para la semana ABSOLUTA `w` (0-indexed). */
function dondeCaeLaSemana(plan: PlanEnSemanas, w: number): string {
  if (w < 0) return "antes del arranque del plan";
  if (w >= plan.span) return "después del cierre planificado";
  const en = plan.fases
    .map((f, i) => ({ f, r: plan.rangos[i] }))
    .filter(({ r }) => r.start <= w && w < r.end)
    .map(({ f, r }) => `«${f.name}», su semana ${w - r.start + 1} de ${r.end - r.start} (weekIndex ${w - r.start})`);
  return `semana ${w + 1} del proyecto: ${en.length ? en.join(" y ") : "ninguna fase planificada esa semana"}`;
}

/**
 * EN QUÉ PARTE DEL PLAN cae un instante (una reunión): «semana 2 del proyecto: «Diagnóstico», su
 * semana 1 de 2 (weekIndex 0)» — con fases en paralelo, «… y «Y», su semana …» —, «antes del
 * arranque del plan», «después del cierre planificado», o "" sin ancla o sin fases (no hay dónde
 * ubicarla). El día se toma en Costa Rica.
 */
export function ubicarEnElCronograma(foto: FotoDelCronograma | null | undefined, ms: number): string {
  const plan = planEnSemanas(foto);
  const ancla = diaDelAncla(foto?.anchorStartDate);
  if (!plan || ancla === null) return "";
  return dondeCaeLaSemana(plan, Math.floor((diaEnCostaRica(ms) - ancla) / SEMANA_MS));
}

/**
 * EL CALENDARIO DEL PLAN, de solo lectura — uno solo para todos los agentes, con opciones.
 * Una línea por fase y, debajo, cada semana de la fase con su weekIndex, su semana del proyecto y
 * el día en que empieza.
 *
 * "" sin fases. Sin ancla: "" también, salvo con `conIds` (quien propone cambios de fases necesita
 * los ids igual), y entonces sale con semanas relativas y sin fechas — nunca inventa un arranque.
 */
export function calendarioDelCronograma(
  foto: FotoDelCronograma | null | undefined,
  ahora: number,
  opts: OpcionesDelCalendario = {},
): string {
  const plan = planEnSemanas(foto);
  if (!plan) return "";
  const ancla = diaDelAncla(foto?.anchorStartDate);
  if (ancla === null && !opts.conIds) return "";

  const lineas: string[] = [ROTULO_DEL_CALENDARIO];
  if (ancla !== null) {
    lineas.push(
      `Arranque del plan: ${fmtDia(ancla, true)} · cierre planificado: ${fmtDia(ancla + plan.span * SEMANA_MS, true)} ` +
        `(${plan.span} ${plan.span === 1 ? "semana" : "semanas"}).`,
    );
    if (opts.conHoy) {
      const hoy = Math.floor((diaEnCostaRica(ahora) - ancla) / SEMANA_MS);
      lineas.push(
        `Hoy: ${fechaEnCostaRica(ahora)} — ${dondeCaeLaSemana(plan, hoy)}. Que una semana ya haya pasado no ` +
          `quiere decir que su trabajo esté hecho.`,
      );
    }
  } else {
    lineas.push("Sin fecha de arranque: las semanas son relativas y ninguna reunión se puede ubicar en el plan.");
  }
  lineas.push(COMO_SE_CUENTAN_LAS_SEMANAS);

  plan.fases.forEach((f, i) => {
    const r = plan.rangos[i];
    const dur = r.end - r.start;
    let cabecera =
      `${i + 1}. ${f.name}${opts.conIds && f.id ? ` [id: ${f.id}]` : ""} — ` +
      `${dur === 1 ? `semana ${r.start + 1}` : `semanas ${r.start + 1}–${r.end}`} del proyecto`;
    if (opts.conEstado) {
      cabecera += f.startWeek != null ? ` · fijada en la semana ${f.startWeek + 1} del proyecto` : " · arranca tras la anterior";
      if (f.status) cabecera += ` · ${ESTADOS_DE_FASE[f.status] ?? f.status.toLowerCase()}`;
      if (f.total != null) cabecera += ` · ${f.hechas ?? 0}/${f.total} tareas hechas`;
    }
    lineas.push(cabecera);
    for (let k = 0; k < dur; k++) {
      const desde = ancla === null ? "" : `, desde el ${fmtDia(ancla + (r.start + k) * SEMANA_MS, false)}`;
      lineas.push(`   · semana ${k + 1} de la fase (weekIndex ${k}) = semana ${r.start + k + 1} del proyecto${desde}`);
    }
  });
  lineas.push(CIERRE_DEL_CALENDARIO);
  return lineas.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS BLOQUES ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface ReunionParaElCronograma {
  title: string;
  /** epoch ms */
  date: number;
  /** «[CON EL CLIENTE] » / «[PUERTAS ADENTRO] » / "" — de `prefijoDeSala`. */
  prefijoDeSala: string;
  /**
   * En qué parte del plan cayó (de `ubicarEnElCronograma`). Opcional: el chat arma el bloque SIN
   * ubicación, para que su caché no cambie cada vez que se mueve una fase.
   */
  ubicacion?: string;
  /** El contenido ya recortado a su cota. `null` = la reunión no dejó nada. */
  contenido: string | null;
}

export interface NotaParaElCronograma {
  title: string | null;
  content: string;
}

/**
 * El bloque de REUNIONES para el agente. `""` si no hay ninguna con contenido — un rótulo sin nada
 * abajo le dice al modelo que le falta material, y gasta presupuesto.
 */
export function bloqueDeReunionesDelCronograma(reuniones: readonly ReunionParaElCronograma[]): string {
  const conContenido = reuniones.filter((r) => r.contenido && r.contenido.trim());
  if (conContenido.length === 0) return "";
  const cuerpo = conContenido
    .map(
      (r) =>
        `### ${r.prefijoDeSala}${r.title || "(sin título)"} — ${fechaEnCostaRica(r.date)}` +
        `${r.ubicacion ? ` · ${r.ubicacion}` : ""}\n${(r.contenido ?? "").trim()}`,
    )
    .join("\n\n---\n\n");
  return (
    `=== REUNIONES QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA (material INTERNO) ===\n` +
    `Las eligió a propósito: úsalas para decidir el trabajo del cronograma — qué se hace, cuándo y con ` +
    `quién. ${PESO_DE_LAS_FUENTES} ${FRONTERA_DEL_MATERIAL}\n\n${cuerpo}`
  );
}

/**
 * El bloque de NOTAS MANUALES para el agente. `""` sin notas. Se recorta al tope TOTAL (no por nota):
 * el orden es el de carga, así que lo que no entra es lo último que se pegó — la pantalla lo avisa.
 */
export function bloqueDeNotasDelCronograma(notas: readonly NotaParaElCronograma[]): string {
  const completo = cuerpoDeNotas(notas);
  if (!completo) return "";
  const cuerpo = completo.slice(0, TOPE_NOTAS_CRONOGRAMA);
  return (
    `=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\n` +
    `Son hechos que no quedaron en ninguna reunión (una decisión, un cambio de prioridad, algo que ` +
    `ya se hizo). Pesan igual que una reunión elegida y más que el handoff; las instrucciones del CSE ` +
    `mandan sobre ellas. ${FRONTERA_DEL_MATERIAL}\n\n${cuerpo}`
  );
}

/** El texto de las notas SIN recortar — el mismo armado que lee el agente. `""` sin notas. */
function cuerpoDeNotas(notas: readonly NotaParaElCronograma[]): string {
  return notas
    .filter((n) => n.content.trim())
    .map((n, i) => `### Nota: ${n.title?.trim() || `(sin título ${i + 1})`}\n${n.content.trim()}`)
    .join("\n\n---\n\n");
}

/**
 * ¿Lo que se pegó pasa el tope? Para el aviso de la pantalla. Mide el MISMO texto que se recorta
 * (`cuerpoDeNotas`): contar solo título + contenido dejaba afuera rótulos y separadores, y el aviso
 * llegaba después de que el agente ya estaba perdiendo el final.
 */
export function notasPasanElTope(notas: readonly NotaParaElCronograma[]): boolean {
  return cuerpoDeNotas(notas).length > TOPE_NOTAS_CRONOGRAMA;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PLAN Y SU INFORME ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * completa      — entra entera;
 * recortada     — entra una parte (ver `cortaLoEsencial`);
 * afuera        — no entra: no hubo espacio, o quedó fuera de las que se leen;
 * sin-contenido — no dejó transcripción, resumen ni minuta;
 * futura        — todavía no ocurrió (entra cuando pase).
 */
export type EstadoDeReunion = "completa" | "recortada" | "afuera" | "sin-contenido" | "futura";

export interface InformeDeReunion {
  sessionId: string;
  title: string;
  /** epoch ms */
  date: number;
  estado: EstadoDeReunion;
  /** Largo del contenido armado (0 si no se leyó). */
  caracteres: number;
  /** Cuántos de esos caracteres le llegan a la IA (con la marca de recorte). */
  entran: number;
  /** `true` si lo que entra no cubre la parte principal (minuta, decisiones, próximos pasos, resumen). */
  cortaLoEsencial: boolean;
}

export interface InformeDelMaterial {
  /** De la más reciente a la más vieja. */
  reuniones: InformeDeReunion[];
  notas: { cantidad: number; caracteres: number; entran: number; tope: number };
}

/** Cómo se leyó una reunión elegida (lo decide el cargador, que es quien sabe la fecha y el tope). */
export type LecturaDeReunion =
  | { tipo: "futura" }
  | { tipo: "sin-leer" }
  | ({ tipo: "leida" } & ContenidoDeReunion);

export interface ReunionElegida {
  id: string;
  title: string;
  /** epoch ms */
  date: number;
  prefijoDeSala: string;
  ubicacion?: string;
  lectura: LecturaDeReunion;
}

export interface PlanDelMaterial {
  /** Las que entran, en orden cronológico (el cronograma se lee como una historia), ya recortadas. */
  reuniones: ReunionParaElCronograma[];
  informe: InformeDelMaterial;
  /** Ids de las reuniones que le llegan a la IA, para la trazabilidad de la corrida. */
  sesionesUsadas: string[];
  /** Los textos que entraron (reuniones recortadas + notas), para revisar la salida contra la frontera. */
  materialInterno: string[];
}

/**
 * EL PLAN DEL MATERIAL: qué entra de cada reunión elegida y con qué estado. Lo usan el cargador
 * (lo que lee la IA) y la pantalla (lo que ve el CSE), así que no pueden separarse. Las futuras,
 * las vacías y las que no se leyeron salen solo en el informe.
 */
export function planDelMaterial(input: {
  elegidas: readonly ReunionElegida[];
  notas?: readonly NotaParaElCronograma[];
  topeReuniones?: number;
}): PlanDelMaterial {
  const conContenido = input.elegidas.filter(
    (r): r is ReunionElegida & { lectura: { tipo: "leida" } & ContenidoDeReunion } =>
      r.lectura.tipo === "leida" && !!r.lectura.texto.trim(),
  );
  const espacio = repartirEspacio(
    conContenido.map((r) => {
      const largo = r.lectura.texto.length;
      // Lo principal de una reunión que se va a recortar necesita lugar también para la marca.
      const esencial = r.lectura.esencial < largo ? Math.min(largo, r.lectura.esencial + MARCA_DE_RECORTE.length) : largo;
      return { id: r.id, date: r.date, esencial, largo };
    }),
    { ...TOPES_DEL_CRONOGRAMA, tope: input.topeReuniones ?? TOPE_REUNIONES_CRONOGRAMA },
  );

  const informe: InformeDeReunion[] = [];
  const entraron: { r: ReunionElegida; texto: string }[] = [];
  for (const r of input.elegidas) {
    const base = { sessionId: r.id, title: r.title, date: r.date };
    const l = r.lectura;
    if (l.tipo === "futura") {
      informe.push({ ...base, estado: "futura", caracteres: 0, entran: 0, cortaLoEsencial: false });
      continue;
    }
    if (l.tipo === "sin-leer") {
      informe.push({ ...base, estado: "afuera", caracteres: 0, entran: 0, cortaLoEsencial: false });
      continue;
    }
    if (!l.texto.trim()) {
      informe.push({ ...base, estado: "sin-contenido", caracteres: 0, entran: 0, cortaLoEsencial: false });
      continue;
    }
    const cota = espacio.get(r.id);
    if (cota === undefined) {
      informe.push({ ...base, estado: "afuera", caracteres: l.texto.length, entran: 0, cortaLoEsencial: l.esencial > 0 });
      continue;
    }
    const texto = recortarReunion(l.texto, cota);
    const recortada = texto !== l.texto;
    informe.push({
      ...base,
      estado: recortada ? "recortada" : "completa",
      caracteres: l.texto.length,
      entran: texto.length,
      cortaLoEsencial: recortada && texto.length - MARCA_DE_RECORTE.length < l.esencial,
    });
    entraron.push({ r, texto });
  }

  const cronologicas = entraron.sort((a, b) => a.r.date - b.r.date || a.r.id.localeCompare(b.r.id));
  const cuerpo = cuerpoDeNotas(input.notas ?? []);
  const notasQueEntran = cuerpo.slice(0, TOPE_NOTAS_CRONOGRAMA);
  return {
    reuniones: cronologicas.map(({ r, texto }) => ({
      title: r.title,
      date: r.date,
      prefijoDeSala: r.prefijoDeSala,
      ...(r.ubicacion ? { ubicacion: r.ubicacion } : {}),
      contenido: texto,
    })),
    informe: {
      reuniones: informe.sort((a, b) => b.date - a.date || a.sessionId.localeCompare(b.sessionId)),
      notas: {
        cantidad: (input.notas ?? []).filter((n) => n.content.trim()).length,
        caracteres: cuerpo.length,
        entran: notasQueEntran.length,
        tope: TOPE_NOTAS_CRONOGRAMA,
      },
    },
    sesionesUsadas: cronologicas.map(({ r }) => r.id),
    materialInterno: [...cronologicas.map(({ texto }) => texto), ...(notasQueEntran ? [notasQueEntran] : [])],
  };
}

export interface ResumenDelInforme {
  /** Todas las reuniones elegidas, incluidas las futuras. */
  elegidas: number;
  /** Las que le llegan a la IA (completas + recortadas). */
  entran: number;
  completas: number;
  recortadas: number;
  /** De las recortadas, cuántas pierden parte de lo principal. */
  cortanLoEsencial: number;
  afuera: number;
  sinContenido: number;
  futuras: number;
  notas: number;
  notasRecortadas: boolean;
}

/**
 * LOS CONTEOS del informe, una sola vez: de acá salen la línea cerrada del «Contexto del
 * cronograma», el aviso de la lista de reuniones y la línea de lectura del chat. Dos conteos
 * hechos a mano terminan diciendo números distintos.
 */
export function resumenDelInforme(informe: InformeDelMaterial | null | undefined): ResumenDelInforme {
  const r = informe?.reuniones ?? [];
  const cuantas = (e: EstadoDeReunion) => r.filter((x) => x.estado === e).length;
  const completas = cuantas("completa");
  const recortadas = cuantas("recortada");
  return {
    elegidas: r.length,
    entran: completas + recortadas,
    completas,
    recortadas,
    cortanLoEsencial: r.filter((x) => x.estado === "recortada" && x.cortaLoEsencial).length,
    afuera: cuantas("afuera"),
    sinContenido: cuantas("sin-contenido"),
    futuras: cuantas("futura"),
    notas: informe?.notas.cantidad ?? 0,
    notasRecortadas: !!informe && informe.notas.entran < informe.notas.caracteres,
  };
}
