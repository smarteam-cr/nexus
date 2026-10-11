/**
 * lib/handoff/sugerencias-server.ts — corre «Buscar lo nuevo» sobre un handoff congelado (etapa 3b).
 *
 * Lo llama /analyze (app/api/clients/[id]/analyze) en modo «sugerir», después de comprobar que el handoff está
 * congelado y que llegó algo después (si no, responde 409 sin pagar la corrida). Las reglas —el pedido, la
 * verificación de las citas y el bloque— viven puras en lib/handoff/sugerencias.ts.
 *
 * Lee SOLO: lo que ya dice el handoff (sin las sugerencias que nadie revisó), las reuniones que alimentan el
 * handoff con fecha posterior al congelado (por el chokepoint de sesiones, `materialDesdeElCongelado`), las
 * fuentes manuales cargadas después, las exclusiones y las instrucciones del handoff. No lee HubSpot.
 *
 * Escribe SOLO bloques en borrador del agente, con la marca de sugerencia, y la salida de su corrida. Cada
 * corrida lee TODO lo posterior al congelado, así que sus sugerencias reemplazan a las que nadie revisó todavía
 * (las usadas ya son contenido, las retocadas a mano se quedan). Si no encontró nada, no borra nada.
 * Nunca llama a `persistTimelineFromAgentOutput`, ni toca etiquetas, `handoffGeneratedAt`, el resumen, los
 * resultados ni la ficha: lo guarda lib/handoff/congelado.test.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { geometriaDeBloque } from "@/lib/canvas/agent-output-doc";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { instruccionesDelDocumento } from "@/lib/contexto/material-del-documento";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { PASO_DE_LAS_SUGERENCIAS, whereCorridasDelAgente } from "@/lib/agents/historial-corridas";
import { componerExclusiones, exclusionDelSistema } from "./duenio";
import { materialDesdeElCongelado } from "./congelado-server";
import { llevaMarcaDeSugerencia } from "./congelado";
import {
  MAX_REUNIONES,
  bloqueDeSugerencia,
  descartadasDe,
  leerSugerencias,
  pedidoDeSugerencias,
  sugerenciaDelBloque,
  topePorFuente,
  type FuenteNueva,
  type SalidaDeSugerencias,
} from "./sugerencias";

export interface ResultadoDeSugerencias {
  canvasId: string | null;
  /** Cuántas sugerencias quedaron en el documento. */
  sugerencias: number;
  /** En cuántas secciones. */
  secciones: number;
  /** Las que el modelo propuso con una cita que no aparece en la reunión. */
  sinCita: number;
  motivo?: "sin-documento" | "sin-novedades";
}

