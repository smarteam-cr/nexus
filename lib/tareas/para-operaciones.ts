/**
 * lib/tareas/para-operaciones.ts — lo que la capa de operaciones lee de Tareas (2026-10-16, fase 0.4 de
 * docs/nexus-sistema-de-trabajo-plan.md). SERVER-ONLY.
 *
 * La capa (lib/operaciones) es la puerta por la que el chat de Nexus va a leer y proponer cambios: lo que devuelve acá
 * puede llegar a un modelo. Por eso es una PROYECCIÓN, como la de los agentes (./para-agentes.ts): número, título,
 * estado, semana, vencimiento, responsable y lado. Nunca la cita de una reunión, el contexto, las notas ni los pasos.
 * Con la visibilidad de la persona que pide (`tareasVisiblesWhere`): ve lo que vería en la pantalla, nunca más.
 *
 * Escribir no es de acá: la capa aplica por el escritor único (./mutaciones.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ESTADOS_ABIERTOS } from "./estados";
import type { ContextoDeTareas } from "./servidor";
import { tareasVisiblesWhere } from "./visibilidad";

/** Lo que se lee de una tarea. */
const SELECT_PARA_OPERACIONES = {
  id: true,
  numero: true,
  titulo: true,
  estado: true,
  version: true,
  semana: true,
  venceEl: true,
  responsableEmail: true,
  clientId: true,
  lado: true,
} as const;

export interface TareaParaOperaciones {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  version: number;
  /** El lunes `AAAA-MM-DD` de su semana; null = más adelante. */
  semana: string | null;
  venceEl: string | null;
  responsableEmail: string | null;
  clientId: string | null;
  lado: string;
}

type Fila = {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  version: number;
  semana: Date | string | null;
  venceEl: Date | string | null;
  responsableEmail: string | null;
  clientId: string | null;
  lado: string;
};

const dia = (d: Date | string | null): string | null => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function aTarea(f: Fila): TareaParaOperaciones {
  return { ...f, semana: dia(f.semana), venceEl: dia(f.venceEl) };
}

/** Tope de tareas abiertas de una cuenta que se leen de una vez. */
export const TOPE_DE_LA_CUENTA = 40;

/** Las tareas ABIERTAS de una cuenta que la persona ve, la que vence antes primero. */
export async function tareasAbiertasDeLaCuenta(ctx: ContextoDeTareas, clientId: string, tope = TOPE_DE_LA_CUENTA): Promise<TareaParaOperaciones[]> {
  const filas = await prisma.tarea.findMany({
    where: { AND: [tareasVisiblesWhere(ctx), { clientId, estado: { in: [...ESTADOS_ABIERTOS] } }] },
    select: SELECT_PARA_OPERACIONES,
    orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { semana: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: tope,
  });
  return filas.map((f) => aTarea(f as Fila));
}

/** Una tarea por su número («T-12»), si la persona la ve. */
export async function tareaVisiblePorNumero(ctx: ContextoDeTareas, numero: number): Promise<TareaParaOperaciones | null> {
  const f = await prisma.tarea.findFirst({ where: { AND: [tareasVisiblesWhere(ctx), { numero }] }, select: SELECT_PARA_OPERACIONES });
  return f ? aTarea(f as Fila) : null;
}
