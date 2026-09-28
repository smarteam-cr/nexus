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
 *   5. las atrasadas, «hoy 59 → con la propuesta 67»: el atraso ya existe, la propuesta no lo crea. M3 (2026-09-27): si
 *      la propuesta trae su reloj (`borrador.hoy`, solo «Regenerar todo»: R13 no reescribe lo que ya pasó), lo que
 *      quedó sin hacer: «⚠ Quedaron sin hacer 4 tareas de semanas que ya pasaron, en «Semana 0»: la propuesta no las
 *      mueve (están en «Más»).», y «Más» las nombra con la acción. Sin reloj, la de siempre («no las mueve» sería falso).
 * Hasta 5 líneas de ≤ 140 caracteres. Lo demás («Más»): dónde se concentran los cambios, una fase terminada que recibe
 * tareas, los atrasos cargados (en una frase APARTE, nunca como causa) y, si es prácticamente otro cronograma, por qué.
 *
 * M4 P4f (2026-09-27, spec del replanteo §5.7, D10, D11) · LO QUE REPROGRAMÓ EL SISTEMA DESDE HOY:
 *   · en la línea 1 es UNA causa, la primera: «8 fases se reprograman desde hoy, en el orden del plan» (con otras causas,
 *     cuánto corre el cierre por sí sola: «(+12 semanas)»). El pin no cuenta;
 *   · las arrastradas no cuentan en ninguna parte: ni en el nivel, ni en «ajusta N» (línea 3), ni en «se concentran»
 *     (las saca el resumen: `TareasDelResumen.cambian` y `gruposDeTareas`);
 *   · «Más» nombra las fases que vuelven a arrancar sin ninguna tarea marcada (si ya se hicieron, conviene marcarlas);
 *   · `avisoDeLaSemana`: si la semana cambió desde que se reprogramó, el aviso para volver a generarla.
 * Todo por `borrador.hoy.politica`, nunca por el interruptor.
 *
 * M5 (2026-09-27, spec del replanteo §6.1) · «TRAER A HOY» (implementado y APAGADO: lo vigente es «avisar»): con esa
 * política, lo pendiente de semanas vencidas de una fase en curso pasa a la semana de hoy, cada una con su casilla
 * (`esTraidaAHoy`). La línea 5 lo suma: «⚠ Quedaron sin hacer 4 tareas de semanas que ya pasaron, en «Semana 0»: la
 * propuesta no las mueve; 3 más pasan a esta semana.» Solo las marcadas que quedan en esta semana; desmarcada, una vuelve
 * a ser «sin hacer». La tabla de «avisar» no las nombra: si el mensaje leyera el interruptor, se notaría.
 *
 * ⛔ LOS NÚMEROS LOS PONE EL CÓDIGO (spec §0.1): todo sale de `resumir` (`r` con lo marcado; `entera`, la propuesta
 * entera, para el nivel), del vivo y de las referencias del GET. Nunca de contar `borrador.cambios`, y nunca del
 * `motivo` que escribió la IA: el motivo solo decide si hay un chip de su fuente (`fuenteDelMotivo`), y se muestra solo
 * si calza con una fuente real de la corrida (D9).
 * Los textos, en tuteo neutro (entra en la lista de tuteo de contexto-cronograma.test.ts). La guarda:
 * mensaje-de-la-propuesta.test.ts, con la propuesta grande anonimizada.
 */
import {
  aplicablesSinSugeridas,
  esTraidaAHoy,
  ordenCompletoDeLaPropuesta,
  type Borrador,
  type Cambio,
  type CambioDeEstructura,
  type PedidoDelBorrador,
  type ResumenDelBorrador,
  type Vivo,
} from "./borrador";
import { unirFrases } from "./magnitud-propuesta";
/* M3 (D11): los textos se eligen por `borrador.hoy.politica`, nunca por la constante del interruptor. M5 (2026-09-27): las
   tablas por opción se arman con `porCadaFasesVencidas` / `porCadaPendientesDelPasado` (los nombres de las opciones se
   escriben solo en politica-de-atrasos.ts). */
