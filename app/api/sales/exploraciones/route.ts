/**
 * POST /api/sales/exploraciones   body: { companyId, empezar? }
 *
 * Abre la exploración de venta de una empresa del HubSpot de Smarteam (lib/exploraciones/crear.ts):
 * si ya hay una viva para esa empresa, devuelve esa. Pide `preventa.write`.
 *
 * `empezar: "transcripcion"` es el flujo liviano (Elías, 2026-10-06) para quien no llegó por el
 * diagnóstico: no se prepara sola; el vendedor suma la transcripción de la llamada y el agente la lee.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardPermission } from "@/lib/auth/api-guards";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { lanzarCorrida } from "@/lib/exploraciones/agente";
import { crearExploracion } from "@/lib/exploraciones/crear";
import { SQL_DE_EXPLORACIONES } from "@/lib/exploraciones/servidor";

const Cuerpo = z.object({
  companyId: z.string().trim().regex(/^\d+$/, "Id de empresa de HubSpot inválido"),
  empezar: z.enum(["preparar", "transcripcion"]).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardPermission("preventa", "write");
  if (guard instanceof NextResponse) return guard;
  if (!modeloDisponible(prisma.exploracionDeVenta)) {
    return NextResponse.json({ error: `Falta aplicar ${SQL_DE_EXPLORACIONES} y reiniciar.` }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const email = guard.user.email ?? "";
  const r = await crearExploracion(cuerpo.data.companyId, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  /* Una exploración NUEVA arranca preparándose sola: el vendedor la abre y el agente ya está leyendo
     HubSpot, el test y las reuniones. Si no se puede lanzar, la exploración queda igual (el botón
     está en el lienzo). */
  if (!r.existia && cuerpo.data.empezar !== "transcripcion") {
    await lanzarCorrida(r.id, "preparar", { triggeredByEmail: email || null }).catch((e) =>
      console.error("[exploraciones] no se pudo lanzar la preparación", e),
    );
  }
  return NextResponse.json({ id: r.id, existia: r.existia }, { status: r.existia ? 200 : 201 });
}
