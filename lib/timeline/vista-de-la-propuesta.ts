/**
 * lib/timeline/vista-de-la-propuesta.ts — LA PROPUESTA PINTADA EN EL GANTT (L3 P3b, 2026-09-26). Puro.
 *
 * Desde L3 cada cambio de la propuesta se decide en el Gantt: cada fila con su casilla y un verbo fijo al lado
 * («Crear», «Quitar», «Pasar a Semana 3», «Mudar a «Y»»). Esta función arma TODO lo que el Gantt pinta en la
 * vista de la propuesta, sin volver a evaluar el plan: sale de `resumir` (`r.items`, `r.grupos`, `r.indice` y
 * `r.proyeccion`), del vivo y del borrador.
 *
 * Las reglas (spec §1):
 *   · D1 · NINGUNA FILA CAMBIA DE LUGAR AL MARCAR. El Gantt es la proyección con lo marcado (`proyectarConPlan`,
 *     sin tocar) más FILAS EXTRA para lo que no está en ella: la que se quita (tachada), la nueva desmarcada o
 *     en espera (fantasma), el origen de una mudanza o de un cambio de semana (fantasma). La casilla de cada
 *     cambio de tarea vive en UNA fila, la de su lugar de hoy («tarea» u «origen»); la de destino lleva su chip
 *     («viene de …») y no casilla. Dentro de cada semana, primero las vivas en su orden del vivo, después los
 *     destinos y al final las nuevas, las dos en el orden del borrador: nunca depende de lo marcado.
 *   · D2 · Las marcas van en un mapa aparte: `r.proyeccion` no se toca (la leen lo escrito, el chat y el cierre).
 *   · D3 · Los números son los de `numeracionDeLaPropuesta`, que no cambian al marcar.
 *   · D13 · Tachado = se quita, nada más (lo hecho va con su check, sin tachar); fantasma = lo que no va a
 *     existir así; «Atrasada» solo en lo que existe hoy y se queda en su semana (`existeHoyYSeQueda`).
 *
 * Los textos que ve el CSE viven acá (entra en la lista de tuteo de contexto-cronograma.test.ts). La guarda:
 * vista-de-la-propuesta.test.ts, con la propuesta grande anonimizada (__fixtures__/propuesta-grande.json).
 */
import {
  acotarSemana,
  aplicablesSinSugeridas,
  destinoDeLaCambia,
  esCambioDeTarea,
  esMudanzaSugerida,
  ordenCompletoDeLaPropuesta,
  type Borrador,
  type Cambio,
  type CambioFaseNueva,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type EstadoDelCambio,
  type FaseViva,
  type GrupoDeTareas,
  type ItemDeLaLista,
  type ItemDeTarea,
  type Party,
  type ResumenDelBorrador,
  type TareaDelVivo,
  type TareaProyectada,
  type TipoDeTarea,
  type UnidadNumerada,
  type Vivo,
} from "./borrador";
import { describeChange } from "./proposal-deltas";
import { filasDeDetalle } from "./sugerencia-detalle";
import { computePhaseRanges, etiquetaDeSemana, fmtDay, isOverdueByDate, overduePlannedEnd, plural } from "./weeks";

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TIPOS ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué es una fila para la propuesta: `nueva` (se crea), `se-va` (se quita), `cambia` (cambia en su lugar),
 * `semana` (el destino de un cambio de semana), `llega` (el destino de una mudanza), `sale` (el origen de una
 * mudanza o de un cambio de semana), `sugerida` (L7), `choque` (no se puede aplicar) y `espera` (espera el
 * recálculo de su fase).
 */
export type TipoDeMarca = "nueva" | "se-va" | "cambia" | "semana" | "llega" | "sale" | "sugerida" | "choque" | "espera";

export interface MarcaDeTarea {
  /** La clave del cambio (la casilla). */
  clave: string;
  /** El número de su grupo (el que se ve en la fila de la fase y cita el chat). */
  numero: number;
  tipo: TipoDeMarca;
  /** Se aplica, o espera el recálculo marcada. */
  marcada: boolean;
  /** `ItemDeTarea.seMarca`: la casilla se puede tocar. */
  seMarca: boolean;
  lugar: "tarea" | "origen" | "destino";
  /** false en el destino (la casilla vive en el origen) y en las tareas de una fase que se va (van con la de la fase). */
  conCasilla: boolean;
  /** Fijo, no cambia al marcar: «Crear», «Quitar», «Cambiar», «Pasar a Semana 3», «Mudar a «Y»». */
  verbo: string;
  /** «nueva», «se quita», «no se crea», «viene de «X»», «→ pasa a la Semana 3», «⚠ la editaste a mano»… */
  chip: string | null;
  /** «antes: «título viejo» · la hacía el equipo» (solo marcada). */
  antes?: string;
  /** El `title` de la fila: el motivo del choque, o el antes → después completo. */
  titulo?: string;
  /** Lo que no va a existir así: una nueva desmarcada o en espera, el origen de lo que se mueve. */
  fantasma: boolean;
  /** Solo `se-va` marcada (y las tareas de una fase que se va). */
  tachada: boolean;
  /** La única que puede llevar «Atrasada»: existe hoy y se queda en su semana. */
  existeHoyYSeQueda: boolean;
  porValidar?: string;
  fuga?: ItemDeTarea["fuga"];
  repetida?: ItemDeTarea["repetida"];
}

/** Una fila que NO está en la proyección: lo que se quita, un fantasma o el origen de lo que se mueve. */
export interface FilaExtra {
  /** La clave del cambio. */
  clave: string;
  /** La key de la fila: el id de la viva (la que se quita), `${id}:origen` (el origen de lo que se mueve) o la
   *  clave del cambio (una nueva fantasma, un choque). Nunca repetida en una semana. */
  key: string;
  /** La fase donde se pinta (id o `n:…`). */
  faseKey: string;
  /** La semana dentro de su fase, desde 0, ya acotada a su duración con lo marcado. */
  semana: number;
  title: string;
  party: Party | null;
  type: TipoDeTarea | null;
  status: string;
  marca: MarcaDeTarea;
}

/** Una fila de una semana, en el orden en que se pinta. `clave` = `TareaProyectada.clave`, o la `key` de la extra. */
export interface FilaDeLaSemana {
  clave: string;
  extra: FilaExtra | null;
}

/** La casilla de un cambio de fase (o del arranque o el orden). */
export interface CasillaDeCambio {
  clave: string;
  numero: number;
  /** Corto y fijo: «3 → 5 semanas», «inicio S2 → S4», «Fase nueva · 2 semanas». */
  texto: string;
  estado: EstadoDelCambio;
  marcada: boolean;
  seMarca: boolean;
  aviso?: string;
  /** Por qué lo propone la IA (el Gantt lo atribuye: «Según la IA: …»). */
  motivo?: string;
  /** P3d: una fase que se quita y se queda con lo que tiene avance («Se queda con 3 tareas con avance…»). Antes lo
   *  decía la lista de la barra (`it.nota`); ahora va al lado de su casilla. */
  nota?: string;
  detalle: ItemDeLaLista["detalle"];
}

/** La casilla de tres estados del grupo de tareas de una fase. */
export interface CasillaDeGrupo {
  numero: number;
  fase: string;
  /** «Tareas: 9 nuevas · 8 se quitan»: la cuenta del grupo ENTERO (no cambia al tocar casillas). */
  texto: string;
  /** Las que marca o desmarca la casilla del grupo (las que se pueden tocar). */
  claves: string[];
  marcadas: number;
  marcables: number;
  /** El número del cambio de fase con el que quedaron fuera sus tareas («va con el 13»), o null. */
  dependeDe: number | null;
  desfasada: boolean;
}

