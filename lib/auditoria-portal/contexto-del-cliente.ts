/**
 * lib/auditoria-portal/contexto-del-cliente.ts — LO QUE NEXUS YA SABE DE LA OPERACIÓN DEL CLIENTE.
 * SERVIDOR.
 *
 * Una auditoría de reimplementación lee el portal tal como lo dejó el partner anterior. Para que el
 * análisis diga si eso sirve, hace falta lo que se sabe del cliente por otro lado: qué se vendió
 * (el resumen del handoff), cómo opera hoy (el Diagnóstico), qué se acordó construir (la
 * Planificación: procesos, ciclo de vida, pipelines y automatizaciones) y sus procesos
 * (Información del cliente). Se congela en la foto al leer el portal.
 *
 * ⛔ Solo de los proyectos del MISMO cliente de la auditoría (invariante 1: nunca se mezcla contexto
 * entre clientes). No lee reuniones: lo que viene de reuniones ya está resumido en esos documentos,
 * y las reuniones solo se leen por el chokepoint de sesiones.
 */
import { prisma } from "@/lib/db/prisma";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { adoptarPipelines } from "@/lib/planificacion/secciones";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import type { ContextoDelCliente } from "./cruces";

/** Tope del texto para el análisis: el portal es lo que se audita; esto es contexto. */
const TOPE_TOTAL = 9000;
const TOPE_POR_PARTE = 3000;

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

/** `null` si el cliente no tiene ningún documento con contenido. */
export async function leerContextoDelCliente(clientId: string): Promise<ContextoDelCliente | null> {
  const proyectos = await prisma.project.findMany({
    // Los mismos proyectos que un agente ve como contexto del cliente (lib/projects/scope.ts).
    where: proyectoClasificableWhere({ clientId }),
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, name: true, handoffResumen: true },
  });

  const fuentes: ContextoDelCliente["fuentes"] = [];
  const partes: string[] = [];
  const sumar = (documento: string, proyecto: string, texto: string) => {
    const t = texto.trim();
    if (!t) return;
    fuentes.push({ documento, proyecto });
    partes.push(`[${documento} · ${proyecto}]\n${recortar(t, TOPE_POR_PARTE)}`);
  };

  // De cada documento, el del proyecto más reciente que lo tenga.
  const conResumen = proyectos.find((p) => p.handoffResumen?.trim());
  if (conResumen) sumar("Qué se vendió", conResumen.name, conResumen.handoffResumen ?? "");

  for (const p of proyectos) {
    const t = await loadCanvasContext(p.id, "diagnosis", {
      includeKeys: ["situacion_actual", "estado_actual", "equipos_licencias", "gap_analysis", "causa_raiz"],
      soloVisibles: true,
    });
    if (t.trim()) {
      sumar("Diagnóstico (cómo opera hoy)", p.name, t);
      break;
    }
  }

  let pipelinesPlaneados: ContextoDelCliente["pipelinesPlaneados"] = [];
  for (const p of proyectos) {
    const t = await loadCanvasContext(p.id, "planning", {
      includeKeys: ["definicion_procesos", "ciclo_vida_crm", "pipelines", "automatizaciones"],
      soloVisibles: true,
    });
    if (!t.trim()) continue;
    sumar("Planificación (lo que se va a construir)", p.name, t);
    pipelinesPlaneados = await pipelinesDeLaPlanificacion(p.id);
    break;
  }

  // Los procesos del cliente (diagramas de «Información del cliente»), con sus dolores marcados.
  sumar("Información del cliente (procesos)", "la cuenta", await serializeProcesosForPrompt(clientId));

  if (!fuentes.length) return null;
  return { fuentes, pipelinesPlaneados, texto: recortar(partes.join("\n\n"), TOPE_TOTAL) };
}

async function pipelinesDeLaPlanificacion(projectId: string): Promise<ContextoDelCliente["pipelinesPlaneados"]> {
  // Por el slug de la pieza, como `loadCanvasContext` arriba: el nombre visible se puede cambiar.
  const canvas = await prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("planning") }, select: { id: true } });
  if (!canvas) return [];
  const seccion = await prisma.canvasSection.findFirst({
    where: { canvasId: canvas.id, key: "pipelines" },
    select: { blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  const data = seccion?.blocks[0]?.data;
  if (!data || typeof data !== "object") return [];
  return adoptarPipelines(data).pipelines
    .map((p) => ({ nombre: p.nombre, tipo: p.tipo, etapas: p.etapas.map((e) => e.etapa?.trim() ?? "").filter(Boolean) }))
    .filter((p) => p.nombre.trim());
}
