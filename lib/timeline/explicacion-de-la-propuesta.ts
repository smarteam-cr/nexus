/**
 * lib/timeline/explicacion-de-la-propuesta.ts — EL PORQUÉ DE LA PROPUESTA, con fuentes NUEVAS (L6, 2026-09-26).
 * Puro y client-safe.
 *
 * Cada fase que cambia puede traer una frase que dice por qué, y la propuesta una frase general. La escribe una
 * llamada aparte a Haiku, pero con una LISTA CERRADA de fuentes: lo que entró desde la última generación APLICADA
 * (D8, `ProjectTimeline.detailGeneratedByAgentRunId`):
 *   · [I1…] las líneas de las «Instrucciones adicionales» que leyó ESTA corrida y no estaban en la anterior;
 *   · [R1…] las reuniones que leyó esta corrida y no la anterior;
 *   · [N1…] las notas cargadas después de la anterior;
 *   · [H]   el último handoff, si es posterior.
 * Sin corrida anterior (primera generación), todo cuenta como nuevo.
 *
 * ⛔ LA IA NO PONE NÚMEROS NI TÍTULOS (spec §0.1): devuelve ids de la lista y una frase corta. El código valida
 * (`leerExplicacion`): la fase y las fuentes tienen que estar en la lista, alguna fuente citada tiene que NOMBRAR la
 * fase como palabras completas (D9: sin eso, la frase sería una justificación inventada después de los hechos) y la
 * frase no lleva cifras, palabras de número, meses, comillas ni voseo. Lo que no pasa se descarta sin tirar: la fase
 * queda en `sinMaterial` y la pantalla lo dice UNA vez, en «Más» (`lineaSinMaterial`). Los chips («Reunión «T» ·
 * 12 sep») los escribe el código.
 *
 * Dónde corre: dentro de la fusión del paso 2 (borrador-del-detalle.ts), antes de su escritura y en la MISMA
 * escritura (`explicacion` en `pendingProposal`), con tope de 15 s. La lectura de la base vive aparte, en
 * fuentes-de-la-explicacion.ts (server). La guarda: explicacion-de-la-propuesta.test.ts, con la propuesta grande.
 * Los textos, en tuteo neutro (entra en la lista de tuteo de contexto-cronograma.test.ts).
 */
import { parseObject } from "@/lib/ai/section-schema";
import { bloqueDeInstruccionesDeDoc } from "@/lib/business-cases/section-briefs";
import { faseDeLaTarea, huellaDeTexto, ordenCompletoDeLaPropuesta, type Cambio, type Vivo } from "./borrador";
import { cortarNombre, fuenteDelMotivo, huellaDePalabras, type FuenteVerificada } from "./mensaje-de-la-propuesta";
import type { FuentesDeLaPropuesta } from "./referencias-de-la-propuesta";
import { fmtDay } from "./weeks";

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TIPOS ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que LEYÓ una corrida del paso 2 (va en su `output`): así la siguiente sabe qué es nuevo. */
export interface FuentesDeLaGeneracion {
  /** Las «Instrucciones adicionales» tal cual (sin el rótulo del prompt), hasta 8000 caracteres. */
  instrucciones: string;
  /** Las reuniones que leyó (`contexto.sesionesUsadas`). */
  sesiones: string[];
  /** Cuándo las leyó (ISO). */
  en: string;
}

/** La generación aplicada contra la que se mide lo nuevo (D8). `instrucciones` null = no se sabe: todas cuentan. */
export interface AnteriorDeLaGeneracion {
  en: string;
  sesiones: string[];
  instrucciones: string | null;
  /** De dónde salen sus instrucciones: su propia salida, el `previousBrief` del `__doc` (aprox.) o ninguna. */
  deDonde: "corrida" | "previousBrief" | "nada";
}

export type TipoDeFuente = "instrucciones" | "reunion" | "nota" | "handoff";

/** Una fuente de la lista cerrada, con su id corto (I1, R2, N1, H). */
export interface FuenteNueva {
  id: string;
  tipo: TipoDeFuente;
  titulo: string | null;
  fecha: string | null;
  texto: string;
}

/** Lo que se guarda de una fuente citada: el chip lo arma el código (`textoDeLaFuente`). */
export type FuenteCitada = { tipo: TipoDeFuente; titulo: string | null; fecha: string | null };