export interface VistaDeFase {
  /** Sus cambios de campo (y la fase nueva o la que se va, si queda en el calendario), por número. */
  casillas: CasillaDeCambio[];
  grupo: CasillaDeGrupo | null;
  /** Lo que ya está así, sin casilla: «10. ya está así: sesiones 3 → 4». */
  yaEsta: string[];
  /** Una lista por semana (0 … duración − 1), en el orden en que se pintan. */
  semanas: FilaDeLaSemana[][];
  /** Las semanas que suma una duración que crece, marcada (desde 0). */
  semanasQueSeSuman: number[];
  /** Las semanas vencidas que reciben una nueva o un destino marcados («ya pasó»). Sin `hoy`, vacía. */
  semanasQueYaPasaron: number[];
  /**
   * M2 (2026-09-27, D9): lo que decide el SISTEMA en esta fase, una vez cada texto (el motivo completo de cada fila del
   * sistema: «Ya hay un kickoff hecho: «X».»). El Gantt lo pinta PRIMERO al desplegar la fase, con su chip, y después
   * el porqué de la IA: lo del sistema nunca se lee como «Según la IA».
   */
  delSistema: string[];
}

/** Una fase fuera del calendario: la nueva desmarcada (o en choque) y la que se va entera. */
export interface FaseFuera {
  key: string;
  /** Detrás de qué fila del Gantt va (la que la precede en el orden completo), o null (arriba). */
  despuesDe: string | null;
  nombre: string;
  semanas: number;
  tono: "se-va" | "desmarcada";
  casilla: CasillaDeCambio;
  /** Sus tareas: fantasmas (la nueva desmarcada) o tachadas (la que se va). */
  tareas: FilaExtra[];
}

export interface VistaDeLaPropuesta {
  /** El arranque, el orden y lo que no tiene fase en la propuesta. */
  cabecera: CasillaDeCambio[];
  /** Por fase de la proyección (y por fase fuera: su grupo y sus otras casillas, sin semanas). */
  porFase: ReadonlyMap<string, VistaDeFase>;
  /** Por `TareaProyectada.clave` (id vivo o `t:`): la marca de cada fila de la proyección que la lleva. */
  marcas: ReadonlyMap<string, MarcaDeTarea>;
  fasesFuera: FaseFuera[];
  orden: UnidadNumerada[];
  totales: { marcadas: number; aplicables: number; choques: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TEXTOS (tuteo, cortos) ───────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const CHIP_NUEVA = "nueva";
export const CHIP_SE_QUITA = "se quita";
export const CHIP_NO_SE_CREA = "no se crea";
export const CHIP_ESPERA = "espera el recálculo";
export const VERBO_CREAR = "Crear";
export const VERBO_QUITAR = "Quitar";
export const VERBO_CAMBIAR = "Cambiar";
const semanaDeLaFase = (w: number) => etiquetaDeSemana(null, w).deLaFase;
export const verboPasarA = (semana: number) => `Pasar a ${semanaDeLaFase(semana)}`;
export const verboMudarA = (fase: string) => `Mudar a «${fase}»`;
/** L7: el verbo de una mudanza que SUGIERE la IA (una hecha que parece de otra fase): una pregunta, no una orden. */
export const verboMoverA = (fase: string) => `¿Mover a «${fase}»?`;
/** L7: la segunda línea de una sugerida sin marcar, en su fase de hoy. */
export const chipEsDe = (fase: string) => `¿es de «${fase}»?`;
export const chipVieneDe = (fase: string) => `viene de «${fase}»`;
export const chipVieneDeLaSemana = (semana: number) => `viene de la ${semanaDeLaFase(semana)}`;
export const chipSeMuda = (fase: string) => `→ se muda a «${fase}»`;
export const chipPasaALaSemana = (semana: number) => `→ pasa a la ${semanaDeLaFase(semana)}`;
export const TITULO_SEMANA_QUE_SE_SUMA = "Semana que suma la propuesta";
/**
 * M2 (2026-09-27, D9 de la spec del replanteo): la fila que decide el SISTEMA (`ItemDeTarea.delSistema`) lleva su chip
 * en vez de «se quita» / «nueva» / «no se crea», y su `title` es el motivo completo. Hoy el sistema solo toca el
 * kickoff (quita el que sobra, agrega el que faltaba); el cierre y la entrega nunca se quitan ni se agregan (D7).
 */
export const CHIP_YA_HAY_KICKOFF = "ya hay kickoff";
export const CHIP_FALTABA_EL_KICKOFF = "faltaba el kickoff";
/** El chip de la línea del sistema al desplegar la fase (va antes del porqué de la IA). */
export const CHIP_DEL_SISTEMA = "Lo decide el sistema";
/** El chip de una fila del sistema: se quita («ya hay kickoff») o se crea («faltaba el kickoff»). */
export const chipDelSistema = (seQuita: boolean) => (seQuita ? CHIP_YA_HAY_KICKOFF : CHIP_FALTABA_EL_KICKOFF);

const PARTY_ANTES: Record<Party, string> = {
  CLIENTE: "la hacía el cliente",
  SMARTEAM: "la hacía el equipo",
  AMBOS: "la hacían juntos",
  DEV: "la hacía desarrollo",
};
const PARTY_DESPUES: Record<Party, string> = {
  CLIENTE: "la hace el cliente",
  SMARTEAM: "la hace el equipo",
  AMBOS: "la hacen juntos",
  DEV: "la hace desarrollo",
};
const tipoEnPalabras = (t: TipoDeTarea | null) => (t === "SESSION" ? "sesión" : t === "TASK" ? "tarea" : "sin tipo");

/** Lo que dice el grupo después de «Tareas:»: cuántas se crean, cuántas se quitan y cuántas cambian. Se mudó de
 *  TareasDeLaPropuesta.tsx (L3): «se quitan» como el chip de la fila, no «se van». L7: y las hechas que la IA sugiere
 *  mudar («· 5 sugeridas»), aparte de las que cambian. */
export function cuentaDelGrupo(g: Pick<GrupoDeTareas, "nuevas" | "seVan" | "cambian"> & { sugeridas?: number }): string {
  const partes: string[] = [];
  if (g.nuevas > 0) partes.push(plural(g.nuevas, "nueva", "nuevas"));
  if (g.seVan > 0) partes.push(`${g.seVan} ${g.seVan === 1 ? "se quita" : "se quitan"}`);
  if (g.cambian > 0) partes.push(`${g.cambian} ${g.cambian === 1 ? "cambia" : "cambian"}`);
  const sugeridas = g.sugeridas ?? 0;
  if (sugeridas > 0) partes.push(plural(sugeridas, "sugerida", "sugeridas"));
  return partes.length > 0 ? partes.join(" · ") : "ya está así";
}

/** El `title` del chip «revisa el texto» (se mudó de TareasDeLaPropuesta.tsx, mismo texto). */
export function tituloDeLaFuga(f: NonNullable<ItemDeTarea["fuga"]>): string {
  const nota = f.motivoDeLaNota ? ` La nota también ${f.motivoDeLaNota}.` : "";
  return (
    `El cliente lee el título y la nota: ${f.campo === "titulo" ? "el título" : "la nota"} ${f.motivo}.${nota} ` +
    "Después de aplicar, corrígela en el Gantt."
  );
}

/** El `title` del chip «ya existe en «X»» (se mudó de TareasDeLaPropuesta.tsx, mismo texto). */
export function tituloDeLaRepetida(r: NonNullable<ItemDeTarea["repetida"]>): string {
  return r.yaAvanzada
    ? `Esta tarea ya existe en «${r.fase}» y allá está ${r.status === "DONE" ? "HECHA" : "en curso"}: si la creas, el avance del proyecto la cuenta dos veces.`
    : `Esta tarea ya existe en «${r.fase}», también pendiente.`;
}

/** El chip corto de un choque (el motivo completo va en el `title`). Lo que no reconoce, «⚠ no se aplica». */
const CHIPS_DEL_CHOQUE: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(Su fase de destino queda fuera|La fase de destino se quita)/, "⚠ su destino queda fuera"],
  [/tiene avance/, "⚠ tiene avance"],
  [/^Ya no está en el cronograma/, "⚠ ya no está"],
  [/^(Su fase|La fase ya no está)/, "⚠ su fase cambió"],
  [/(a mano|^La moviste)/, "⚠ la editaste a mano"],
];
export function chipDelChoque(motivo: string): string {
  const texto = motivo.replace(/^⚠\s*/, "");
  return CHIPS_DEL_CHOQUE.find(([re]) => re.test(texto))?.[1] ?? "⚠ no se aplica";
}

