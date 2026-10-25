/**
 * lib/clients/documentos-de-la-empresa-server.ts — los documentos de una empresa, con o sin proyecto (R3, etapa 1,
 * 2026-10-25). SERVIDOR.
 *
 * `documentoDeLaEmpresa` busca o crea el documento de una pieza (`slug`) que es de la EMPRESA, sin proyecto ni propuesta.
 * Es el primer escalón de R3: con él se puede armar un diagnóstico para un prospecto o el documento de resultados de la
 * preventa (C5) sin el proyecto falso «Información del cliente». Todavía no lo usa ninguna pantalla: abrir uno exige que
 * las rutas de los documentos sepan de un dueño que no es un proyecto (etapa 3, ver DECISIONS › «La empresa, parte 2»).
 *
 * `documentosDeLaEmpresa` lista TODOS los de una empresa, por los tres caminos (la empresa, sus proyectos y sus
 * propuestas), cada uno con de qué camino viene.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { empresaDelDocumento, SELECT_DEL_DUENO } from "./documentos-de-la-empresa";

const esUnicoViolado = (e: unknown) => (e as { code?: string })?.code === "P2002";

/** El documento de esta pieza de la empresa (sin proyecto ni propuesta). Lo crea si no existe; dos a la vez no duplican. */
export async function documentoDeLaEmpresa(clientId: string, slug: string, nombre: string): Promise<{ id: string; creado: boolean }> {
  const buscar = () => prisma.projectCanvas.findFirst({ where: { clientId, slug, projectId: null, businessCaseId: null }, select: { id: true } });
  const ya = await buscar();
  if (ya) return { id: ya.id, creado: false };
  try {
    const nuevo = await prisma.projectCanvas.create({ data: { clientId, slug, name: nombre, isDefault: false }, select: { id: true } });
    return { id: nuevo.id, creado: true };
  } catch (e) {
    // Otro pedido lo creó entre la búsqueda y el alta: el único parcial (clientId, slug) lo frenó. Se usa ese.
    if (!esUnicoViolado(e)) throw e;
    const otro = await buscar();
    if (!otro) throw e;
    return { id: otro.id, creado: false };
  }
}

export interface DocumentoDeLaEmpresa {
  id: string;
  nombre: string;
  slug: string | null;
  via: "empresa" | "proyecto" | "propuesta";
  projectId: string | null;
  businessCaseId: string | null;
  updatedAt: Date;
}

/** Todos los documentos de una empresa, por los tres caminos. */
export async function documentosDeLaEmpresa(clientId: string): Promise<DocumentoDeLaEmpresa[]> {
  const filas = await prisma.projectCanvas.findMany({
    where: { OR: [{ clientId }, { project: { clientId } }, { businessCase: { clientId } }] },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, slug: true, projectId: true, businessCaseId: true, updatedAt: true, ...SELECT_DEL_DUENO },
  });
  return filas.flatMap((f) => {
    const dueno = empresaDelDocumento(f);
    // Defensa: solo los que son de ESTA empresa (un documento no puede ser de dos, pero el filtro no cuesta).
    if (!dueno || dueno.clientId !== clientId) return [];
    return [{ id: f.id, nombre: f.name, slug: f.slug, via: dueno.via, projectId: f.projectId, businessCaseId: f.businessCaseId, updatedAt: f.updatedAt }];
  });
}