export async function runSugerenciasDelHandoff(opts: {
  projectId: string;
  /** La corrida de /analyze, que nace con el paso `PASO_DE_LAS_SUGERENCIAS` (no cuenta como corrida del documento). */
  agentRunId: string | null;
  desde: Date;
}): Promise<ResultadoDeSugerencias> {
  const { projectId, agentRunId, desde } = opts;
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf("handoff") },
    select: { id: true, canvasSections: { orderBy: { order: "asc" }, select: { id: true, key: true, label: true } } },
  });
  if (!canvas) return { canvasId: null, sugerencias: 0, secciones: 0, sinCita: 0, motivo: "sin-documento" };

  const material = await materialDesdeElCongelado(projectId, desde);
  const reuniones = material.reuniones.slice(-MAX_REUNIONES);
  const manuales = material.fuentesManuales.slice(-4);
  if (reuniones.length === 0 && manuales.length === 0) {
    return { canvasId: canvas.id, sugerencias: 0, secciones: 0, sinCita: 0, motivo: "sin-novedades" };
  }

  // ── Las fuentes, cada una con su código ────────────────────────────────────
  const tope = topePorFuente(reuniones.length + manuales.length);
  const dominiosPropios = buildInternalDomainsSet(await getSessionCategories());
  const fuentes: FuenteNueva[] = [];
  for (const [i, s] of reuniones.entries()) {
    const texto = (await fetchTranscriptContent(s.id, s.title, { maxChars: tope }))?.trim() ?? "";
    if (!texto) continue;
    fuentes.push({
      codigo: `R${i + 1}`,
      tipo: "reunion",
      id: s.id,
      titulo: s.title || "(sin título)",
      fecha: new Date(s.date).toISOString(),
      sala: prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios)),
      texto,
    });
  }
  for (const [i, m] of manuales.entries()) {
    const texto = m.content.trim().slice(0, tope);
    if (!texto) continue;
    fuentes.push({
      codigo: `M${i + 1}`,
      tipo: "manual",
      id: m.id,
      titulo: m.title?.trim() || "Fuente manual",
      fecha: m.createdAt.toISOString(),
      sala: "",
      texto,
    });
  }
  if (fuentes.length === 0) {
    return { canvasId: canvas.id, sugerencias: 0, secciones: 0, sinCita: 0, motivo: "sin-novedades" };
  }

  // ── Lo demás que lee: el handoff congelado, las exclusiones, las instrucciones ──
  const [handoff, proyecto, handoffFila, delSistema, instrucciones, bloquesConMarca, corridasAnteriores] = await Promise.all([
    // Sin las sugerencias que nadie revisó: las reemplaza esta corrida (loadCanvasContext no las lee).
    loadHandoffContext(projectId, { onlyConfirmed: false }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, client: { select: { name: true, company: true } } } }),
    prisma.handoff.findUnique({ where: { projectId }, select: { contextExclusions: true } }),
    exclusionDelSistema(projectId),
    instruccionesDelDocumento(projectId, "handoff"),
    prisma.canvasBlock.findMany({ where: { section: { canvasId: canvas.id } }, select: { data: true } }),
    prisma.agentRun.findMany({
      where: {
        ...whereCorridasDelAgente(projectId, "handoff"),
        stepLabel: PASO_DE_LAS_SUGERENCIAS,
        status: "DONE",
        ...(agentRunId ? { id: { not: agentRunId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { output: true },
    }),
  ]);
  const vivas = bloquesConMarca.map((b) => sugerenciaDelBloque(b.data)?.cita).filter((c): c is string => !!c);
  const descartadas = descartadasDe(
    corridasAnteriores.map((r) => {
      try {
        return JSON.parse(r.output ?? "{}") as unknown;
      } catch {
        return null;
      }
    }),
    vivas,
  );

  const secciones = canvas.canvasSections.map((s) => ({ key: s.key, label: s.label }));
  const pedido = pedidoDeSugerencias({
    empresa: proyecto?.client?.company ?? proyecto?.client?.name ?? "la empresa",
    proyecto: proyecto?.name ?? "el proyecto",
    congeladoAt: desde.toISOString(),
    handoff,
    secciones,
    fuentes,
    exclusiones: componerExclusiones(delSistema, handoffFila?.contextExclusions),
    instrucciones,
    descartadas,
  });

  if (agentRunId) {
    prisma.agentRun.update({ where: { id: agentRunId }, data: { currentPhase: "Leyendo las reuniones nuevas…" } }).catch(() => {});
  }
  // El gasto queda a nombre de la corrida: /analyze envuelve esta llamada en `conContextoDeIA`.
  const respuesta = await anthropic.messages.create(pedido);
  const lectura = leerSugerencias(respuesta, { secciones, fuentes, descartadas });

  // ── Escribir: reemplazar las pendientes del agente por las nuevas ──────────
  const idDeSeccion = new Map(canvas.canvasSections.map((s) => [s.key, s.id]));
  const porSeccion = new Map<string, typeof lectura.verificadas>();
  for (const v of lectura.verificadas) {
    const lista = porSeccion.get(v.seccion) ?? [];
    lista.push(v);
    porSeccion.set(v.seccion, lista);
  }
  if (lectura.verificadas.length > 0) {
    await prisma.$transaction(async (tx) => {
      const pendientes = await tx.canvasBlock.findMany({
        where: { status: "DRAFT", source: "AGENT", section: { canvasId: canvas.id } },
        select: { id: true, data: true },
      });
      const aBorrar = pendientes.filter((b) => llevaMarcaDeSugerencia(b.data)).map((b) => b.id);
      if (aBorrar.length) await tx.canvasBlock.deleteMany({ where: { id: { in: aBorrar } } });
      for (const [key, lista] of porSeccion) {
        const sectionId = idDeSeccion.get(key);
        if (!sectionId) continue;
        const ultimo = await tx.canvasBlock.findFirst({ where: { sectionId }, orderBy: { order: "desc" }, select: { order: true } });
        const desdeOrden = (ultimo?.order ?? -1) + 1;
        const filas: Prisma.CanvasBlockCreateManyInput[] = lista.map((v, i) => {
          const b = bloqueDeSugerencia(v);
          const g = geometriaDeBloque({ type: "text", content: b.content });
          return {
            sectionId,
            blockType: "TEXT",
            content: b.content,
            data: b.data as unknown as Prisma.InputJsonValue,
            order: desdeOrden + i,
            colSpan: g.colSpan,
            rowSpan: g.rowSpan,
            source: "AGENT",
            status: "DRAFT",
            agentRunId: agentRunId ?? null,
          };
        });
        await tx.canvasBlock.createMany({ data: filas });
      }
    });
  }

  const salida: SalidaDeSugerencias = {
    modo: "sugerir",
    sectionCount: porSeccion.size,
    sugerencias: lectura.verificadas.map((v) => ({ seccion: v.seccion, texto: v.texto, cita: v.cita, fuente: v.fuente.codigo })),
    sinCita: lectura.sinCita,
    fuentes: fuentes.length,
  };
  if (agentRunId) {
    await prisma.agentRun
      .update({
        where: { id: agentRunId },
        data: {
          output: JSON.stringify(salida),
          sourceSessionIds: fuentes.filter((f) => f.tipo === "reunion").map((f) => f.id),
        },
      })
      .catch(() => {}); // la salida es rastro: si falla, las sugerencias ya están en el documento
  }
  return { canvasId: canvas.id, sugerencias: lectura.verificadas.length, secciones: porSeccion.size, sinCita: lectura.sinCita };
}
