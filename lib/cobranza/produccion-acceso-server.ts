/**
 * lib/cobranza/produccion-acceso-server.ts — la guarda de la tabla del paso a producción (2026-11-13). SERVER-ONLY.
 * La regla es pura y vive en ./produccion-acceso.ts.
 */
import "server-only";
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { puedeVerProduccion, type QuienMira } from "./produccion-acceso";

/** Quien mira, o la respuesta 401/403. Primera línea de cada handler de /api/cobranza/produccion. */
export async function guardProduccion(): Promise<QuienMira | NextResponse> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const [veCobranza, editaCobranza] = await Promise.all([can(guard.teamMember, "cobranza", "read"), can(guard.teamMember, "cobranza", "write")]);
  const q: QuienMira = { rol: guard.role, email: guard.user.email.toLowerCase(), veCobranza, editaCobranza };
  if (!puedeVerProduccion(q)) {
    return NextResponse.json({ error: "Tu rol no tiene acceso al paso a producción." }, { status: 403 });
  }
  return q;
}
