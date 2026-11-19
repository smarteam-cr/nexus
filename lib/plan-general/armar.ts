/**
 * lib/plan-general/armar.ts — arma el plan general de una cuenta desde los cronogramas de sus proyectos. Puro.
 *
 * Reglas (DECISIONS «El plan general de la cuenta», 2026-11-19):
 *  - Entra cada fase con `loopNumero`; el resto de las fases no se ve (Semana 0, fases comunes).
 *  - Las semanas del plan van desde 1 y se cuentan desde el arranque MÁS TEMPRANO de los cronogramas que entran: un
 *    proyecto que arrancó dos semanas después se corre dos semanas. Un cronograma sin arranque se lee desde el del plan.
 *  - La semana de una tarea = inicio de su fase (computePhaseRanges, con TODAS las fases del cronograma, porque una fase
 *    contigua arranca donde terminó la anterior) + weekIndex. Dura `semanas` (null = 1).
 *  - Una tarea SUSPENDED no está en el plan. Para el cliente tampoco la que está «por validar» (`needsValidation`), ni
 *    ninguna de un cronograma sin el detalle confirmado (`detailConfirmedAt`): las mismas puertas del cronograma externo.
 */
import { cruzaAlCliente } from "@/lib/external/tarea-del-cronograma";
import { computePhaseRanges } from "@/lib/timeline/weeks";
import { esTipoDeTrabajo, type EstadoDelPlan, type GrupoDelPlan, type PlanGeneral } from "./tipos";

export interface TareaParaElPlan {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  semanas: number | null;
  tipoDeTrabajo: string | null;
  status: string;
  notes: string | null;
  /** La tarea típica que inventó un agente y nadie revisó: nunca cruza al cliente (como en el cronograma). */
  needsValidation?: boolean;
}

export interface FaseParaElPlan {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  loopNumero: number | null;
  tasks: TareaParaElPlan[];
}

export interface ProyectoParaElPlan {
  id: string;
  name: string;
  timeline: {
    anchorStartDate: Date | string | null;
    /** La misma puerta que el cronograma externo (readClientTimeline): sin el detalle confirmado, sus tareas no cruzan. */
    detailConfirmedAt?: Date | string | null;
    phases: FaseParaElPlan[];
  } | null;
}

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

function diaUtc(d: Date | string): number {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** Semanas enteras entre dos arranques (redondeadas: un arranque en martes cuenta como la semana del lunes). */
export function semanasEntre(desde: Date | string, hasta: Date | string): number {
  return Math.round((diaUtc(hasta) - diaUtc(desde)) / SEMANA_MS);
}

function estadoDelPlan(status: string): EstadoDelPlan | null {
  if (status === "DONE" || status === "IN_PROGRESS" || status === "PENDING") return status;
  return null; // SUSPENDED: salió del plan
}

export function armarPlanGeneral(
  proyectos: readonly ProyectoParaElPlan[],
  opciones: { paraElCliente?: boolean } = {},
): PlanGeneral {
  const conLoops = proyectos.filter((p) => p.timeline?.phases.some((f) => f.loopNumero != null));
  const arranques = conLoops
    .map((p) => p.timeline?.anchorStartDate)
    .filter((a): a is Date | string => a != null)
    .map((a) => diaUtc(a));
  const arranqueMs = arranques.length > 0 ? Math.min(...arranques) : null;
  const arranque = arranqueMs != null ? new Date(arranqueMs).toISOString() : null;

  const grupos: GrupoDelPlan[] = [];
  for (const p of conLoops) {
    const tl = p.timeline!;
    const corrimiento = tl.anchorStartDate != null && arranqueMs != null ? semanasEntre(new Date(arranqueMs), tl.anchorStartDate) : 0;
    const fases = [...tl.phases].sort((a, b) => a.order - b.order);
    const rangos = computePhaseRanges(fases);
    fases.forEach((f, i) => {
      if (f.loopNumero == null) return;
      const inicio = corrimiento + rangos[i].start; // 0 en adelante
      const filas = f.tasks
        .flatMap((t) => {
          const estado = estadoDelPlan(t.status);
          if (!estado) return [];
          // Para el cliente, LA regla única de qué tarea cruza (la misma del cronograma externo).
          if (opciones.paraElCliente && !tl.detailConfirmedAt) return [];
          if (opciones.paraElCliente && !cruzaAlCliente({ status: t.status, needsValidation: t.needsValidation ?? false })) return [];
          const desde = inicio + t.weekIndex + 1;
          return [{
            tareaId: t.id,
            titulo: t.title,
            tipo: esTipoDeTrabajo(t.tipoDeTrabajo) ? t.tipoDeTrabajo : null,
            desde,
            hasta: desde + Math.max(1, t.semanas ?? 1) - 1,
            estado,
            detalle: t.notes,
            porValidar: t.needsValidation ?? false,
            orden: t.order,
          }];
        })
        .sort((a, b) => a.desde - b.desde || a.orden - b.orden || a.titulo.localeCompare(b.titulo))
        .map((fila) => ({
          tareaId: fila.tareaId,
          titulo: fila.titulo,
          tipo: fila.tipo,
          desde: fila.desde,
          hasta: fila.hasta,
          estado: fila.estado,
          detalle: fila.detalle,
          porValidar: fila.porValidar,
        }));
      grupos.push({
        loopNumero: f.loopNumero,
        nombre: f.name,
        faseId: f.id,
        proyectoId: p.id,
        proyectoNombre: p.name,
        faseDesde: inicio + 1,
        faseSemanas: f.durationWeeks || 1,
        detalleConfirmado: !!tl.detailConfirmedAt,
        filas,
      });
    });
  }
  grupos.sort((a, b) => a.loopNumero - b.loopNumero || a.proyectoNombre.localeCompare(b.proyectoNombre) || a.nombre.localeCompare(b.nombre));

  const semanas = Math.max(
    0,
    ...grupos.map((g) => g.faseDesde + g.faseSemanas - 1),
    ...grupos.flatMap((g) => g.filas.map((f) => f.hasta)),
  );
  return { arranque, semanas, grupos };
}

/**
 * Lo que guarda el servidor al mover una actividad en el plan: de semanas del plan (1 en adelante, inclusivas) a
 * `weekIndex`/`semanas` de la tarea dentro de su fase. null si el rango se sale de la fase (la ruta responde 400).
 */
export function semanasDeLaTarea(
  grupo: Pick<GrupoDelPlan, "faseDesde" | "faseSemanas">,
  desde: number,
  hasta: number,
): { weekIndex: number; semanas: number } | null {
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta < desde) return null;
  const weekIndex = desde - grupo.faseDesde;
  const semanas = hasta - desde + 1;
  if (weekIndex < 0 || weekIndex + semanas > grupo.faseSemanas) return null;
  return { weekIndex, semanas };
}

/** La semana de HOY en el plan (1 en adelante), o null sin arranque. `hoy` es la fecha de pared del que mira. */
export function semanaActualDelPlan(arranque: string | null, hoy: Date): number | null {
  if (!arranque) return null;
  const a = new Date(arranque);
  const inicio = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const dia = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.floor((dia - inicio) / SEMANA_MS) + 1;
}
