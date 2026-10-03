/**
 * lib/timeline/limites-servidor.ts — leer y guardar los límites del cronograma (2026-10-02). SERVIDOR.
 * La regla vive en lib/timeline/limites.ts (puro); acá solo la base.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { tieneVozDeHandoffPropia } from "./semana-cero";
import {
  fusionarPropuestos,
  leerPropuestos,
  limitesDeLaFila,
  ymdDeFecha,
  type LimitesDelCronograma,
  type LimitesPropuestos,
} from "./limites";

/** Las columnas de los límites, para sumarlas a un `select` de `ProjectTimeline`. */
export const SELECT_LIMITES = {
  fechaLimite: true,
  duracionVendidaSemanas: true,
  limitesConfirmacion: true,
  limitesPropuestos: true,
} as const;

/** ¿El proyecto tiene Semana 0? Customer Success sí; Desarrollo y Web (agente de handoff propio) no. */
export function conSemanaCeroDelPipeline(hubspotPipelineId: string | null): boolean {
  return !tieneVozDeHandoffPropia(hubspotPipelineId);
}

export async function leerLimitesDelProyecto(projectId: string): Promise<LimitesDelCronograma | null> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { ...SELECT_LIMITES, project: { select: { hubspotPipelineId: true } } },
  });
  if (!tl) return null;
  return limitesDeLaFila({ ...tl, conSemanaCero: conSemanaCeroDelPipeline(tl.project.hubspotPipelineId) });
}

/**
 * Lo que necesita el bloque de límites del handoff (`bloqueDeLimitesParaElHandoff`): si el proyecto
 * tiene Semana 0 y los límites ya confirmados. Sin proyecto, Customer Success sin límites.
 */
export async function contextoDeLimitesParaElHandoff(projectId: string | null): Promise<{
  conSemanaCero: boolean;
  confirmados: { fechaLimite: string | null; duracionVendidaSemanas: number | null };
}> {
  if (!projectId) return { conSemanaCero: true, confirmados: { fechaLimite: null, duracionVendidaSemanas: null } };
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotPipelineId: true, timeline: { select: { fechaLimite: true, duracionVendidaSemanas: true } } },
  });
  return {
    conSemanaCero: conSemanaCeroDelPipeline(p?.hubspotPipelineId ?? null),
    confirmados: {
      fechaLimite: ymdDeFecha(p?.timeline?.fechaLimite),
      duracionVendidaSemanas: p?.timeline?.duracionVendidaSemanas ?? null,
    },
  };
}

/**
 * Guarda lo que propuso la IA (del handoff) junto a lo que ya había, sin tocar lo confirmado: lo que
 * coincide con un límite confirmado no se propone. Sin cronograma no hace nada (lo crea analyze, con
 * la propuesta adentro). No tira: el handoff no puede fallar por esto.
 */
export async function guardarLimitesPropuestos(projectId: string, nuevos: LimitesPropuestos | null): Promise<void> {
  if (!nuevos) return;
  try {
    const tl = await prisma.projectTimeline.findUnique({ where: { projectId }, select: { id: true, ...SELECT_LIMITES } });
    if (!tl) return;
    const anterior = leerPropuestos(tl.limitesPropuestos);
    const fusion = fusionarPropuestos(anterior, nuevos, {
      fechaLimite: ymdDeFecha(tl.fechaLimite),
      duracionVendidaSemanas: tl.duracionVendidaSemanas,
    });
    if (JSON.stringify(fusion) === JSON.stringify(anterior)) return;
    await prisma.projectTimeline.update({
      where: { id: tl.id },
      data: { limitesPropuestos: fusion === null ? Prisma.DbNull : (fusion as unknown as Prisma.InputJsonValue) },
    });
  } catch (e) {
    console.warn("[limites] la propuesta de límites del handoff no se guardó:", e instanceof Error ? e.message : e);
  }
}
