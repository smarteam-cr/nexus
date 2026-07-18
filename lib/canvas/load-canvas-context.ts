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
import { extractFingerprint } from "@/lib/timeline/particularidad-identity";

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
 *
 * `includeKeys` (opcional): ALLOWLIST de keys de sección. Lo usa el agente del
 * KICKOFF para no ver las secciones INTERNAS del handoff (riesgos, "por qué
 * vendimos", acuerdos comerciales, estado interno) — el kickoff lo lee el CLIENTE.
 * Sin `includeKeys` el comportamiento es idéntico al de antes (todos los callers).
 */
export async function loadCanvasContext(
  projectId: string,
  canvasName: string,
  opts: { onlyConfirmed?: boolean; includeKeys?: readonly string[] } = {},
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
      key: true,
      label: true,
      blocks: {
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true, status: true },
      },
    },
  });

  const allow = opts.includeKeys ? new Set(opts.includeKeys) : null;
  const parts: string[] = [];
  for (const s of sections) {
    if (allow && !allow.has(s.key)) continue;
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
 *
 * `includeIds` (D.1): expone el id de cada fase + su activityType — lo usa el
 * agente de detalle de cronograma, que debe referenciar fases EXISTENTES por id
 * (no puede crear ni renombrar). El kickoff sigue llamando sin ids.
 *
 * `includeProgress` (D.2): además expone el ESTADO actual de cada fase y sus
 * tareas (con id + status) — lo usa el agente de avance para ver lo YA confirmado
 * (no re-proponerlo) y referenciar tareas por id. Implica `includeIds`.
 */
/** Forma mínima de una desviación ya registrada, para mostrarle al agente lo que no debe repetir. */
interface RegisteredParticularidad {
  kind: string;
  party: string;
  title: string;
  weeksImpact: number | null;
  occurredAt: Date;
  dedupeKey: string | null;
  visibleExternal: boolean;
}

export async function loadTimelineContext(
  projectId: string,
  opts: { includeIds?: boolean; includeProgress?: boolean } = {},
): Promise<string> {
  const withProgress = !!opts.includeProgress;
  const withIds = withProgress || !!opts.includeIds; // progress implica ids
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          durationWeeks: true,
          sessionCount: true,
          notes: true,
          activityType: true,
          status: true,
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: { id: true, title: true, status: true, weekIndex: true },
          },
        },
      },
      // Desviaciones YA registradas — solo para el modo avance (el agente que las propone). Sin esto
      // el agente es CIEGO a lo que ya registró y re-deriva el mismo hecho en cada corrida con otra
      // redacción, duplicando la fila y contando el corrimiento dos veces. Espeja lo que hace el
      // watchdog, que le pasa al modelo las alertas existentes CON su huella para que la reuse.
      ...(withProgress
        ? {
            particularidades: {
              orderBy: { occurredAt: "desc" as const },
              select: {
                kind: true, party: true, title: true, weeksImpact: true,
                occurredAt: true, dedupeKey: true, visibleExternal: true,
              },
            },
          }
        : {}),
    },
  });
  if (!tl || tl.phases.length === 0) return "";

  const header = withProgress
    ? "CRONOGRAMA CON AVANCE CONFIRMADO (fases y tareas con su id y estado — usá esos ids EXACTOS para proponer avance; NO re-propongas lo que ya está DONE):"
    : withIds
    ? "CRONOGRAMA (fases en orden, cada una con su id — usá esos ids EXACTOS en tu output):"
    : "CRONOGRAMA (fases en orden — contexto de solo lectura, NO lo reproduzcas como lista en tu output):";
  const lines: string[] = [header];
  tl.phases.forEach((p, i) => {
    const bits = [`${i + 1}. ${p.name}`];
    if (p.durationWeeks) bits.push(`${p.durationWeeks} sem`);
    if (p.sessionCount) bits.push(`${p.sessionCount} sesiones`);
    if (withIds) bits.push(`tipo: ${p.activityType ?? "(sin asignar)"}`);
    if (withProgress) bits.push(`estado: ${p.status}`);
    let line = bits.join(" · ");
    if (withIds) line = `[id: ${p.id}] ${line}`;
    if (p.notes?.trim()) line += ` — ${p.notes.trim()}`;
    lines.push(line);
    if (withProgress) {
      for (const t of p.tasks) {
        lines.push(`   - [tarea id: ${t.id}] (sem ${t.weekIndex + 1}, ${t.status}) ${t.title}`);
      }
    }
  });

  // Bloque de desviaciones ya registradas, con su HUELLA. Es lo que permite que la instrucción
  // "no repitas lo ya registrado" sea cumplible: el agente ve el hecho y la clave con que quedó.
  const yaRegistradas = withProgress ? (tl as { particularidades?: RegisteredParticularidad[] }).particularidades ?? [] : [];
  if (yaRegistradas.length > 0) {
    lines.push("");
    lines.push(
      "DESVIACIONES YA REGISTRADAS (NO las vuelvas a proponer). Si el MISMO hecho sigue vigente y querés" +
        " corregirlo, devolvelo con su MISMA huella y se actualiza en lugar de duplicarse:",
    );
    for (const pt of yaRegistradas) {
      const huella = extractFingerprint(pt.dedupeKey) ?? "(sin huella)";
      const sem = pt.weeksImpact ? ` +${pt.weeksImpact}sem` : "";
      lines.push(
        `- [huella: ${huella}] ${pt.kind}/${pt.party}${sem} (${pt.occurredAt.toISOString().slice(0, 10)}) ${pt.title}`,
      );
    }
  }
  return lines.join("\n");
}
