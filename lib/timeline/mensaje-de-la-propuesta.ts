/**
 * lib/timeline/mensaje-de-la-propuesta.ts — EL MENSAJE DE ARRIBA DEL GANTT, con los números del código (L4, 2026-09-26).
 * Puro y client-safe.
 *
 * Cada propuesta trae arriba un mensaje corto que dice cómo estaba, cómo queda y por qué, en este orden (spec §5.1):
 *   1. el cierre y su causa: «El cierre pasa del 13 oct al 10 nov (+4 semanas): «X» pasa de 3 a 5 semanas y se suma
 *      «Y» (2).»;
 *   2. contra lo prometido (lo último que se subió al cliente) y contra el último handoff (aprox.), siempre «hoy → con
 *      la propuesta»;
 *   3. qué tareas se rehacen y que las hechas conservan su estado;
 *   4. si la IA no tuvo reuniones ni notas;
 *   5. las atrasadas, «hoy 59 → con la propuesta 67»: el atraso ya existe, la propuesta no lo crea.
 * Hasta 5 líneas de ≤ 140 caracteres. Lo demás («Más»): dónde se concentran los cambios, una fase terminada que recibe
 * tareas, los atrasos cargados (en una frase APARTE, nunca como causa) y, si es prácticamente otro cronograma, por qué.
 *
 * ⛔ LOS NÚMEROS LOS PONE EL CÓDIGO (spec §0.1): todo sale de `resumir` (`r` con lo marcado; `entera`, la propuesta
 * entera, para el nivel), del vivo y de las referencias del GET. Nunca de contar `borrador.cambios`, y nunca del
 * `motivo` que escribió la IA: el motivo solo decide si hay un chip de su fuente (`fuenteDelMotivo`), y se muestra solo
 * si calza con una fuente real de la corrida (D9).
 * Los textos, en tuteo neutro (entra en la lista de tuteo de contexto-cronograma.test.ts). La guarda:
 * mensaje-de-la-propuesta.test.ts, con la propuesta grande anonimizada.
 */
import {
  ordenCompletoDeLaPropuesta,
  type Borrador,
  type Cambio,
  type CambioDeEstructura,
  type PedidoDelBorrador,
  type ResumenDelBorrador,
  type Vivo,
} from "./borrador";
import { unirFrases } from "./magnitud-propuesta";
import type { FuentesDeLaPropuesta, PrometidoDeLaPropuesta, ReferenciasDeLaPropuesta } from "./referencias-de-la-propuesta";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges, fmtDay, plural, semanaDelProyecto, type ProjectedEnd } from "./weeks";

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TIPOS ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export type NivelDeLaPropuesta = "primera" | "casi-todo" | "mediano" | "casi-igual";

/** Un atraso cargado (una particularidad): solo cuentan los `ATRASO` posteriores a lo prometido. */
export interface AtrasoCargado {
  kind: string;
  party: string;
  weeksImpact: number | null;
  occurredAt: string;
}

export interface EntradaDelMensaje {
  vivo: Vivo;
  borrador: Borrador;
  /** El resumen con lo marcado. */
  r: ResumenDelBorrador;
  /** `resumir(vivo, borrador, [], { tareas })`: la propuesta ENTERA. Decide el nivel (no salta al tocar casillas). */
  entera: ResumenDelBorrador;
  referencias: ReferenciasDeLaPropuesta | null;
  atrasos: ReadonlyArray<AtrasoCargado>;
  /** El cierre fijado a mano (Tanda K), YYYY-MM-DD, o null. */
  cierreFijado: string | null;
  /** Hoy; null antes de hidratar: sin la línea de las atrasadas. */
  hoy: Date | null;
}

/** Una fuente real de un cambio de fases: «Instrucciones adicionales», «Reunión «T» · 12 sep», «Nota «T»». */
export interface FuenteVerificada {
  tipo: "instrucciones" | "reunion" | "nota";
  texto: string;
}

