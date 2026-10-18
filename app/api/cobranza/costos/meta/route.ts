/**
 * /api/cobranza/costos/meta — la meta de facturación del año (iniciativa C de docs/roadmap.md).
 *   GET → lo facturado de cada año, la meta vigente y de qué está hecha la línea de «por facturar».
 *   POST { anio, montoUsd, nota? } → define la meta de ese año: una fila nueva, firmada (append-only).
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler. Vive bajo /costos para que el
 * escaneo estructural de lib/cobranza/costos-privacy.test.ts lo vigile.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { crDateParts } from "@/lib/jobs/time";
import { cargarMetaYPorFacturar, guardarMeta } from "@/lib/finanzas/meta-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

const metaSchema = z.object({
  anio: z.number().int().min(2020).max(2100),
  montoUsd: z.number().positive().max(1_000_000_000),
  nota: z.string().trim().max(1000).nullable().optional(),
});

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ meta: await cargarMetaYPorFacturar(crDateParts(new Date()).dateKey) });
}

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, metaSchema);
  if (data instanceof NextResponse) return data;
  try {
    await guardarMeta(data.anio, Math.round(data.montoUsd * 100) / 100, data.nota?.trim() || null, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "meta");
  }
}
