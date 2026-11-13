/**
 * POST /api/cobranza/servicios/[servicioId]/desactivacion — confirmar (o deshacer) la desactivación de un conector en
 * mora (2026-11-13, lib/cobranza/conectores-en-mora.ts). Nexus solo la propone; esto es la persona que confirma, y queda
 * su nombre, la hora y una nota en la bitácora de la cuenta. Confirmar responde 409 si Nexus ya no la propone hoy.
 * Acceso: guardCobranzaEditor (`cobranza.write`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaEditor } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { desactivacionSchema } from "@/lib/cobranza/schema";
import { decidirDesactivacion, SeguimientoError } from "@/lib/cobranza/seguimiento-server";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ servicioId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;
  const parsed = desactivacionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    await decidirDesactivacion(servicioId, parsed.data.desactivar, guard.user.email, crDateParts(new Date()).dateKey);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SeguimientoError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/desactivacion]", e);
    return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
  }
}
