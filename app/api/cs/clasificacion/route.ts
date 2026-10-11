/**
 * POST /api/cs/clasificacion   body: { cuentas: [{ clientId, operaciones }] }
 *
 * «Usar las propuestas» de las cuentas que la CSL tiene a la vista en la pestaña «Cartera» (2026-10-07,
 * docs/exito-del-cliente-cartera-plan.md, entrega 1): las mismas operaciones que el PATCH de una cuenta, en un
 * solo pedido. Cada cuenta va en su propia transacción: si una falla, las anteriores quedan guardadas y la
 * respuesta dice cuáles.
 *
 * ⚠ Solo las cuentas que pasan el where de acceso del usuario; las demás se cuentan en `fuera` y no se tocan.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { clasificacionEnBloqueSchema } from "@/lib/cs/schema";
import { aplicarOperacionesDeClasificacion, faltaLaTabla } from "@/lib/cs/clasificacion-server";
import type { ClasificacionGuardada } from "@/lib/cs/clasificacion";

export async function POST(req: NextRequest) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = clasificacionEnBloqueSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const ids = [...new Set(parsed.data.cuentas.map((c) => c.clientId))];
  const clientWhere = await accessibleClientWhere(guard.user);
  const visibles = new Set(
    (
      await prisma.client.findMany({
        where: { id: { in: ids }, ...(clientWhere ? { AND: [clientWhere] } : {}) },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  const email = guard.user.email ?? "sin-correo";
  const guardadas: Record<string, ClasificacionGuardada> = {};
  try {
    for (const c of parsed.data.cuentas) {
      if (!visibles.has(c.clientId) || guardadas[c.clientId]) continue;
      guardadas[c.clientId] = await aplicarOperacionesDeClasificacion(c.clientId, c.operaciones, email);
    }
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json(
        { error: "Falta aplicar el SQL de la clasificación (scripts/sql/2026-10-07-clasificacion-de-cuenta.sql)." },
        { status: 503 },
      );
    }
    // Lo que ya se guardó, queda: la pantalla lo pinta y dice que el resto no entró.
    console.error("[cs/clasificacion] guardado en bloque cortado:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Se cortó a mitad: lo que se ve confirmado quedó guardado; vuelve a intentarlo con el resto.", guardadas },
      { status: 500 },
    );
  }
  return NextResponse.json({ guardadas, fuera: ids.length - visibles.size });
}