import {
  fasesVencidasDeLosTextos,
  porCadaFasesVencidas,
  porCadaPendientesDelPasado,
  type PoliticaDeFasesVencidas,
  type PoliticaDePendientesDelPasado,
} from "./politica-de-atrasos";
import type { FuentesDeLaPropuesta, PrometidoDeLaPropuesta, ReferenciasDeLaPropuesta } from "./referencias-de-la-propuesta";
import { lecturaDelSistema, semanaDeHoy, semanaVencida, textoDeLaSemanaQueCambio } from "./vista-de-la-propuesta";
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
  /** M4 P4f: «⚠ Se reprogramó desde la S18 y hoy es la S19: vuelve a generarla…», o null (misma semana, sin reloj o sin
   *  nada del sistema). La barra lo pinta abajo, antes de los choques. */
  avisoDeLaSemana: string | null;
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

/** La línea 4: lo verificable es que no tuvo reuniones ni notas (el paso 2 lee también el handoff y el cronograma).
 *  Revisión de L1–L7 (#8): habla de la IA, no del CSE. Decía «No elegiste reuniones ni notas», y una reunión elegida
 *  que no le llegó (futura, o sin contenido todavía) no entra en las fuentes: el texto afirmaba algo falso. */
export const LINEA_SIN_MATERIAL = "La IA no tuvo reuniones ni notas: armó las tareas sin saber qué pasó en el proyecto.";
/** Antes de los chips de «Más». */
export const TEXTO_DE_LAS_FUENTES = "Los cambios de fases salen de:";
/** L7, en «Más»: «La IA sugiere mudar 5 tareas hechas a otra fase: vienen sin marcar.» */
export function textoDeLasSugeridas(n: number): string {
  return n === 1
    ? "La IA sugiere mudar 1 tarea hecha a otra fase: viene sin marcar."
    : `La IA sugiere mudar ${n} tareas hechas a otra fase: vienen sin marcar.`;
}
export const FUENTE_INSTRUCCIONES = "Instrucciones adicionales";

/**
 * M3 (2026-09-27): lo que quedó sin hacer en semanas que ya pasaron, por la política de lo pendiente del pasado con que
 * se calculó la propuesta (`borrador.hoy.politica`, D11). «avisar» (decisión (a) de Elías): la propuesta no lo mueve y lo
 * nombra. `donde` ya viene con las fases citadas («en «Semana 0» y «Fase A»»); null = sin nombrarlas (para que la línea
 * entre en 140 caracteres).
 * M5 (2026-09-27): «traer-a-hoy» suma lo que el sistema pasó a esta semana (`traidas`, las marcadas): «…: la propuesta
 * no las mueve; 3 más pasan a esta semana.» (sin «(están en «Más»)»: dos «más» seguidos se leían mal). `solas`: sin nada
 * sin hacer. «avisar» nunca las trae y no las nombra.
 */
interface TextosDeLoQueQuedoSinHacer {
  /** La línea 5 con una sola tarea sin hacer; `traidas`: las que pasan a esta semana. */
  una: (donde: string | null, traidas?: number) => string;
  /** La línea 5 con varias; `conPuntero`: «(están en «Más»)». */
  varias: (n: number, donde: string | null, conPuntero: boolean, traidas?: number) => string;
  /** M5: la línea 5 sin nada sin hacer y con traídas; null si la política no trae nada a hoy. */
  solas: ((traidas: number) => string) | null;
  /** «Más»: qué hacer con ellas. */
  accionUna: string;
  accionVarias: string;
}
const LO_QUE_QUEDO_AVISANDO: TextosDeLoQueQuedoSinHacer = {
  una: (donde) => `⚠ Quedó sin hacer 1 tarea de una semana que ya pasó${donde ? `, ${donde}` : ""}: la propuesta no la mueve.`,
  varias: (n, donde, conPuntero) =>
    `⚠ Quedaron sin hacer ${n} tareas de semanas que ya pasaron${donde ? `, ${donde}` : ""}: la propuesta no las mueve${conPuntero ? " (están en «Más»)" : ""}.`,
  solas: null,
  accionUna: "Si ya se hizo, márcala hecha; si falta, muévela a esta semana.",
  accionVarias: "Si ya se hicieron, márcalas hechas; si faltan, muévelas a esta semana.",
};
/** M5: «; 3 más pasan a esta semana», o nada. */
const yMasPasan = (traidas = 0) => (traidas > 0 ? `; ${traidas} más ${traidas === 1 ? "pasa" : "pasan"} a esta semana` : "");
export const TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER: Record<PoliticaDePendientesDelPasado, TextosDeLoQueQuedoSinHacer> =
  porCadaPendientesDelPasado<TextosDeLoQueQuedoSinHacer>({
    avisar: LO_QUE_QUEDO_AVISANDO,
    traerAHoy: {
      ...LO_QUE_QUEDO_AVISANDO,
      una: (donde, traidas) =>
        `⚠ Quedó sin hacer 1 tarea de una semana que ya pasó${donde ? `, ${donde}` : ""}: la propuesta no la mueve${yMasPasan(traidas)}.`,
      varias: (n, donde, conPuntero, traidas = 0) =>
        `⚠ Quedaron sin hacer ${n} tareas de semanas que ya pasaron${donde ? `, ${donde}` : ""}: la propuesta no las mueve${
          conPuntero && traidas === 0 ? " (están en «Más»)" : ""
        }${yMasPasan(traidas)}.`,
      solas: (traidas) =>
        traidas === 1
          ? "1 tarea de una semana que ya pasó pasa a esta semana."
          : `${traidas} tareas de semanas que ya pasaron pasan a esta semana.`,
    },
  });
