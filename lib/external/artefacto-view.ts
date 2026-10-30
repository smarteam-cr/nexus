/**
 * lib/external/artefacto-view.ts — CHOKEPOINT de la vista del ENLACE PROPIO de un documento de un proyecto (etapa V4 de
 * docs/artefactos-plan.md, 2026-10-29). Único lugar donde el token de `/external/documento/[token]` se resuelve al
 * contenido de un documento de PROYECTO (los de la empresa los resuelve lib/external/documento-de-la-empresa-view.ts,
 * como siempre). SERVIDOR.
 *
 * Para qué: Elías, 29 oct — «muchas veces ese enlace lo usa Customer Success para compartir la pantalla desde ahí». Por
 * eso sirve el documento VIVO y no una foto: lo que se escribe se ve al recargar. Y porque `publishedSnapshot` del
 * documento de siempre de cada tipo lo usan los mecanismos de publicar del kickoff y la planificación: no se toca.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoAlDocumento` con él, sin revocar;
 *   2. el documento es de un PROYECTO de la MISMA empresa que el enlace, nunca de una propuesta (lo vigila también INV64);
 *   3. el documento no está apagado/archivado (`disabledAt`) y su tipo lo lee el cliente (`clientFacing`) y se sabe pintar.
 * Sirve solo lo confirmado, sin lo oculto, sin las secciones que leen el proyecto (las `ctxDriven` que no son la portada
 * ni el cierre), sin las secciones internas de su tipo (la estimación del equipo técnico) y sin nada interno: ni quién lo
 * escribió, ni las fuentes, ni el estado de los bloques, ni el costo de una licencia (`sinLoInterno`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { sinLoInterno } from "@/lib/landing/inversion-costo";
import { comparaSectionHasContent, kickoffHiddenKey, stripProseCompara, COMPARA_KEY } from "@/components/canvas/kickoff-landing-adapter";
import { ocultasDelBorrador, ocultasEnElEditor } from "@/lib/kickoff/ocultas-del-editor";
import type { LandingSectionRow } from "@/components/landing/build-landing";
import { esCopia, nombreDelArtefacto, tipoDelDocumento } from "@/lib/artefactos/copias";
import { getBrandLogos } from "./smarteam-logo";
import { seccionesQueSalenPorElEnlace, tipoCompartible } from "@/lib/artefactos/secciones-del-enlace";

export interface ArtefactoViewData {
  /** El tipo del documento (lib/artefactos/tipos.ts): elige su adaptador del motor. */
  tipo: string;
  /** El nombre del documento («Planificación — Marketing»), sin su estado. */
  nombre: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoDarkUrl: string | null;
  clientLogoScale: number | null;
  smarteamLogoUrl: string | null;
  brandLogos: Record<string, string>;
  rows: LandingSectionRow[];
}

const TOKEN = /^[0-9a-f]{64}$/;

export async function artefactoParaElToken(token: string): Promise<ArtefactoViewData | null> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoAlDocumento.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      clientId: true,
      revokedAt: true,
      canvas: {
        select: {
          id: true,
          clientId: true,
          projectId: true,
          businessCaseId: true,
          slug: true,
          tipoArtefacto: true,
          name: true,
          titulo: true,
          disabledAt: true,
          sections: true,
          project: { select: { clientId: true, hiddenKickoffKeys: true } },
        },
      },
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
  });
  if (!acceso || acceso.revokedAt) return null;
  const c = acceso.canvas;
  if (!c || c.businessCaseId !== null || c.clientId !== null || !c.projectId || !c.project) return null;
  if (c.project.clientId !== acceso.clientId || c.disabledAt) return null;
  const tipo = tipoDelDocumento(c);
  if (!tipo || !tipoCompartible(tipo)) return null;

  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId: c.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      titleOverride: true,
      eyebrowOverride: true,
      // Solo lo CONFIRMADO: un bloque en borrador es una propuesta que nadie aceptó.
      blocks: { where: { status: "CONFIRMED" }, orderBy: { order: "asc" }, select: { blockType: true, content: true, data: true } },
    },
  });

  const ocultas = hiddenKeysFrom(c.sections);
  /* El kickoff de siempre guarda lo oculto en el PROYECTO (`hiddenKickoffKeys`, por id de sección) y en su borrador
     (`__ocultas`): se suman, como en su PDF. Una copia lo guarda en su Json, como todo documento del motor. */
  const ocultasDelKickoff =
    tipo === "kickoff" && !esCopia(c) ? new Set(ocultasEnElEditor(c.project.hiddenKickoffKeys ?? [], ocultasDelBorrador(c.sections))) : new Set<string>();
  const salen = seccionesQueSalenPorElEnlace(tipo);
  const dropProseCompara = tipo === "kickoff" && comparaSectionHasContent(secciones);

  await prisma.accesoAlDocumento.update({ where: { id: acceso.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  const logos = await getBrandLogos();
  const brandLogos = Object.fromEntries(Object.entries(logos).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  return {
    tipo,
    nombre: nombreDelArtefacto(c),
    clientName: acceso.client.name,
    clientLogoUrl: acceso.client.logoUrl,
    clientLogoDarkUrl: acceso.client.logoDarkUrl,
    clientLogoScale: acceso.client.logoScale,
    smarteamLogoUrl: logos.smarteam ?? null,
    brandLogos,
    rows: secciones
      .filter((s) => salen(s.key) && !ocultas.has(s.key) && !ocultasDelKickoff.has(kickoffHiddenKey(s.key, s.id)) && s.blocks.length > 0)
      .map((s) => ({
        key: s.key,
        titleOverride: s.titleOverride ?? null,
        eyebrowOverride: s.eyebrowOverride ?? null,
        blocks: s.blocks.map((b) => ({
          blockType: b.blockType,
          content: b.content,
          data: sinLoInterno(dropProseCompara && s.key !== COMPARA_KEY ? stripProseCompara(b.data) : b.data),
        })),
      })),
  };
}