/**
 * El texto corto y FIJO de la casilla de un cambio: «3 → 5 semanas», «pasa a llamarse «Y»», «inicio S2 → S4»
 * (la semana del proyecto desde 0, D4), «sesiones 3 → 4», «cambia la nota», «tipo: Configuración → Adopción»,
 * «Fase nueva · 2 semanas», «Se quita la fase», «Arranque: 19 may → 2 jun», «Reordenar las fases».
 */
export function etiquetaCortaDelCambio(c: Cambio, vivo: Vivo): string {
  switch (c.tipo) {
    case "ancla": {
      const hoy = vivo.ancla ?? c.desde;
      return `Arranque: ${hoy ? fmtDay(new Date(hoy.slice(0, 10))) : "sin fecha"} → ${fmtDay(new Date(c.a.slice(0, 10)))}`;
    }
    case "orden":
      return "Reordenar las fases";
    case "fase-nueva":
      return `Fase nueva · ${plural(c.fase.durationWeeks, "semana", "semanas")}`;
    case "fase-se-va":
      return "Se quita la fase";
    case "fase-cambia": {
      if (c.campo === "durationWeeks" || c.campo === "startWeek") {
        const rangos = computePhaseRanges(vivo.fases);
        const i = vivo.fases.findIndex((f) => f.id === c.faseId);
        return describeChange({ field: c.campo, from: c.desde, to: c.a }, { inicioActual: i >= 0 ? rangos[i].start : null });
      }
      if (c.campo === "sessionCount") return `sesiones ${c.desde ?? "sin estimar"} → ${c.a ?? "sin estimar"}`;
      if (c.campo === "notes") return "cambia la nota";
      if (c.campo === "name") return `pasa a llamarse «${String(c.a)}»`;
      const [fila] = filasDeDetalle([{ field: "activityType", from: c.desde, to: c.a }]);
      return `tipo: ${fila.antes} → ${fila.despues}`;
    }
    case "tarea-nueva":
      return `Crear «${c.tarea.title}»`;
    case "tarea-se-va":
      return `Quitar «${c.desde.title}»`;
    case "tarea-cambia":
      return `Cambiar «${c.desde.title}»`;
    default: {
      const _: never = c;
      return _;
    }
  }
}

/**
 * Una observación de la IA como la lee el CSE: parte la frase en «; » y saca las partes que nombran «el paso
 * de tareas» (jerga del paso 1). Termina en punto. Vacía si no queda nada (no se muestra). No toca lo que se
 * guarda ni lo que lee el modelo.
 */