/** M3: hasta cuántas tareas sin hacer nombra «Más» (con más, las fases y cuántas tiene cada una). */
export const TOPE_DE_LAS_QUE_SE_NOMBRAN = 5;

/**
 * M4 P4f (2026-09-27): lo que reprogramó el sistema, en el mensaje, por la política de las fases vencidas con que se
 * calculó (`borrador.hoy.politica`, D11). `una` y `varias`: la causa de la línea 1 (una fase, por su nombre; varias,
 * cuántas); `solas`: no hay otras causas; `corre`: con otras causas, cuánto corre el cierre lo de hoy solo («+12
 * semanas»). `sinNadaMarcado…`: «Más», las que vuelven a arrancar sin ninguna tarea marcada. «avisar» no reprograma:
 * lleva los del orden del plan.
 */
interface TextosDeLoDeHoyEnElMensaje {
  una: (fase: string, corre: string | null) => string;
  varias: (n: number, solas: boolean, corre: string | null) => string;
  sinNadaMarcadoUna: (fase: string) => string;
  sinNadaMarcadoVarias: (n: number, fases: string) => string;
}
const conCorrimiento = (s: string, corre: string | null) => (corre ? `${s} (${corre})` : s);
const TEXTOS_DE_HOY_EN_EL_ORDEN_DEL_PLAN: TextosDeLoDeHoyEnElMensaje = {
  una: (fase, corre) => conCorrimiento(`«${fase}» se reprograma desde hoy`, corre),
  varias: (n, solas, corre) => conCorrimiento(`${n} fases se reprograman desde hoy${solas ? ", en el orden del plan" : ""}`, corre),
  sinNadaMarcadoUna: (fase) => `«${fase}» se reprograma y no tiene ninguna tarea marcada: si ya se hizo, márcala hecha y desmarca su casilla.`,
  sinNadaMarcadoVarias: (n, fases) =>
    `${n} de las fases que se reprograman no tienen ninguna tarea marcada: ${fases}. Si ya se hicieron, márcalas hechas y desmarca su casilla.`,
};
export const TEXTOS_DE_LO_DE_HOY_EN_EL_MENSAJE: Record<PoliticaDeFasesVencidas, TextosDeLoDeHoyEnElMensaje> =
  porCadaFasesVencidas<TextosDeLoDeHoyEnElMensaje>({
    enElOrdenDelPlan: TEXTOS_DE_HOY_EN_EL_ORDEN_DEL_PLAN,
    todoDesdeHoy: {
      ...TEXTOS_DE_HOY_EN_EL_ORDEN_DEL_PLAN,
      una: (fase, corre) => conCorrimiento(`«${fase}» arranca desde hoy`, corre),
      varias: (n, _solas, corre) => conCorrimiento(`${n} fases atrasadas arrancan desde hoy`, corre),
    },
    avisar: TEXTOS_DE_HOY_EN_EL_ORDEN_DEL_PLAN,
  });

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
  // L7: una hecha que la IA sugiere mudar de fase no rehace ninguna pendiente: no mide cuánto cambia la propuesta.
  const tareas = quitadas + entera.tareas.nuevas + entera.tareas.cambian - (entera.tareas.sugeridas ?? 0);
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

