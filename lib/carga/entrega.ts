/**
 * lib/carga/entrega.ts — el trabajo fuera de las reuniones que pide el cronograma, estimado. PURO.
 *
 * ── QUÉ SE CUENTA ────────────────────────────────────────────────────────────
 * Las TAREAS (no las sesiones: esas ya están en el calendario) de cada cronograma, en la semana en que el plan las
 * pone. Una tarea «Smarteam» vale las horas de su tipo de fase × el factor de complejidad de la cuenta; una «Ambos»,
 * la parte que configure `ambosFraccion`; las del cliente y las de Desarrollo no le cargan al CSE. La carga va a quien
 * lleva el proyecto en HubSpot, que es el único responsable que Nexus conoce: las tareas no tienen persona propia.
 *
 * ── PASADO Y FUTURO ──────────────────────────────────────────────────────────
 * En una semana que ya pasó cuenta lo que el plan pedía esa semana, se haya marcado o no (es la carga que se le
 * puso a la persona). En una semana que viene, solo lo que sigue abierto. Las abiertas con fecha pasada se cuentan
 * aparte como «atrasadas o sin marcar»: pueden ser trabajo hecho y no marcado, y sumarlas inventaría carga.
 *
 * ── LO RESPONDIDO MANDA ──────────────────────────────────────────────────────
 * Si quien hizo la tarea anotó cuánto le tomó («¿cuánto te tomó?», lib/tiempos), eso reemplaza al estimado: ya trae
 * adentro la parte de Smarteam y la complejidad de la cuenta. Va a la persona que lo anotó (puede no ser el dueño del
 * proyecto) y cuenta como DECLARADO; el resto, como estimado. Así cada número dice de dónde sale.
 */
import { addWeeks, computePhaseRanges, overduePlannedEnd } from "@/lib/timeline/weeks";
import { familiaDe, familiaPorClave, type ClaveDeFamilia } from "@/lib/tiempos/familias";
import type { ConfigCarga, TipoDeFase } from "./config";
import { ETIQUETA_DE_TIPO, TIPOS_DE_FASE } from "./config";
import { lunesDe, lunesDeFecha } from "./semana";

export interface TareaParaCarga {
  /** El id de la tarea: con él se encuentra lo que respondió quien la hizo. */
  id?: string;
  /** Con el título se reconoce si es una tarea clave (lib/tiempos/familias.ts). */
  titulo?: string | null;
  weekIndex: number;
  estado: string;
  parte: string | null;
  tipo: string | null;
  fechaManual: Date | string | null;
}

export interface FaseParaCarga {
  orden: number;
  duracionSemanas: number;
  semanaInicio: number | null;
  tipo: string | null;
  tareas: TareaParaCarga[];
}

export interface CronogramaParaCarga {
  proyectoId: string;
  clienteId: string;
  responsableEmail: string | null;
  ancla: Date | string | null;
  fases: FaseParaCarga[];
}

export interface EntregaDeLaSemana {
  horas: number;
  /** La parte de `horas` que respondió quien hizo la tarea (el resto es estimado). */
  declaradas: number;
  tareas: number;
  porCliente: Map<string, number>;
  /** La parte declarada de cada cuenta. */
  declaradasPorCliente: Map<string, number>;
}

/** Lo que alguien anotó para una tarea: quién y cuántas horas. */
export interface TiempoDeclarado {
  persona: string;
  horas: number;
}

export interface EntregaEstimada {
  /** email → lunes → horas estimadas. */
  porPersona: Map<string, Map<string, EntregaDeLaSemana>>;
  /** email → tareas abiertas con fecha pasada (atrasadas o sin marcar). */
  atrasadas: Map<string, number>;
  /** email → tareas abiertas en cronogramas sin fecha de arranque (no se pueden ubicar en una semana). */
  sinFecha: Map<string, number>;
}

const ABIERTA = new Set(["PENDING", "IN_PROGRESS"]);

