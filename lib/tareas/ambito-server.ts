/**
 * lib/tareas/ambito-server.ts — los datos que necesita `ambitoDe` para muchas tareas, en dos consultas. SERVIDOR.
 *
 * El ámbito se calcula al leer (lib/tareas/ambito.ts). Para no consultar por tarea, esto trae de una vez las empresas
 * y los proyectos de HubSpot de un lote, con el criterio de trabajo interno de lib/clients (`esTrabajoInterno`).
 */
import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esTrabajoInterno } from "@/lib/clients/resumen-proyectos";
import { esProyectoClasificable } from "@/lib/projects/scope";
import { ambitoDe, type AmbitoCalculado, type EmpresaParaAmbito, type ProyectoParaAmbito } from "./ambito";

type Db = PrismaClient | Prisma.TransactionClient;

const SELECT_FILTRO = {
  id: true,
  name: true,
  status: true,
  serviceType: true,
  hubspotServiceId: true,
  hubspotPipelineId: true,
  proyectoInterno: true,
  hermanoCsProjectId: true,
  altaEstado: true,
  clientId: true,
} as const;

export interface DatosDeAmbito {
  empresas: Map<string, EmpresaParaAmbito>;
  proyectos: Map<string, ProyectoParaAmbito & { clientId: string; cerrado: boolean }>;
}

export async function datosDeAmbito(clientIds: readonly (string | null)[], projectIds: readonly (string | null)[], db: Db = prisma): Promise<DatosDeAmbito> {
  const ids = [...new Set(clientIds.filter((x): x is string => !!x))];
  const pids = [...new Set(projectIds.filter((x): x is string => !!x))];
  const [clientes, proyectosDeLasEmpresas, proyectos] = await Promise.all([
    ids.length ? db.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, kind: true } }) : [],
    ids.length ? db.project.findMany({ where: { clientId: { in: ids } }, select: SELECT_FILTRO }) : [],
    pids.length ? db.project.findMany({ where: { id: { in: pids } }, select: SELECT_FILTRO }) : [],
  ]);
  const porEmpresa = new Map<string, (typeof proyectosDeLasEmpresas)[number][]>();
  for (const p of proyectosDeLasEmpresas) porEmpresa.set(p.clientId, [...(porEmpresa.get(p.clientId) ?? []), p]);
  const empresas = new Map<string, EmpresaParaAmbito>(
    clientes.map((c) => {
      const clasificables = (porEmpresa.get(c.id) ?? []).filter(esProyectoClasificable);
      return [c.id, { id: c.id, nombre: c.name, kind: c.kind as string, todoInterno: clasificables.length > 0 && clasificables.every(esTrabajoInterno) }];
    }),
  );
  return {
    empresas,
    proyectos: new Map(
      proyectos.map((p) => [p.id, { id: p.id, nombre: p.name, proyectoInterno: p.proyectoInterno, clientId: p.clientId, cerrado: !esProyectoClasificable(p) }]),
    ),
  };
}

export function ambitoConDatos(d: DatosDeAmbito, clientId: string | null, projectId: string | null): AmbitoCalculado {
  return ambitoDe(clientId ? (d.empresas.get(clientId) ?? null) : null, projectId ? (d.proyectos.get(projectId) ?? null) : null);
}