/**
 * Los cambios de estructura MARCADOS que mueven el cierre, en el orden de sus números.
 * M4 P4f (2026-09-27): lo que reprogramó el sistema desde hoy (sus casillas marcadas; el pin no es un renglón) va junto,
 * en UNA causa y primero: «8 fases se reprograman desde hoy, en el orden del plan». Con otras causas dice cuánto corre el
 * cierre por sí solo: las semanas del cierre con solo lo de hoy (`magnitudDeLoMarcado.finAntes`) menos las de hoy.
 * `cambios` cuenta las casillas (la causa del sistema vale lo que sus fases): lo usa la variante más corta de la línea
 * («: 8 cambios de fases.»). P4h (2026-09-27, §5.10): con el cierre fijado a mano la causa entera no entra en 140 y esa
 * variante contaba causas («1 cambio de fases» por 8 casillas).
 */
function causasDelCierre(i: EntradaDelMensaje): { causas: string[]; cambios: number } {
  const porClave = new Map<string, Cambio>(i.borrador.cambios.map((c) => [c.clave, c]));
  const marcados = [...i.r.items].filter((it) => it.estado === "aplica").sort((a, b) => a.numero - b.numero);
  const deHoy = new Set<string>();
  for (const it of marcados) {
    const c = porClave.get(it.clave);
    if (c?.tipo === "fase-cambia" && c.desdeHoy) deHoy.add(c.faseId);
  }
  const otras = marcados
    .filter((it) => {
      const c = porClave.get(it.clave);
      return !(c?.tipo === "fase-cambia" && c.desdeHoy);
    })
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
  if (deHoy.size === 0) return { causas: otras, cambios: otras.length };
  const textos = TEXTOS_DE_LO_DE_HOY_EN_EL_MENSAJE[fasesVencidasDeLosTextos(i.borrador.hoy?.politica)];
  // Cuánto corre el cierre lo de hoy solo: solo se dice si hay otras causas (si no, es el corrimiento de la línea).
  let corre: string | null = null;
  if (otras.length > 0) {
    const antes = i.r.cierreAntes;
    const conLoDeHoy = i.r.magnitudDeLoMarcado.finAntes;
    const dias = antes.date && conLoDeHoy.date ? diasEntre(antes.date, conLoDeHoy.date) : (conLoDeHoy.spanWeeks - antes.spanWeeks) * 7;
    corre = dias === 0 ? null : corrimiento(dias);
  }
  const [unaFase] = [...deHoy];
  const causa =
    deHoy.size === 1
      ? textos.una(cortarNombre(i.vivo.fases.find((f) => f.id === unaFase)?.name ?? unaFase), corre)
      : textos.varias(deHoy.size, otras.length === 0, corre);
  return { causas: [causa, ...otras], cambios: deHoy.size + otras.length };
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
  const { causas, cambios } = mueve ? causasDelCierre(i) : { causas: [], cambios: 0 };
  const variantes = [2, 1, 0]
    .filter((n) => n <= causas.length)
    .map((n) => (causas.length === 0 ? `${base}.` : n === 0 ? `${base}: ${plural(cambios, "cambio de fases", "cambios de fases")}.` : `${base}: ${lasCausas(causas, n)}.`));
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

/**
 * Línea 3: qué tareas se rehacen, con lo marcado, y que las hechas conservan su estado. null sin tareas en la propuesta.
 * L7: las hechas que se mudan de fase (una sugerencia de la IA que el CSE marcó) van aparte, al final («…las 46 hechas
 * conservan su estado; 1 se muda de fase.»): no «ajustan» ninguna pendiente. Y las sugeridas sin marcar no hacen decir
 * «Con lo marcado»: nacen así.
 */
function lineaDeLasTareas(i: EntradaDelMensaje, nivel: NivelDeLaPropuesta): string | null {
  const { r, entera, vivo } = i;
  const enLaPropuesta = entera.tareas.seVan + entera.tareas.conLaFase + entera.tareas.nuevas + entera.tareas.cambian;
  if (enLaPropuesta === 0) return null;
  const conLoMarcado = r.marcadas !== aplicablesSinSugeridas(r);
  const quitadas = r.tareas.seVan + r.tareas.conLaFase;
  const { nuevas } = r.tareas;
  const mudadas = r.tareas.sugeridas ?? 0;
  const cambian = r.tareas.cambian - mudadas;
  const hechas = contarVivas(vivo, "DONE");
  const pendientes = contarVivas(vivo, "PENDING");
  const conPrefijo = (s: string) => (conLoMarcado ? `Con lo marcado, ${s}` : mayuscula(s));
  const hechasQueSeMudan = mudadas === 0 ? "" : `; ${mudadas} ${mudadas === 1 ? "hecha se muda" : "hechas se mudan"} de fase`;
  if (quitadas + nuevas + cambian === 0) {
    return mudadas === 0 ? "Con lo marcado, las tareas quedan como están." : `${conPrefijo("las pendientes quedan como están")}${hechasQueSeMudan}.`;
  }
  if (nivel === "casi-igual") {
    const fases = r.grupos.filter((g) => g.marcadas > 0).map((g) => `«${cortarNombre(g.nombre)}»`);
    const donde = fases.length > 2 ? unirFrases([...fases.slice(0, 2), plural(fases.length - 2, "fase más", "fases más")]) : unirFrases(fases);
    const n = quitadas + nuevas + cambian;
    return laQueEntra([
      `${conPrefijo(`cambian ${plural(n, "tarea pendiente", "tareas pendientes")}`)}${donde ? `, en ${donde}` : ""}${hechasQueSeMudan}.`,
      `${conPrefijo(`cambian ${plural(n, "tarea pendiente", "tareas pendientes")}`)}${hechasQueSeMudan}.`,
    ]);
  }
  const partes: string[] = [];
  if (quitadas > 0) partes.push(quitadas >= pendientes && pendientes > 0 ? `quita las ${pendientes} pendientes` : `quita ${quitadas} de las ${pendientes} pendientes`);
  if (cambian > 0) partes.push(partes.length === 0 ? `ajusta ${plural(cambian, "tarea", "tareas")}` : `ajusta ${cambian}`);
  if (nuevas > 0)
    partes.push(partes.length === 0 ? `suma ${plural(nuevas, "tarea nueva", "tareas nuevas")}` : `suma ${nuevas} ${nuevas === 1 ? "nueva" : "nuevas"}`);
  const hechasTxt = hechas === 0 ? "" : hechas === 1 ? "; la hecha conserva su estado" : `; las ${hechas} hechas conservan su estado`;
  const seMudan = mudadas === 0 ? "" : `; ${mudadas} ${mudadas === 1 ? "se muda" : "se mudan"} de fase`;
  return `${conPrefijo(unirFrases(partes))}${hechasTxt}${seMudan}.`;
}

/**
 * Cuántas tareas quedan atrasadas hoy y con lo marcado, con EL predicado de la vista (`semanaVencida`: su semana ya
 * venció y no está hecha ni suspendida). `hoy`: las vivas; `despues`: las de la proyección; `nacen`: las de la
 * proyección que no existen hoy (nuevas) o que cambian de semana, y quedan atrasadas.
 */
export function atrasadas(vivo: Vivo, r: Pick<ResumenDelBorrador, "proyeccion">, hoy: Date): { hoy: number; despues: number; nacen: number } {
  const { hoy: antes, despues, nacen } = atrasadasConLoQueQuedo(vivo, r, hoy);
  return { hoy: antes, despues, nacen };
}

/** M3: una fase con lo que quedó sin hacer en semanas que ya pasaron (sus títulos, en el orden del Gantt). */
export interface SinHacerDeLaFase {
  nombre: string;
  titulos: string[];
}

/**
 * `atrasadas` y, además (M3, 2026-09-27), `sinHacerPorFase`: las de la proyección vencidas que NO nacen (ni nuevas ni
 * movidas por la propuesta), por fase y en el orden del Gantt. Suman `despues − nacen`: lo que quedó sin hacer y la
 * propuesta no mueve. Aparte de `atrasadas` para que su forma (y su guarda, que la compara entera) no cambie.
 * M5 (2026-09-27): `pasanAHoy`, de las `traidas` (los ids de las traídas a hoy, `esTraidaAHoy`), las que la proyección
 * cambia de lugar y ya no vencen: las marcadas. Una desmarcada queda en su semana vencida y cuenta como sin hacer.
 */
export function atrasadasConLoQueQuedo(
  vivo: Vivo,
  r: Pick<ResumenDelBorrador, "proyeccion">,
  hoy: Date,
  traidas: ReadonlySet<string> = new Set(),
): { hoy: number; despues: number; nacen: number; sinHacerPorFase: SinHacerDeLaFase[]; pasanAHoy: number } {
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
  let pasanAHoy = 0;
  const sinHacerPorFase: SinHacerDeLaFase[] = [];
  p.fases.forEach((f, k) => {
    const titulos: string[] = [];
    for (const t of f.tareas) {
      if (!semanaVencida(p.ancla, rangos[k].start, t.weekIndex, hoy, t.status)) {
        if (t.id !== null && t.cambia && traidas.has(t.id)) pasanAHoy++;
        continue;
      }
      despues++;
      if (t.id === null || (t.cambia && semanaDeHoy.get(t.id) !== rangos[k].start + t.weekIndex)) nacen++;
      else titulos.push(t.title);
    }
    if (titulos.length > 0) sinHacerPorFase.push({ nombre: f.name, titulos });
  });
  return { hoy: antes, despues, nacen, sinHacerPorFase, pasanAHoy };
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

/** M3: «en «A» y «B»», «en «A», «B» y 3 fases más», «en 5 fases»: hasta `cuantas` fases nombradas. */
function dondeQuedo(fases: readonly SinHacerDeLaFase[], cuantas: number): string {
  if (cuantas === 0) return `en ${plural(fases.length, "fase", "fases")}`;
  const citadas = fases.slice(0, cuantas).map((f) => `«${cortarNombre(f.nombre)}»`);
  const resto = fases.length - citadas.length;
  return `en ${unirFrases(resto > 0 ? [...citadas, plural(resto, "fase más", "fases más")] : citadas)}`;
}

/**
 * M3 (2026-09-27): la línea 5 cuando la propuesta trae su reloj (`borrador.hoy`): R13 no reescribió lo que ya pasó, así
 * que lo pendiente de semanas vencidas QUEDÓ SIN HACER y la propuesta no lo mueve. N = `despues − nacen`. Si algo nuevo cae
 * igual en el pasado (lo movió el chat, o el CSE desmarcó una reprogramación), se suma. Hasta 2 fases nombradas y
 * después «N fases más», en 140 caracteres. Los textos, por `hoy.politica` (D11). null si no queda nada.
 */
function lineaDeLoQueQuedoSinHacer(i: EntradaDelMensaje): string | null {
  if (!i.hoy || !i.borrador.hoy) return null;
  const traidas = new Set(i.borrador.cambios.filter(esTraidaAHoy).map((c) => c.tareaId));
  const a = atrasadasConLoQueQuedo(i.vivo, i.r, i.hoy, traidas);
  const sinHacer = a.despues - a.nacen;
  const textos = TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER[i.borrador.hoy.politica.pendientesDelPasado];
  // M5: las traídas a esta semana solo se nombran si la política con que se calculó las trae (la de «avisar» no).
  const pasan = textos.solas ? a.pasanAHoy : 0;
  if (sinHacer === 0 && a.nacen === 0 && pasan === 0) return null;
  const que = i.r.tareas.cambian > 0 ? ["tarea nueva o movida cae", "tareas nuevas o movidas caen"] : ["tarea nueva cae", "tareas nuevas caen"];
  const caen = a.nacen > 0 ? `${plural(a.nacen, que[0], que[1])} en semanas que ya pasaron.` : "";
  if (sinHacer === 0) {
    const solas = pasan > 0 && textos.solas ? textos.solas(pasan) : "";
    return [caen ? `⚠ ${caen}` : "", solas].filter(Boolean).join(" ");
  }
  // De la más completa a la más corta: 2, 1 o ninguna fase nombrada; sin las fases; sin «(están en «Más»)».
  const formas: Array<{ donde: string | null; conPuntero: boolean }> = [
    ...[2, 1, 0].map((n) => ({ donde: dondeQuedo(a.sinHacerPorFase, Math.min(n, a.sinHacerPorFase.length)), conPuntero: true })),
    { donde: null, conPuntero: true },
    { donde: null, conPuntero: false },
  ];
  const variantes = formas.map(({ donde, conPuntero }) => {
    const base = sinHacer === 1 ? textos.una(donde, pasan) : textos.varias(sinHacer, donde, conPuntero, pasan);
    return caen ? `${base} ${caen}` : base;
  });
  return laQueEntra([...new Set(variantes)]);
}

/**
 * M3: la línea de «Más» con lo que quedó sin hacer (solo con el reloj de la propuesta): con 5 o menos, sus títulos por
 * fase; con más, las fases y cuántas tiene cada una. Siempre con la acción. null si no queda nada.
 */
function detalleDeLoQueQuedoSinHacer(i: EntradaDelMensaje): string | null {
  if (!i.hoy || !i.borrador.hoy) return null;
  const { sinHacerPorFase } = atrasadasConLoQueQuedo(i.vivo, i.r, i.hoy);
  const total = sinHacerPorFase.reduce((n, f) => n + f.titulos.length, 0);
  if (total === 0) return null;
  const textos = TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER[i.borrador.hoy.politica.pendientesDelPasado];
  const accion = total === 1 ? textos.accionUna : textos.accionVarias;
  if (total <= TOPE_DE_LAS_QUE_SE_NOMBRAN) {
    const porFase = sinHacerPorFase.map((f) => `en «${cortarNombre(f.nombre)}»: ${f.titulos.map((t) => `«${t}»`).join(" · ")}`);
    return `Sin hacer ${porFase.join("; ")}. ${accion}`;
  }
  return `Sin hacer: ${sinHacerPorFase.map((f) => `«${cortarNombre(f.nombre)}» (${f.titulos.length})`).join(" · ")}. ${accion}`;
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

/**
 * M4 P4f (§5.1): las fases que el sistema reprograma (su casilla marcada), que no empezaron y no tienen ninguna tarea
 * marcada: en Wherex, «Service Hub», «Marketing Hub» y «Cierre y entrega». Si ya se hicieron, la propuesta las vuelve a
 * arrancar: conviene marcarlas hechas y desmarcar su casilla. En el orden del cronograma. null si no hay ninguna.
 */
function detalleDeLasSinNadaMarcado(i: EntradaDelMensaje): string | null {
  const lectura = lecturaDelSistema(i.vivo, i.borrador);
  if (lectura.size === 0) return null;
  const marcadas = new Set(i.r.items.filter((it) => it.estado === "aplica").map((it) => it.clave));
  const fases = new Set([...lectura.entries()].filter(([clave, l]) => l.sinNadaMarcado && marcadas.has(clave)).map(([, l]) => l.fase));
  const nombres = i.vivo.fases.filter((f) => fases.has(f.id)).map((f) => cortarNombre(f.name));
  if (nombres.length === 0) return null;
  const textos = TEXTOS_DE_LO_DE_HOY_EN_EL_MENSAJE[fasesVencidasDeLosTextos(i.borrador.hoy?.politica)];
  return nombres.length === 1
    ? textos.sinNadaMarcadoUna(nombres[0])
    : textos.sinNadaMarcadoVarias(nombres.length, unirFrases(nombres.map((n) => `«${n}»`)));
}

/** «Más»: dónde se concentran, la fase terminada que recibe, los atrasos (APARTE) y por qué es otro cronograma. */
function detalleDelMensaje(i: EntradaDelMensaje, porMagnitud: boolean, prometido: PrometidoDeLaPropuesta | null): string[] {
  const { r, vivo, borrador } = i;
  const detalle: string[] = [];
  // M4 P4f: las que el sistema vuelve a arrancar sin ninguna tarea marcada (quizás ya se hicieron y nadie las marcó).
  const sinNadaMarcado = detalleDeLasSinNadaMarcado(i);
  if (sinNadaMarcado) detalle.push(sinNadaMarcado);
  // M3: lo que quedó sin hacer en semanas que ya pasaron (la línea 5 dice que está acá), con la acción.
  const sinHacer = detalleDeLoQueQuedoSinHacer(i);
  if (sinHacer) detalle.push(sinHacer);
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
  // L7: las hechas que la IA sugiere mudar a otra fase (nacen sin marcar: cada una se decide con su casilla).
  const sugeridas = r.grupos.reduce((n, g) => n + g.sugeridas, 0);
  if (sugeridas > 0) detalle.push(textoDeLasSugeridas(sugeridas));
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
  /* M3: con el reloj de la propuesta, lo que quedó sin hacer (R13 no lo reescribió); sin él («Regenerar» de una fase,
     «primera», un borrador de antes), la línea de siempre: ahí decir «no las mueve» sería falso. */
  const atraso = i.borrador.hoy ? lineaDeLoQueQuedoSinHacer(i) : lineaDeLasAtrasadas(i);
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
    // M4 P4f: la semana del reloj de la propuesta contra la de hoy (el mismo predicado que «ya pasó»).
    avisoDeLaSemana: textoDeLaSemanaQueCambio(i.borrador, semanaDeHoy(i.vivo.ancla, i.hoy)),
  };
}
