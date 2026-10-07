/**
 * lib/para-ti/fuentes/etapa.ts — la etapa que una reunión sugiere mover en HubSpot, en los proyectos que llevas
 * (2026-10-07). La regla es la de la ficha (`sugerenciaVigente`): si alguien ya movió la tarjeta en HubSpot, la
 * pregunta desaparece sola. Solo para quien puede responderla (`proyectos.cambiarEstadoHubspot`): al resto no le
 * sirve de nada saber que hay una pregunta que no puede contestar.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { resolvePipeline } from "@/lib/projects/kind";
import { sugerenciaVigente } from "@/lib/projects/etapa-sugerida";
import { haceCuanto } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const ETAPA_SUGERIDA: Fuente = {
  clave: "etapa-sugerida",
  frente: null,
  alDia: "Las etapas de tus proyectos en HubSpot",
  aplica: (a) => a.proyectos.length > 0 && a.permisos.sections.proyectos?.cambiarEstadoHubspot === true,
  async medir(a, c) {
    const porId = new Map(a.proyectos.map((p) => [p.id, p]));
    const filas = await prisma.project.findMany({
      where: { id: { in: [...porId.keys()] }, etapaPropuestaStageId: { not: null } },
      select: {
        id: true,
        hubspotPipelineId: true,
        hubspotPipelineStageId: true,
        etapaPropuestaStageId: true,
        etapaPropuestaMotivo: true,
        etapaPropuestaAt: true,
      },
    });
    return filas.flatMap((f): Pendiente[] => {
      const p = porId.get(f.id);
      if (!p) return [];
      const s = sugerenciaVigente(resolvePipeline(f.hubspotPipelineId), f.hubspotPipelineStageId, {
        stageId: f.etapaPropuestaStageId,
        motivo: f.etapaPropuestaMotivo,
        at: f.etapaPropuestaAt,
      });
      if (!s) return [];
      const espera = haceCuanto(s.at, c.ahora);
      return [
        {
          clave: `etapa-sugerida:${p.id}`,
          fuente: "etapa-sugerida",
          cuando: "hoy",
          delAgente: true,
          titulo: `Confirma si ${p.empresa} pasó a ${s.hasta}`,
          detalle:
            `${s.reunion ? `Lo vio la IA en la reunión «${s.reunion.titulo}». ` : ""}` +
            `En HubSpot sigue en ${s.desde ?? "otra etapa"}; nada se mueve hasta que respondas` +
            `${espera && espera !== "hoy" ? ` (espera desde ${espera})` : ""}.`,
          meta: `Etapa · ${p.name}`,
          accion: "Responder",
          href: `${urlDeProyecto(p.clientId, p.id)}&etapa=revisar#proyecto-etapa`,
          desde: s.at,
        },
      ];
    });
  },
};
