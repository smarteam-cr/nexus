/**
 * POST /api/projects/[projectId]/timeline/particularidades/[particularidadId]/resolve
 *
 * El CSE resuelve una SUGERENCIA del equipo técnico: la aprueba (con o sin editarla) o la
 * descarta. Es el ÚNICO lugar donde una sugerencia se vuelve una particularidad real — misma
 * invariante que el `apply` del agente: nada entra al cronograma sin que el CSE lo confirme.
 *
 * Body: { action: "approve" | "discard", ...campos editados (title/detail/kind/party/
 *         weeksImpact/occurredAt/phaseId/visibleExternal) }
 *
 * APPROVE  → `needsValidation: false` (recién ahí suma al corrimiento y puede salir al cliente),
 *            con los campos que el CSE haya corregido.
 * DISCARD  → borra la fila. Una sugerencia descartada no deja rastro a propósito: no es un hecho
 *            del proyecto, es una propuesta que no prosperó, y dejarla como fila muerta ensuciaría
 *            cualquier read futuro que olvide filtrar (justo el problema que esto viene a cerrar).
 *
 * La AUTORÍA DE QUIEN SUGIRIÓ se preserva: `createdByEmail` NO se pisa al aprobar. Quién aprobó
 * queda en el log de la app; quién detectó el hecho es el dato que importa para volver a preguntarle.
 *
 * Guarded con guardTimelineEdit: aprobar ES escribir en el cronograma. El que sugiere no aprueba.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { ParticularidadKind, TaskParty } from "@prisma/client";
import {
  parseTitle,
  parseOptionalText,
  parseParty,
  parseKind,
  parseWeeksImpact,
  parseOccurredAt,
  normalizeWeeksForKind,
  checkKindWeeksInvariant,
} from "@/lib/timeline/particularidad-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as {
    action?: unknown;
    kind?: unknown;
    party?: unknown;
    title?: unknown;
    detail?: unknown;
    weeksImpact?: unknown;
    occurredAt?: unknown;
    visibleExternal?: unknown;
    phaseId?: unknown;
  };

  if (body.action !== "approve" && body.action !== "discard") {
    return NextResponse.json({ error: 'action debe ser "approve" o "discard"' }, { status: 400 });
  }

  // Pertenencia: la sugerencia tiene que ser del cronograma de ESTE proyecto (si no, conociendo
  // un id se podría aprobar la sugerencia de otro cliente).
  const existing = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true, kind: true, party: true, weeksImpact: true, needsValidation: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "La sugerencia no existe en este proyecto" }, { status: 404 });
  }
  if (!existing.needsValidation) {
    // Ya resuelta (doble clic, dos pestañas). 409 y no 400: no es un body inválido, es un
    // conflicto de estado — y hacerlo explícito evita "aprobar" dos veces en silencio.
    return NextResponse.json(
      { error: "Esa particularidad ya está confirmada; no es una sugerencia pendiente." },
      { status: 409 },
    );
  }

  if (body.action === "discard") {
    await prisma.particularidad.delete({ where: { id: particularidadId } });
    return NextResponse.json({ ok: true, discarded: true });
  }

  // ── APPROVE (con las ediciones del CSE, todas opcionales) ────────────────────
  const data: {
    needsValidation: false;
    title?: string;
    detail?: string | null;
    kind?: ParticularidadKind;
    party?: TaskParty;
    weeksImpact?: number | null;
    occurredAt?: Date;
    visibleExternal?: boolean;
    phaseId?: string | null;
  } = { needsValidation: false };

  if (body.title !== undefined) {
    const t = parseTitle(body.title);
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
    data.title = t.value;
  }
  if (body.detail !== undefined) data.detail = parseOptionalText(body.detail);

  let kind = existing.kind;
  if (body.kind !== undefined) {
    const k = parseKind(body.kind);
    if (!k.ok) return NextResponse.json({ error: k.error }, { status: 400 });
    data.kind = k.value;
    kind = k.value;
  }
  if (body.party !== undefined) {
    const p = parseParty(body.party);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    data.party = p.value;
  }

  // El invariante kind↔weeks se revalida SIEMPRE contra el estado FINAL (kind editado o el que
  // ya tenía): aprobar un ATRASO sin semanas metería un corrimiento de 0 al cronograma.
  const weeksFinal =
    body.weeksImpact === undefined
      ? existing.weeksImpact
      : (() => {
          const w = parseWeeksImpact(body.weeksImpact);
          return w.ok ? w.value : undefined;
        })();
  if (weeksFinal === undefined) {
    return NextResponse.json({ error: "weeksImpact inválido" }, { status: 400 });
  }
  const weeksImpact = normalizeWeeksForKind(kind, weeksFinal);
  const invariant = checkKindWeeksInvariant(kind, weeksImpact);
  if (invariant) return NextResponse.json({ error: invariant }, { status: 400 });
  data.weeksImpact = weeksImpact;

  if (body.occurredAt !== undefined) {
    const o = parseOccurredAt(body.occurredAt);
    if (!o.ok) return NextResponse.json({ error: o.error }, { status: 400 });
    data.occurredAt = o.value;
  }
  if (body.visibleExternal !== undefined) data.visibleExternal = body.visibleExternal === true;

  if (body.phaseId !== undefined) {
    if (body.phaseId === null) {
      data.phaseId = null;
    } else {
      if (typeof body.phaseId !== "string" || !body.phaseId) {
        return NextResponse.json({ error: "phaseId debe ser un id o null" }, { status: 400 });
      }
      const phase = await prisma.timelinePhase.findFirst({
        where: { id: body.phaseId, timeline: { projectId } },
        select: { id: true },
      });
      if (!phase) {
        return NextResponse.json({ error: "La fase no pertenece a este cronograma" }, { status: 400 });
      }
      data.phaseId = phase.id;
    }
  }

  const updated = await prisma.particularidad.update({
    where: { id: particularidadId },
    data,
    select: {
      id: true,
      kind: true,
      party: true,
      title: true,
      detail: true,
      sourceQuote: true,
      weeksImpact: true,
      visibleExternal: true,
      needsValidation: true,
      source: true,
      createdByEmail: true,
      phaseId: true,
      occurredAt: true,
    },
  });

  return NextResponse.json({ ...updated, occurredAt: updated.occurredAt.toISOString() });
}
