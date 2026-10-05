/**
 * lib/para-ti/alcance-server.ts — QUÉ ES TUYO, en un solo lugar (2026-10-04). SERVER-ONLY.
 *
 * «Para ti» separa dos preguntas que hasta hoy contestaba el rol solo:
 * · qué PUEDES VER — el rol y la matriz de permisos (lib/auth). No cambia.
 * · qué te TOCA — esto. Sale de DATOS, no de permisos:
 *     - los proyectos de Customer Success donde eres el encargado en HubSpot (`hubspotOwnerEmail`), abiertos;
 *     - los proyectos de las cuentas que te compartieron A TI (ClientAssignment GRANT por persona, no por rol);
 *     - tus frentes («lo que llevas», lib/para-ti/frentes.ts).
 *   Las preventas, propuestas y registros de Finanzas propios los resuelve cada fuente con su campo de dueño
 *   (`responsableEmail`, `createdByEmail`, quien registró): no hace falta traerlos acá.
 *
 * ⚠ Por qué no se usa `accessibleClientWhere`: ese responde «qué puede ABRIR» y para quien ve toda la cartera
 * devuelve todo. Eso era justamente el problema: el índice de clientes le mostraba a dirección y a Ventas los avisos
 * de todas las cuentas como si les tocaran.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { esProyectoDePipelineCS, PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { can, getEffectivePermissions } from "@/lib/auth/permissions/engine";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { esResponsable } from "@/lib/escala/comentarios/reglas";
import { frentesDe, type ClaveDeFrente } from "./frentes";

export interface ProyectoPropio {
  id: string;
  name: string;
  clientId: string;
  empresa: string;
  altaEstado: string | null;
  /** La empresa tiene 2+ proyectos abiertos: solo ahí una reunión puede caer en el proyecto equivocado. */
  multiproyecto: boolean;
}

export interface Alcance {
  email: string;
  nombre: string;
  rol: string;
  teamMemberId: string;
  frentes: ClaveDeFrente[];
  permisos: PermissionMap;
  /** Puede abrir toda la cartera: en «Del equipo» ve los nombres de las cuentas de los demás. */
  veTodaLaCartera: boolean;
  proyectos: ProyectoPropio[];
}

export type MiembroParaAlcance = Pick<
  TeamMember,
  | "id"
  | "name"
  | "email"
  | "roleEnum"
  | "permissionOverrides"
  | "canViewAllClients"
  | "canViewAllExpiresAt"
  | "vistaFinanzas"
  | "frentes"
  | "frentesEditadosAt"
>;

export const SELECT_MIEMBRO_PARA_ALCANCE = {
  id: true,
  name: true,
  email: true,
  roleEnum: true,
  permissionOverrides: true,
  canViewAllClients: true,
  canViewAllExpiresAt: true,
  vistaFinanzas: true,
  frentes: true,
  frentesEditadosAt: true,
} as const;

/** Los frentes efectivos de un miembro (con el default del rol y el responsable fijo de la Escala). */
export function frentesDelMiembro(tm: Pick<MiembroParaAlcance, "roleEnum" | "email" | "frentes" | "frentesEditadosAt" | "vistaFinanzas">) {
  return frentesDe({
    roleEnum: tm.roleEnum,
    email: tm.email,
    frentes: tm.frentes,
    frentesEditadosAt: tm.frentesEditadosAt,
    vistaFinanzas: tm.vistaFinanzas,
    esResponsableDeLaEscala: esResponsable(tm.email),
  });
}

export async function alcanceDe(tm: MiembroParaAlcance): Promise<Alcance> {
  const email = tm.email.toLowerCase();
  const [permisos, veTodo, asignaciones] = await Promise.all([
    getEffectivePermissions(tm),
    tm.roleEnum === "SUPER_ADMIN" ? Promise.resolve(true) : can(tm, "clientes", "viewAll"),
    prisma.clientAssignment.findMany({
      where: { teamMemberId: tm.id },
      select: { clientId: true, kind: true },
    }),
  ]);
  const compartidas = new Set(asignaciones.filter((a) => a.kind === "GRANT").map((a) => a.clientId));
  for (const a of asignaciones) if (a.kind === "REVOKE") compartidas.delete(a.clientId);

  const clientes = await prisma.client.findMany({
    where: {
      ...CS_CLIENT_WHERE,
      OR: [
        { projects: { some: { hubspotOwnerEmail: { equals: email, mode: "insensitive" }, ...PROYECTO_DE_PIPELINE_CS_WHERE } } },
        ...(compartidas.size ? [{ id: { in: [...compartidas] } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          serviceType: true,
          hubspotServiceId: true,
          hubspotPipelineId: true,
          proyectoInterno: true,
          hermanoCsProjectId: true,
          altaEstado: true,
          hubspotOwnerEmail: true,
        },
      },
    },
  });

  const proyectos: ProyectoPropio[] = [];
  for (const c of clientes) {
    const abiertos = proyectosAbiertos(c.projects);
    const compartida = compartidas.has(c.id);
    for (const p of abiertos) {
      if (!esProyectoDePipelineCS(p)) continue;
      const mio = (p.hubspotOwnerEmail ?? "").toLowerCase() === email;
      if (!mio && !compartida) continue;
      proyectos.push({
        id: p.id,
        name: p.name,
        clientId: c.id,
        empresa: c.name,
        altaEstado: p.altaEstado,
        multiproyecto: abiertos.length >= 2,
      });
    }
  }

  const veTodaLaCartera =
    veTodo || (tm.canViewAllClients && (!tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date()));

  return {
    email,
    nombre: tm.name,
    rol: tm.roleEnum,
    teamMemberId: tm.id,
    frentes: frentesDelMiembro(tm),
    permisos,
    veTodaLaCartera,
    proyectos,
  };
}

/** ¿Tiene esta celda de la matriz? (lectura del mapa efectivo ya resuelto). */
export function tienePermiso(a: Pick<Alcance, "permisos">, seccion: string, accion: string): boolean {
  const secciones = (a.permisos?.sections ?? {}) as Record<string, Record<string, boolean> | undefined>;
  return secciones[seccion]?.[accion] === true;
}
