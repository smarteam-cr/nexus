/**
 * lib/tareas/donde.ts — los filtros de trabajo de Tareas internas. Las consultas de trabajo los usan (sin propuestas,
 * vencidas ni lápidas), y ninguna filtra por espacio fuera de `enEspacioWhere`.
 */
import type { Prisma } from "@prisma/client";

/** Lo que se trabaja: aceptado y sin cerrar. */
export const ABIERTAS_WHERE = { archivadaAt: null, estado: { in: ["pendiente", "en_curso"] } } satisfies Prisma.TareaWhereInput;

/** Lo aceptado (abierto o cerrado): sin propuestas, vencidas ni lápidas. */
export const TRABAJO_WHERE = { archivadaAt: null, estado: { in: ["pendiente", "en_curso", "hecha", "no_se_hara"] } } satisfies Prisma.TareaWhereInput;

/** Lo que espera una decisión. */
export const PROPUESTAS_WHERE = { archivadaAt: null, estado: "propuesta" } satisfies Prisma.TareaWhereInput;

/**
 * Las tareas que viven en un espacio: las de sus proyectos y, si es el de un equipo, las de su sprint sin proyecto.
 * El único lugar que sabe filtrar por espacio.
 */
export function enEspacioWhere(espacio: { id: string; tipo: string; equipo: string | null }): Prisma.TareaWhereInput {
  if (espacio.tipo === "equipo" && espacio.equipo) {
    return { OR: [{ proyecto: { espacioId: espacio.id } }, { proyectoId: null, equipo: espacio.equipo }] };
  }
  return { proyecto: { espacioId: espacio.id } };
}

/**
 * Las candidatas a «¿Es T-12?» de una lectura: lo abierto o propuesto de los dueños de las líneas y el «Por asignar»
 * del equipo que leyó. En una reunión de cliente, además, solo lo de ese cliente o sin cliente. Va con AND: un segundo
 * OR suelto pisaría al primero y las candidatas serían cualquier tarea de cualquier estado.
 */
export function candidatasWhere(duenos: readonly string[], equipo: string, clienteDeLaReunion: string | null): Prisma.TareaWhereInput {
  return {
    archivadaAt: null,
    AND: [
      {
        OR: [
          { responsableEmail: { in: [...duenos] }, estado: { in: ["pendiente", "en_curso", "propuesta"] } },
          { equipo, responsableEmail: null, ...ABIERTAS_WHERE },
        ],
      },
      ...(clienteDeLaReunion ? [{ OR: [{ clientId: null }, { clientId: clienteDeLaReunion }] }] : []),
    ],
  };
}