export interface MensajeDeLaPropuesta {
  nivel: NivelDeLaPropuesta;
  /** Qué cambia, sin cuentas («Rehace casi todas las pendientes»). */
  titulo: string;
  /** `warn` solo en «casi todo»: el tono de la barra. */
  tono: "warn" | "info";
  /** ≤ 5, cada una ≤ 140 caracteres. */
  lineas: string[];
  /** Lo de «Más». */
  detalle: string[];
  /** De dónde salen los cambios de fases, solo lo verificado (chips). */
  fuentes: FuenteVerificada[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TEXTOS ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const TOPE_DE_LA_LINEA = 140;
/** Los nombres de fase se cortan acá: con dos causas, la línea del cierre entra en 140. */
export const TOPE_DEL_NOMBRE = 28;

export const TITULOS_DEL_MENSAJE = {
  primera: "Primer cronograma",
  casiNuevo: "Cronograma casi nuevo",
  casiTodo: "Rehace casi todas las pendientes",
  mediano: "Cambia parte del cronograma",
  casiIgual: "Ajuste chico",
} as const;

/** La línea 4: lo verificable es que no tuvo reuniones ni notas (el paso 2 lee también el handoff y el cronograma). */
export const LINEA_SIN_MATERIAL = "No elegiste reuniones ni notas: la IA armó las tareas sin saber qué pasó en el proyecto.";
/** Antes de los chips de «Más». */
export const TEXTO_DE_LAS_FUENTES = "Los cambios de fases salen de:";
export const FUENTE_INSTRUCCIONES = "Instrucciones adicionales";

const PARTES_DEL_ATRASO: ReadonlyArray<readonly [string, string]> = [
  ["CLIENTE", "cliente"],
  ["AMBOS", "ambos"],
  ["SMARTEAM", "Smarteam"],
  ["DEV", "desarrollo"],
];

// ─────────────────────────────────────────────────────────────────────────────
// ── LO CHICO ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Un nombre de fase (o de reunión o nota) cortado a `TOPE_DEL_NOMBRE` con «…». */
export function cortarNombre(nombre: string): string {
  const n = nombre.trim();
  return n.length > TOPE_DEL_NOMBRE ? `${n.slice(0, TOPE_DEL_NOMBRE - 1).trimEnd()}…` : n;
}

/** Días de calendario (UTC) de `a` a `b`. */
function diasEntre(a: Date, b: Date): number {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(b) - dia(a)) / 86_400_000);
}

const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** «+4 semanas», «−1 semana»; si no son semanas enteras, en días. */
function corrimiento(dias: number): string {
  if (dias % 7 === 0) return `${conSigno(dias / 7)} ${Math.abs(dias) === 7 ? "semana" : "semanas"}`;
  return `${conSigno(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`;
}