function tipoDeFase(t: string | null): TipoDeFase {
  return t && (TIPOS_DE_FASE as readonly string[]).includes(t) ? (t as TipoDeFase) : "SIN";
}

/** La parte de una tarea que le toca a Smarteam: 1, la fracción de «Ambos», o 0. */
export function parteDeSmarteam(parte: string | null, config: ConfigCarga): number {
  if (parte === "CLIENTE" || parte === "DEV") return 0;
  if (parte === "AMBOS") return config.ambosFraccion;
  return 1; // SMARTEAM o sin parte declarada
}

export interface EstimadoDeTarea {
  /** base × parte × factor. */
  horas: number;
  /** Horas antes de la parte y del factor: las de su tarea clave si tiene número propio; si no, las de su tipo de fase. */
  base: number;
  de: "familia" | "tipo";
  familia: ClaveDeFamilia | null;
  /** El nombre de la tarea clave o del tipo de fase. */
  nombre: string;
  parte: number;
  factor: number;
}

/**
 * Lo que la carga supone para una tarea. Es UNA sola cuenta para la carga, el plan de la rentabilidad y lo que se le
 * muestra a quien responde «¿cuánto te tomó?» (y se guarda con su respuesta para compararlas).
 */
export function estimarTarea(
  t: { tipoFase: string | null; parte: string | null; titulo?: string | null },
  factor: number,
  config: ConfigCarga,
): EstimadoDeTarea {
  const familia = familiaDe(t.titulo);
  const propia = familia ? config.horasPorFamilia[familia] : undefined;
  const tipo = tipoDeFase(t.tipoFase);
  const base = propia ?? config.horasPorTipo[tipo];
  const parte = parteDeSmarteam(t.parte, config);
  return {
    horas: base * parte * factor,
    base,
    de: propia !== undefined ? "familia" : "tipo",
    familia,
    nombre: propia !== undefined && familia ? (familiaPorClave(familia)?.nombre ?? familia) : tipo === "SIN" ? "Sin tipo" : ETIQUETA_DE_TIPO[tipo],
    parte,
    factor,
  };
}

/** Horas estimadas de una tarea en una cuenta. */
export function horasDeTarea(tipo: string | null, parte: string | null, factor: number, config: ConfigCarga, titulo?: string | null): number {
  return estimarTarea({ tipoFase: tipo, parte, titulo }, factor, config).horas;
}

/** Recorre las tareas de un cronograma con la fecha en que el plan las pone. */
export function* tareasConFecha(c: CronogramaParaCarga): Generator<{ tarea: TareaParaCarga; fase: FaseParaCarga; fecha: Date | null; finPlaneado: Date | null }> {
  const fases = [...c.fases].sort((a, b) => a.orden - b.orden);
  const rangos = computePhaseRanges(fases.map((f) => ({ durationWeeks: f.duracionSemanas, startWeek: f.semanaInicio })));
  const ancla = c.ancla ? new Date(c.ancla).toISOString() : null;
  for (let i = 0; i < fases.length; i++) {
    const fase = fases[i];
    for (const tarea of fase.tareas) {
      const manual = tarea.fechaManual ? new Date(tarea.fechaManual) : null;
      const fecha = manual ?? (ancla ? addWeeks(ancla, rangos[i].start + tarea.weekIndex) : null);
      const finPlaneado = manual ?? overduePlannedEnd(ancla, rangos[i].start, tarea.weekIndex);
      yield { tarea, fase, fecha, finPlaneado };
    }
  }
}

/**
 * La entrega de los cronogramas, por persona y semana. `factorDe` da el factor de complejidad de una cuenta (1 si no
 * se conoce). `hoy` separa lo que ya pasó de lo que viene. `declarados` = lo que respondió quien hizo cada tarea, por
 * id de tarea: reemplaza al estimado.
 */