export function observacionParaMostrar(o: string): string {
  const partes = o
    .split(/;\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/\bpaso de (las )?tareas\b/i.test(p));
  if (partes.length === 0) return "";
  const texto = `${partes.join("; ").replace(/[\s.;,:]+$/, "")}.`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cuántas tareas del avance sin revisar toca la propuesta (las quita o las cambia): «Revísalo antes de aplicar». */
export function avanceQueSeCruza(idsDelAvance: readonly string[], cambios: readonly Cambio[]): number {
  const tocadas = new Set<string>();
  for (const c of cambios) {
    if (c.tipo === "tarea-se-va" || c.tipo === "tarea-cambia") tocadas.add(c.tareaId);
    else if (c.tipo === "fase-se-va") for (const t of c.desde.tareas) tocadas.add(t.id);
  }
  return new Set(idsDelAvance.filter((id) => tocadas.has(id))).size;
}

/**
 * Las fases a desplegar al entrar: las que tienen cambios, si sus filas de tareas (desplegadas) suman `tope` o
 * menos. Si pasan (la propuesta grande: 185), ninguna: las filas de fase ya muestran cada número y su casilla.
 */
export function fasesADesplegarAlEntrar(v: VistaDeLaPropuesta, tope = 40): string[] {
  const claves: string[] = [];
  let filas = 0;
  for (const [clave, f] of v.porFase) {
    if (f.casillas.length === 0 && f.grupo === null) continue;
    claves.push(clave);
    filas += f.semanas.reduce((n, s) => n + s.length, 0);
  }
  for (const f of v.fasesFuera) {
    if (!claves.includes(f.key)) claves.push(f.key);
    filas += f.tareas.length;
  }
  return filas <= tope ? claves : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO QUE EL GANTT PREGUNTA (L3 P3c) ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Las etiquetas de la fila de una fase (`MarcaDeFase`, de `proyectarConPlan`) que ya dice una casilla: la
 *  duración, el inicio, el nombre, las sesiones, la nota, el tipo, la fase nueva y lo que cuenta el grupo. */
const DICHAS_POR_UNA_CASILLA: readonly RegExp[] = [
  /^[+−]\d+ semanas?$/,
  /^inicio /,
  /^(renombrada|sesiones|notas|tipo|nueva)$/,
  /^[+−]\d+ tareas?$/,
  /^\d+ tareas? cambian?$/,
];

/** Las etiquetas de la fila de una fase que quedan como chips SIN casilla en la vista de la propuesta
 *  («movida», «se queda con N tareas», «tareas por recalcular»): lo demás ya lo dice una casilla, no dos veces. */
export function etiquetasSinCasilla(etiquetas: readonly string[]): string[] {
  return etiquetas.filter((e) => !DICHAS_POR_UNA_CASILLA.some((re) => re.test(e)));
}

/** Las tareas que cuentan para los atrasos en la vista de la propuesta (el punto de la fase, el anillo de la
 *  celda, «Pendiente del cliente · atrasadas»): las que existen hoy y se quedan en su semana. Sin marca, cuenta. */
export function tareasQueExistenHoy<T extends { key: string }>(tareas: readonly T[], marcas: ReadonlyMap<string, MarcaDeTarea>): T[] {
  return tareas.filter((t) => marcas.get(t.key)?.existeHoyYSeQueda !== false);
}

/** Lo que dice la casilla de una tarea a quien no la ve (su `aria-label`): el verbo con la tarea y su número.
 *  «Quitar la tarea «T» · número 12», «Pasar «T» a la Semana 3 · número 7», «Mudar «T» a «Y» · número 9». */
export function etiquetaDeLaCasilla(m: MarcaDeTarea, titulo: string): string {
  const t = `«${titulo.trim() || "Sin título"}»`;
  const sugerida = /^¿Mover a (.+)\?$/.exec(m.verbo);
  const accion =
    m.verbo === VERBO_CREAR
      ? `Crear la tarea ${t}`
      : m.verbo === VERBO_QUITAR
        ? `Quitar la tarea ${t}`
        : m.verbo === VERBO_CAMBIAR
          ? `Cambiar la tarea ${t}`
          : m.verbo.startsWith("Pasar a ")
            ? `Pasar ${t} a la ${m.verbo.slice("Pasar a ".length)}`
            : m.verbo.startsWith("Mudar a ")
              ? `Mudar ${t} a ${m.verbo.slice("Mudar a ".length)}`
              : sugerida
                ? `Mover ${t} a ${sugerida[1]}`
                : `${m.verbo} ${t}`;
  return `${accion}${m.tipo === "sugerida" ? " (sugerida)" : ""} · número ${m.numero}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA BARRA Y EL CANVAS (L3 P3d) ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de una semana como la pinta el Gantt: la `key` de su `GanttTask`, o la de la fila extra. */
export interface FilaDelGantt {
  key: string;
  extra: FilaExtra | null;
}

/** Lo que el Gantt busca por `key` (`PropuestaEnElGantt.marcasPorKey` y `semanasPorKey`). */
export interface VistaEnLasFilas {
  marcasPorKey: Map<string, MarcaDeTarea>;
  semanasPorKey: Map<string, FilaDelGantt[][]>;
}

/**
 * La vista con sus claves pasadas a las `key` de la pantalla. La vista habla de `TareaProyectada.clave` (el id de la
 * viva, o `t:…`) y el Gantt de la `key` de cada `GanttTask`: la de una viva es la de su fila de hoy (así React
 * conserva el nodo al alternar), que no siempre es su id. `keyDeLaViva(id)` la da (undefined: no tiene fila, queda la
 * clave). Una fila extra cuya key es el id de una viva (la que se quita, marcada) toma la key de esa fila: marcarla o
 * desmarcarla no cambia la key. Las fases, por la `key` de su fila del Gantt.
 */
export function vistaEnLasFilas(
  v: VistaDeLaPropuesta,
  fases: ReadonlyArray<{ clave: string; key: string }>,
  keyDeLaViva: (id: string) => string | undefined,
): VistaEnLasFilas {
  const key = (clave: string) => keyDeLaViva(clave) ?? clave;
  const marcasPorKey = new Map<string, MarcaDeTarea>();
  for (const [clave, m] of v.marcas) marcasPorKey.set(key(clave), m);
  const semanasPorKey = new Map<string, FilaDelGantt[][]>();
  for (const f of fases) {
    const vf = v.porFase.get(f.clave);
    if (!vf) continue;
    semanasPorKey.set(
      f.key,
      vf.semanas.map((s) => s.map((x) => ({ key: key(x.clave), extra: x.extra }))),
    );
  }
  return { marcasPorKey, semanasPorKey };
}

/** El chip del cierre en la cabecera del Gantt (`texto`) y las fechas con que se arma. */
export interface CierreEnElGantt {
  antes: string;
  despues: string;
  texto: string;
}

/**
 * El chip «Cierre: 13 oct → 10 nov» de la cabecera del Gantt: el cierre de hoy y con lo marcado. null sin fechas.
 * Revisión de L1–L7 (#9): con un cierre FIJADO a mano (Tanda K, `cierreFijado`), aplicar no lo cambia: el chip dice que
 * lo que se mueve es el plan calculado («Plan calculado: 13 oct → 10 nov · el cierre fijado no cambia»), como la barra y
 * la confirmación (`fraseDelCierre`). Decía «Cierre: 13 oct → 10 nov» al lado de la fecha fijada.
 */
export function cierreParaElGantt(
  r: Pick<ResumenDelBorrador, "cierreAntes" | "cierreDespues">,
  cierreFijado: string | null = null,
): CierreEnElGantt | null {
  if (!r.cierreAntes.date || !r.cierreDespues.date) return null;
  const antes = fmtDay(r.cierreAntes.date);
  const despues = fmtDay(r.cierreDespues.date);
  const tramo = antes === despues ? `${despues} (no cambia)` : `${antes} → ${despues}`;
  const texto = cierreFijado
    ? `Plan calculado: ${antes === despues ? despues : tramo} · el cierre fijado no cambia`
    : `Cierre: ${tramo}`;
  return { antes, despues, texto };
}

/** Lo que recorre «Siguiente número»: todo menos lo «ya está» (se numera, pero no hay nada que decidir). */
export function unidadesDelSiguiente(orden: readonly UnidadNumerada[]): UnidadNumerada[] {
  return orden.filter((u) => !u.yaEsta);
}

/** A qué unidad va «Siguiente» (`dir` 1) o «anterior» (−1) desde `actual` (índice desde 0, o null antes del primer
 *  clic). Da la vuelta. null si no hay ninguna. */
export function pasoDelSiguiente(total: number, actual: number | null, dir: 1 | -1): number | null {
  if (total <= 0) return null;
  if (actual === null || actual < 0 || actual >= total) return dir === 1 ? 0 : total - 1;
  return (actual + dir + total) % total;
}

export interface PosicionDelSiguiente {
  /** En cuál está (desde 1), o null antes del primer clic. */
  actual: number | null;
  total: number;
  /** El número de la primera unidad (el de «Volver al N»), o null sin unidades. */
  primero: number | null;
  /** Revisión de L1–L7 (#10): el número del Gantt de la unidad en la que está (el de su casilla), o null. */
  numero?: number | null;
  /** Revisión de L1–L7 (#10): cuántos números «ya está» se saltan (tienen número, pero no hay nada que decidir). */
  saltados?: number;
}

/** Dónde está «Siguiente número» (`iActual`: el índice en `unidadesDelSiguiente(indice)`, o null antes del primer clic).
 *  Revisión de L1–L7 (#10): con el número del Gantt de esa unidad y cuántos «ya está» se saltan. */
export function posicionDelSiguiente(indice: readonly UnidadNumerada[], iActual: number | null): PosicionDelSiguiente {
  const unidades = unidadesDelSiguiente(indice);
  const i = iActual !== null && iActual >= 0 && iActual < unidades.length ? iActual : null;
  return {
    actual: i === null ? null : i + 1,
    total: unidades.length,
    primero: unidades[0]?.numero ?? null,
    numero: i === null ? null : unidades[i].numero,
    saltados: indice.length - unidades.length,
  };
}

export const TITULO_DEL_SIGUIENTE = "Atajos: n (siguiente) y p (anterior)";

/**
 * «Recorrer los 14 números» → «Siguiente número · 3 de 14» → «Volver al 1 · 14 de 14». null sin números.
 * Revisión de L1–L7 (#10): «k de N» es la posición en el recorrido, que salta lo «ya está». Desde el primer «ya está» ya
 * no es el número de la casilla enfocada (ni el que cita el chat): entonces el texto nombra también el número real
 * («Siguiente número · el 11 (10 de 14)»), y el recorrido dice que cuenta solo lo que falta decidir.
 */
export function textoDelSiguiente(p: PosicionDelSiguiente): string | null {
  if (p.total <= 0 || p.primero === null) return null;
  if (p.actual === null) {
    if (p.total === 1) return `Ir al número ${p.primero}`;
    return (p.saltados ?? 0) > 0 ? `Recorrer los ${p.total} números por decidir` : `Recorrer los ${p.total} números`;
  }
  const numero = p.numero ?? null;
  const donde = numero !== null && numero !== p.actual ? `el ${numero} (${p.actual} de ${p.total})` : `${p.actual} de ${p.total}`;
  if (p.actual >= p.total) return `Volver al ${p.primero} · ${donde}`;
  return `Siguiente número · ${donde}`;
}

/** La tecla de «Siguiente número»: `n` (1) o `p` (−1), sin modificadores y fuera de un campo de escritura. */
export function atajoDelSiguiente(
  e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean },
  escribiendo: boolean,
): 1 | -1 | null {
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  return e.key === "n" ? 1 : e.key === "p" ? -1 : null;
}

/** Los totales de la barra (van en `aria-live`): «Aplicas 132 de 132 cambios». Las tareas que esperan su recálculo
 *  todavía no cuentan, y lo dice. L7: las mudanzas sugeridas sin marcar no cuentan en M (nacen así, no las desmarcó
 *  el CSE) y se dicen aparte: «Aplicas 132 de 132 cambios · 5 mudanzas sugeridas sin marcar». */
export function textoDeLosTotales(
  r: Pick<ResumenDelBorrador, "marcadas" | "aplicables" | "desfasadas"> & { sugeridasSinMarcar?: number },
): string {
  const base = `Aplicas ${r.marcadas} de ${plural(aplicablesSinSugeridas(r), "cambio", "cambios")}`;
  const conRecalculo = r.desfasadas.length > 0 ? `${base}, sin contar las tareas que se recalculan` : base;
  const sugeridas = r.sugeridasSinMarcar ?? 0;
  return sugeridas > 0
    ? `${conRecalculo} · ${plural(sugeridas, "mudanza sugerida sin marcar", "mudanzas sugeridas sin marcar")}`
    : conRecalculo;
}

/** Los choques, solo si hay: cada fila dice el suyo con su ⚠ (no siempre es una edición a mano). */
export function textoDeLosChoques(n: number): string {
  return n === 1 ? "⚠ 1 cambio choca y queda fuera: su ⚠ dice por qué." : `⚠ ${n} cambios chocan y quedan fuera: cada ⚠ dice por qué.`;
}

/** El avance sin revisar (el cajón «Lo que detectó el agente»): si toca tareas que la propuesta quita o cambia, pide
 *  revisarlo antes de aplicar. */
export function textoDelAvance(seCruza: boolean): string {
  return seCruza ? "Hay un avance detectado sin revisar. Revísalo antes de aplicar." : "Hay un avance detectado sin revisar.";
}
export const ACCION_REVISAR_AVANCE = "Revisar avance";

/** M1 (2026-09-27, pedido de Elías): «Descartar» vive en la barra fija, al lado de «Aplicar», y SIEMPRE pregunta (está a
 *  un clic del botón principal y descartar no deja copia). El diálogo, corto: qué pasa con el cronograma y que no hay
 *  vuelta. */
export const TEXTO_DESCARTAR = "Descartar";
export const TITULO_DEL_DESCARTE = "¿Descartar la propuesta?";
export const TEXTO_DEL_DESCARTE = "El cronograma queda como está y la propuesta no se recupera.";

/**
 * ¿Ya venció la semana `semana` (desde 0) de una fase que arranca en la semana `inicio` del proyecto, para una tarea en
 * `status`? L4: es EL predicado del atraso de la propuesta: rotula «ya pasó» en la semana del Gantt y cuenta las
 * atrasadas del mensaje (`atrasadas`, mensaje-de-la-propuesta.ts). Sin ancla o sin `hoy` (antes de hidratar), nunca.
 */
export function semanaVencida(ancla: string | null, inicio: number, semana: number, hoy: Date | null, status = "PENDING"): boolean {
  return isOverdueByDate(overduePlannedEnd(ancla, inicio, semana), hoy, status);
}

const SEMANA_MS = 7 * 86_400_000;

/**
 * M3 (2026-09-27, D2): LA SEMANA DE HOY del proyecto (desde 0): la primera que NO vence según `semanaVencida`, el mismo
 * predicado que pinta «ya pasó» y «Atrasada». Así la regla del paso 2 (R13), lo que lee el modelo, el mensaje y la
 * pantalla nunca discrepan. 0 antes del arranque; null sin ancla o sin `hoy`.
 * ⚠ No es `semanaDelProyecto` del armador (propuesta-de-estructura.ts), que cuenta por el día de Costa Rica: de noche
 * (entre las 18:00 y la medianoche del día del arranque) daría una semana menos que «ya pasó».
 * Se calcula de una vez y se ajusta contra el predicado: el predicado manda.
 */
export function semanaDeHoy(ancla: string | null, hoy: Date | null): number | null {
  if (!ancla || !hoy) return null;
  const inicio = new Date(ancla).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(hoy.getTime())) return null;
  let w = Math.max(0, Math.ceil((hoy.getTime() - inicio) / SEMANA_MS) - 1);
  while (w > 0 && !semanaVencida(ancla, 0, w - 1, hoy)) w--;
  while (semanaVencida(ancla, 0, w, hoy)) w++;
  return w;
}

/** Lo que notó la IA como se muestra en la barra: sin la jerga del paso 1 y sin las que quedan vacías. */
export function observacionesParaMostrar(observaciones: readonly string[]): string[] {
  return observaciones.map(observacionParaMostrar).filter((o) => o.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA VISTA ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Dónde cae una fila dentro de su semana (D1): 0 las vivas (orden del vivo), 1 los destinos y 2 las nuevas
 *  (orden del borrador), 3 lo que no se reconoce (una recién escrita sin id: al final). */
type Bloque = 0 | 1 | 2 | 3;
interface Ubicada {
  extra: FilaExtra;
  bloque: Bloque;
  orden: number;
}

const motivoDelAviso = (aviso: string | undefined) => (aviso ?? "").replace(/^⚠\s*/, "");

/**
 * ⭐ LA VISTA DE LA PROPUESTA: las casillas de fase y de grupo, la marca de cada fila, las filas extra y el
 * orden de cada semana. `r` es el resumen con lo marcado; `hoy` (null antes de hidratar) solo decide las
 * semanas que «ya pasaron». No toca `r.proyeccion`.
 */
export function vistaDeLaPropuesta(vivo: Vivo, borrador: Borrador, r: ResumenDelBorrador, hoy: Date | null): VistaDeLaPropuesta {
  // ── Índices ──
  const cambioPorClave = new Map<string, Cambio>();
  const ordenDelBorrador = new Map<string, number>();
  borrador.cambios.forEach((c, i) => {
    if (cambioPorClave.has(c.clave)) return;
    cambioPorClave.set(c.clave, c);
    ordenDelBorrador.set(c.clave, i);
  });
  const vivaPorId = new Map<string, { tarea: TareaDelVivo; fase: string; orden: number }>();
  for (const f of vivo.fases) for (const t of f.tareas ?? []) vivaPorId.set(t.id, { tarea: t, fase: f.id, orden: vivaPorId.size });
  const faseViva = new Map<string, FaseViva>(vivo.fases.map((f) => [f.id, f]));
  const fasesNuevas = new Map<string, CambioFaseNueva>(
    borrador.cambios.flatMap((c) => (c.tipo === "fase-nueva" ? [[c.clave, c] as const] : [])),
  );
  const rangos = computePhaseRanges(r.proyeccion.fases);
  const enLaProyeccion = new Map(r.proyeccion.fases.map((f, i) => [f.clave, { fase: f, inicio: rangos[i].start }]));
  const tareaProyectada = new Map<string, { fase: string; t: TareaProyectada }>();
  for (const f of r.proyeccion.fases) for (const t of f.tareas) tareaProyectada.set(t.clave, { fase: f.clave, t });
  /** El nombre FIJO de una fase (el de hoy, o el de la nueva): el verbo y los chips no cambian al marcar un renombre. */
  const nombreFijo = (fase: string) => fasesNuevas.get(fase)?.fase.name ?? faseViva.get(fase)?.name ?? fase;
  const duracionDe = (fase: string) =>
    enLaProyeccion.get(fase)?.fase.durationWeeks ?? fasesNuevas.get(fase)?.fase.durationWeeks ?? faseViva.get(fase)?.durationWeeks ?? 1;

  // ── Las marcas y las filas extra de las tareas ──
  const marcas = new Map<string, MarcaDeTarea>();
  const extrasPorFase = new Map<string, Ubicada[]>();
  const ponerExtra = (u: Ubicada) => extrasPorFase.set(u.extra.faseKey, [...(extrasPorFase.get(u.extra.faseKey) ?? []), u]);
  /** La fila de una viva que no está en la proyección (o cuya fila ya lleva otra marca): un fantasma en su lugar. */
  const fantasmaDeLaViva = (c: CambioTareaSeVa | CambioTareaCambia, marca: MarcaDeTarea): Ubicada => {
    const viva = vivaPorId.get(c.tareaId);
    const p = tareaProyectada.get(c.tareaId);
    const faseKey = p?.fase ?? c.faseId;
    const t = viva?.tarea;
    return {
      extra: {
        clave: c.clave,
        key: c.clave,
        faseKey,
        semana: p ? p.t.weekIndex : acotarSemana(t?.weekIndex ?? c.desde.weekIndex, duracionDe(faseKey)),
        title: t?.title ?? c.desde.title,
        party: t ? t.party : c.desde.party,
        type: t ? t.type : c.desde.type,
        status: t?.status ?? "PENDING",
        marca: { ...marca, fantasma: true, existeHoyYSeQueda: false },
      },
      bloque: 0,
      orden: viva?.orden ?? Number.MAX_SAFE_INTEGER,
    };
  };
  /** La marca sobre una fila de la proyección; si no está (o ya lleva otra), su fantasma. */
  const marcarLaViva = (c: CambioTareaSeVa | CambioTareaCambia, marca: MarcaDeTarea) => {
    if (tareaProyectada.has(c.tareaId) && !marcas.has(c.tareaId)) marcas.set(c.tareaId, marca);
    else ponerExtra(fantasmaDeLaViva(c, marca));
  };
  /** La fila de una viva en su lugar de hoy (la que se quita, el origen de lo que se mueve). */
  const extraEnSuLugar = (c: CambioTareaSeVa | CambioTareaCambia, key: string, marca: MarcaDeTarea): Ubicada => {
    const viva = vivaPorId.get(c.tareaId);
    const t = viva?.tarea;
    return {
      extra: {
        clave: c.clave,
        key,
        faseKey: c.faseId,
        semana: acotarSemana(t?.weekIndex ?? c.desde.weekIndex, duracionDe(c.faseId)),
        title: t?.title ?? c.desde.title,
        party: t ? t.party : c.desde.party,
        type: t ? t.type : c.desde.type,
        status: t?.status ?? "PENDING",
        marca,
      },
      bloque: 0,
      orden: viva?.orden ?? Number.MAX_SAFE_INTEGER,
    };
  };

  /** Lo que toda marca de un `ItemDeTarea` lleva igual: su casilla, su número y sus chips de siempre. */
  type Base = Pick<MarcaDeTarea, "clave" | "numero" | "marcada" | "seMarca" | "tachada" | "porValidar" | "fuga" | "repetida" | "titulo">;

  function tareaNueva(c: CambioTareaNueva, it: ItemDeTarea, base: Base, choque: string | null) {
    // M2: la que agrega el sistema dice por qué («faltaba el kickoff»), marcada o no; un choque o la espera, lo suyo.
    const delSistema = it.delSistema ? chipDelSistema(false) : null;
    if (choque === null && it.estado === "aplica") {
      // Está en la proyección: la fila real, en verde.
      if (tareaProyectada.has(c.clave)) {
        marcas.set(c.clave, {
          ...base,
          tipo: "nueva",
          lugar: "tarea",
          conCasilla: true,
          verbo: VERBO_CREAR,
          chip: delSistema ?? CHIP_NUEVA,
          fantasma: false,
          existeHoyYSeQueda: false,
        });
      }
      return;
    }
    // Desmarcada, en espera (`proyectarConPlan` saca lo que espera) o en choque: un fantasma en su lugar.
    const tipo: TipoDeMarca = choque !== null ? "choque" : it.enEspera ? "espera" : "nueva";
    ponerExtra({
      extra: {
        clave: c.clave,
        key: c.clave,
        faseKey: c.fase,
        semana: acotarSemana(c.tarea.weekIndex, duracionDe(c.fase)),
        title: c.tarea.title,
        party: c.tarea.party,
        type: c.tarea.type,
        status: "PENDING",
        marca: {
          ...base,
          tipo,
          lugar: "tarea",
          conCasilla: true,
          verbo: VERBO_CREAR,
          chip: choque !== null ? chipDelChoque(choque) : it.enEspera ? CHIP_ESPERA : (delSistema ?? CHIP_NO_SE_CREA),
          fantasma: true,
          existeHoyYSeQueda: false,
        },
      },
      bloque: 2,
      orden: ordenDelBorrador.get(c.clave) ?? Number.MAX_SAFE_INTEGER,
    });
  }

  function tareaSeVa(c: CambioTareaSeVa, it: ItemDeTarea, base: Base, choque: string | null) {
    const comun = { ...base, lugar: "tarea" as const, conCasilla: true, verbo: VERBO_QUITAR, fantasma: false };
    // M2: la que quita el sistema (el kickoff que sobra) dice por qué, marcada o no.
    const delSistema = it.delSistema ? chipDelSistema(true) : null;
    if (choque !== null) {
      marcarLaViva(c, { ...comun, tipo: "choque", chip: chipDelChoque(choque), existeHoyYSeQueda: true });
    } else if (it.enEspera) {
      // La viva SIGUE en la proyección (todavía no se aplica): la marca va sobre ella, sin extra (si no, la
      // misma key quedaría dos veces en la semana).
      marcarLaViva(c, { ...comun, tipo: "espera", chip: CHIP_ESPERA, existeHoyYSeQueda: false });
    } else if (it.estado === "aplica") {
      ponerExtra(
        extraEnSuLugar(c, c.tareaId, { ...comun, tipo: "se-va", chip: delSistema ?? CHIP_SE_QUITA, tachada: true, existeHoyYSeQueda: false }),
      );
    } else {
      // Desmarcada: se queda, normal y sin chip (la del sistema, con el suyo).
      marcarLaViva(c, { ...comun, tipo: "se-va", chip: delSistema, existeHoyYSeQueda: true });
    }
  }

  function tareaCambia(c: CambioTareaCambia, it: ItemDeTarea, base: Base, choque: string | null) {
    const viva = vivaPorId.get(c.tareaId)?.tarea;
    const semanaHoy = viva?.weekIndex ?? c.desde.weekIndex;
    const destino = destinoDeLaCambia(c);
    const nuevaSemana = c.a.weekIndex !== undefined && c.a.weekIndex !== semanaHoy ? c.a.weekIndex : null;
    const seMueve = destino !== null || nuevaSemana !== null;
    /* L7: una mudanza SUGERIDA por la IA (una hecha que parece de otra fase) se pinta como la mudanza del chat, con
       su pregunta de verbo («¿Mover a «Y»?») y su tipo propio: desmarcada, normal en su ORIGEN con «¿es de «Y»?»;
       marcada, fantasma SIN tachar en el origen y «viene de «X»» en el destino. La hecha conserva su check en los dos. */
    const sugerida = esMudanzaSugerida(c) && destino !== null;
    const verbo =
      destino !== null
        ? sugerida
          ? verboMoverA(nombreFijo(destino))
          : verboMudarA(nombreFijo(destino))
        : nuevaSemana !== null
          ? verboPasarA(nuevaSemana)
          : VERBO_CAMBIAR;
    const { antes, titulo } = antesYDespues(c, semanaHoy, destino !== null ? nombreFijo(destino) : null, nombreFijo(c.faseId));
    const comun = {
      ...base,
      verbo,
      ...(base.titulo === undefined && titulo ? { titulo } : {}),
    };
    if (choque !== null) {
      marcarLaViva(c, {
        ...comun,
        tipo: "choque",
        lugar: seMueve ? "origen" : "tarea",
        conCasilla: true,
        chip: chipDelChoque(choque),
        fantasma: false,
        existeHoyYSeQueda: true,
      });
      return;
    }
    if (!seMueve) {
      // Cambia en su lugar (título, dueño, tipo): marcada, con su «antes»; desmarcada, con los valores de hoy.
      marcarLaViva(c, {
        ...comun,
        tipo: "cambia",
        lugar: "tarea",
        conCasilla: true,
        chip: null,
        ...(it.estado === "aplica" && antes ? { antes } : {}),
        fantasma: false,
        existeHoyYSeQueda: true,
      });
      return;
    }
    if (it.estado !== "aplica") {
      // Desmarcada: la viva sigue en su semana (y su fase), con la casilla. L7: la sugerida, con su pregunta.
      marcarLaViva(c, {
        ...comun,
        tipo: sugerida ? "sugerida" : "sale",
        lugar: "origen",
        conCasilla: true,
        chip: sugerida && destino !== null ? chipEsDe(nombreFijo(destino)) : null,
        fantasma: false,
        existeHoyYSeQueda: true,
      });
      return;
    }
    // Marcada: la viva ya está en su destino (sin casilla) y en su lugar de hoy queda un fantasma SIN tachar.
    const marcaDelDestino: MarcaDeTarea = {
      ...comun,
      tipo: destino !== null ? "llega" : "semana",
      lugar: "destino",
      conCasilla: false,
      chip: destino !== null ? chipVieneDe(nombreFijo(c.faseId)) : chipVieneDeLaSemana(semanaHoy),
      ...(antes ? { antes } : {}),
      fantasma: false,
      existeHoyYSeQueda: false,
    };
    if (tareaProyectada.has(c.tareaId) && !marcas.has(c.tareaId)) marcas.set(c.tareaId, marcaDelDestino);
    ponerExtra(
      extraEnSuLugar(c, `${c.tareaId}:origen`, {
        ...comun,
        tipo: sugerida ? "sugerida" : "sale",
        lugar: "origen",
        conCasilla: true,
        chip: destino !== null ? chipSeMuda(nombreFijo(destino)) : chipPasaALaSemana(nuevaSemana ?? semanaHoy),
        fantasma: true,
        existeHoyYSeQueda: false,
      }),
    );
  }

  /* Cada `ItemDeTarea` (sin lo «ya está», que no tiene casilla): UNA fila con su casilla, en su lugar de hoy. */
  const tocadas = new Set<string>();
  /** M2: lo que decide el sistema, por fase (su grupo), sin repetir el texto. */
  const delSistemaPorFase = new Map<string, string[]>();
  for (const g of r.grupos) {
    for (const it of g.tareas) {
      if (it.estado === "ya-esta") continue;
      if (it.delSistema) {
        const ya = delSistemaPorFase.get(g.fase) ?? [];
        if (!ya.includes(it.delSistema.texto)) delSistemaPorFase.set(g.fase, [...ya, it.delSistema.texto]);
      }
      const c = cambioPorClave.get(it.clave);
      if (!c || !esCambioDeTarea(c)) continue;
      if (c.tipo !== "tarea-nueva") tocadas.add(c.tareaId);
      const choque = it.estado === "choque" ? motivoDelAviso(it.aviso) : null;
      const base: Base = {
        clave: it.clave,
        numero: g.numero,
        marcada: it.estado === "aplica" || !!it.enEspera,
        seMarca: it.seMarca,
        tachada: false,
        ...(it.porValidar ? { porValidar: it.porValidar } : {}),
        ...(it.fuga ? { fuga: it.fuga } : {}),
        ...(it.repetida ? { repetida: it.repetida } : {}),
        // M2: la del sistema lleva su motivo completo en el `title` (el choque, si lo hay, manda).
        ...(choque !== null ? { titulo: choque } : it.delSistema ? { titulo: it.delSistema.texto } : {}),
      };
      if (c.tipo === "tarea-nueva") tareaNueva(c, it, base, choque);
      else if (c.tipo === "tarea-se-va") tareaSeVa(c, it, base, choque);
      else tareaCambia(c, it, base, choque);
    }
  }

  // ── La estructura: la cabecera, las casillas de cada fase y las fases fuera del calendario ──
  const casillaDe = (it: ItemDeLaLista, c: Cambio): CasillaDeCambio => ({
    clave: it.clave,
    numero: it.numero,
    texto: etiquetaCortaDelCambio(c, vivo),
    estado: it.estado,
    marcada: it.estado === "aplica",
    seMarca: it.estado === "aplica" || it.estado === "excluido",
    ...(it.aviso ? { aviso: it.aviso } : {}),
    ...(it.motivo ? { motivo: it.motivo } : {}),
    ...(it.nota ? { nota: it.nota } : {}),
    detalle: it.detalle,
  });
  const ordenCompleto = ordenCompletoDeLaPropuesta(vivo, borrador.cambios);
  const despuesDe = (key: string): string | null => {
    const i = ordenCompleto.indexOf(key);
    for (let j = i - 1; j >= 0; j--) if (enLaProyeccion.has(ordenCompleto[j])) return ordenCompleto[j];
    return null;
  };
  const cabecera: CasillaDeCambio[] = [];
  const casillasPorFase = new Map<string, CasillaDeCambio[]>();
  const yaEstaPorFase = new Map<string, string[]>();
  const sumadasPorFase = new Map<string, number[]>();
  /* Primero las fases fuera (un campo de una de ellas puede venir antes en el borrador): la nueva que no se suma
     (desmarcada, heredada o en choque) y la que se va entera. */
  const fuera = new Map<string, Omit<FaseFuera, "tareas">>();
  const casillaFuera = new Set<string>();
  for (const it of r.items) {
    const c = cambioPorClave.get(it.clave);
    if (c?.tipo === "fase-nueva" && it.estado !== "aplica" && it.estado !== "ya-esta") {
      fuera.set(c.clave, {
        key: c.clave,
        despuesDe: despuesDe(c.clave),
        nombre: c.fase.name,
        semanas: c.fase.durationWeeks,
        tono: "desmarcada",
        casilla: casillaDe(it, c),
      });
      casillaFuera.add(it.clave);
    } else if (c?.tipo === "fase-se-va" && it.estado === "aplica" && !enLaProyeccion.has(c.faseId)) {
      const f = faseViva.get(c.faseId);
      fuera.set(c.faseId, {
        key: c.faseId,
        despuesDe: despuesDe(c.faseId),
        nombre: f?.name ?? c.desde.name,
        semanas: f?.durationWeeks ?? c.desde.durationWeeks,
        tono: "se-va",
        casilla: casillaDe(it, c),
      });
      casillaFuera.add(it.clave);
    }
  }
  for (const it of r.items) {
    const c = cambioPorClave.get(it.clave);
    if (!c || casillaFuera.has(it.clave)) continue;
    const casilla = casillaDe(it, c);
    const fase = c.tipo === "fase-nueva" ? c.clave : c.tipo === "fase-cambia" || c.tipo === "fase-se-va" ? c.faseId : null;
    if (fase === null || (!enLaProyeccion.has(fase) && !fuera.has(fase))) {
      // El arranque, el orden y lo que no tiene fase en la propuesta (lo «ya está» de la cabecera no se pinta).
      if (it.estado !== "ya-esta") cabecera.push(casilla);
      continue;
    }
    if (it.estado === "ya-esta") {
      yaEstaPorFase.set(fase, [...(yaEstaPorFase.get(fase) ?? []), `${it.numero}. ya está así: ${casilla.texto}`]);
      continue;
    }
    casillasPorFase.set(fase, [...(casillasPorFase.get(fase) ?? []), casilla]);
    if (c.tipo === "fase-cambia" && c.campo === "durationWeeks" && it.estado === "aplica") {
      const desde = Number(c.desde);
      const a = Number(c.a);
      const suma: number[] = [];
      for (let w = desde; w < a; w++) suma.push(w);
      sumadasPorFase.set(fase, suma);
    }
  }

  /* Las tareas de una fase que se va (marcada): tachadas, sin casilla propia (van con la de la fase). Las que ya
     tienen su propio cambio se pintan con él; las que se quedan (el rescate) están en la proyección. */
  for (const it of r.items) {
    const c = cambioPorClave.get(it.clave);
    if (!c || c.tipo !== "fase-se-va" || it.estado !== "aplica") continue;
    for (const t of faseViva.get(c.faseId)?.tareas ?? []) {
      if (tocadas.has(t.id) || tareaProyectada.has(t.id)) continue;
      ponerExtra({
        extra: {
          clave: c.clave,
          key: t.id,
          faseKey: c.faseId,
          semana: acotarSemana(t.weekIndex, duracionDe(c.faseId)),
          title: t.title,
          party: t.party,
          type: t.type,
          status: t.status,
          marca: {
            clave: c.clave,
            numero: it.numero,
            tipo: "se-va",
            marcada: true,
            seMarca: false,
            lugar: "tarea",
            conCasilla: false,
            verbo: VERBO_QUITAR,
            chip: CHIP_SE_QUITA,
            fantasma: false,
            tachada: true,
            existeHoyYSeQueda: false,
          },
        },
        bloque: 0,
        orden: vivaPorId.get(t.id)?.orden ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  // ── Los grupos de tareas ──
  const grupoPorFase = new Map<string, CasillaDeGrupo>();
  for (const g of r.grupos) {
    if (g.estado === "ya-esta") {
      yaEstaPorFase.set(g.fase, [...(yaEstaPorFase.get(g.fase) ?? []), `${g.numero}. ya está así: tareas`]);
      continue;
    }
    /* L7: la casilla del grupo no toca las mudanzas sugeridas: una hecha no se mueve sin SU casilla (spec §0.1). Si
       no, el grupo de su origen nacía «a medias» y marcarlo mudaba todas las hechas sugeridas de un clic. */
    const marcables = g.tareas.filter((t) => t.seMarca && !t.sugerida);
    grupoPorFase.set(g.fase, {
      numero: g.numero,
      fase: g.fase,
      texto: `Tareas: ${cuentaDelGrupo(g)}`,
      claves: marcables.map((t) => t.clave),
      marcadas: marcables.filter((t) => t.estado === "aplica" || t.enEspera).length,
      marcables: marcables.length,
      dependeDe: g.dependeDe,
      desfasada: g.desfasada,
    });
  }

  // ── Las semanas de cada fase de la proyección, en su orden estable ──
  const porNumero = (a: CasillaDeCambio, b: CasillaDeCambio) => a.numero - b.numero;
  const porFase = new Map<string, VistaDeFase>();
  for (const f of r.proyeccion.fases) {
    const inicio = enLaProyeccion.get(f.clave)!.inicio;
    const duracion = Math.max(f.durationWeeks, 1);
    const enSemana = (w: number) => Math.min(Math.max(w, 0), duracion - 1);
    const filas: Array<{ semana: number; fila: FilaDeLaSemana; bloque: Bloque; orden: number; sub: number; i: number }> = [];
    f.tareas.forEach((t, i) => {
      const m = marcas.get(t.clave);
      const viva = t.id !== null ? vivaPorId.get(t.id) : undefined;
      const bloque: Bloque =
        m?.lugar === "destino" ? 1 : t.id === null ? (ordenDelBorrador.has(t.clave) ? 2 : 3) : viva ? 0 : 3;
      const orden =
        bloque === 0 ? viva!.orden : bloque === 1 ? (ordenDelBorrador.get(m!.clave) ?? i) : bloque === 2 ? ordenDelBorrador.get(t.clave)! : i;
      filas.push({ semana: enSemana(t.weekIndex), fila: { clave: t.clave, extra: null }, bloque, orden, sub: 0, i });
    });
    (extrasPorFase.get(f.clave) ?? []).forEach((u, i) => {
      filas.push({ semana: enSemana(u.extra.semana), fila: { clave: u.extra.key, extra: u.extra }, bloque: u.bloque, orden: u.orden, sub: 1, i });
    });
    filas.sort((a, b) => a.bloque - b.bloque || a.orden - b.orden || a.sub - b.sub || a.i - b.i);
    const semanas: FilaDeLaSemana[][] = Array.from({ length: duracion }, () => []);
    for (const x of filas) semanas[x.semana].push(x.fila);

    const semanasQueYaPasaron: number[] = [];
    const ancla = r.proyeccion.ancla;
    if (hoy && ancla) {
      semanas.forEach((filasDeLaSemana, w) => {
        if (!semanaVencida(ancla, inicio, w, hoy)) return;
        const recibe = filasDeLaSemana.some((x) => {
          const m = x.extra?.marca ?? marcas.get(x.clave);
          return !!m && m.marcada && !m.fantasma && (m.tipo === "nueva" || m.lugar === "destino");
        });
        if (recibe) semanasQueYaPasaron.push(w);
      });
    }
    porFase.set(f.clave, {
      casillas: (casillasPorFase.get(f.clave) ?? []).sort(porNumero),
      grupo: grupoPorFase.get(f.clave) ?? null,
      yaEsta: yaEstaPorFase.get(f.clave) ?? [],
      semanas,
      semanasQueSeSuman: sumadasPorFase.get(f.clave) ?? [],
      semanasQueYaPasaron,
      delSistema: delSistemaPorFase.get(f.clave) ?? [],
    });
  }

  // ── Las fases fuera del calendario, en el orden completo de la propuesta ──
  const fasesFuera: FaseFuera[] = [...fuera.values()]
    .sort((a, b) => ordenCompleto.indexOf(a.key) - ordenCompleto.indexOf(b.key))
    .map((x) => ({
      ...x,
      tareas: (extrasPorFase.get(x.key) ?? [])
        .map((u, i) => ({ u, i }))
        .sort((a, b) => a.u.extra.semana - b.u.extra.semana || a.u.bloque - b.u.bloque || a.u.orden - b.u.orden || a.i - b.i)
        .map(({ u }) => u.extra),
    }));
  for (const x of fasesFuera) {
    porFase.set(x.key, {
      casillas: (casillasPorFase.get(x.key) ?? []).sort(porNumero),
      grupo: grupoPorFase.get(x.key) ?? null,
      yaEsta: yaEstaPorFase.get(x.key) ?? [],
      semanas: [],
      semanasQueSeSuman: [],
      semanasQueYaPasaron: [],
      delSistema: delSistemaPorFase.get(x.key) ?? [],
    });
  }

  return {
    cabecera: cabecera.sort(porNumero),
    porFase,
    marcas,
    fasesFuera,
    orden: r.indice,
    totales: { marcadas: r.marcadas, aplicables: r.aplicables, choques: r.choques },
  };
}

/**
 * El «antes» corto de una tarea que cambia («antes: «título viejo» · la hacía el equipo») y su `title` completo
 * (antes → con la propuesta), con lo que el cambio pide: la fase, la semana, el título, el dueño y el tipo.
 */
function antesYDespues(
  c: CambioTareaCambia,
  semanaHoy: number,
  destino: string | null,
  origen: string,
): { antes: string | null; titulo: string | null } {
  const antes: string[] = [];
  const despues: string[] = [];
  const cortas: string[] = [];
  if (destino !== null) {
    antes.push(`en «${origen}»`);
    despues.push(`en «${destino}»`);
  }
  if (c.a.weekIndex !== undefined && c.a.weekIndex !== semanaHoy) {
    antes.push(semanaDeLaFase(semanaHoy));
    despues.push(semanaDeLaFase(c.a.weekIndex));
  }
  if (c.a.title !== undefined && c.a.title !== c.desde.title) {
    antes.push(`«${c.desde.title}»`);
    despues.push(`«${c.a.title}»`);
    cortas.push(`«${c.desde.title}»`);
  }
  if (c.a.party !== undefined && c.a.party !== c.desde.party) {
    const de = c.desde.party === null ? "sin dueño" : PARTY_ANTES[c.desde.party];
    antes.push(de);
    despues.push(c.a.party === null ? "sin dueño" : PARTY_DESPUES[c.a.party]);
    cortas.push(de);
  }
  if (c.a.type !== undefined && c.a.type !== c.desde.type) {
    const de = `era ${tipoEnPalabras(c.desde.type)}`;
    antes.push(de);
    despues.push(tipoEnPalabras(c.a.type));
    cortas.push(de);
  }
  return {
    antes: cortas.length > 0 ? `antes: ${cortas.join(" · ")}` : null,
    titulo: antes.length > 0 ? `Hoy: ${antes.join(" · ")}. Con la propuesta: ${despues.join(" · ")}.` : null,
  };
}
