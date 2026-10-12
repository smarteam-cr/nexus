/**
 * lib/cs/recordatorios-de-adopcion-server.ts — el job que le recuerda al CSE de la cuenta y a la líder
 * de Customer Success revisar la adopción (2026-10-07). Las reglas: ./recordatorios-de-adopcion.ts.
 *
 * Es un AVISO de «Para ti» (`avisar`): al CSE por el dato (el encargado del proyecto en HubSpot, salvo
 * que esté de baja) y a quien lleva el frente «Liderar Customer Success» (Alex Vanegas). La llave del
 * aviso hace que correr dos veces el mismo día, o todos los días de la ventana, no repita nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { esProyectoDePipelineCS, PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { RECURRENTE_TAG } from "@/lib/tags/catalog";
import { displayedEnd, projectedEnd } from "@/lib/timeline/weeks";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";
import { avisar } from "@/lib/para-ti/avisos-server";
import { cseVigente } from "./cartera-reglas";
import {
  recordatoriosDeHoy,
  textoDelRecordatorio,
  urlDeLaAdopcion,
  type ProyectoParaRecordar,
} from "./recordatorios-de-adopcion";

/** La etapa «Continuidad» del pipeline de Customer Success: un servicio recurrente después de implementar. */
const ETAPA_CONTINUIDAD = "1370129216";

const ymd = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export async function correrRecordatoriosDeAdopcion(ahora: Date): Promise<{ recordatorios: number; avisos: number }> {
  const hoy = fechaLocalDeLaReunion(ahora);
  const [clientes, deBajaFilas] = await Promise.all([
    prisma.client.findMany({
      where: { ...CS_CLIENT_WHERE, projects: { some: PROYECTO_DE_PIPELINE_CS_WHERE } },
      select: {
        id: true,
        name: true,
        projects: {
          where: PROYECTO_DE_PIPELINE_CS_WHERE,
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
            esPrueba: true,
            hubspotOwnerEmail: true,
            hubspotCreatedAt: true,
            hubspotPipelineStageId: true,
            tags: true,
            timeline: {
              select: { anchorStartDate: true, closeDateOverride: true, phases: { select: { durationWeeks: true, startWeek: true } } },
            },
          },
        },
      },
    }),
    prisma.teamMember.findMany({ where: { deactivatedAt: { not: null } }, select: { email: true, name: true } }),
  ]);
  const deBaja = new Map(deBajaFilas.map((m) => [m.email.toLowerCase(), m.name]));

  const proyectos: Array<ProyectoParaRecordar & { empresa: string; nombre: string; cse: string | null }> = [];
  for (const c of clientes) {
    for (const p of proyectosAbiertos(c.projects)) {
      if (!esProyectoDePipelineCS(p)) continue;
      const t = p.timeline;
      const anchor = ymd(t?.anchorStartDate);
      const fin = t ? displayedEnd(t.closeDateOverride?.toISOString() ?? null, projectedEnd(anchor, t.phases)) : null;
      proyectos.push({
        projectId: p.id,
        clientId: c.id,
        empresa: c.name,
        nombre: p.name,
        inicio: anchor ?? ymd(p.hubspotCreatedAt),
        entrega: ymd(fin?.date ?? null),
        recurrente: p.tags.includes(RECURRENTE_TAG) || p.hubspotPipelineStageId === ETAPA_CONTINUIDAD,
        cse: cseVigente(null, p.hubspotOwnerEmail, deBaja).cseEmail,
      });
    }
  }

  const recordatorios = recordatoriosDeHoy(proyectos, hoy);
  let avisos = 0;
  for (const r of recordatorios) {
    const delProyecto = r.projectId ? proyectos.find((p) => p.projectId === r.projectId) : null;
    // El mensual es de la cuenta: les llega a los CSE de sus proyectos recurrentes.
    const cses = delProyecto
      ? [delProyecto.cse]
      : proyectos.filter((p) => p.clientId === r.clientId && p.recurrente).map((p) => p.cse);
    const empresa = delProyecto?.empresa ?? proyectos.find((p) => p.clientId === r.clientId)?.empresa ?? "el cliente";
    const { titulo, detalle } = textoDelRecordatorio(r, empresa, delProyecto?.nombre ?? null);
    avisos += await avisar({
      para: [...new Set(cses.filter((e): e is string => !!e))],
      frente: "LIDERAR_CS",
      tipo: "adopcion.revisar",
      titulo,
      detalle,
      href: urlDeLaAdopcion(r.clientId),
      actorEmail: null,
      dedupeKey: r.clave,
    });
  }
  return { recordatorios: recordatorios.length, avisos };
}
