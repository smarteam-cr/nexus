/**
 * lib/timeline/ciclo-server.ts — lo que el CICLO de un servicio recurrente escribe en el cronograma del proyecto
 * (docs/smartloop-plan.md, etapa 3; ficha E). Servidor.
 *
 * Cada caso de uso del ciclo es una fase del `ProjectTimeline` del proyecto; las dependencias del cliente son tareas de
 * esa fase con responsable CLIENTE. Las funciones reciben la transacción de quien las llama (lib/servicios/ciclos-server.ts
 * es el único escritor del ciclo y de sus casos, y une la fase con el caso en la misma transacción).
 *
 * ⚠ Solo lo del ciclo: nada de esto corre en una implementación. Cada escritura deja su línea en `TimelineChange`.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { FaseDelCiclo } from "./ciclo";

type Tx = Prisma.TransactionClient;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * El cronograma del proyecto, creándolo si falta. Un cronograma que ya tiene ancla no se toca.
 *
 * ⚠ `anchorStartDate` se escribe SOLO con un clic que lo diga (docs/KNOWN-ERRORS.md: lo leen cobranza, las alertas de
 * arranque y la cartera como dato confirmado). `arranqueConfirmado` es esa fecha, confirmada por una persona («El
 * cronograma arranca el …» o el `--apply` del traductor); con null, un cronograma sin ancla queda sin ancla y quien
 * llama decide qué hacer (`anchor: null`).
 */
export async function asegurarCronograma(tx: Tx, projectId: string, arranqueConfirmado: string | null): Promise<{ timelineId: string; anchor: string | null }> {
  const t = await tx.projectTimeline.findUnique({ where: { projectId }, select: { id: true, anchorStartDate: true } });
  const ancla = arranqueConfirmado ? new Date(`${arranqueConfirmado.slice(0, 10)}T00:00:00.000Z`) : null;
  if (!t) {
    const creado = await tx.projectTimeline.create({ data: { projectId, anchorStartDate: ancla }, select: { id: true, anchorStartDate: true } });
    return { timelineId: creado.id, anchor: dia(creado.anchorStartDate) };
  }
  if (!t.anchorStartDate && ancla) {
    await tx.projectTimeline.update({ where: { id: t.id }, data: { anchorStartDate: ancla } });
    return { timelineId: t.id, anchor: dia(ancla) };
  }
  return { timelineId: t.id, anchor: dia(t.anchorStartDate) };
}

export const ESTADOS_DE_FASE = ["PENDING", "IN_PROGRESS", "DONE"] as const;
export type EstadoDeFase = (typeof ESTADOS_DE_FASE)[number];

