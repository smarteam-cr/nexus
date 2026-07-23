/**
 * POST /api/projects/[projectId]/timeline/particularidades/apply
 *
 * Aplica las PARTICULARIDADES que el CSE aceptó del borrador (pendingParticularidades). Es el
 * ÚNICO lugar donde una particularidad propuesta por el agente se vuelve un registro real
 * (invariante: nada se crea sin que el CSE apruebe). Espejo del patrón progress/apply, pero
 * para un modelo aparte (Particularidad), con apply SEPARADO: aceptar avance ≠ aceptar desviaciones.
 *
 * Body = subconjunto ACEPTADO por el CSE, por ÍNDICE del borrador (el CONTENIDO viene del
 * borrador en DB, no del cliente — el cliente solo elige cuáles crear y su visibilidad):
 *   { accepted: Array<{ index: number, visibleExternal?: boolean }> }
 *
 * En una transacción: crea una Particularidad por índice aceptado (source=AGENT,
 * needsValidation=false al confirmar, createdByEmail = quien aplica) y LIMPIA el borrador
 * entero (aceptar es "resolví esta tanda"; lo no aceptado se descarta con el borrador).
 *
 * Guarded con guardTimelineEdit (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma, type ParticularidadKind, type TaskParty } from "@prisma/client";
import type { PendingParticularidad } from "../../route";
import { buildDedupeKey, normalizeFingerprint } from "@/lib/timeline/particularidad-identity";

// SOLICITUD deprecado (eje DESTINO): un insumo del cliente es una tarea party=CLIENTE, no una
// particularidad. El agente ya no lo propone; no se admite crear ninguno nuevo.
const VALID_KINDS = new Set(["ATRASO", "COMPROMISO"]);
const VALID_PARTIES = new Set(["CLIENTE", "SMARTEAM", "AMBOS", "DEV"]);

const STOP = new Set(["para", "que", "con", "los", "las", "del", "una", "por", "sobre", "entre", "como", "sus", "este", "esta"]);

/** Tokens significativos de un título (minúsculas, sin acentos, ≥4 chars, sin stopwords). */
function titleTokens(s: string): Set<string> {
  const norm = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/gi, " ");
  return new Set(norm.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as { accepted?: unknown };
  const acceptedRaw = Array.isArray(body.accepted) ? body.accepted : [];
  // Mapa índice → visibleExternal (último gana si se repite). Solo índices enteros ≥0.
  const visByIndex = new Map<number, boolean>();
  for (const a of acceptedRaw) {
    const o = (a ?? {}) as { index?: unknown; visibleExternal?: unknown };
    if (typeof o.index === "number" && Number.isInteger(o.index) && o.index >= 0) {
      visByIndex.set(o.index, o.visibleExternal === true);
    }
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, pendingParticularidades: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });

  const draft = (tl.pendingParticularidades as PendingParticularidad[] | null) ?? [];
  if (draft.length === 0) {
    return NextResponse.json({ error: "No hay particularidades propuestas por aplicar." }, { status: 400 });
  }

  // Construir las filas a crear desde el BORRADOR (source de verdad del contenido), solo para
  // los índices aceptados que resuelven a una particularidad válida. Re-validamos kind/party por
  // si el borrador quedó de una versión vieja o corrupto (defensa en profundidad).
  // Las que YA existen, para resolver identidad. `dedupeKey` es la vía canónica; los títulos son el
  // fallback para las filas LEGACY (creadas antes de que existiera la huella, que tienen dedupeKey null).
  const existentes = await prisma.particularidad.findMany({
    where: { timelineId: tl.id },
    select: { id: true, dedupeKey: true, title: true, phaseId: true, source: true },
  });
  const porHuella = new Map(existentes.filter((e) => e.dedupeKey).map((e) => [e.dedupeKey as string, e]));

  const toCreate: Prisma.ParticularidadCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.ParticularidadUpdateInput }> = [];

  for (const [index, visibleExternal] of visByIndex) {
    const d = draft[index];
    if (!d) continue;
    if (!VALID_KINDS.has(d.kind) || !VALID_PARTIES.has(d.party) || !d.title) continue;
    const weeksImpact =
      typeof d.weeksImpact === "number" && Number.isFinite(d.weeksImpact) && d.weeksImpact > 0
        ? Math.round(d.weeksImpact)
        : null;
    // Invariante del eje DESTINO: un ATRASO es un corrimiento cuantificado — sin weeksImpact ≥1 no
    // se crea (defensa en profundidad; el borrador ya no debería traerlo, pero un draft viejo podría).
    if (d.kind === "ATRASO" && weeksImpact === null) continue;
    // occurredAt propuesto (fecha de la sesión del hecho): se persiste si es parseable; si no, se
    // omite y la columna cae a su default now().
    const occTs = typeof d.occurredAt === "string" ? Date.parse(d.occurredAt) : NaN;
    const occurredAt = Number.isNaN(occTs) ? undefined : new Date(occTs);
    const sourceQuote = typeof d.sourceQuote === "string" && d.sourceQuote.trim() ? d.sourceQuote.trim() : null;
    const dedupeKey = buildDedupeKey(tl.id, d.kind, normalizeFingerprint(d.fingerprint, d.title));

    // ¿Ya existe este HECHO? 1) por huella exacta. 2) por título parecido, para absorber las filas
    // legacy sin huella (si no, el mismo atraso queda dos veces y el corrimiento se cuenta doble).
    let match = porHuella.get(dedupeKey) ?? null;
    if (!match) {
      const t = titleTokens(d.title);
      for (const e of existentes) {
        if (e.dedupeKey) continue; // las que ya tienen huella se resuelven arriba, no por texto
        // Los avisos ESCRITOS POR EL CSE (source=HUMAN, sin huella) NO se absorben por parecido de
        // título: son texto propio, no una detección legacy del agente. Absorberlos le pisaba el
        // contenido al humano y le adoptaba una huella de agente.
        if (e.source === "HUMAN") continue;
        if (d.phaseId && e.phaseId && d.phaseId !== e.phaseId) continue;
        if ([...titleTokens(e.title)].filter((w) => t.has(w)).length >= 2) { match = e; break; }
      }
    }

    const contenido = {
      phaseId: d.phaseId ?? null,
      kind: d.kind as ParticularidadKind,
      party: d.party as TaskParty,
      title: d.title,
      detail: d.detail ?? null,
      sourceQuote,
      weeksImpact,
      ...(occurredAt ? { occurredAt } : {}),
      visibleExternal,
    };

    if (match) {
      // MISMO hecho re-detectado → se actualiza y se cuenta la repetición. Las semanas quedan en la
      // última confirmada, NO se suman: sumar era exactamente el bug (13 semanas mostradas, 8 reales).
      toUpdate.push({
        id: match.id,
        data: {
          ...contenido,
          dedupeKey, // backfill: la fila legacy adopta la huella y desde ahora dedupea por ella
          occurrences: { increment: 1 },
          lastDetectedAt: new Date(),
          needsValidation: false,
        },
      });
      porHuella.set(dedupeKey, { ...match, dedupeKey });
    } else {
      toCreate.push({
        timelineId: tl.id,
        ...contenido,
        dedupeKey,
        source: "AGENT",
        needsValidation: false, // el CSE lo confirmó en el banner
        createdByEmail: guard.user.email ?? null,
      });
    }
  }

  let created = 0;
  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      const r = await tx.particularidad.createMany({ data: toCreate });
      created = r.count;
    }
    for (const u of toUpdate) {
      await tx.particularidad.update({ where: { id: u.id }, data: u.data });
    }
    // Aceptar esta tanda LIMPIA el borrador entero: lo no aceptado se descarta junto con él.
    await tx.projectTimeline.update({
      where: { id: tl.id },
      data: { pendingParticularidades: Prisma.DbNull, pendingParticularidadesRunId: null },
    });
  });

  return NextResponse.json({ applied: true, created, updated: toUpdate.length });
}

// DELETE → descartar el borrador de particularidades sin crear nada (botón "Descartar").
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });

  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingParticularidades: Prisma.DbNull, pendingParticularidadesRunId: null },
  });
  return NextResponse.json({ discarded: true });
}
