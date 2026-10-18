/**
 * /api/integrations/gasto-ia/factura — anotar lo que facturó Anthropic en un mes (/integrations/gasto-ia › «Factura»).
 * Solo dirección (`guardCostosAccess`, el mismo gate de la pantalla). Una fila por mes: volver a anotar el mes lo
 * corrige. DELETE la borra (un dedazo). No escribe nada fuera de `FacturaDeAnthropic`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";

const FALTA_EL_SQL = "Falta correr scripts/sql/2026-10-18-gasto-de-ia.sql: la tabla de las facturas todavía no existe.";

const Anotar = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes va como AAAA-MM."),
  montoUsd: z.number().finite().min(0, "El monto no puede ser negativo.").max(1_000_000, "Ese monto no parece de un mes."),
  notas: z.string().trim().max(500).optional().nullable(),
});

const Borrar = z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Anotar.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: cuerpo.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const { mes, montoUsd, notas } = cuerpo.data;
  try {
    const f = await prisma.facturaDeAnthropic.upsert({
      where: { mes },
      create: { mes, montoUsd, notas: notas || null, anotadaPorEmail: guard.user.email },
      update: { montoUsd, notas: notas || null, anotadaPorEmail: guard.user.email },
      select: { mes: true, montoUsd: true },
    });
    return NextResponse.json({ ok: true, mes: f.mes, montoUsd: Number(f.montoUsd) });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Borrar.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "El mes va como AAAA-MM." }, { status: 400 });
  try {
    await prisma.facturaDeAnthropic.deleteMany({ where: { mes: cuerpo.data.mes } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}
