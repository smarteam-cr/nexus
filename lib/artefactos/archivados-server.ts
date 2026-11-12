/**
 * lib/artefactos/archivados-server.ts — LOS TIPOS CUYO DOCUMENTO DE SIEMPRE SE ARCHIVÓ A PROPÓSITO (Elías, 12 nov). SERVIDOR.
 *
 * Archivar el documento de siempre le suelta el lugar (lib/artefactos/copias-server.ts › archivarArtefacto): para los que
 * lo buscan por `slug`, el proyecto queda como si nunca lo hubiera tenido. Eso es lo correcto para escribir, publicar o
 * generar, pero hay lugares que ante «no existe» lo PIDEN o lo CREAN solos, y ahí archivar no se distinguiría de «todavía
 * no se hizo»:
 *   · la lista muestra siempre el cronograma y el kickoff (`PIEZAS_SIEMPRE_EN_EL_RIEL`);
 *   · el «Qué sigue» pide generar el documento de la etapa;
 *   · las etiquetas y el encadenado del handoff crean el requerimiento técnico;
 *   · los agentes caen a la guía de exploración vieja cuando no hay exploración.
 * Esos lugares preguntan acá. Un tipo deja de contar como archivado en cuanto vuelve a tener documento de siempre (uno
 * nuevo, o el archivado que se recuperó).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { canvasOfAny } from "@/lib/pieces/canvas-query";
import { slugForCanvas } from "@/lib/pieces/registry";
import { hayExploracionAbierta } from "@/lib/exploraciones/del-proyecto";
import { ARCHIVADO_EL_DE_SIEMPRE } from "./copias";

/** Los tipos del proyecto con su documento de siempre archivado y sin otro en su lugar. */
export async function tiposConElDeSiempreArchivado(projectId: string): Promise<Set<string>> {
  const archivados = await prisma.projectCanvas.findMany({
    where: { projectId, slug: null, disabledReason: ARCHIVADO_EL_DE_SIEMPRE, disabledAt: { not: null }, tipoArtefacto: { not: null } },
    select: { tipoArtefacto: true },
  });
  const tipos = [...new Set(archivados.map((a) => a.tipoArtefacto!))];
  if (!tipos.length) return new Set();
  const enSuLugar = await prisma.projectCanvas.findMany({
    where: { projectId, ...canvasOfAny(tipos) },
    select: { slug: true, name: true, businessCaseId: true },
  });
  const ocupados = new Set(enSuLugar.map((c) => slugForCanvas(c)).filter(Boolean));
  // La exploración de siempre vive afuera del canvas: una nueva sin documento (la que abre «ubicar en la escala») también
  // ocupa el lugar, y la lista tiene que mostrarla.
  if (tipos.includes("exploration") && !ocupados.has("exploration") && (await hayExploracionAbierta(projectId))) ocupados.add("exploration");
  return new Set(tipos.filter((t) => !ocupados.has(t)));
}

/**
 * ¿El sello de publicado del proyecto (`kickoffPublishedAt`, `desarrolloPublishedAt`) sigue siendo del documento de
 * siempre que está en el lugar? Los sellos no se tocan al archivar (las etapas los leen), así que un documento nuevo
 * heredaría el del archivado y el portal mostraría su borrador. No es suyo si:
 *   · hay un de siempre ARCHIVADO después del sello (el publicado, o uno que vino después, se archivó sin volver a publicar);
 *   · el que está nació después del sello y hay una copia del tipo de antes del sello (el publicado, recuperado como copia).
 * Compartir antes de que exista el documento (que nace después sin nada archivado) sigue valiendo.
 */
export async function selloDelDeSiempreVigente(projectId: string, tipo: string, sello: Date, documento: { createdAt: Date }): Promise<boolean> {
  const archivadoDespues = await prisma.projectCanvas.findFirst({
    where: { projectId, slug: null, tipoArtefacto: tipo, disabledReason: ARCHIVADO_EL_DE_SIEMPRE, disabledAt: { gte: sello } },
    select: { id: true },
  });
  if (archivadoDespues) return false;
  if (documento.createdAt <= sello) return true;
  const copiaDeAntes = await prisma.projectCanvas.findFirst({
    where: { projectId, slug: null, tipoArtefacto: tipo, createdAt: { lte: sello } },
    select: { id: true },
  });
  return !copiaDeAntes;
}

/** ¿El documento de siempre de ese tipo está archivado (y nadie ocupó su lugar)? */
export async function deSiempreArchivado(projectId: string, tipo: string): Promise<boolean> {
  return (await tiposConElDeSiempreArchivado(projectId)).has(tipo);
}
