/**
 * /api/cobranza/cuentas/[cuentaId] — detalle + edición de la cuenta.
 *   GET   → detalle completo (servicios + plan + cobros + bitácora + proyectos).
 *   PATCH → editar campos; cambiar estadoCuenta registra quién/cuándo (curaduría).
 * SIN DELETE en v1 (local==PROD: evitar accidentes; usar SUSPENDIDA/excluida).
 *
 * ⭐ El PATCH también corrige el NOMBRE de la empresa (2026-09-29, pedido de Alex): `nombre` es `Client.name`, el de
 * todo Nexus, así que pide permiso de edición (guardCobranzaEditor), queda en la bitácora de la cuenta y dispara lo
 * mismo que la ficha del cliente cuando cambia un nombre: avisa al menú de clientes y vuelve a repartir las reuniones.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { getCuentaDetail } from "@/lib/cobranza/queries";
import { updateCuenta, CobranzaError } from "@/lib/cobranza/mutations";
import { cuentaPatchSchema } from "@/lib/cobranza/schema";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

type Params = { params: Promise<{ cuentaId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const cuenta = await getCuentaDetail(cuentaId);
  if (!cuenta) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
  return NextResponse.json({ cuenta });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cuentaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  /* ⚠ Cambiar el nombre de la empresa exige EDICIÓN, no lectura: se ve en todo Nexus, no solo en Cobranza. */
  if (parsed.data.nombre !== undefined) {
    const editor = await guardCobranzaEditor();
    if (editor instanceof NextResponse) return editor;
  }

  try {
    const { nombreCambio } = await updateCuenta(cuentaId, parsed.data, guard.user.email);
    if (nombreCambio) {
      revalidateClientsSidebar();
      /* En segundo plano: una reunión puede ser de una empresa por el nombre que lleva en el título, así que
         renombrar cambia de quién son. ⚠ El catch LOGUEA: si falla en silencio queda la atribución vieja. */
      void resolveAllSessions().catch((e) => {
        console.error(`[cobranza] volver a repartir las reuniones tras renombrar la cuenta ${cuentaId} falló:`, e);
      });
    }
    return NextResponse.json({ ok: true, nombreCambio });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
  }
}
