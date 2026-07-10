/**
 * /api/cobranza/import/[importId]/filas/[filaId] — una fila de la cola de revisión.
 *   PATCH → {canonico}: edición inline (partial del canónico) — mergea, REVALIDA
 *           la fila completa (Zod + skip-list + warnings) y corre su dedup fresco.
 *         → {estado: "OMITIDA"}: omitir la fila del apply.
 *         → {estado: "REVISAR"}: des-omitir — re-evalúa (vuelve VALIDA si pasa).
 * Devuelve la fila fresca. Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { importFilaCanonicaSchema } from "@/lib/cobranza/schema";
import { buildDedupIndices, evaluarCanonico, filaUpdateData } from "@/lib/cobranza/import-server";

type Params = { params: Promise<{ importId: string; filaId: string }> };

const FILA_SELECT = {
  id: true,
  numFila: true,
  raw: true,
  canonico: true,
  estado: true,
  errores: true,
  dedup: true,
  idExterno: true,
  aplicadoClientId: true,
} as const;

const patchSchema = z
  .object({
    canonico: importFilaCanonicaSchema.partial().optional(),
    estado: z.enum(["OMITIDA", "REVISAR"]).optional(),
  })
  .refine((v) => (v.canonico !== undefined) !== (v.estado !== undefined), {
    message: "Mandá canonico O estado, uno de los dos.",
  });

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId, filaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  const fila = await prisma.importacionFila.findUnique({
    where: { id: filaId },
    include: { import: { select: { id: true, estado: true } } },
  });
  if (!fila || fila.import.id !== importId) {
    return NextResponse.json({ error: "La fila no existe en este import" }, { status: 404 });
  }
  if (fila.import.estado === "APLICADO" || fila.import.estado === "DESCARTADO") {
    return NextResponse.json({ error: "El import ya está cerrado — no se editan filas." }, { status: 409 });
  }
  if (fila.estado === "APLICADA") {
    return NextResponse.json({ error: "La fila ya fue aplicada — no se edita." }, { status: 409 });
  }

  // Omitir: la persona la saca del apply sin tocar el canónico.
  if (parsed.data.estado === "OMITIDA") {
    const actualizada = await prisma.importacionFila.update({
      where: { id: filaId },
      data: { estado: "OMITIDA" },
      select: FILA_SELECT,
    });
    return NextResponse.json({ fila: actualizada });
  }

  // Des-omitir o edición inline: re-evaluar la fila completa con dedup fresco.
  const base = (fila.canonico ?? {}) as Record<string, unknown>;
  const canonico = parsed.data.canonico ? { ...base, ...parsed.data.canonico } : base;
  const idx = await buildDedupIndices();
  const ev = evaluarCanonico(canonico, idx);
  const actualizada = await prisma.importacionFila.update({
    where: { id: filaId },
    data: filaUpdateData(canonico, ev),
    select: FILA_SELECT,
  });
  return NextResponse.json({ fila: actualizada });
}
