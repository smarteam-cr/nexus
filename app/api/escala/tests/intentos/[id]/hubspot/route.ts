/**
 * POST /api/escala/tests/intentos/[id]/hubspot — vuelve a poner en la cola de HubSpot un intento del test que agotó sus
 * reintentos (área O, 2026-10-26), cuando alguien arregló la causa (el formulario, la propiedad del contacto). Lo manda
 * el job `tests-hubspot` en su próxima tanda.
 *
 * Quien trabaja la preventa o un super admin.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { ErrorSinTablas, reintentarHubspot, SQL_DE_LOS_TESTS } from "@/lib/tests-diagnostico/repositorio-server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role) && !(await can(ctx.teamMember, "preventa", "write"))) {
    return NextResponse.json({ error: "Reintentar el envío a HubSpot lo hace quien trabaja la preventa." }, { status: 403 });
  }
  const { id } = await params;
  if (!/^c[0-9a-f]{24}$/.test(id)) return NextResponse.json({ error: "Ese intento no existe." }, { status: 404 });
  try {
    await reintentarHubspot(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LOS_TESTS}.` }, { status: 503 });
    throw e;
  }
}
