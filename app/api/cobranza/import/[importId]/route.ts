/**
 * /api/cobranza/import/[importId] — un batch del importador CSV.
 *   GET    → batch + filas completas (reabrir el wizard donde quedó).
 *   PATCH  → {mapeo}: guarda el mapeo y REVALIDA todas las filas (Zod + dedup +
 *            skip-list + warnings "⚠ ") → batch EN_REVISION. Devuelve además
 *            avisoResolver: tokens del title-match que se volverían ambiguos si
 *            se crean los clientes nuevos del batch (aviso, no bloqueo).
 *   DELETE → marca el batch DESCARTADO (staging: no borra filas, queda rastro).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { importMapeoSchema } from "@/lib/cobranza/schema";
import { revalidarImport } from "@/lib/cobranza/import-server";

type Params = { params: Promise<{ importId: string }> };

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

async function loadBatch(importId: string) {
  return prisma.importacionCobranza.findUnique({
    where: { id: importId },
    include: { filas: { orderBy: { numFila: "asc" }, select: FILA_SELECT } },
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

  const batch = await loadBatch(importId);
  if (!batch) return NextResponse.json({ error: "El import no existe" }, { status: 404 });
  return NextResponse.json({ batch });
}

const patchSchema = z.object({ mapeo: importMapeoSchema });

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

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

  const existente = await prisma.importacionCobranza.findUnique({
    where: { id: importId },
    select: { estado: true },
  });
  if (!existente) return NextResponse.json({ error: "El import no existe" }, { status: 404 });
  if (existente.estado === "APLICADO" || existente.estado === "DESCARTADO") {
    return NextResponse.json(
      { error: `El import ya está ${existente.estado === "APLICADO" ? "aplicado" : "descartado"} — no se puede re-mapear.` },
      { status: 409 },
    );
  }

  const { avisoResolver } = await revalidarImport(importId, parsed.data.mapeo);
  const batch = await loadBatch(importId);
  return NextResponse.json({ batch, avisoResolver });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

  const existente = await prisma.importacionCobranza.findUnique({
    where: { id: importId },
    select: { estado: true },
  });
  if (!existente) return NextResponse.json({ error: "El import no existe" }, { status: 404 });
  if (existente.estado === "APLICADO") {
    return NextResponse.json(
      { error: "El import ya fue aplicado — no se puede descartar." },
      { status: 409 },
    );
  }

  await prisma.importacionCobranza.update({
    where: { id: importId },
    data: { estado: "DESCARTADO" },
  });
  return NextResponse.json({ ok: true });
}