export function entregaEstimada(
  cronogramas: CronogramaParaCarga[],
  factorDe: (clienteId: string) => number,
  config: ConfigCarga,
  hoy: Date,
  declarados: ReadonlyMap<string, TiempoDeclarado> = new Map(),
): EntregaEstimada {
  const porPersona = new Map<string, Map<string, EntregaDeLaSemana>>();
  const atrasadas = new Map<string, number>();
  const sinFecha = new Map<string, number>();
  const lunesDeHoy = lunesDe(hoy);

  for (const c of cronogramas) {
    const dueno = c.responsableEmail?.trim().toLowerCase();
    if (!dueno) continue;
    const factor = factorDe(c.clienteId);
    for (const { tarea, fase, fecha, finPlaneado } of tareasConFecha(c)) {
      if (tarea.estado === "SUSPENDED") continue;
      const declarado = tarea.id ? declarados.get(tarea.id) : undefined;
      const email = declarado?.persona.trim().toLowerCase() || dueno;
      const abierta = ABIERTA.has(tarea.estado);
      const deSmarteam = parteDeSmarteam(tarea.parte, config) > 0 || tarea.parte === "DEV";
      if (!fecha) {
        if (abierta && deSmarteam && tarea.parte !== "DEV") sinFecha.set(email, (sinFecha.get(email) ?? 0) + 1);
        continue;
      }
      if (abierta && tarea.parte !== "CLIENTE" && finPlaneado && finPlaneado < hoy) {
        atrasadas.set(email, (atrasadas.get(email) ?? 0) + 1);
      }
      if (tarea.tipo === "SESSION") continue; // las sesiones ya están en el calendario
      const horas = declarado ? declarado.horas : horasDeTarea(fase.tipo, tarea.parte, factor, config, tarea.titulo);
      if (horas <= 0) continue;
      const lunes = lunesDeFecha(fecha);
      // Lo que viene, solo si sigue abierto (salvo que alguien ya haya dicho cuánto le tomó: eso pasó).
      if (lunes >= lunesDeHoy && !abierta && !declarado) continue;
      const semanas = porPersona.get(email) ?? new Map<string, EntregaDeLaSemana>();
      const s = semanas.get(lunes) ?? { horas: 0, declaradas: 0, tareas: 0, porCliente: new Map(), declaradasPorCliente: new Map() };
      s.horas += horas;
      s.tareas++;
      s.porCliente.set(c.clienteId, (s.porCliente.get(c.clienteId) ?? 0) + horas);
      if (declarado) {
        s.declaradas += horas;
        s.declaradasPorCliente.set(c.clienteId, (s.declaradasPorCliente.get(c.clienteId) ?? 0) + horas);
      }
      semanas.set(lunes, s);
      porPersona.set(email, semanas);
    }
  }
  return { porPersona, atrasadas, sinFecha };
}

export interface PlanDeLaCuenta {
  /** Sesiones que el plan ponía en el período. */
  sesiones: number;
  /** Horas de tareas fuera de reunión que el plan ponía en el período. */
  horasTareas: number;
}

/** Lo que el cronograma planeaba para cada cuenta entre dos fechas, para comparar contra lo que pasó. */
export function planDelPeriodo(
  cronogramas: CronogramaParaCarga[],
  factorDe: (clienteId: string) => number,
  config: ConfigCarga,
  desde: Date,
  hasta: Date,
): Map<string, PlanDeLaCuenta> {
  const out = new Map<string, PlanDeLaCuenta>();
  for (const c of cronogramas) {
    const factor = factorDe(c.clienteId);
    for (const { tarea, fase, fecha } of tareasConFecha(c)) {
      if (!fecha || fecha < desde || fecha >= hasta || tarea.estado === "SUSPENDED") continue;
      const p = out.get(c.clienteId) ?? { sesiones: 0, horasTareas: 0 };
      if (tarea.tipo === "SESSION") p.sesiones++;
      else p.horasTareas += horasDeTarea(fase.tipo, tarea.parte, factor, config, tarea.titulo);
      out.set(c.clienteId, p);
    }
  }
  return out;
}
