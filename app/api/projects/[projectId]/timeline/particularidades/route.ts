/**
 * POST /api/projects/[projectId]/timeline/particularidades
 *
 * Crea un AVISO/particularidad A MANO (el CSE lo escribe). Es la otra mitad del diseño que ya
 * documentaba `docs/DECISIONS.md` ("el CSE las crea a mano o acepta una propuesta del agente"):
 * hasta ahora solo existía la mitad del agente (particularidades/apply).
 *
 * Diferencias con el apply (que crea las propuestas del agente):
 *   - `source: "HUMAN"` y `dedupeKey: null` — sin identidad de agente. Es lo que además evita que
 *     una corrida futura del agente lo absorba o le pise el texto.
 *   - `visibleExternal` por defecto TRUE: un aviso manual se escribe PARA el cliente (el CSE lo
 *     puede ocultar con el interruptor). Las propuestas del agente siguen naciendo ocultas.
 *   - El contenido viene del body (no de un borrador en DB).
 *
 * Ojo: como toda la vista del cliente, el aviso llega recién con «Subir al cliente» (el snapshot
 * publicado se re-congela ahí). Guarded con guardTimelineEdit (el CSE lo tiene por defecto).
 *
 * MODO SUGERENCIA (`{ suggest: true }`): el equipo técnico PROPONE un hecho desde el canvas
 * Desarrollo sin poder tocar el cronograma. Cambia tres cosas y ninguna más:
 *   - el guard pasa a ser `cronograma.suggest` (no `write`) — sugerir ≠ escribir;
 *   - nace con `needsValidation: true` → NINGÚN read la cuenta como desviación real
 *     (ni el corrimiento de semanas, ni la lista del CSE, ni la vista del cliente);
 *   - `visibleExternal` se fuerza a false — una propuesta sin revisar no se le muestra al cliente.
 * Se vuelve real cuando el CSE la aprueba en `particularidades/[id]/resolve`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
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
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  // El body se lee ANTES del guard porque `suggest` decide CUÁL guard aplica.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as {
    kind?: unknown;
    party?: unknown;
    title?: unknown;
    detail?: unknown;
    sourceQuote?: unknown;
    weeksImpact?: unknown;
    occurredAt?: unknown;
    visibleExternal?: unknown;
    phaseId?: unknown;
    suggest?: unknown;
  };
  const esSugerencia = body.suggest === true;

  // Sugerir exige `cronograma.suggest`; registrar de verdad exige la edición del cronograma.
  // En los dos casos se valida PRIMERO el acceso al cliente del proyecto: la matriz de permisos
  // y el row-level son ortogonales (ARCHITECTURE §4.2) — tener la celda no da acceso a un
  // cliente ajeno con solo conocer el projectId.
  let email: string | null;
  if (esSugerencia) {
    const access = await guardAccessToProject(projectId);
    if (access instanceof NextResponse) return access;
    const perm = await guardPermission("cronograma", "suggest");
    if (perm instanceof NextResponse) return perm;
    email = perm.user.email ?? null;
  } else {
    const guard = await guardTimelineEdit(projectId);
    if (guard instanceof NextResponse) return guard;
    email = guard.user.email ?? null;
  }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!tl) {
    return NextResponse.json({ error: "Este proyecto no tiene cronograma todavía" }, { status: 400 });
  }

  const title = parseTitle(body.title);
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  const kind = parseKind(body.kind);
  if (!kind.ok) return NextResponse.json({ error: kind.error }, { status: 400 });

  // party = quién CAUSÓ el hecho. Un aviso libre suele ser de Smarteam; se puede cambiar.
  const party = parseParty(body.party ?? "SMARTEAM");
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 });

  const weeksRaw = body.weeksImpact === undefined ? { ok: true as const, value: null } : parseWeeksImpact(body.weeksImpact);
  if (!weeksRaw.ok) return NextResponse.json({ error: weeksRaw.error }, { status: 400 });
  const weeksImpact = normalizeWeeksForKind(kind.value, weeksRaw.value);

  const invariant = checkKindWeeksInvariant(kind.value, weeksImpact);
  if (invariant) return NextResponse.json({ error: invariant }, { status: 400 });

  // Una particularidad es un hecho FECHADO; si no mandan fecha, es "ahora".
  const occurred = body.occurredAt === undefined ? { ok: true as const, value: new Date() } : parseOccurredAt(body.occurredAt);
  if (!occurred.ok) return NextResponse.json({ error: occurred.error }, { status: 400 });

  // Ancla opcional a una fase — debe ser de ESTE cronograma.
  let phaseId: string | null = null;
  if (body.phaseId !== undefined && body.phaseId !== null) {
    if (typeof body.phaseId !== "string" || !body.phaseId) {
      return NextResponse.json({ error: "phaseId debe ser un id o null" }, { status: 400 });
    }
    const phase = await prisma.timelinePhase.findFirst({
      where: { id: body.phaseId, timelineId: tl.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "La fase no pertenece a este cronograma" }, { status: 400 });
    phaseId = phase.id;
  }

  const created = await prisma.particularidad.create({
    data: {
      timelineId: tl.id,
      phaseId,
      kind: kind.value,
      party: party.value,
      title: title.value,
      detail: parseOptionalText(body.detail),
      sourceQuote: parseOptionalText(body.sourceQuote),
      weeksImpact,
      occurredAt: occurred.value,
      // Un aviso del CSE nace VISIBLE (lo escribe PARA el cliente); una SUGERENCIA nace
      // oculta sin excepción — todavía no la revisó nadie.
      visibleExternal: esSugerencia
        ? false
        : body.visibleExternal === undefined
        ? true
        : body.visibleExternal === true,
      source: "HUMAN",
      dedupeKey: null, // sin identidad de agente → el apply no lo absorbe
      // LA marca que la mantiene fuera de todo conteo hasta que el CSE la apruebe.
      needsValidation: esSugerencia,
      createdByEmail: email,
    },
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
      phaseId: true,
      occurredAt: true,
      source: true,
    },
  });

  return NextResponse.json({ ...created, occurredAt: created.occurredAt.toISOString() });
}
