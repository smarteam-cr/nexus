/**
 * lib/timeline/propuesta-de-estructura.ts — EL ARMADOR DE LA PROPUESTA DE FASES Y TIEMPOS.
 * Puro y client-safe: sin Prisma. Lo usan la ruta `timeline/estructura` (paso 1 de «Regenerar
 * todo») y la pantalla (la máquina de pasos: qué hacer después de pedir la estructura y después
 * de resolver la última sugerencia).
 *
 * ── POR QUÉ EXISTE (2026-09-23) ──────────────────────────────────────────────
 * «Regenerar todo» detallaba TAREAS sobre las fases de siempre: aunque una reunión elegida dijera
 * «se suma una fase de piloto» o «Pruebas pasa a 3 semanas», las fases y sus duraciones no se
 * movían (el detalle tiene prohibido tocarlas). Ahora, con reuniones o notas elegidas, un revisor
 * corto propone CAMBIOS de estructura (ajustar, agregar o mover) y este armador los convierte en
 * la MISMA propuesta de solo estructura que ya deja el handoff en `pendingProposal`: el CSE la
 * decide uno por uno en el Gantt real, con la franja, los badges y el impacto en el cierre de
 * siempre. Después, la pantalla encadena el detalle de siempre sobre la estructura aceptada.
 *
 * ── LO QUE EL MODELO NO PUEDE HACER, AUNQUE LO DIGA ─────────────────────────
 * El prompt (lib/agents/estructura-cronograma.ts) lo prohíbe y ESTE archivo lo hace cumplir: una
 * regla que solo vive en un prompt se incumple la vez que el modelo se equivoca. Se descarta, con
 * un motivo legible:
 *  · un id que no existe o se repite (nunca se vuelve una fase nueva);
 *  · un cambio sin motivo (el CSE decide leyendo el «por qué»);
 *  · tocar una fase terminada o suspendida, o la Semana 0 / Kick-off;
 *  · mover el inicio de una fase que no está pendiente, a una semana que ya pasó o al mismo
 *    inicio que ya tiene (fijaría una fase contigua sin moverla);
 *  · una duración fuera de 1..52, no entera, igual a la actual (solo ese campo) o que corta por
 *    debajo del trabajo ya empezado;
 *  · un nombre vacío, largo, repetido, que entra o sale de «Desarrollo / Integración», o que
 *    cruza la frontera (fechas, plazos, montos, la cita de la fuente: lo lee el cliente);
 *  · más de MAX_CAMBIOS cambios o más de MAX_FASES_NUEVAS fases nuevas.
 * Y NUNCA: quitar fases, mover el arranque del proyecto, escribir tareas o notas de fase. La
 * propuesta sale sin `tasks` (si no, deja de ser «solo estructura» y el Gantt se congela), sin
 * ancla, y con las notas y el tipo de cada fase tal cual estaban.
 *
 * El `motivo` (interno, cita la reunión o la nota) viaja en la fase propuesta y en el delta, nunca
 * como un cambio: lo ve el CSE en el Gantt («Por qué (solo lo ves tú)») y el endpoint que aplica
 * nunca lo escribe (ver lib/timeline/proposal-deltas.ts).
 */
