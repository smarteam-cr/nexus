/**
 * lib/siguiente-paso/desde-tareas.ts — el siguiente paso de un equipo SALE de sus tareas (2026-10-16, fase 0.2 de
 * docs/nexus-sistema-de-trabajo-plan.md, decisión 1). PURO y client-safe.
 *
 * El siguiente paso de un equipo sobre una empresa, un negocio o un proyecto es su PRÓXIMA TAREA ABIERTA CON FECHA:
 *   · del sprint del equipo (Ventas → `ventas`, CS → `cs`, Dev → `desarrollo`), con responsable o en «Por asignar»;
 *   · pendiente o en curso (una propuesta todavía no le llegó a nadie), y nunca «Solo para mí»;
 *   · de la cuenta (la empresa), de ese negocio o de ese proyecto;
 *   · la de fecha más temprana: el día de la reunión, el vencimiento o, si no, la semana en que está.
 * Si ninguna tiene fecha, sigue la que ya estaba escrita en HubSpot mientras siga abierta: así una tarea sin fecha que
 * entró desde HubSpot no se borra de allá en la copia siguiente.
 *
 * Lo que está escrito en HubSpot se guarda en `SiguientePaso` (la copia, con la tarea de la que salió).
 */
import type { EquipoDelSiguientePaso } from "./propiedades";
import type { ObjetoDelPaso } from "./reglas";

/** El sprint (lib/tareas/equipos.ts) de cada equipo que lleva siguiente paso. */
export const SPRINT_DEL_PASO: Record<EquipoDelSiguientePaso, string> = { ventas: "ventas", cs: "cs", dev: "desarrollo" };

/** El equipo del siguiente paso de un sprint (Marketing, Admin y RevOps no llevan). */
export function equipoDelPasoDeSprint(sprint: string | null | undefined): EquipoDelSiguientePaso | null {
  const e = (Object.entries(SPRINT_DEL_PASO) as Array<[EquipoDelSiguientePaso, string]>).find(([, s]) => s === sprint);
  return e ? e[0] : null;
}

export const SPRINTS_CON_PASO: readonly string[] = Object.values(SPRINT_DEL_PASO);

/** Lo que hace falta de una tarea para decidir el siguiente paso. Las fechas como `YYYY-MM-DD`. */
export interface TareaDelPaso {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  privada: boolean;
  equipo: string | null;
  responsableEmail: string | null;
  venceEl: string | null;
  /** El lunes de su semana. */
  semana: string | null;
  /** Una reunión planeada: el día en que se propone (hora de Costa Rica). */
  reunionDia: string | null;
  clientId: string | null;
  projectId: string | null;
  hubspotDealId: string | null;
  origen: string;
  creadaPorEmail: string | null;
  /** ISO. */
  creadaAt: string;
  version: number;
}

const ABIERTAS = new Set(["pendiente", "en_curso"]);

/** La fecha de la tarea para el siguiente paso: el día de la reunión, el vencimiento o su semana. */
export function fechaDelPaso(t: Pick<TareaDelPaso, "reunionDia" | "venceEl" | "semana">): string | null {
  return t.reunionDia ?? t.venceEl ?? t.semana ?? null;
}

/** ¿Puede ser el siguiente paso de alguien? Abierta, no privada y del sprint de un equipo con paso. */
export function cuentaParaElPaso(t: TareaDelPaso): boolean {
  return ABIERTAS.has(t.estado) && !t.privada && !!t.equipo && SPRINTS_CON_PASO.includes(t.equipo);
}

/** ¿Es de ese objeto? De la empresa = cualquiera de la cuenta; de un negocio o un proyecto = ligada a él. */
export function esDelObjeto(t: TareaDelPaso, o: { objeto: ObjetoDelPaso; clientId: string | null; objetoId: string; hubspotDealId?: string | null }): boolean {
  if (o.objeto === "empresa") return !!t.clientId && t.clientId === o.clientId;
  if (o.objeto === "negocio") return !!o.hubspotDealId && t.hubspotDealId === o.hubspotDealId;
  return t.projectId === o.objetoId;
}

/**
 * El siguiente paso de un equipo entre las tareas de un objeto. `actualTareaId` = la que está escrita hoy en HubSpot:
 * si ninguna tiene fecha, sigue esa mientras esté abierta.
 */
export function siguientePasoDe(tareas: readonly TareaDelPaso[], equipo: EquipoDelSiguientePaso, actualTareaId: string | null = null): TareaDelPaso | null {
  const sprint = SPRINT_DEL_PASO[equipo];
  const delEquipo = tareas.filter((t) => cuentaParaElPaso(t) && t.equipo === sprint);
  const conFecha = delEquipo
    .filter((t) => !!fechaDelPaso(t))
    .sort((a, b) => fechaDelPaso(a)!.localeCompare(fechaDelPaso(b)!) || a.creadaAt.localeCompare(b.creadaAt) || a.numero - b.numero);
  if (conFecha.length) return conFecha[0];
  return (actualTareaId && delEquipo.find((t) => t.id === actualTareaId)) || null;
}

/**
 * Al fijar el siguiente paso: ¿se cambia la tarea que hoy lo es, o se crea otra? Solo se cambia una tarea de paso
 * (`origen = "paso"`) de quien lo fija. La de otra persona, o la que nació en una reunión, el chat o HubSpot, no se
 * reescribe desde el diálogo: se crea una tarea de paso nueva.
 */
export function tareaQueSeCambiaAlFijar(actual: TareaDelPaso | null, quienFija: string): TareaDelPaso | null {
  if (!actual || actual.origen !== "paso") return null;
  return (actual.responsableEmail ?? "").toLowerCase() === quienFija.trim().toLowerCase() ? actual : null;
}

/** De dónde salió la tarea, como lo dice la pantalla del siguiente paso. */
export function fuenteDeLaTarea(t: Pick<TareaDelPaso, "origen" | "creadaPorEmail">): "persona" | "chat" | "reunion" | "hubspot" {
  if (t.origen === "chat") return "chat";
  if (t.origen === "reunion" || t.origen === "notas") return "reunion";
  if (t.origen === "hubspot" || (t.origen === "paso" && !t.creadaPorEmail)) return "hubspot";
  return "persona";
}

/** ¿Lo que está escrito en HubSpot dice lo mismo que la tarea? */
export function mismoQueLaTarea(
  escrito: { tareaId: string | null; que: string; fecha: string | null; responsableEmail: string | null },
  t: TareaDelPaso,
): boolean {
  const normalizar = (s: string) => s.replace(/\s+/g, " ").trim();
  return (
    escrito.tareaId === t.id &&
    normalizar(escrito.que) === normalizar(t.titulo) &&
    (escrito.fecha ?? null) === fechaDelPaso(t) &&
    (escrito.responsableEmail ?? null) === (t.responsableEmail ?? null)
  );
}
