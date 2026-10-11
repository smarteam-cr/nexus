/**
 * PATCH /api/cs/clasificacion/[clientId]   body: { operaciones: [{ accion, dato, valor, huella? }] }
 *
 * La CSL (o un super admin) confirma el tipo de relación, el potencial o el momento de una cuenta, o descarta
 * lo que propone Nexus (2026-10-07, docs/exito-del-cliente-cartera-plan.md, entrega 1). Devuelve cómo quedó lo
 * guardado; la pantalla recalcula la propuesta con `estadoDelDato`, sin volver a pedir la cartera.
 *
 * ⚠ La cuenta tiene que pasar el where de acceso del usuario, como al cerrar una alerta: 404 y no 403, quien no
 * la ve tampoco tiene por qué enterarse de que existe.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { clasificacionPatchSchema } from "@/lib/cs/schema";
import { aplicarOperacionesDeClasificacion, faltaLaTabla } from "@/lib/cs/clasificacion-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = clasificacionPatchSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const clientWhere = await accessibleClientWhere(guard.user);
  const cliente = await prisma.client.findFirst({
    where: { id: clientId, ...(clientWhere ? { AND: [clientWhere] } : {}) },
    select: { id: true },
  });
  if (!cliente) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const email = guard.user.email ?? "sin-correo";
  try {
    const guardada = await aplicarOperacionesDeClasificacion(clientId, parsed.data.operaciones, email);
    return NextResponse.json({ guardada });
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json(
        { error: "Falta aplicar el SQL de la clasificación (scripts/sql/2026-10-07-clasificacion-de-cuenta.sql)." },
        { status: 503 },
      );
    }
    throw e;
  }
}
