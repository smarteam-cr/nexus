/**
 * lib/external/pagina-del-cliente-server.ts — guardar y previsualizar la página del cronograma que ve el cliente
 * (2026-11-27). SERVIDOR. La forma y los valores de siempre: lib/external/pagina-del-cliente.ts.
 *
 * La VISTA PREVIA sale del MISMO chokepoint que la foto que se publica (`readClientTimeline` para un proyecto,
 * `leerPlanParaElCliente` para el plan): el equipo ve, antes de publicar, exactamente lo que el cliente verá al
 * publicar. Nunca se arma acá campo por campo.
 *
 * Guardar NO publica: deja el cambio como «sin subir» (un proyecto marca `lastEditedByHuman`, que es lo que enciende
 * «Subir al cliente»; el plan lo detecta solo al comparar su foto). Pide el permiso quien llama.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leerPlanParaElCliente } from "@/lib/plan-general/leer";
import { asegurarPlan } from "@/lib/plan-general/plan";
import { readClientTimeline } from "./timeline-view";
import type { ExternalTimelineData } from "./timeline-view-types";
import { compactarPagina, leerPaginaDelCliente, mismaPagina, type PaginaDelCliente } from "./pagina-del-cliente";

/** Lo que pinta la vista previa: la misma forma que reciben las páginas externas. */
export interface VistaPreviaDelCliente {
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale: number | null;
  timeline: ExternalTimelineData;
}

const valorDeLaColumna = (p: PaginaDelCliente) => {
  const c = compactarPagina(p);
  return c ? (c as Prisma.InputJsonValue) : Prisma.DbNull;
};

/** null = el proyecto no tiene cronograma (no hay página que mostrar). */
export async function vistaPreviaDelProyecto(projectId: string): Promise<VistaPreviaDelCliente | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { timeline: { select: { id: true } }, client: { select: { name: true, logoUrl: true, logoScale: true } } },
  });
  if (!p?.timeline) return null;
  return {
    clientName: p.client.name,
    clientLogoUrl: p.client.logoUrl ?? null,
    clientLogoScale: p.client.logoScale ?? null,
    timeline: await readClientTimeline(projectId),
  };
}

/** Guarda la página del cronograma de un proyecto. false = no tiene cronograma. */
export async function guardarPaginaDelProyecto(projectId: string, pagina: PaginaDelCliente): Promise<boolean> {
  const tl = await prisma.projectTimeline.findUnique({ where: { projectId }, select: { id: true, paginaDelCliente: true } });
  if (!tl) return false;
  // Lo mismo que ya estaba (prender lo prendido): no se toca nada, así no se enciende «Subir al cliente» de gusto.
  if (mismaPagina(leerPaginaDelCliente(tl.paginaDelCliente), pagina)) return true;
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    // `lastEditedByHuman` es lo que enciende «Subir al cliente» en el cronograma: el cliente lo ve recién al subir.
    data: { paginaDelCliente: valorDeLaColumna(pagina), lastEditedByHuman: new Date() },
  });
  return true;
}

/** null = la cuenta no existe. */
export async function vistaPreviaDelPlan(clientId: string): Promise<VistaPreviaDelCliente | null> {
  const [c, timeline] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true, logoUrl: true, logoScale: true } }),
    leerPlanParaElCliente(clientId),
  ]);
  if (!c) return null;
  return { clientName: c.name, clientLogoUrl: c.logoUrl ?? null, clientLogoScale: c.logoScale ?? null, timeline };
}

/** Guarda la página del plan general (en el cronograma del plan; lo crea si la cuenta todavía no tiene plan). */
export async function guardarPaginaDelPlan(clientId: string, pagina: PaginaDelCliente, porEmail: string | null): Promise<void> {
  const { timelineId } = await asegurarPlan(clientId, porEmail);
  await prisma.projectTimeline.update({
    where: { id: timelineId },
    data: { paginaDelCliente: valorDeLaColumna(pagina), lastEditedByHuman: new Date() },
  });
}
