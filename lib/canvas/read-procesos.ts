/**
 * lib/canvas/read-procesos.ts
 *
 * Lectura de los diagramas de proceso (FLOWCHART) de un CLIENTE — viven en la sección
 * "procesos" del canvas "Información del cliente" (proyecto __strategy__), donde los
 * deja `sync-procesos-blocks.ts`. Lo consume el kickoff (interno: todos; externo: solo
 * CONFIRMED) para renderizarlos como sección "Procesos".
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { SENTINEL_SERVICE_TYPE as SENTINEL } from "@/lib/projects/kind";

export interface ProcesoFlowchart {
  id: string;
  title: string | null;
  /** { nodes, edges, description? } — shape de FlowchartViewer. */
  data: unknown;
  /** DRAFT | CONFIRMED. Lo usa el editor del kickoff para el botón "Confirmar para el cliente". */
  status?: string;
}

export async function readClientProcesos(
  clientId: string,
  opts: { onlyConfirmed?: boolean } = {},
): Promise<ProcesoFlowchart[]> {
  const strategy = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL },
    select: { id: true },
  });
  if (!strategy) return [];

  const blocks = await prisma.canvasBlock.findMany({
    where: {
      blockType: "FLOWCHART",
      ...(opts.onlyConfirmed ? { status: "CONFIRMED" } : {}),
      section: { key: "procesos", canvas: canvasOfNested("client-info", { projectId: strategy.id }) },
    },
    orderBy: { order: "asc" },
    select: { id: true, content: true, data: true, status: true },
  });

  // Solo flowcharts con nodos (descarta vacíos).
  return blocks
    .filter((b) => {
      const d = b.data as { nodes?: unknown[] } | null;
      return Array.isArray(d?.nodes) && (d!.nodes as unknown[]).length > 0;
    })
    .map((b) => ({ id: b.id, title: b.content, data: b.data, status: b.status }));
}

// ── Serialización para agentes ──────────────────────────────────────────────────

/** La parte de un nodo de flowchart que interesa para serializar. */
interface NodoLite {
  id?: string;
  type?: string;
  data?: { label?: string; sublabel?: string; detail?: string };
  // Shape alternativo (nodos viejos): label/detail al tope.
  label?: string;
  sublabel?: string;
  detail?: string;
}

interface EdgeLite {
  source?: string;
  target?: string;
  label?: string;
}

function textoDe(n: NodoLite): { label: string; sublabel: string; detail: string } {
  return {
    label: (n.data?.label ?? n.label ?? "").trim(),
    sublabel: (n.data?.sublabel ?? n.sublabel ?? "").trim(),
    detail: (n.data?.detail ?? n.detail ?? "").trim(),
  };
}

/**
 * Serializa los procesos REALES del cliente a texto legible por un agente.
 *
 * Existe porque el serializador genérico de canvas convierte un FLOWCHART en el
 * placeholder "(diagrama de flujo)" — correcto para no inflar prompts que no lo
 * necesitan, e inservible para el Diagnóstico y la Planificación, cuyo insumo central
 * es justamente lo que esos diagramas ya traen marcado:
 *
 *   · los nodos `pain` (⚠ dolor) — la fricción real detectada por proceso, y
 *   · el nodo `info` — fuente, responsables, herramientas y qué funciona/qué no.
 *
 * El resto se narra como recorrido (nodo → nodo), suficiente para que el agente
 * entienda el flujo sin reconstruir la geometría.
 */
export async function serializeProcesosForPrompt(
  clientId: string,
  opts: { onlyConfirmed?: boolean } = {},
): Promise<string> {
  const procesos = await readClientProcesos(clientId, opts);
  if (!procesos.length) return "";

  const bloques: string[] = [];
  for (const p of procesos) {
    const d = p.data as { nodes?: NodoLite[]; edges?: EdgeLite[]; description?: string } | null;
    const nodes = d?.nodes ?? [];
    const edges = d?.edges ?? [];
    const porId = new Map(nodes.map((n) => [n.id ?? "", n]));

    const lineas: string[] = [`### Proceso: ${p.title ?? "(sin título)"}`];
    if (d?.description?.trim()) lineas.push(d.description.trim());

    // Dolores y notas primero: son lo que el diagnóstico necesita.
    for (const n of nodes) {
      const t = textoDe(n);
      if (n.type === "pain" && t.label) {
        lineas.push(`⚠ DOLOR: ${[t.label, t.sublabel].filter(Boolean).join(" — ")}`);
      } else if ((n.type === "info" || n.type === "annotation") && (t.label || t.detail)) {
        lineas.push(`NOTA: ${[t.label, t.detail].filter(Boolean).join(" — ")}`);
      }
    }

    // El flujo, como recorrido de edges (legible sin geometría).
    const pasos: string[] = [];
    for (const e of edges) {
      const a = textoDe(porId.get(e.source ?? "") ?? {});
      const b = textoDe(porId.get(e.target ?? "") ?? {});
      if (!a.label || !b.label) continue;
      const etiqueta = e.label ? ` [${e.label}]` : "";
      pasos.push(`${a.label}${etiqueta} → ${b.label}`);
    }
    if (pasos.length) lineas.push("Flujo: " + pasos.join(" · "));
    bloques.push(lineas.join("\n"));
  }
  return bloques.join("\n\n");
}
