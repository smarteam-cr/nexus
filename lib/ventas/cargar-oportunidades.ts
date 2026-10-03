/**
 * lib/ventas/cargar-oportunidades.ts — las dos fuentes de «Oportunidades detectadas» (/sales).
 *
 * Solo lectura. Trae (1) la sugerencia que el CSE dejó al marcar «Entrega realizada» y (2) la
 * sección «Se conversó y no se vendió» de cada handoff, y las agrupa por cliente con el módulo
 * puro (`./oportunidades.ts`).
 *
 * No pregunta «¿qué proyectos cuentan?» (lib/projects/scope.ts): lista lo que alguien ESCRIBIÓ.
 * Un proyecto ya cerrado sigue siendo una oportunidad —más todavía—, así que ningún criterio de
 * alcance aplica; lo único que se excluye son los proyectos internos de Smarteam.
 */
import { prisma } from "@/lib/db/prisma";
import { loadFueraDeAlcanceDeTodos } from "@/lib/canvas/load-canvas-context";
import { agruparPorCliente, recortarTexto, type OportunidadDetectada, type OportunidadesDeCliente } from "./oportunidades";

export async function cargarOportunidadesDetectadas(): Promise<OportunidadesDeCliente[]> {
  const [notas, handoffs, pedidos] = await Promise.all([
    /* La nota vive en la compuerta ENTREGA_REALIZADA (ProjectStageGate.note): «p.ej. sugerencia de
       cross-selling», dice el schema. Se escribe una vez al marcar y nadie la releía. */
    prisma.projectStageGate.findMany({
      where: { gate: "ENTREGA_REALIZADA", note: { not: null }, project: { proyectoInterno: false } },
      select: {
        note: true,
        markedAt: true,
        markedBy: true,
        project: { select: { id: true, name: true, clientId: true, client: { select: { name: true, company: true } } } },
      },
    }),
    loadFueraDeAlcanceDeTodos(),
    /* Los pedidos fuera de alcance que salieron en las REUNIONES (2026-10-02, lib/sessions/
       compromisos-y-alcance.ts). Solo los que siguen abiertos: lo descartado o lo que ya estaba
       incluido no es una oportunidad. */
    prisma.pedidoFueraDeAlcance.findMany({
      where: { estado: { in: ["PEDIDO", "COTIZADO"] } },
      select: {
        pedido: true,
        quienLoPidio: true,
        monto: true,
        createdAt: true,
        decididoPor: true,
        clientId: true,
        client: { select: { name: true, company: true } },
        project: { select: { id: true, name: true, proyectoInterno: true } },
      },
    }),
  ]);

  const items: OportunidadDetectada[] = [];
  for (const g of notas) {
    const texto = g.note?.trim();
    if (!texto || !g.project.clientId) continue;
    items.push({
      clientId: g.project.clientId,
      clientName: g.project.client?.name ?? g.project.client?.company ?? "",
      projectId: g.project.id,
      projectName: g.project.name,
      fuente: "entrega",
      texto: recortarTexto(texto),
      fecha: g.markedAt.toISOString(),
      autor: g.markedBy,
    });
  }
  for (const p of pedidos) {
    // Lo de un proyecto interno de Smarteam no es una oportunidad de venta (misma regla que arriba).
    if (p.project?.proyectoInterno) continue;
    const detalle = [p.quienLoPidio ? `Lo pidió: ${p.quienLoPidio}` : "", p.monto ? `Monto: ${p.monto}` : ""].filter(Boolean).join(" · ");
    items.push({
      clientId: p.clientId,
      clientName: p.client?.name ?? p.client?.company ?? "",
      projectId: p.project?.id ?? "",
      projectName: p.project?.name ?? "",
      fuente: "reunion",
      texto: recortarTexto(detalle ? `${p.pedido} (${detalle})` : p.pedido),
      fecha: p.createdAt.toISOString(),
      autor: p.decididoPor,
    });
  }
  for (const h of handoffs) {
    items.push({
      clientId: h.project.clientId,
      clientName: h.project.clientName,
      projectId: h.project.id,
      projectName: h.project.name,
      fuente: "handoff",
      texto: recortarTexto(h.texto),
      fecha: h.escritoEn?.toISOString() ?? null,
      autor: null,
    });
  }
  return agruparPorCliente(items);
}
