/**
 * POST /api/cs/prioridad/[clientId]   body: { accion: "marcar", motivo, nota? } | { accion: "quitar" }
 *
 * La CSL (o un super admin) marca la cuenta como prioritaria —más seguimiento— con un motivo corto (SmartLoop, ticket
 * grande, interlocutores difíciles u otro), o le quita la marca (2026-10-29, pedido de Elías; regla en
 * lib/cs/prioridad-de-cuenta.ts). La marca no cambia el color: ordena la cartera. Devuelve cómo quedó; la pantalla
 * refresca.
 *
 * Dos puertas: el rol del área (`guardLiderDeCs`, como toda ruta de Éxito del cliente) y la celda de la matriz
 * `customerSuccess.marcarPrioridad` (por defecto la CSL; SUPER_ADMIN la tiene siempre), que dice quién de los que entran
 * puede marcar.
 *
 * ⚠ La cuenta tiene que pasar el where de acceso del usuario: 404 y no 403 (como al corregir el color).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { prioridadDeCuentaSchema } from "@/lib/cs/schema";
import { registrarPrioridad } from "@/lib/cs/prioridad-de-cuenta-server";
import { prioridadVisible } from "@/lib/cs/prioridad-de-cuenta";
import { faltaLaTabla } from "@/lib/cs/clasificacion-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;
  if (!(await can(guard.teamMember, "customerSuccess", "marcarPrioridad"))) {
    return NextResponse.json({ error: "No tienes permiso para marcar cuentas prioritarias." }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = prioridadDeCuentaSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const pedido = parsed.data;

  const clientWhere = await accessibleClientWhere(guard.user);
  const cliente = await prisma.client.findFirst({
    where: { id: clientId, ...(clientWhere ? { AND: [clientWhere] } : {}) },
    select: { id: true },
  });
  if (!cliente) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const quien = { email: guard.user.email ?? "sin-correo", nombre: guard.teamMember?.name ?? null };
  try {
    const prioridad = await registrarPrioridad(
      clientId,
      pedido.accion === "marcar" ? { tipo: "marcar", motivo: pedido.motivo, nota: pedido.nota ?? null } : { tipo: "quitar" },
      quien,
    );
    return NextResponse.json({ prioritaria: prioridadVisible(prioridad) });
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json(
        { error: "Falta aplicar el SQL de la prioridad (scripts/sql/2026-10-29-prioridad-de-cuenta.sql)." },
        { status: 503 },
      );
    }
    throw e;
  }
}
