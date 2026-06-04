/**
 * lib/canvas/load-canvas-context.ts
 *
 * Serializa un canvas de proyecto (CanvasSection + CanvasBlock) a texto markdown
 * para inyectarlo como CONTEXTO en el prompt de un agente. Mismo espíritu que el
 * `projectCanvasText` de analyze/route.ts (que serializa ClientContextCard), pero
 * sobre CanvasBlock — el primer consumidor es el agente de Kickoff, que lee los
 * bloques CONFIRMED del canvas "Handoff".
 *
 * También expone loadTimelineContext: serializa ProjectTimeline + TimelinePhase a
 * texto de solo-lectura (el agente NO regenera el cronograma; la plantilla lo pinta
 * directo desde ProjectTimeline).
 */
import { prisma } from "@/lib/db/prisma";

interface BlockLite {
  blockType: string;
  content: string | null;
  data: unknown;
  status: string;
}

function blockToText(b: BlockLite): string {
  const data = (b.data ?? {}) as Record<string, unknown>;
  switch (b.blockType) {
    case "HEADING":
      return `## ${(b.content ?? "").trim()}`.trim();
    case "TABLE": {
      const headers = Array.isArray(data.headers) ? (data.headers as string[]) : [];
      const rows = Array.isArray(data.rows) ? (data.rows as string[][]) : [];
      if (!headers.length && !rows.length) return (b.content ?? "").trim();
      const lines: string[] = [];
      if (headers.length) lines.push(headers.join(" | "));
      for (const r of rows) lines.push((r ?? []).join(" | "));
      return lines.join("\n");
    }
    case "METRIC": {
      const label = typeof data.label === "string" ? data.label : "";
      const value = typeof data.value === "string" ? data.value : "";
      const comparison = typeof data.comparison === "string" ? data.comparison : "";
      const main = label && value ? `${label}: ${value}` : (b.content ?? "");
      return [main, comparison].filter(Boolean).join(" ").trim();
    }
    case "CALLOUT": {
      const title = typeof data.title === "string" ? data.title : "";
      return [title, b.content ?? ""].filter(Boolean).join(": ").trim();
    }
    case "FLOWCHART":
      return "(diagrama de flujo)";
    case "CHART":
      return "(gráfico)";
    case "IMAGE":
      return "(imagen)";
    default: // TEXT, CARD
      return (b.content ?? "").trim();
  }
}

/**
 * Lee un canvas por (projectId, name) y lo serializa a markdown agrupado por
 * sección. Si `onlyConfirmed`, solo incluye bloques con status CONFIRMED.
 * Devuelve "" si el canvas no existe o no tiene bloques que incluir.
 */
export async function loadCanvasContext(
  projectId: string,
  canvasName: string,
  opts: { onlyConfirmed?: boolean } = {},
): Promise<string> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: canvasName },
    select: { id: true },
  });
  if (!canvas) return "";

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      label: true,
      blocks: {
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true, status: true },
      },
    },
  });

  const parts: string[] = [];
  for (const s of sections) {
    const blocks = opts.onlyConfirmed
      ? s.blocks.filter((b) => b.status === "CONFIRMED")
      : s.blocks;
    const texts = blocks.map(blockToText).map((t) => t.trim()).filter(Boolean);
    if (texts.length === 0) continue;
    parts.push(`[Sección: ${s.label}]\n${texts.join("\n\n")}`);
  }
  return parts.join("\n\n");
}

/**
 * Serializa el cronograma (ProjectTimeline + fases) a texto de solo-lectura.
 * Devuelve "" si no hay timeline o no tiene fases.
 */
export async function loadTimelineContext(projectId: string): Promise<string> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      phases: {
        orderBy: { order: "asc" },
        select: { name: true, durationWeeks: true, sessionCount: true, notes: true },
      },
    },
  });
  if (!tl || tl.phases.length === 0) return "";

  const lines: string[] = [
    "CRONOGRAMA (fases en orden — contexto de solo lectura, NO lo reproduzcas como lista en tu output):",
  ];
  tl.phases.forEach((p, i) => {
    const bits = [`${i + 1}. ${p.name}`];
    if (p.durationWeeks) bits.push(`${p.durationWeeks} sem`);
    if (p.sessionCount) bits.push(`${p.sessionCount} sesiones`);
    let line = bits.join(" · ");
    if (p.notes?.trim()) line += ` — ${p.notes.trim()}`;
    lines.push(line);
  });
  return lines.join("\n");
}
