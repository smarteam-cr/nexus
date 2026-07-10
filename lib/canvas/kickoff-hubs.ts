/**
 * lib/canvas/kickoff-hubs.ts
 *
 * Auto-poblado de las SESIONES de la sección "horarios" del Kickoff desde los HUBS
 * detectados por el handoff (product tags del proyecto: Marketing Hub, Sales Hub, …).
 * El CSE solo asigna la franja a cada sesión (drag); las sesiones ya vienen puestas.
 *
 * Best-effort e IDEMPOTENTE: agrega una sesión por hub que no exista todavía
 * (match por label, case-insensitive), preservando las sesiones y asignaciones
 * (`optionId`) ya existentes. No borra nada.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { productTags, labelForTag, sanitizeTags } from "@/lib/tags/catalog";

interface Session {
  id: string;
  label: string;
  optionId: string | null;
}

function sessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function syncHorariosSessionsFromHubs(canvasId: string, tags: string[] | null | undefined): Promise<void> {
  try {
    const productSlugs = new Set(productTags().map((p) => p.slug));
    const hubLabels = sanitizeTags(tags ?? []).filter((s) => productSlugs.has(s)).map(labelForTag);
    if (!hubLabels.length) return;

    const section = await prisma.canvasSection.findFirst({
      where: { canvasId, key: "horarios" },
      select: { blocks: { where: { blockType: "CARD" }, select: { id: true, data: true }, take: 1 } },
    });
    const block = section?.blocks[0];
    if (!block) return;

    const data = (block.data ?? {}) as { intro?: string; options?: unknown[]; sessions?: Session[] };
    const sessions: Session[] = Array.isArray(data.sessions)
      ? data.sessions.filter((s): s is Session => !!s && typeof s.id === "string")
      : [];
    const existing = new Set(sessions.map((s) => (s.label ?? "").trim().toLowerCase()));
    const toAdd = hubLabels
      .filter((l) => !existing.has(l.toLowerCase()))
      .map((l) => ({ id: sessionId(), label: l, optionId: null }));
    if (!toAdd.length) return;

    const newData = {
      intro: typeof data.intro === "string" ? data.intro : "",
      options: Array.isArray(data.options) ? data.options : [],
      sessions: [...sessions, ...toAdd],
    };
    await prisma.canvasBlock.update({
      where: { id: block.id },
      data: { data: newData as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    console.error("[kickoff-hubs] sync sesiones falló:", e instanceof Error ? e.message : e);
  }
}