import { ACTIVITY_TYPES } from "./validate";
import { computePhaseRanges } from "./weeks";
import { isDevIntegrationPhaseName } from "./phase-names";
import { sanitizeTaskTitle } from "./compute-detail-tasks";
import { elegirFaseDeSemanaCero } from "./semana-cero-tareas";
import {
  computeProposalDeltas,
  type CurrentPhaseLike,
  type ProposalDelta,
  type ProposalLike,
  type ProposalPhaseLike,
} from "./proposal-deltas";
import { fugaEn, normalizarParaFrontera, type HuellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import { diaEnCostaRica } from "@/lib/contexto/material-cronograma";

/** Cuántos cambios se leen de una respuesta. Más que esto no es un ajuste: es otro cronograma. */
export const MAX_CAMBIOS = 12;
/** Cuántas fases nuevas puede sumar una sola revisión. */
export const MAX_FASES_NUEVAS = 3;
/** Cuántas observaciones del modelo se muestran, y su largo máximo. */
export const MAX_OBSERVACIONES = 5;
export const MAX_LARGO_OBSERVACION = 300;
/** El nombre de una fase lo lee el cliente: corto. */
export const MAX_LARGO_NOMBRE_DE_FASE = 60;
/** El motivo es interno, pero una fila del Gantt no es un informe. */
const MAX_LARGO_MOTIVO = 500;

const DIA_MS = 86_400_000;

/** Una fase tal como la ven el revisor y el armador (la MISMA foto: ver la ruta). */
export interface FaseParaEstructura {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  /** PENDING | IN_PROGRESS | DONE | SUSPENDED */
  status: string | null;
  tasks: ReadonlyArray<{ status: string; weekIndex: number }>;
}

export interface ResultadoDeEstructura {
  /** null = no hay ningún cambio real (nada que guardar ni que decidir). */
  propuesta: ProposalLike | null;
  deltas: ProposalDelta[];
  /** Lo que el modelo pidió y el armador no aceptó, con el motivo. Interno (va a la corrida). */
  descartados: string[];
  /** Lo que la IA notó y no se aplica solo. Interno: lo ve el CSE, nunca el cliente. */
  observaciones: string[];
}

interface Ajuste {
  durationWeeks?: number;
  startWeek?: number | null;
  name?: string;
  sessionCount?: number;
  motivo: string;
}

interface FaseNueva {
  despuesDe: string;
  fase: ProposalPhaseLike;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const esEnteroEntre = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Los cambios y las observaciones del JSON crudo: acepta `{estructura:{…}}` o el objeto suelto. */
function leerCrudo(crudo: unknown): { cambios: unknown[]; observaciones: unknown[] } {
  const raiz = esObjeto(crudo) && esObjeto(crudo.estructura) ? crudo.estructura : crudo;
  if (!esObjeto(raiz)) return { cambios: [], observaciones: [] };
  return {
    cambios: Array.isArray(raiz.cambios) ? raiz.cambios : [],
    observaciones: Array.isArray(raiz.observaciones) ? raiz.observaciones : [],
  };
}

/**
 * Convierte la respuesta cruda del revisor en la propuesta de solo estructura, o en `null` si no
 * cambia nada. Ver el docblock del archivo para lo que se descarta y por qué.
 *
 * @param fases       las fases vigentes, EN ORDEN — las mismas que vio el modelo.
 * @param anchorISO   el ancla guardada (solo para medir los deltas; la propuesta nunca la trae).
 * @param huellas     las del material que entró al prompt: un nombre de fase que cruza la
 *                    frontera se descarta. Sin huellas (o sin material) no se revisa.
 * @param ahora       para no mover una fase a una semana que ya pasó. Sin él no se mira.
 */
export function construirPropuestaDeEstructura(input: {
  fases: readonly FaseParaEstructura[];
  crudo: unknown;
  anchorISO: string | null;
  huellas?: HuellasDeFrontera | null;
  ahora?: number | null;
}): ResultadoDeEstructura {
  const fases = [...input.fases].sort((a, b) => a.order - b.order);
  const porId = new Map(fases.map((f) => [f.id, f]));
  const semanaCero = elegirFaseDeSemanaCero(fases)?.id ?? null;
  const rangos = computePhaseRanges(fases);
  const inicioActual = new Map(fases.map((f, i) => [f.id, rangos[i].start]));
  const semanaDeHoy = semanaDelProyecto(input.anchorISO, input.ahora ?? null);

  const { cambios: todos, observaciones: obsCrudas } = leerCrudo(input.crudo);
  const descartados: string[] = [];
  const observaciones = obsCrudas
    .map(texto)
    .filter(Boolean)
    .slice(0, MAX_OBSERVACIONES)
    .map((o) => recortar(o, MAX_LARGO_OBSERVACION));

  if (todos.length > MAX_CAMBIOS) {
    descartados.push(`Llegaron ${todos.length} cambios: solo se leen los primeros ${MAX_CAMBIOS}.`);
  }
  const cambios = todos.slice(0, MAX_CAMBIOS);

  const nombreDe = (id: string) => `«${porId.get(id)?.name ?? id}»`;
  const nombresTomados = new Set(fases.map((f) => normalizarParaFrontera(f.name)));
  /** Por qué un nombre propuesto no sirve, o null si sirve. */
  const problemaDelNombre = (nombre: string, propio: string | null): string | null => {
    if (!nombre) return "el nombre está vacío";
    if (nombre.length > MAX_LARGO_NOMBRE_DE_FASE) return `el nombre pasa de ${MAX_LARGO_NOMBRE_DE_FASE} caracteres`;
    const n = normalizarParaFrontera(nombre);
    if (nombresTomados.has(n) && n !== (propio === null ? null : normalizarParaFrontera(propio))) {
      return "ya hay otra fase con ese nombre";
    }
    const fuga = input.huellas ? fugaEn(nombre, input.huellas, "titulo") : null;
    if (fuga) return `el nombre ${fuga} (lo lee el cliente)`;
    return null;
  };
  /** Por qué una fase existente no se puede tocar, o null. */
  const intocable = (f: FaseParaEstructura): string | null => {
    if (f.id === semanaCero) return "es la Semana 0 / Kick-off";
    if (f.status === "DONE") return "la fase está terminada";
    if (f.status === "SUSPENDED") return "la fase está suspendida";
    return null;
  };

  const ajustes = new Map<string, Ajuste>();
  const movidas = new Map<string, { despuesDe: string; motivo: string }>();
  const nuevas: FaseNueva[] = [];

  for (const c of cambios) {
    if (!esObjeto(c)) {
      descartados.push("Un cambio no era un objeto.");
      continue;
    }
    const tipo = texto(c.tipo);
    const motivo = recortar(texto(c.motivo), MAX_LARGO_MOTIVO);

    if (tipo === "ajustar") {
      const id = texto(c.faseId);
      const f = porId.get(id);
      if (!f) {
        descartados.push(`ajustar: la fase «${id || "(sin id)"}» no existe.`);
        continue;
      }
      const donde = `ajustar ${nombreDe(id)}`;
      if (ajustes.has(id)) {
        descartados.push(`${donde}: ya había otro cambio para esa fase.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      const bloqueo = intocable(f);
      if (bloqueo) {
        descartados.push(`${donde}: ${bloqueo}.`);
        continue;
      }
      const ajuste: Ajuste = { motivo };

      if (c.durationWeeks !== undefined) {
        const trabajoEmpezado = Math.max(-1, ...f.tasks.filter((t) => t.status !== "PENDING").map((t) => t.weekIndex));
        if (!esEnteroEntre(c.durationWeeks, 1, 52)) {
          descartados.push(`${donde}: la duración tiene que ser un entero de 1 a 52 semanas.`);
        } else if (c.durationWeeks === f.durationWeeks) {
          descartados.push(`${donde}: la duración ya es ${f.durationWeeks}.`);
        } else if (c.durationWeeks <= trabajoEmpezado) {
          descartados.push(
            `${donde}: acortarla a ${c.durationWeeks} semanas dejaría afuera trabajo ya empezado (semana ${trabajoEmpezado + 1}).`,
          );
        } else {
          ajuste.durationWeeks = c.durationWeeks;
        }
      }

      if (c.inicioSemana !== undefined) {
        if (f.status !== "PENDING") {
          descartados.push(`${donde}: solo se mueve el inicio de una fase pendiente.`);
        } else if (c.inicioSemana === null) {
          if (f.startWeek !== null) ajuste.startWeek = null;
        } else if (!esEnteroEntre(c.inicioSemana, 1, 104)) {
          descartados.push(`${donde}: la semana de inicio tiene que ser un entero de 1 a 104.`);
        } else if (c.inicioSemana - 1 === inicioActual.get(id)) {
          descartados.push(`${donde}: ya arranca en la semana ${c.inicioSemana}.`);
        } else if (semanaDeHoy !== null && c.inicioSemana - 1 < semanaDeHoy) {
          descartados.push(`${donde}: la semana ${c.inicioSemana} ya pasó.`);
        } else {
          // La semana DEL PROYECTO desde 1 (la que ve el CSE) → startWeek desde 0.
          ajuste.startWeek = c.inicioSemana - 1;
        }
      }

      if (c.name !== undefined) {
        const nombre = typeof c.name === "string" ? sanitizeTaskTitle(c.name) : "";
        if (normalizarParaFrontera(nombre) !== normalizarParaFrontera(f.name) || !nombre) {
          const problema =
            problemaDelNombre(nombre, f.name) ??
            (isDevIntegrationPhaseName(nombre) !== isDevIntegrationPhaseName(f.name)
              ? "el nombre entra o sale de «Desarrollo / Integración» (cambia qué tareas lleva la fase)"
              : null);
          if (problema) descartados.push(`${donde}: ${problema}.`);
          else {
            ajuste.name = nombre;
            nombresTomados.add(normalizarParaFrontera(nombre));
          }
        }
      }

      if (c.sessionCount !== undefined) {
        if (!esEnteroEntre(c.sessionCount, 1, 50)) {
          descartados.push(`${donde}: las sesiones tienen que ser un entero de 1 a 50.`);
        } else if (c.sessionCount !== f.sessionCount) {
          ajuste.sessionCount = c.sessionCount;
        }
      }

      const cambiaAlgo =
        ajuste.durationWeeks !== undefined ||
        ajuste.startWeek !== undefined ||
        ajuste.name !== undefined ||
        ajuste.sessionCount !== undefined;
      if (cambiaAlgo) ajustes.set(id, ajuste);
      continue;
    }

    if (tipo === "agregar") {
      const despuesDe = texto(c.despuesDeFaseId);
      const nombre = typeof c.name === "string" ? sanitizeTaskTitle(c.name) : "";
      const donde = `agregar «${nombre || "(sin nombre)"}»`;
      if (nuevas.length >= MAX_FASES_NUEVAS) {
        descartados.push(`${donde}: ya hay ${MAX_FASES_NUEVAS} fases nuevas.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      if (!porId.has(despuesDe)) {
        // Sin ancla iría al principio: antes de la Semana 0. Un id inventado, a ningún lado.
        descartados.push(`${donde}: no dice después de qué fase va (o la fase no existe).`);
        continue;
      }
      if (!esEnteroEntre(c.durationWeeks, 1, 52)) {
        descartados.push(`${donde}: la duración tiene que ser un entero de 1 a 52 semanas.`);
        continue;
      }
      const problema = problemaDelNombre(nombre, null);
      if (problema) {
        descartados.push(`${donde}: ${problema}.`);
        /* Una fase ACORDADA no se pierde en silencio por su nombre: el CSE la ve y decide. */
        if (nombre) {
          observaciones.push(
            recortar(
              `Se sugirió sumar la fase «${nombre}» después de ${nombreDe(despuesDe)}, pero ${problema}: si ` +
                `corresponde, agrégala a mano con otro nombre.`,
              MAX_LARGO_OBSERVACION,
            ),
          );
        }
        continue;
      }
      nombresTomados.add(normalizarParaFrontera(nombre));
      const tipoDeFase = texto(c.activityType);
      nuevas.push({
        despuesDe,
        fase: {
          name: nombre,
          durationWeeks: c.durationWeeks,
          startWeek: null,
          sessionCount: esEnteroEntre(c.sessionCount, 1, 50) ? c.sessionCount : null,
          notes: null,
          activityType: (ACTIVITY_TYPES as readonly string[]).includes(tipoDeFase) ? tipoDeFase : null,
          motivo,
        },
      });
      continue;
    }

    if (tipo === "mover") {
      const id = texto(c.faseId);
      const despuesDe = texto(c.despuesDeFaseId);
      const f = porId.get(id);
      if (!f) {
        descartados.push(`mover: la fase «${id || "(sin id)"}» no existe.`);
        continue;
      }
      const donde = `mover ${nombreDe(id)}`;
      if (movidas.has(id)) {
        descartados.push(`${donde}: ya había otro movimiento para esa fase.`);
        continue;
      }
      if (!motivo) {
        descartados.push(`${donde}: sin motivo.`);
        continue;
      }
      const bloqueo = intocable(f);
      if (bloqueo) {
        descartados.push(`${donde}: ${bloqueo}.`);
        continue;
      }
      if (!porId.has(despuesDe) || despuesDe === id) {
        descartados.push(`${donde}: no dice después de qué otra fase va (o la fase no existe).`);
        continue;
      }
      movidas.set(id, { despuesDe, motivo });
      continue;
    }

    descartados.push(`Un cambio de tipo «${tipo || "(sin tipo)"}» no existe: solo ajustar, agregar o mover.`);
  }

  // ── EL ARMADO: copia EXACTA de lo vigente + solo lo aceptado ──────────────────
  const motivos = new Map<string, string>();
  const anotarMotivo = (id: string, m: string) => {
    const previo = motivos.get(id);
    motivos.set(id, previo && previo !== m ? `${previo} · ${m}` : m);
  };

  const copia = new Map<string, ProposalPhaseLike>(
    fases.map((f) => {
      const a = ajustes.get(f.id);
      if (a) anotarMotivo(f.id, a.motivo);
      return [
        f.id,
        {
          id: f.id,
          name: a?.name ?? f.name,
          durationWeeks: a?.durationWeeks ?? f.durationWeeks,
          startWeek: a && a.startWeek !== undefined ? a.startWeek : (f.startWeek ?? null),
          sessionCount: a?.sessionCount ?? f.sessionCount ?? null,
          // ⛔ Las notas y el tipo de una fase existente NUNCA salen del modelo.
          notes: f.notes ?? null,
          activityType: f.activityType ?? null,
        },
      ];
    }),
  );

  // Orden: el de hoy, con cada «mover» aplicado en el orden en que llegó.
  const orden = fases.map((f) => f.id);
  for (const [id, m] of movidas) {
    const sin = orden.filter((x) => x !== id);
    const at = sin.indexOf(m.despuesDe);
    if (at < 0) continue;
    sin.splice(at + 1, 0, id);
    if (sin.join("\u0000") === orden.join("\u0000")) {
      descartados.push(`mover ${nombreDe(id)}: ya está después de ${nombreDe(m.despuesDe)}.`);
      continue;
    }
    orden.splice(0, orden.length, ...sin);
    anotarMotivo(id, m.motivo);
  }

  const phases: ProposalPhaseLike[] = [];
  for (const id of orden) {
    const p = copia.get(id)!;
    const m = motivos.get(id);
    phases.push(m ? { ...p, motivo: m } : p);
    for (const n of nuevas.filter((x) => x.despuesDe === id)) phases.push(n.fase);
  }

  const propuesta: ProposalLike = {
    anchorStartDate: null,
    phases,
    origen: "contexto",
    observaciones,
  };
  const actuales: CurrentPhaseLike[] = fases.map((f) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek ?? null,
    sessionCount: f.sessionCount ?? null,
    notes: f.notes ?? null,
    activityType: f.activityType ?? null,
  }));
  const deltas = computeProposalDeltas(actuales, propuesta, input.anchorISO);
  return { propuesta: deltas.length > 0 ? propuesta : null, deltas, descartados, observaciones };
}

/**
 * La semana DEL PROYECTO (desde 0) en que cae `ahora`, o null sin ancla o sin `ahora`. El día se
 * toma en Costa Rica con la MISMA función que el calendario que leyó el modelo: si no, la «semana
 * de hoy» del armador y la del prompt podrían diferir de noche.
 */
function semanaDelProyecto(anchorISO: string | null, ahora: number | null): number | null {
  if (!anchorISO || ahora === null) return null;
  const a = new Date(anchorISO);
  if (Number.isNaN(a.getTime())) return null;
  const ancla = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.floor((diaEnCostaRica(ahora) - ancla) / (7 * DIA_MS));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA MÁQUINA DE PASOS DE LA PANTALLA ───────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que devolvió POST /timeline/estructura, visto por la pantalla. `red` = ni llegó. */
export type RespuestaDeEstructura =
  | { red: true }
  | { red?: false; status: number; estado?: unknown; message?: unknown };

export type PasoTrasEstructura =
  | { paso: "tareas"; aviso?: string }
  | { paso: "detener"; mensaje: string }
  | { paso: "esperar" };

export const AVISO_SIN_CAMBIOS = "Tus reuniones y notas no piden cambios de fases ni de tiempos.";
export const AVISO_PROPUESTA_PENDIENTE =
  "Hay cambios de fases sin revisar: resuélvelos y vuelve a regenerar para que la IA revise las fases.";
export const AVISO_FALLO_DE_ESTRUCTURA = "Esta vez no se pudieron revisar las fases; sigo con las tareas.";

/**
 * Qué hace la pantalla después de pedir la estructura (paso 1):
 *  · 'esperar'  — hay una propuesta: el CSE la decide en el Gantt y, al resolver la última, sigue
 *                 el paso 2;
 *  · 'tareas'   — no hay nada que decidir (sin material, sin cambios) o el paso 1 no se pudo
 *                 hacer (409, falla, red): sigue con las tareas. ⛔ Una falla del paso 1 NUNCA traba
 *                 al CSE: el detalle de siempre corre igual;
 *  · 'detener'  — 403: sin permiso para cambiar el cronograma con IA, el paso 2 tampoco lo tendría.
 */
export function pasoTrasEstructura(r: RespuestaDeEstructura): PasoTrasEstructura {
  if (r.red) return { paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA };
  if (r.status === 403) {
    return {
      paso: "detener",
      mensaje: typeof r.message === "string" && r.message ? r.message : "No tienes permiso para cambiar el cronograma con IA.",
    };
  }
  if (r.status === 409) return { paso: "tareas", aviso: AVISO_PROPUESTA_PENDIENTE };
  if (r.status < 200 || r.status >= 300) return { paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA };
  if (r.estado === "propuesta") return { paso: "esperar" };
  if (r.estado === "sin-cambios") return { paso: "tareas", aviso: AVISO_SIN_CAMBIOS };
  if (r.estado === "sin-material") return { paso: "tareas" };
  return { paso: "tareas", aviso: AVISO_FALLO_DE_ESTRUCTURA };
}

/**
 * Qué hace la pantalla después de resolver sugerencias de estructura:
 *  · 'nada'     — quedan sugerencias, o la propuesta era la del handoff;
 *  · 'auto'     — era la de las reuniones, no queda ninguna y el «Regenerar todo» lo apretó ESTA
 *                 pantalla: sigue sola con las tareas (paso 2);
 *  · 'ofrecer'  — igual, pero la cadena no arrancó acá (recargó a mitad de camino, o las resolvió
 *                 otra persona): se ofrece el paso 2, nunca se dispara solo para quien no lo pidió.
 */
export function pasoTrasResolver(input: {
  pendientes: number;
  origen: "contexto" | "handoff";
  iniciadoAqui: boolean;
}): "nada" | "auto" | "ofrecer" {
  if (input.pendientes > 0 || input.origen !== "contexto") return "nada";
  return input.iniciadoAqui ? "auto" : "ofrecer";
}