/** El día de un tramo («AAAA-MM-DD»), como fecha. null si no hay dato. */
const fechaDelTramo = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00.000Z`) : null);

/**
 * Crea la fase de un caso de uso, al final del cronograma. Devuelve su id.
 *
 * Lo importado como hecho o en curso lleva las fechas reales del TRAMO (`tramo.desde`/`tramo.hasta`, las del caso o del
 * ciclo), nunca «hoy»: hoy no es cuándo arrancó ni cuándo terminó. Sin dato, quedan vacías.
 */
export async function crearFaseDelCaso(
  tx: Tx,
  timelineId: string,
  datos: {
    nombre: string;
    notas: string | null;
    startWeek: number;
    durationWeeks: number;
    estado?: EstadoDeFase;
    tramo?: { desde?: string | null; hasta?: string | null };
  },
  por: string,
): Promise<string> {
  const ultima = await tx.timelinePhase.findFirst({ where: { timelineId }, orderBy: { order: "desc" }, select: { order: true } });
  const estado = datos.estado ?? "PENDING";
  const ahora = new Date();
  const inicioReal = fechaDelTramo(datos.tramo?.desde);
  const finReal = fechaDelTramo(datos.tramo?.hasta);
  const fase = await tx.timelinePhase.create({
    data: {
      timelineId,
      name: datos.nombre.slice(0, 200),
      order: (ultima?.order ?? -1) + 1,
      startWeek: Math.max(0, datos.startWeek),
      durationWeeks: Math.max(1, datos.durationWeeks),
      notes: datos.notas,
      source: "HUMAN",
      status: estado,
      statusSource: "HUMAN",
      ...(estado !== "PENDING"
        ? { statusChangedByEmail: por, statusChangedAt: ahora, actualStart: inicioReal, ...(estado === "DONE" ? { actualEnd: finReal } : {}) }
        : {}),
    },
    select: { id: true },
  });
  return fase.id;
}

/**
 * Suma una dependencia del cliente a la fase: una tarea con responsable CLIENTE (no se crea nada en Tareas). Una
 * importada como hecha lleva las fechas del tramo (`tramo`), nunca «hoy»; sin dato, vacías.
 */
export async function crearDependenciaDelCliente(
  tx: Tx,
  faseId: string,
  datos: { titulo: string; weekIndex: number; hecha?: boolean; tramo?: { desde?: string | null; hasta?: string | null } },
  por: string,
): Promise<string> {
  const fase = await tx.timelinePhase.findUnique({ where: { id: faseId }, select: { durationWeeks: true } });
  if (!fase) throw new Error("La fase no existe.");
  const weekIndex = Math.min(Math.max(0, datos.weekIndex), Math.max(1, fase.durationWeeks) - 1);
  const orden = await tx.timelineTask.count({ where: { phaseId: faseId, weekIndex } });
  const ahora = new Date();
  const t = await tx.timelineTask.create({
    data: {
      phaseId: faseId,
      title: datos.titulo.slice(0, 300),
      weekIndex,
      order: orden,
      party: "CLIENTE",
      type: "TASK",
      source: "HUMAN",
      status: datos.hecha ? "DONE" : "PENDING",
      statusSource: "HUMAN",
      ...(datos.hecha
        ? { statusChangedByEmail: por, statusChangedAt: ahora, actualStart: fechaDelTramo(datos.tramo?.desde), actualEnd: fechaDelTramo(datos.tramo?.hasta) }
        : {}),
    },
    select: { id: true },
  });
  return t.id;
}

/**
 * Saca del plan la fase de un caso de uso que no se cumplió al cerrar el ciclo («no cumplido», «pasa» o «descartado»):
 * la fase y sus tareas sin terminar pasan a SUSPENDED (aparcadas: ni pendientes ni atrasadas, y no cuentan en «Lo que
 * debe el cliente»). Lo hecho (DONE) y lo ya suspendido no se toca. Devuelve qué cambió (null si la fase no existe).
 */
export async function suspenderFaseDelCaso(
  tx: Tx,
  faseId: string,
  por: string,
  ahora = new Date(),
): Promise<{ fase: boolean; tareas: number } | null> {
  const fase = await tx.timelinePhase.findUnique({ where: { id: faseId }, select: { status: true } });
  if (!fase) return null;
  const tareas = await tx.timelineTask.updateMany({
    where: { phaseId: faseId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    data: { status: "SUSPENDED", statusSource: "HUMAN", statusChangedByEmail: por, statusChangedAt: ahora },
  });
  if (fase.status === "DONE" || fase.status === "SUSPENDED") return { fase: false, tareas: tareas.count };
  await tx.timelinePhase.update({
    where: { id: faseId },
    data: { status: "SUSPENDED", statusSource: "HUMAN", statusChangedByEmail: por, statusChangedAt: ahora },
  });
  return { fase: true, tareas: tareas.count };
}

/** Aplica la propuesta por una dependencia atrasada: alarga la fase y corre las dependencias. */
export async function correrFasePorDependencia(
  tx: Tx,
  faseId: string,
  cambio: { durationWeeks: number; tareas: Array<{ id: string; weekIndex: number }> },
): Promise<void> {
  await tx.timelinePhase.update({ where: { id: faseId }, data: { durationWeeks: cambio.durationWeeks } });
  for (const t of cambio.tareas) {
    await tx.timelineTask.updateMany({ where: { id: t.id, phaseId: faseId }, data: { weekIndex: t.weekIndex } });
  }
}

/** Deja una línea en el historial del cronograma (`TimelineChange`), con lo que cambió en pocas palabras. */
export async function anotarCambioDelCiclo(tx: Tx, timelineId: string, motivo: string, detalle: object, por: string): Promise<void> {
  await tx.timelineChange.create({
    data: { timelineId, reason: motivo.slice(0, 2000), kind: "MANUAL", changedByEmail: por, snapshot: { ciclo: detalle } as Prisma.InputJsonValue },
  });
  await tx.projectTimeline.update({ where: { id: timelineId }, data: { lastEditedByHuman: new Date() } });
}

/** El cronograma del proyecto para el ciclo: el ancla y las fases pedidas, con sus tareas. */
export async function leerFasesDelCiclo(projectId: string, faseIds: readonly string[]): Promise<{ anchor: string | null; fases: FaseDelCiclo[] }> {
  const t = await prisma.projectTimeline.findUnique({ where: { projectId }, select: { id: true, anchorStartDate: true } });
  if (!t) return { anchor: null, fases: [] };
  const fases = faseIds.length
    ? await prisma.timelinePhase.findMany({
        where: { timelineId: t.id, id: { in: [...faseIds] } },
        select: {
          id: true, name: true, durationWeeks: true, startWeek: true, status: true,
          tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { id: true, title: true, weekIndex: true, status: true, party: true, needsValidation: true } },
        },
      })
    : [];
  return {
    anchor: dia(t.anchorStartDate),
    fases: fases.map((f) => ({
      ...f,
      status: String(f.status),
      tasks: f.tasks.map((x) => ({ ...x, status: String(x.status), party: x.party ? String(x.party) : null })),
    })),
  };
}
