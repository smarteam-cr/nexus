/**
 * POST /api/escala/tests — genera los borradores de las preguntas del test del diagnóstico desde la escala vigente (área
 * O, 2026-10-26): cada área × versión, para la escala general y cada edición. Los que ya existen no se tocan.
 *
 * Solo los super admin: las preguntas las revisa y las aprueba Elías antes de que el público las vea.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { generarBorradores } from "@/lib/tests-diagnostico/admin-server";
import { ErrorSinTablas, SQL_DE_LOS_TESTS } from "@/lib/tests-diagnostico/repositorio-server";

export async function POST() {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  try {
    const creados = await generarBorradores(ctx.user.email);
    if (creados === null) return NextResponse.json({ error: "No hay una escala publicada de la que sacar las preguntas." }, { status: 409 });
    return NextResponse.json({ creados });
  } catch (e) {
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LOS_TESTS}.` }, { status: 503 });
    throw e;
  }
}