/** Una fase que cambia, como la lee la IA (id corto F1…) y como la ubica el código (`clave`: el id o `n:…`). */
export interface CambioDeFaseParaExplicar {
  id: string;
  clave: string;
  nombre: string;
  /** Otro nombre con el que una fuente puede nombrarla (el nuevo, si la propuesta la renombra). */
  otrosNombres: string[];
  estado: string;
  /** Conteos, hasta 6 títulos que entran y 6 que se van, y el motivo del paso 1. */
  resumen: string;
}

export interface Explicacion {
  /** La corrida del paso 2 que la escribió. */
  corrida: string;
  /** La versión del borrador con que se escribió. */
  version: number;
  /** `huellaDeLosCambios` de la lista que se escribió: si hoy es otra, la frase es «de cuando se generó». */
  huellaDeCambios: string;
  general: { frase: string; fuentes: FuenteCitada[] } | null;
  fases: Array<{ fase: string; frase: string; fuentes: FuenteCitada[] }>;
  /** Claves de fase con cambios y sin frase válida. */
  sinMaterial: string[];
  /** Cuándo fue la generación anterior (ISO), para «desde la generación del 25 sep». null = primera. */
  desde: string | null;
}

/** Lo que devuelve `explicar` (la ruta): la fusión le pone la corrida, la versión y la huella. */
export type ExplicacionSinSello = Omit<Explicacion, "corrida" | "version" | "huellaDeCambios">;
/** Lo que se deja leer de la respuesta del modelo, y por qué se descartó lo demás (sin el texto: va al log). */
export type LecturaDeLaExplicacion = Omit<Explicacion, "corrida" | "version" | "huellaDeCambios" | "desde"> & {
  descartes: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TOPES Y LOS TEXTOS ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const TOPE_DE_LAS_INSTRUCCIONES_LEIDAS = 8000;
/** Largo de cada fuente que lee la IA. */
export const TOPE_DEL_FRAGMENTO = 600;
/** Cuántas fuentes de cada tipo entran en la lista. */
export const TOPE_DE_FUENTES_POR_TIPO = 12;
/** Cuántas fases se explican (las de más cambios primero). */
export const TOPE_DE_FASES = 15;
/** Títulos que entran y que se van, por fase, en el resumen. */
export const TOPE_DE_TITULOS = 6;
export const LARGO_MINIMO_DE_LA_FRASE = 20;
export const LARGO_MAXIMO_DE_LA_FRASE = 180;

/** Después de una frase cuando el chat editó la propuesta desde que se generó. */
export const TEXTO_DE_CUANDO_SE_GENERO = "(de cuando se generó)";
export const CHIP_DE_LAS_INSTRUCCIONES = "Instrucciones adicionales · línea nueva";

/**
 * ⭐ El prompt de sistema (vive en código, como el del paso 1: nunca en la base). El usuario es `mensajeParaExplicar`.
 */
export const PROMPT_EXPLICACION = [
  "Explicas en una frase por qué cambia cada fase de una propuesta de cronograma, solo con las fuentes nuevas de la lista.",
  "Cita solo ids de la lista (I1, R2, N1, H). Si ninguna fuente nueva explica el cambio de una fase, no escribas nada para esa fase.",
  "Nada de números, cantidades, fechas ni meses. No nombres reuniones ni notas: el sistema pone sus títulos. Sin comillas.",
  "Una oración de hasta 180 caracteres, en tuteo, para el CSE.",
  'Responde solo JSON: {"general":{"frase":"…","fuentes":["I1"]} | null,"fases":[{"fase":"F3","frase":"…","fuentes":["R1"]}]}',
].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// ── LO QUE LEYÓ LA CORRIDA ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const esListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** El rótulo con que el prompt envuelve las instrucciones (`bloqueDeInstruccionesDeDoc`): no es del CSE. */
const ROTULO_DE_LAS_INSTRUCCIONES = bloqueDeInstruccionesDeDoc("·").split("\n")[0];

/** Las instrucciones tal cual las escribió el CSE, desde el bloque que leyó el agente (sin su rótulo). */
export function instruccionesDelBloque(bloque: string): string {
  const t = bloque.replace(/\r\n?/g, "\n").trim();
  return (t.startsWith(ROTULO_DE_LAS_INSTRUCCIONES) ? t.slice(ROTULO_DE_LAS_INSTRUCCIONES.length) : t).trim();
}

/** Lo que leyó esta corrida, para su `output` (se arma al construir el mensaje del paso 2). */
export function fuentesDeLaGeneracion(i: { bloqueDeInstrucciones: string; sesiones: readonly string[]; en: Date }): FuentesDeLaGeneracion {
  return {
    instrucciones: instruccionesDelBloque(i.bloqueDeInstrucciones).slice(0, TOPE_DE_LAS_INSTRUCCIONES_LEIDAS),
    sesiones: [...new Set(i.sesiones)],
    en: i.en.toISOString(),
  };
}

/** Las `fuentesDeLaGeneracion` de una salida ya parseada, validadas. null = la corrida es anterior a L6. */
export function fuentesDeLaGeneracionDe(salida: unknown): FuentesDeLaGeneracion | null {
  const f = esObjeto(salida) ? salida.fuentesDeLaGeneracion : null;
  if (!esObjeto(f) || typeof f.instrucciones !== "string" || !esListaDeTextos(f.sesiones) || typeof f.en !== "string") return null;
  if (Number.isNaN(Date.parse(f.en))) return null;
  return { instrucciones: f.instrucciones, sesiones: [...f.sesiones], en: f.en };
}

/** El `output` guardado de una corrida (un JSON en texto), o null. */
function salidaGuardada(output: string | null): unknown {
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * La generación anterior (D8), desde su corrida. Sus instrucciones: las que ella misma guardó; si es anterior a L6
 * (no las guardó), el `previousBrief` del `__doc` (aproximado: el valor anterior a la última edición); si no hay
 * nada, null (todas cuentan como nuevas). ⭐ Con las suyas, el `previousBrief` no se mira.
 */
export function anteriorDeLaCorrida(
  corrida: { output: string | null; sourceSessionIds: readonly string[]; createdAt: Date } | null,
  previousBrief: string | null,
): AnteriorDeLaGeneracion | null {
  if (!corrida) return null;
  const propias = fuentesDeLaGeneracionDe(salidaGuardada(corrida.output));
  if (propias) return { en: propias.en, sesiones: propias.sesiones, instrucciones: propias.instrucciones, deDonde: "corrida" };
  const brief = previousBrief?.trim() ? previousBrief : null;
  return {
    en: corrida.createdAt.toISOString(),
    sesiones: [...corrida.sourceSessionIds],
    instrucciones: brief,
    deDonde: brief ? "previousBrief" : "nada",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAS FUENTES NUEVAS ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const corto = (t: string, tope = TOPE_DEL_FRAGMENTO) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > tope ? `${s.slice(0, tope - 1).trimEnd()}…` : s;
};
const lineasDe = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

export interface EntradaDeLasFuentesNuevas {
  /** Lo que leyó ESTA corrida. */
  leidas: FuentesDeLaGeneracion;
  /** La generación aplicada; null = primera generación (todo cuenta como nuevo). */
  anterior: AnteriorDeLaGeneracion | null;
  /** Las reuniones que leyó esta corrida, con su título, su fecha y su contenido. */
  reuniones: ReadonlyArray<{ id: string; titulo: string; fecha: string; texto: string }>;
  /** Las notas vivas del cronograma, con su fecha de carga. */
  notas: ReadonlyArray<{ titulo: string | null; fecha: string; texto: string }>;
  /** El último handoff (sus fases, en texto) y cuándo corrió. */
  handoff: { fecha: string; texto: string } | null;
}

/**
 * ⭐ La lista CERRADA de fuentes nuevas (D8), comparada contra lo que leyó la generación anterior, nunca contra «lo de
 * ahora»: una reunión que la anterior ya había leído no es nueva aunque hoy siga elegida.
 */
export function fuentesNuevas(i: EntradaDeLasFuentesNuevas): FuenteNueva[] {
  const out: FuenteNueva[] = [];
  const hasta = Date.parse(i.leidas.en);
  const desde = i.anterior ? Date.parse(i.anterior.en) : Number.NEGATIVE_INFINITY;

  // Instrucciones: cada línea nueva (por su huella de palabras), una vez.
  const antes = i.anterior?.instrucciones != null ? new Set(lineasDe(i.anterior.instrucciones).map(huellaDePalabras)) : null;
  const vistas = new Set<string>();
  for (const l of lineasDe(i.leidas.instrucciones)) {
    const h = huellaDePalabras(l);
    if (!h || vistas.has(h) || antes?.has(h)) continue;
    vistas.add(h);
    const n = out.filter((f) => f.tipo === "instrucciones").length;
    if (n >= TOPE_DE_FUENTES_POR_TIPO) break;
    out.push({ id: `I${n + 1}`, tipo: "instrucciones", titulo: null, fecha: null, texto: corto(l) });
  }

  // Reuniones: las que leyó esta corrida y no la anterior.
  const leidas = new Set(i.leidas.sesiones);
  const previas = i.anterior ? new Set(i.anterior.sesiones) : null;
  let r = 0;
  for (const x of i.reuniones) {
    if (!leidas.has(x.id) || previas?.has(x.id) || r >= TOPE_DE_FUENTES_POR_TIPO) continue;
    out.push({ id: `R${++r}`, tipo: "reunion", titulo: x.titulo, fecha: x.fecha, texto: corto(x.texto) });
  }

  // Notas: las cargadas después de la anterior (y antes de que esta corrida leyera).
  let n = 0;
  for (const x of i.notas) {
    const t = Date.parse(x.fecha);
    if (!(t > desde) || t > hasta || n >= TOPE_DE_FUENTES_POR_TIPO) continue;
    out.push({ id: `N${++n}`, tipo: "nota", titulo: x.titulo?.trim() || null, fecha: x.fecha, texto: corto(x.texto) });
  }

  // El handoff, solo si corrió después de la anterior.
  if (i.handoff) {
    const t = Date.parse(i.handoff.fecha);
    if (t > desde && t <= hasta) out.push({ id: "H", tipo: "handoff", titulo: null, fecha: i.handoff.fecha, texto: corto(i.handoff.texto) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAS FASES QUE CAMBIAN ────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const ETIQUETA_DEL_CAMPO: Record<string, string> = {
  durationWeeks: "duración (semanas)",
  startWeek: "inicio (semana del proyecto)",
  sessionCount: "sesiones",
  notes: "nota",
  activityType: "tipo",
  name: "nombre",
};

interface Grupo {
  clave: string;
  campos: string[];
  motivos: string[];
  entran: string[];
  seVan: string[];
  cambian: string[];
  nombreNuevo: string | null;
  esNueva: string | null;
  seVa: boolean;
  total: number;
}

/**
 * Las fases con cambios, como las lee la IA. Sin lo que dictó el chat (no lo pidió ninguna fuente: lo pidió el CSE), ni
 * las mudanzas que SUGIERE la IA (L7: nacen sin marcar, no son un cambio de la propuesta todavía), ni lo que decide el
 * SISTEMA (M2, D9: el kickoff que sobra o el que faltaba; su porqué es la regla, no una reunión). Hasta 15, las de más
 * cambios primero (empate: el orden del Gantt), con ids F1….
 */
export function cambiosParaExplicar(vivo: Vivo, cambios: readonly Cambio[]): CambioDeFaseParaExplicar[] {
  const grupos = new Map<string, Grupo>();
  const grupo = (clave: string): Grupo => {
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, campos: [], motivos: [], entran: [], seVan: [], cambian: [], nombreNuevo: null, esNueva: null, seVa: false, total: 0 };
      grupos.set(clave, g);
    }
    return g;
  };
  for (const c of cambios) {
    if (c.porChat) continue;
    if (c.tipo === "ancla" || c.tipo === "orden") continue;
    if (c.tipo === "tarea-cambia" && c.sugerida) continue;
    /* M2 (2026-09-27, D9 de la spec del replanteo): lo que decide el sistema no pasa por la explicación. Si pasara,
       Haiku le buscaría una reunión a una regla, contaría para el tope de 15 fases y «Más» lo sumaría a «cambian sin
       material nuevo». Su porqué ya lo dice su fila («ya hay kickoff») y la línea del sistema en el Gantt. */
    if ((c.tipo === "tarea-nueva" || c.tipo === "tarea-se-va") && c.delSistema) continue;
    const clave = c.tipo === "fase-nueva" ? c.clave : c.tipo === "fase-cambia" || c.tipo === "fase-se-va" ? c.faseId : faseDeLaTarea(c);
    const g = grupo(clave);
    g.total++;
    if ((c.tipo === "fase-nueva" || c.tipo === "fase-cambia" || c.tipo === "fase-se-va") && c.motivo) g.motivos.push(c.motivo);
    switch (c.tipo) {
      case "fase-nueva":
        g.esNueva = c.fase.name;
        g.campos.push(`fase nueva de ${c.fase.durationWeeks} semanas`);
        break;
      case "fase-cambia":
        if (c.campo === "name" && typeof c.a === "string") g.nombreNuevo = c.a;
        g.campos.push(`${ETIQUETA_DEL_CAMPO[c.campo] ?? c.campo}: ${c.desde ?? "vacío"} → ${c.a ?? "vacío"}`);
        break;
      case "fase-se-va":
        g.seVa = true;
        g.campos.push("se quita la fase");
        break;
      case "tarea-nueva":
        g.entran.push(c.tarea.title);
        break;
      case "tarea-se-va":
        g.seVan.push(c.desde.title);
        break;
      case "tarea-cambia":
        g.cambian.push(c.desde.title);
        break;
    }
  }
  const vivas = new Map(vivo.fases.map((f) => [f.id, f]));
  const orden = ordenCompletoDeLaPropuesta(vivo, cambios);
  const lugar = (clave: string) => {
    const k = orden.indexOf(clave);
    return k < 0 ? Number.MAX_SAFE_INTEGER : k;
  };
  const ordenados = [...grupos.values()].sort((a, b) => b.total - a.total || lugar(a.clave) - lugar(b.clave)).slice(0, TOPE_DE_FASES);
  return ordenados.map((g, k): CambioDeFaseParaExplicar => {
    const viva = vivas.get(g.clave);
    const nombre = viva?.name ?? g.esNueva ?? g.clave;
    const estado = g.esNueva
      ? "nueva"
      : g.seVa
        ? "se quita"
        : viva?.status === "DONE"
          ? "terminada"
          : viva?.status === "IN_PROGRESS"
            ? "en curso"
            : "pendiente";
    const titulos = (xs: string[]) => xs.slice(0, TOPE_DE_TITULOS).map((t) => `"${corto(t, 80)}"`).join(", ") + (xs.length > TOPE_DE_TITULOS ? "…" : "");
    const tareas = [
      g.entran.length ? `${g.entran.length} nuevas` : "",
      g.seVan.length ? `${g.seVan.length} se quitan` : "",
      g.cambian.length ? `${g.cambian.length} cambian` : "",
    ].filter(Boolean);
    const partes = [
      ...g.campos,
      tareas.length ? `tareas: ${tareas.join(", ")}` : "",
      g.entran.length ? `entran: ${titulos(g.entran)}` : "",
      g.seVan.length ? `se van: ${titulos(g.seVan)}` : "",
      g.motivos.length ? `motivo del revisor de fases: ${corto([...new Set(g.motivos)].join(" / "), 300)}` : "",
    ].filter(Boolean);
    return {
      id: `F${k + 1}`,
      clave: g.clave,
      nombre,
      otrosNombres: g.nombreNuevo && g.nombreNuevo !== nombre ? [g.nombreNuevo] : [],
      estado,
      resumen: partes.join("; "),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL MENSAJE Y LA LECTURA ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const ROTULO_DE_LA_FUENTE: Record<TipoDeFuente, string> = {
  instrucciones: "Instrucciones adicionales, línea nueva",
  reunion: "Reunión nueva",
  nota: "Nota nueva",
  handoff: "Handoff nuevo",
};

/** El mensaje de usuario de la llamada: la lista cerrada de fuentes y las fases que cambian, con ids cortos. */
export function mensajeParaExplicar(f: readonly FuenteNueva[], c: readonly CambioDeFaseParaExplicar[]): string {
  const fuentes = f.map((x) => {
    const titulo = x.titulo ? ` "${corto(x.titulo, 120)}"` : "";
    const fecha = x.fecha && x.tipo !== "instrucciones" ? ` (${x.fecha.slice(0, 10)})` : "";
    return `[${x.id}] ${ROTULO_DE_LA_FUENTE[x.tipo]}${titulo}${fecha}: ${x.texto}`;
  });
  const fases = c.map((x) => `[${x.id}] "${x.nombre}" (${x.estado}): ${x.resumen}`);
  return ["=== FUENTES NUEVAS (solo puedes citar estas) ===", ...fuentes, "", "=== FASES QUE CAMBIAN ===", ...fases].join("\n");
}

/** D9: ¿`texto` nombra a `nombre` como palabras completas? «CS» no calza en «CSV»; «Semana 0» sí en ««Semana 0» sigue». */
export function nombraLaFase(texto: string, nombre: string): boolean {
  const h = huellaDePalabras(nombre);
  return h.length > 0 && ` ${huellaDePalabras(texto)} `.includes(` ${h} `);
}

/** Palabras de número (las cifras las pone el código). «uno/una» no: son artículos. */
const PALABRAS_DE_NUMERO =
  /(^|[^\p{L}\p{N}])(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\p{L}+|veinte|veinti\p{L}+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|doscientos|trescientos|quinientos|mil|miles|millón|millones|docena|docenas|mitad|doble|triple|cuádruple)(?=$|[^\p{L}\p{N}])/iu;
/** Meses, completos y abreviados, como palabra. */
const MESES =
  /(^|[^\p{L}\p{N}])(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|set|oct|nov|dic)(?=$|[^\p{L}\p{N}])/iu;
/**
 * Voseo (las formas de la spec §0.1), con límites que entienden las tildes (`\b` de JS no). Las letras van escapadas
 * (\u00e1 = á, \u00e9 = é, \u00ed = í, \u0065 = e, \u0061 = a): la guarda de tuteo (contexto-cronograma.test.ts) lee
 * este archivo y confundiría el detector con un texto en voseo.
 */
const VOSEO =
  /(^|[^\p{L}\p{N}])(pod\u00e9s|quer\u00e9s|ten\u00e9s|d\u0065cime|d\u0065c\u00edmelo|fij\u0061te|mir\u00e1|revis\u00e1|sab\u00e9s|eleg\u00ed|aplic\u00e1)(?=$|[^\p{L}\p{N}])/iu;

/** Por qué una frase de la IA no se muestra, o null si vale. Solo el motivo: el texto no va al log. */
export function porQueSeDescarta(frase: unknown): string | null {
  if (typeof frase !== "string") return "no es texto";
  const t = frase.trim();
  if (t.length < LARGO_MINIMO_DE_LA_FRASE) return "muy corta";
  if (t.length > LARGO_MAXIMO_DE_LA_FRASE) return "muy larga";
  if (/\d/.test(t)) return "trae cifras";
  if (PALABRAS_DE_NUMERO.test(t)) return "trae palabras de número";
  if (MESES.test(t)) return "trae meses";
  if (/[«»"“”]/.test(t)) return "trae comillas";
  if (VOSEO.test(t)) return "voseo";
  return null;
}

const citada = (f: FuenteNueva): FuenteCitada => ({ tipo: f.tipo, titulo: f.titulo, fecha: f.fecha });

/**
 * ⭐ Lo que se deja leer de la respuesta del modelo. Valida y descarta sin tirar: JSON tolerante; la fase en la
 * lista; las fuentes, no vacías y todas de la lista; alguna fuente citada NOMBRA la fase (D9); la frase, por
 * `porQueSeDescarta`. La general, igual menos la mención. Las fases sin frase válida van a `sinMaterial`.
 */
export function leerExplicacion(
  crudo: unknown,
  f: readonly FuenteNueva[],
  c: readonly CambioDeFaseParaExplicar[],
): LecturaDeLaExplicacion {
  const obj = typeof crudo === "string" ? parseObject(crudo) : esObjeto(crudo) ? crudo : {};
  const porId = new Map(f.map((x) => [x.id, x]));
  const porFase = new Map(c.map((x) => [x.id, x]));
  const descartes: string[] = [];

  const lasFuentes = (v: unknown, donde: string): FuenteNueva[] | null => {
    if (!Array.isArray(v) || v.length === 0) {
      descartes.push(`${donde}: sin fuentes`);
      return null;
    }
    const out: FuenteNueva[] = [];
    for (const id of v) {
      const x = typeof id === "string" ? porId.get(id.trim()) : undefined;
      if (!x) {
        descartes.push(`${donde}: una fuente fuera de la lista`);
        return null;
      }
      if (!out.includes(x)) out.push(x);
    }
    return out;
  };
  const laFrase = (v: unknown, donde: string): string | null => {
    const motivo = porQueSeDescarta(v);
    if (motivo) {
      descartes.push(`${donde}: ${motivo}`);
      return null;
    }
    return (v as string).trim();
  };

  let general: LecturaDeLaExplicacion["general"] = null;
  if (esObjeto(obj.general)) {
    const frase = laFrase(obj.general.frase, "general");
    const fuentes = frase ? lasFuentes(obj.general.fuentes, "general") : null;
    if (frase && fuentes) general = { frase, fuentes: fuentes.map(citada) };
  }

  const validas = new Map<string, { frase: string; fuentes: FuenteCitada[] }>();
  for (const item of Array.isArray(obj.fases) ? obj.fases : []) {
    if (!esObjeto(item)) continue;
    const id = typeof item.fase === "string" ? item.fase.trim() : "";
    const fase = porFase.get(id);
    if (!fase) {
      descartes.push("una fase fuera de la lista");
      continue;
    }
    if (validas.has(fase.clave)) {
      descartes.push(`${id}: repetida`);
      continue;
    }
    const frase = laFrase(item.frase, id);
    if (!frase) continue;
    const fuentes = lasFuentes(item.fuentes, id);
    if (!fuentes) continue;
    const nombres = [fase.nombre, ...fase.otrosNombres];
    const nombrada = fuentes.some((x) => nombres.some((n) => nombraLaFase(`${x.titulo ?? ""} ${x.texto}`, n)));
    if (!nombrada) {
      descartes.push(`${id}: ninguna fuente citada nombra la fase`);
      continue;
    }
    validas.set(fase.clave, { frase, fuentes: fuentes.map(citada) });
  }
  return {
    general,
    fases: c.filter((x) => validas.has(x.clave)).map((x) => ({ fase: x.clave, ...validas.get(x.clave)! })),
    sinMaterial: c.filter((x) => !validas.has(x.clave)).map((x) => x.clave),
    descartes,
  };
}

/**
 * ⭐ La explicación de una propuesta, con el modelo inyectado (`llamar`): la ruta pasa Haiku, los tests un doble. Sin
 * fases que cambian, o SIN FUENTES NUEVAS, no se llama al modelo: todas las fases van a `sinMaterial`. Si el modelo
 * tira, tira (quien la llama la envuelve con su tope y su `catch`).
 */
export async function explicarLaPropuesta(i: {
  fuentes: readonly FuenteNueva[];
  cambios: readonly CambioDeFaseParaExplicar[];
  desde: string | null;
  llamar: (sistema: string, mensaje: string) => Promise<string>;
  /** Los motivos de lo descartado (sin el texto), para el log. */
  alDescartar?: (descartes: string[]) => void;
}): Promise<ExplicacionSinSello> {
  if (i.cambios.length === 0) return { general: null, fases: [], sinMaterial: [], desde: i.desde };
  if (i.fuentes.length === 0) return { general: null, fases: [], sinMaterial: i.cambios.map((c) => c.clave), desde: i.desde };
  const respuesta = await i.llamar(PROMPT_EXPLICACION, mensajeParaExplicar(i.fuentes, i.cambios));
  const { descartes, ...leida } = leerExplicacion(respuesta, i.fuentes, i.cambios);
  if (descartes.length > 0) i.alDescartar?.(descartes);
  return { ...leida, desde: i.desde };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO GUARDADO Y LA PANTALLA ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** JSON con las claves ordenadas y sin `undefined`: la base (jsonb) reordena las claves al guardar. */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : canonico(x)));
  if (esObjeto(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonico(v[k]);
    return out;
  }
  return v;
}

/** La huella de una lista de cambios: la que se escribe con la explicación y la que se compara al leerla. */
export function huellaDeLosCambios(cambios: readonly unknown[]): string {
  return huellaDeTexto(JSON.stringify(canonico(cambios)));
}

const TIPOS: readonly TipoDeFuente[] = ["instrucciones", "reunion", "nota", "handoff"];
function leerCitadas(v: unknown): FuenteCitada[] | null {
  if (!Array.isArray(v)) return null;
  const out: FuenteCitada[] = [];
  for (const x of v) {
    if (!esObjeto(x) || !TIPOS.includes(x.tipo as TipoDeFuente)) return null;
    const titulo = typeof x.titulo === "string" ? x.titulo : null;
    const fecha = typeof x.fecha === "string" ? x.fecha : null;
    out.push({ tipo: x.tipo as TipoDeFuente, titulo, fecha });
  }
  return out;
}

/** La explicación guardada en la propuesta (`pendingProposal.explicacion`), validada. null = no hay o no se deja leer. */
export function explicacionGuardada(guardado: unknown): Explicacion | null {
  const e = esObjeto(guardado) ? guardado.explicacion : null;
  if (!esObjeto(e) || typeof e.corrida !== "string" || typeof e.huellaDeCambios !== "string") return null;
  if (typeof e.version !== "number" || !Number.isInteger(e.version)) return null;
  let general: Explicacion["general"] = null;
  if (esObjeto(e.general)) {
    const fuentes = leerCitadas(e.general.fuentes);
    if (typeof e.general.frase !== "string" || !fuentes) return null;
    general = { frase: e.general.frase, fuentes };
  } else if (e.general !== null && e.general !== undefined) return null;
  if (!Array.isArray(e.fases) || !esListaDeTextos(e.sinMaterial)) return null;
  const fases: Explicacion["fases"] = [];
  for (const x of e.fases) {
    const fuentes = esObjeto(x) ? leerCitadas(x.fuentes) : null;
    if (!esObjeto(x) || typeof x.fase !== "string" || typeof x.frase !== "string" || !fuentes) return null;
    fases.push({ fase: x.fase, frase: x.frase, fuentes });
  }
  const desde = typeof e.desde === "string" ? e.desde : null;
  return { corrida: e.corrida, version: e.version, huellaDeCambios: e.huellaDeCambios, general, fases, sinMaterial: [...e.sinMaterial], desde };
}

/** La explicación de la propuesta en pantalla y si es VIEJA (el chat editó los cambios desde que se generó). */
export interface ExplicacionEnPantalla {
  explicacion: Explicacion;
  vieja: boolean;
}

/** Desde lo guardado tal cual (`pendingProposal`): la huella se compara con SUS `cambios`, los que se escribieron. */
export function explicacionEnPantalla(guardado: unknown): ExplicacionEnPantalla | null {
  const explicacion = explicacionGuardada(guardado);
  if (!explicacion) return null;
  const cambios = esObjeto(guardado) && Array.isArray(guardado.cambios) ? guardado.cambios : [];
  return { explicacion, vieja: explicacion.huellaDeCambios !== huellaDeLosCambios(cambios) };
}

/** El chip de una fuente citada: «Instrucciones adicionales · línea nueva», «Reunión «T» · 12 sep», «Nota «T»», «Handoff · 12 ago». */
export function textoDeLaFuente(f: FuenteCitada): string {
  const dia = f.fecha && !Number.isNaN(Date.parse(f.fecha)) ? ` · ${fmtDay(new Date(f.fecha))}` : "";
  switch (f.tipo) {
    case "instrucciones":
      return CHIP_DE_LAS_INSTRUCCIONES;
    case "reunion":
      return `Reunión «${cortarNombre(f.titulo ?? "sin título")}»${dia}`;
    case "nota":
      return `Nota «${cortarNombre(f.titulo ?? "sin título")}»`;
    case "handoff":
      return `Handoff${dia}`;
  }
}

/**
 * «Más», UNA vez: «10 fases cambian sin una reunión, nota o instrucción nueva que las nombre (desde la generación del
 * 25 sep).». Es lo que el código verificó; no afirma que nada lo pida. null si todas tienen frase.
 */
export function lineaSinMaterial(e: Pick<Explicacion, "sinMaterial" | "desde">): string | null {
  const n = e.sinMaterial.length;
  if (n === 0) return null;
  const desde = e.desde && !Number.isNaN(Date.parse(e.desde)) ? ` (desde la generación del ${fmtDay(new Date(e.desde))})` : "";
  return n === 1
    ? `1 fase cambia sin una reunión, nota o instrucción nueva que la nombre${desde}.`
    : `${n} fases cambian sin una reunión, nota o instrucción nueva que las nombre${desde}.`;
}

/** La frase general para la barra, con sus chips y «(de cuando se generó)» si es vieja. */
export function fraseGeneral(e: ExplicacionEnPantalla | null): { frase: string; fuentes: string[] } | null {
  const g = e?.explicacion.general;
  if (!g) return null;
  return { frase: e.vieja ? `${g.frase} ${TEXTO_DE_CUANDO_SE_GENERO}` : g.frase, fuentes: [...new Set(g.fuentes.map(textoDeLaFuente))] };
}

/** El porqué de una fase en el Gantt: la frase de L6, o los motivos del paso 1 con su fuente verificada (L4). */
export type PorqueDeLaFase =
  | { tipo: "frase"; frase: string; fuentes: string[]; vieja: boolean }
  | { tipo: "motivos"; motivos: Array<{ motivo: string; fuente: FuenteVerificada | null }> };

/**
 * ⭐ La prioridad (spec §7.5): la frase de L6 > el motivo verificado (L4) > «Según la IA: …», este último SOLO si no hay
 * explicación guardada (las propuestas de antes de L6, o una llamada que no llegó a tiempo). Con explicación y sin
 * frase ni motivo verificado, NO hay línea: lo dice «Más», una vez.
 */
export function porqueDeLaFase(
  fase: string,
  motivos: readonly string[],
  e: ExplicacionEnPantalla | null,
  fuentes: FuentesDeLaPropuesta | null,
): PorqueDeLaFase | null {
  const conFrase = e?.explicacion.fases.find((x) => x.fase === fase);
  if (e && conFrase) {
    return { tipo: "frase", frase: conFrase.frase, fuentes: [...new Set(conFrase.fuentes.map(textoDeLaFuente))], vieja: e.vieja };
  }
  const conFuente = [...new Set(motivos)].map((motivo) => ({ motivo, fuente: fuenteDelMotivo(motivo, fuentes) }));
  const quedan = e ? conFuente.filter((m) => m.fuente !== null) : conFuente;
  return quedan.length > 0 ? { tipo: "motivos", motivos: quedan } : null;
}
