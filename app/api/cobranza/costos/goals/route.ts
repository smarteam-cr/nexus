/**
 * /api/cobranza/costos/goals — las metas de gerencia (Finanzas › Metas y bonos, 2026-11-13).
 *   POST { nombre, medida, objetivoUsd, desde, hasta, corteEn, premio, paraQuien, avanceManualUsd, avanceManualAl, nota }
 *     → crea una meta, firmada. La lee la página (lib/finanzas/metas-de-gerencia-server.ts).
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler. Vive bajo /costos para que el
 * escaneo estructural de lib/cobranza/costos-privacy.test.ts lo vigile.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { metaDeGerenciaSchema } from "@/lib/finanzas/metas-de-gerencia-esquema";
import { crearMetaDeGerencia } from "@/lib/finanzas/metas-de-gerencia-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, metaDeGerenciaSchema);
  if (data instanceof NextResponse) return data;
  try {
    const id = await crearMetaDeGerencia(data, guard.user.email);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return responderError(e, "goals");
  }
}