/** La huella de palabras (D9): sin tildes, en minúsculas, todo lo que no es letra ni número pasa a un espacio. */
export function huellaDePalabras(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** ¿`texto` nombra a `nombre` como palabras completas? `(^| )huella( |$)`: «CS» no calza dentro de «CSE». */
function nombraComoPalabras(texto: string, nombre: string): boolean {
  const h = huellaDePalabras(nombre);
  return h.length > 0 && ` ${huellaDePalabras(texto)} `.includes(` ${h} `);
}

const contarVivas = (vivo: Vivo, status: string) =>
  vivo.fases.reduce((n, f) => n + (f.tareas ?? []).filter((t) => t.status === status).length, 0);

/** Semanas contra lo prometido: por fecha si las dos tienen; si no, por semanas del plan. */
function contraLoPrometido(cierre: ProjectedEnd, p: PrometidoDeLaPropuesta): number {
  if (p.cierreISO && cierre.date) return Math.round(diasEntre(new Date(p.cierreISO), cierre.date) / 7);
  return cierre.spanWeeks - p.semanas;
}

/** «9 semanas tarde», «2 semanas antes», «a tiempo». */
function tardeOAntes(n: number, conUnidad: boolean): string {
  if (n === 0) return "a tiempo";
  const abs = Math.abs(n);
  return `${abs}${conUnidad ? ` ${abs === 1 ? "semana" : "semanas"}` : ""} ${n > 0 ? "tarde" : "antes"}`;
}

/** «hoy 9 semanas tarde → 13», «hoy 2 semanas antes → 1 tarde», «hoy a tiempo → 2 semanas tarde». */
function hoyYConLaPropuesta(antes: number, despues: number): string {
  if (antes !== 0 && despues !== 0 && Math.sign(antes) === Math.sign(despues)) return `hoy ${tardeOAntes(antes, true)} → ${Math.abs(despues)}`;
  return `hoy ${tardeOAntes(antes, true)} → ${tardeOAntes(despues, antes === 0)}`;
}

/** La primera variante que entra en el tope (si ninguna, la más corta). */
function laQueEntra(variantes: readonly string[]): string {
  return variantes.find((v) => v.length <= TOPE_DE_LA_LINEA) ?? [...variantes].sort((a, b) => a.length - b.length)[0];
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─────────────────────────────────────────────────────────────────────────────
// ── EL NIVEL ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ Cuánto cambia la propuesta ENTERA (D7): decide el título y el tono, y NO salta al tocar casillas. «primera» si es
 * «Generar cronograma»; «casi-todo» si es prácticamente otro cronograma (`magnitud`, la regla de siempre) o si quita el
 * 60 % o más de las pendientes; «casi-igual» si no cambia la estructura y toca pocas tareas (≤ 2, o ≤ 20 % de las
 * pendientes); si no, «mediano».
 */
export function nivelDeLaPropuesta(
  entera: Pick<ResumenDelBorrador, "items" | "tareas" | "magnitud">,
  vivo: Vivo,
  pedido: PedidoDelBorrador | null,
): { nivel: NivelDeLaPropuesta; porMagnitud: boolean } {
  if (pedido === "primera") return { nivel: "primera", porMagnitud: false };
  if (entera.magnitud.esCronogramaNuevo) return { nivel: "casi-todo", porMagnitud: true };
  const pendientes = contarVivas(vivo, "PENDING");
  const quitadas = entera.tareas.seVan + entera.tareas.conLaFase;
  if (quitadas / Math.max(pendientes, 1) >= 0.6) return { nivel: "casi-todo", porMagnitud: false };
  const conEstructura = entera.items.some((it) => it.estado === "aplica" || it.estado === "excluido");
  const tareas = quitadas + entera.tareas.nuevas + entera.tareas.cambian;
  if (!conEstructura && tareas <= Math.max(2, Math.ceil(0.2 * pendientes))) return { nivel: "casi-igual", porMagnitud: false };
  return { nivel: "mediano", porMagnitud: false };
}

function tituloDelNivel(nivel: NivelDeLaPropuesta, porMagnitud: boolean): string {
  if (nivel === "primera") return TITULOS_DEL_MENSAJE.primera;
  if (nivel === "casi-todo") return porMagnitud ? TITULOS_DEL_MENSAJE.casiNuevo : TITULOS_DEL_MENSAJE.casiTodo;
  return nivel === "mediano" ? TITULOS_DEL_MENSAJE.mediano : TITULOS_DEL_MENSAJE.casiIgual;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAS PIEZAS ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un cambio de estructura en palabras, para la causa del cierre: ««X» pasa de 3 a 5 semanas», «se suma «Y» (2)»,
 * «se quita «Z»», «el arranque pasa al 2 jun», «cambia el orden». Los nombres, cortados a 28 caracteres.
 */
export function etiquetaLargaDelCambio(c: CambioDeEstructura, vivo: Vivo): string {
  const nombreDe = (id: string, respaldo: string) => cortarNombre(vivo.fases.find((f) => f.id === id)?.name ?? respaldo);
  switch (c.tipo) {
    case "fase-cambia": {
      const nombre = nombreDe(c.faseId, c.fase);
      if (c.campo === "durationWeeks") return `«${nombre}» pasa de ${Number(c.desde)} a ${plural(Number(c.a), "semana", "semanas")}`;
      if (c.campo === "startWeek")
        return c.a === null ? `«${nombre}» pasa a arrancar tras la anterior` : `«${nombre}» pasa a arrancar en ${semanaDelProyecto(Number(c.a))}`;
      return `cambia «${nombre}»`;
    }
    case "fase-nueva":
      return `se suma «${cortarNombre(c.fase.name)}» (${c.fase.durationWeeks})`;
    case "fase-se-va":
      return `se quita «${nombreDe(c.faseId, c.desde.name)}»`;
    case "ancla":
      return `el arranque pasa al ${fmtDay(new Date(c.a))}`;
    case "orden":
      return "cambia el orden";
    default: {
      const _: never = c;
      return _;
    }
  }
}

/** Los cambios de estructura MARCADOS que mueven el cierre, en el orden de sus números. */
function causasDelCierre(i: EntradaDelMensaje): string[] {
  const porClave = new Map<string, Cambio>(i.borrador.cambios.map((c) => [c.clave, c]));
  return [...i.r.items]
    .filter((it) => it.estado === "aplica")
    .sort((a, b) => a.numero - b.numero)
    .flatMap((it) => {
      const c = porClave.get(it.clave);
      if (!c) return [];
      const mueve =
        (c.tipo === "fase-cambia" && (c.campo === "durationWeeks" || c.campo === "startWeek")) ||
        c.tipo === "fase-nueva" ||
        c.tipo === "fase-se-va" ||
        c.tipo === "ancla" ||
        c.tipo === "orden";
      return mueve ? [etiquetaLargaDelCambio(c as CambioDeEstructura, i.vivo)] : [];
    });
}

/** «A y B», o «A, B y 3 cambios más» si no entran todas. */
function lasCausas(causas: readonly string[], cuantas: number): string {
  const mostradas = causas.slice(0, cuantas);
  const resto = causas.length - mostradas.length;
  return resto > 0 ? unirFrases([...mostradas, plural(resto, "cambio más", "cambios más")]) : unirFrases(mostradas);
}

/** Línea 1: el cierre, cómo se mueve y por qué. */
function lineaDelCierre(i: EntradaDelMensaje, nivel: NivelDeLaPropuesta): string {
  const { r, cierreFijado } = i;
  const antes = r.cierreAntes;
  const despues = r.cierreDespues;
  if (nivel === "primera") {
    const fases = plural(r.proyeccion.fases.length, "fase", "fases");
    const semanas = plural(despues.spanWeeks, "semana", "semanas");
    return `Primer cronograma: ${fases}, ${semanas}${despues.date ? `, cierre ${fmtDay(despues.date)}` : ""}.`;
  }
  const conFechas = !!(antes.date || despues.date);
  let mueve: boolean;
  let frase: string;
  if (antes.date && despues.date) {
    const dias = diasEntre(antes.date, despues.date);
    mueve = dias !== 0;
    frase = mueve ? `pasa del ${fmtDay(antes.date)} al ${fmtDay(despues.date)} (${corrimiento(dias)})` : `sigue el ${fmtDay(despues.date)}`;
  } else if (despues.date) {
    mueve = true;
    frase = `pasa a tener fecha: el ${fmtDay(despues.date)}`;
  } else if (antes.date) {
    mueve = true;
    frase = "se queda sin fecha (se quita el arranque)";
  } else {
    const d = despues.spanWeeks - antes.spanWeeks;
    mueve = d !== 0;
    frase = mueve
      ? `pasa de ${antes.spanWeeks} a ${plural(despues.spanWeeks, "semana", "semanas")} (${corrimiento(d * 7)})`
      : `sigue en ${plural(despues.spanWeeks, "semana", "semanas")}`;
  }
  const sujeto = conFechas ? "el cierre" : "el plan";
  let base: string;
  if (cierreFijado) {
    base = `El cierre está fijado a mano el ${fmtDay(new Date(cierreFijado))} y aplicar no lo cambia; ${conFechas ? "el plan calculado" : "el plan"} ${frase}`;
  } else if (!mueve && !r.items.some((it) => it.estado === "aplica")) {
    base = `Ninguna fase cambia y ${sujeto} ${frase}`;
  } else {
    base = `${mayuscula(sujeto)} ${frase}`;
  }
  const causas = mueve ? causasDelCierre(i) : [];
  const variantes = [2, 1, 0]
    .filter((n) => n <= causas.length)
    .map((n) => (causas.length === 0 ? `${base}.` : n === 0 ? `${base}: ${plural(causas.length, "cambio de fases", "cambios de fases")}.` : `${base}: ${lasCausas(causas, n)}.`));
  return laQueEntra(variantes.length > 0 ? variantes : [`${base}.`]);
}

/** Línea 2: contra lo prometido y contra el último handoff (aprox.), hoy → con la propuesta. null sin ninguno. */
function lineaDeLaComparacion(i: EntradaDelMensaje, prometido: PrometidoDeLaPropuesta | null): string | null {
  const { r, borrador, cierreFijado } = i;
  const handoff = borrador.origen === "handoff" ? null : (i.referencias?.handoff ?? null);
  if (!prometido && !handoff) return null;
  const calculado = cierreFijado ? "El plan calculado contra" : "Contra";
  const prom = prometido ? hoyYConLaPropuesta(contraLoPrometido(r.cierreAntes, prometido), contraLoPrometido(r.cierreDespues, prometido)) : null;
  // Sin fecha de arranque el plan no tiene fechas: lo prometido se nombra por sus semanas.
  const cuando = (largo: boolean) =>
    prometido?.cierreISO && r.cierreAntes.date
      ? `${largo ? "cierre " : ""}${fmtDay(new Date(prometido.cierreISO))}`
      : plural(prometido?.semanas ?? 0, "semana", "semanas");
  const hand = handoff
    ? `hoy ${conSigno(r.cierreAntes.spanWeeks - handoff.semanas)} → ${conSigno(r.cierreDespues.spanWeeks - handoff.semanas)} semanas`
    : null;
  const variantes: string[] = [];
  for (const largo of [true, false]) {
    const partes: string[] = [];
    if (prom) partes.push(`${calculado} lo prometido (${cuando(largo)}): ${prom}.`);
    if (hand)
      partes.push(
        largo || !prom ? `${prom ? "Contra" : calculado} el último handoff: ${hand} (aprox.).` : `Handoff (aprox.): ${hand}.`,
      );
    variantes.push(partes.join(" "));
  }
  return laQueEntra(variantes);
}

/** Línea 3: qué tareas se rehacen, con lo marcado, y que las hechas conservan su estado. null sin tareas en la propuesta. */
function lineaDeLasTareas(i: EntradaDelMensaje, nivel: NivelDeLaPropuesta): string | null {
  const { r, entera, vivo } = i;
  const enLaPropuesta = entera.tareas.seVan + entera.tareas.conLaFase + entera.tareas.nuevas + entera.tareas.cambian;
  if (enLaPropuesta === 0) return null;
  const conLoMarcado = r.marcadas !== r.aplicables;
  const quitadas = r.tareas.seVan + r.tareas.conLaFase;
  const { nuevas, cambian } = r.tareas;
  const hechas = contarVivas(vivo, "DONE");
  const pendientes = contarVivas(vivo, "PENDING");
  const conPrefijo = (s: string) => (conLoMarcado ? `Con lo marcado, ${s}` : mayuscula(s));
  if (quitadas + nuevas + cambian === 0) return "Con lo marcado, las tareas quedan como están.";
  if (nivel === "casi-igual") {
    const fases = r.grupos.filter((g) => g.marcadas > 0).map((g) => `«${cortarNombre(g.nombre)}»`);
    const donde = fases.length > 2 ? unirFrases([...fases.slice(0, 2), plural(fases.length - 2, "fase más", "fases más")]) : unirFrases(fases);
    const n = quitadas + nuevas + cambian;
    return laQueEntra([
      `${conPrefijo(`cambian ${plural(n, "tarea pendiente", "tareas pendientes")}`)}${donde ? `, en ${donde}` : ""}.`,
      `${conPrefijo(`cambian ${plural(n, "tarea pendiente", "tareas pendientes")}`)}.`,
    ]);
  }
  const partes: string[] = [];
  if (quitadas > 0) partes.push(quitadas >= pendientes && pendientes > 0 ? `quita las ${pendientes} pendientes` : `quita ${quitadas} de las ${pendientes} pendientes`);
  if (cambian > 0) partes.push(partes.length === 0 ? `ajusta ${plural(cambian, "tarea", "tareas")}` : `ajusta ${cambian}`);
  if (nuevas > 0)
    partes.push(partes.length === 0 ? `suma ${plural(nuevas, "tarea nueva", "tareas nuevas")}` : `suma ${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"}`);
  const hechasTxt = hechas === 0 ? "" : hechas === 1 ? "; la hecha conserva su estado" : `; las ${hechas} hechas conservan su estado`;
  return `${conPrefijo(unirFrases(partes))}${hechasTxt}.`;
}

/**
 * Cuántas tareas quedan atrasadas hoy y con lo marcado, con EL predicado de la vista (`semanaVencida`: su semana ya
 * venció y no está hecha ni suspendida). `hoy`: las vivas; `despues`: las de la proyección; `nacen`: las de la
 * proyección que no existen hoy (nuevas) o que cambian de semana, y quedan atrasadas.
 */
export function atrasadas(vivo: Vivo, r: Pick<ResumenDelBorrador, "proyeccion">, hoy: Date): { hoy: number; despues: number; nacen: number } {
  const rangosHoy = computePhaseRanges(vivo.fases);
  const semanaDeHoy = new Map<string, number>();
  let antes = 0;
  vivo.fases.forEach((f, k) => {
    for (const t of f.tareas ?? []) {
      semanaDeHoy.set(t.id, rangosHoy[k].start + t.weekIndex);
      if (semanaVencida(vivo.ancla, rangosHoy[k].start, t.weekIndex, hoy, t.status)) antes++;
    }
  });
  const p = r.proyeccion;
  const rangos = computePhaseRanges(p.fases);
  let despues = 0;
  let nacen = 0;
  p.fases.forEach((f, k) => {
    for (const t of f.tareas) {
      if (!semanaVencida(p.ancla, rangos[k].start, t.weekIndex, hoy, t.status)) continue;
      despues++;
      if (t.id === null || (t.cambia && semanaDeHoy.get(t.id) !== rangos[k].start + t.weekIndex)) nacen++;
    }
  });
  return { hoy: antes, despues, nacen };
}

/** Línea 5: «⚠ Atrasadas: hoy 59 → con la propuesta 67: 58 tareas nuevas caen en semanas que ya pasaron.» */
function lineaDeLasAtrasadas(i: EntradaDelMensaje): string | null {
  if (!i.hoy) return null;
  const a = atrasadas(i.vivo, i.r, i.hoy);
  if (a.despues === 0) return null;
  const que = i.r.tareas.cambian > 0 ? ["tarea nueva o movida cae", "tareas nuevas o movidas caen"] : ["tarea nueva cae", "tareas nuevas caen"];
  const nacen = a.nacen > 0 ? `: ${plural(a.nacen, que[0], que[1])} en semanas que ya pasaron` : "";
  return `${a.despues > a.hoy ? "⚠ " : ""}Atrasadas: hoy ${a.hoy} → con la propuesta ${a.despues}${nacen}.`;
}

/**
 * La fuente REAL de un motivo de la IA, o null (y el Gantt dice «Según la IA: …»). «Instrucciones del CSE: …» con
 * instrucciones → «Instrucciones adicionales»; si no, una reunión de la corrida cuyo título el motivo nombra como
 * palabras completas (D9) → «Reunión «T» · 12 sep»; si no, una nota → «Nota «T»». El motivo nunca se copia al mensaje.
 */
export function fuenteDelMotivo(motivo: string, f: FuentesDeLaPropuesta | null): FuenteVerificada | null {
  if (!f) return null;
  if (/^instrucciones del cse\b/i.test(motivo.trim()) && f.instrucciones) return { tipo: "instrucciones", texto: FUENTE_INSTRUCCIONES };
  const reunion = f.reuniones.find((x) => nombraComoPalabras(motivo, x.titulo));
  if (reunion) return { tipo: "reunion", texto: `Reunión «${cortarNombre(reunion.titulo)}» · ${fmtDay(new Date(reunion.fecha))}` };
  const nota = f.notas.find((x) => nombraComoPalabras(motivo, x));
  if (nota) return { tipo: "nota", texto: `Nota «${cortarNombre(nota)}»` };
  return null;
}

/** «Más»: dónde se concentran, la fase terminada que recibe, los atrasos (APARTE) y por qué es otro cronograma. */
function detalleDelMensaje(i: EntradaDelMensaje, porMagnitud: boolean, prometido: PrometidoDeLaPropuesta | null): string[] {
  const { r, vivo, borrador } = i;
  const detalle: string[] = [];
  // Dónde se concentran: los 3 grupos con más cambios (empate: el orden del Gantt), si el mayor tiene 5 o más.
  const orden = ordenCompletoDeLaPropuesta(vivo, borrador.cambios);
  const lugar = (fase: string) => {
    const k = orden.indexOf(fase);
    return k < 0 ? Number.MAX_SAFE_INTEGER : k;
  };
  const conCambios = r.grupos
    .map((g) => ({ g, n: g.nuevas + g.seVan + g.cambian }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || lugar(a.g.fase) - lugar(b.g.fase));
  if (conCambios.length > 0 && conCambios[0].n >= 5) {
    detalle.push(`Los cambios se concentran en ${unirFrases(conCambios.slice(0, 3).map((x) => `«${cortarNombre(x.g.nombre)}» (${x.n})`))}.`);
  }
  // Una fase terminada que recibe tareas nuevas.
  const terminadas = new Set(vivo.fases.filter((f) => f.status === "DONE").map((f) => f.id));
  for (const g of r.grupos) {
    if (terminadas.has(g.fase) && g.nuevas > 0) {
      detalle.push(`⚠ «${cortarNombre(g.nombre)}» está terminada y la propuesta le suma ${plural(g.nuevas, "tarea", "tareas")}.`);
    }
  }
  // Los atrasos cargados DESDE lo prometido, en una frase aparte: nunca como causa de lo que propone la IA.
  if (prometido?.fecha) {
    const desde = Date.parse(prometido.fecha);
    const porParte = new Map<string, number>();
    for (const a of i.atrasos) {
      if (a.kind !== "ATRASO" || !(Date.parse(a.occurredAt) > desde)) continue;
      porParte.set(a.party, (porParte.get(a.party) ?? 0) + (a.weeksImpact ?? 0));
    }
    const total = [...porParte.values()].reduce((s, n) => s + n, 0);
    if (total > 0) {
      const conocidas = new Set(PARTES_DEL_ATRASO.map(([p]) => p));
      const sinAtribuir = [...porParte.entries()].filter(([p]) => !conocidas.has(p)).reduce((s, [, n]) => s + n, 0);
      const partes = [
        ...PARTES_DEL_ATRASO.flatMap(([p, nombre]) => ((porParte.get(p) ?? 0) > 0 ? [`${nombre} ${porParte.get(p)}`] : [])),
        ...(sinAtribuir > 0 ? [`sin atribuir ${sinAtribuir}`] : []),
      ];
      detalle.push(
        `Desde lo prometido (${fmtDay(new Date(prometido.fecha))}) hay ${plural(total, "semana", "semanas")} de atrasos cargados: ${partes.join(" · ")}.`,
      );
      // UN corrimiento de referencia: el cierre de hoy contra lo prometido.
      const corrido = Math.max(contraLoPrometido(r.cierreAntes, prometido), 0);
      if (total > corrido) {
        detalle.push(
          `Suman más que lo que se corrió el plan desde entonces (${plural(corrido, "semana", "semanas")}): revísalos antes de explicárselo al cliente.`,
        );
      }
    }
  }
  if (porMagnitud && i.entera.magnitud.motivos.length > 0) {
    detalle.push(`Es prácticamente otro cronograma. ${i.entera.magnitud.motivos.join(" ")}`);
  }
  return detalle;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL MENSAJE ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** ⭐ El mensaje de arriba del Gantt: título por el nivel, hasta 5 líneas y lo de «Más». */
export function mensajeDeLaPropuesta(i: EntradaDelMensaje): MensajeDeLaPropuesta {
  const { nivel, porMagnitud } = nivelDeLaPropuesta(i.entera, i.vivo, i.borrador.pedido);
  const prometido = i.referencias?.prometido ?? null;
  const fuentes = i.referencias?.fuentes ?? null;
  const lineas: string[] = [lineaDelCierre(i, nivel)];
  const comparacion = lineaDeLaComparacion(i, prometido);
  if (comparacion) lineas.push(comparacion);
  const tareas = lineaDeLasTareas(i, nivel);
  if (tareas) lineas.push(tareas);
  // Sin reuniones ni notas en las corridas de la propuesta (con o sin instrucciones, la misma frase).
  if (fuentes && fuentes.reuniones.length === 0 && fuentes.notas.length === 0 && i.borrador.tareas !== null) lineas.push(LINEA_SIN_MATERIAL);
  const atraso = lineaDeLasAtrasadas(i);
  if (atraso) lineas.push(atraso);

  const verificadas = new Map<string, FuenteVerificada>();
  for (const it of i.r.items) {
    const f = it.motivo ? fuenteDelMotivo(it.motivo, fuentes) : null;
    if (f && !verificadas.has(f.texto)) verificadas.set(f.texto, f);
  }
  return {
    nivel,
    titulo: tituloDelNivel(nivel, porMagnitud),
    tono: nivel === "casi-todo" ? "warn" : "info",
    lineas: lineas.slice(0, 5),
    detalle: detalleDelMensaje(i, porMagnitud, prometido),
    fuentes: [...verificadas.values()],
  };
}
