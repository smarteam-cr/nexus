/**
 * GET /api/para-ti/cuenta — el número de «Para ti» en el menú (2026-10-04).
 *
 * Lo pide cada pestaña abierta cada minuto y medio (solo si está a la vista). Usa la medición guardada dos minutos
 * (`medirConCache`): no recalcula todas las fuentes en cada pedido. Los avisos sin leer sí van frescos (una consulta
 * por índice), para que un aviso nuevo aparezca en el siguiente latido.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { medirConCache } from "@/lib/para-ti/medir-server";
import { avisosNuevosDe } from "@/lib/para-ti/avisos-server";
import { cuentaDelMenu } from "@/lib/para-ti/armar";
import type { CuentaDeParaTi } from "@/lib/para-ti/tipos";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const alcance = await alcanceDe(g.teamMember);
  const [medicion, nuevos] = await Promise.all([medirConCache(alcance), avisosNuevosDe(alcance.email)]);
  const body: CuentaDeParaTi = {
    cuenta: cuentaDelMenu(medicion, nuevos.n),
    avisosNuevos: nuevos.n,
    ultimoAviso: nuevos.ultimo,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
