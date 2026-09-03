/**
 * /api/cobranza/odoo/diferencias — la mesa de trabajo con el CFO.
 *   GET  → todo lo que no cuadra entre Nexus y Odoo, ordenado por plata.
 *   POST → «está bien así» (aceptar), volver a abrir una línea, o cerrar a mano una factura
 *          soltada que se emitió fuera de Odoo.
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN), el mismo gate que el resto del módulo.
 *
 * ⚠ Aceptar guarda la HUELLA de los números, no solo la clave: si el monto cambia, la línea
 * vuelve sola. Una aceptación no puede convertirse en el lugar donde se esconde un problema
 * nuevo.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import {
  EmparejadoError,
  aceptarDiferencia,
  cargarDiferencias,
  reabrirDiferencia,
  resolverLiberacion,
} from "@/lib/cobranza/odoo/servicio";
import {
  odooDiferenciaAceptarSchema,
  odooDiferenciaReabrirSchema,
  odooResolverLiberacionSchema,
} from "@/lib/cobranza/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await cargarDiferencias());
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    if ((raw as { accion?: unknown })?.accion === "aceptar") {
      const p = odooDiferenciaAceptarSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      await aceptarDiferencia(p.data, guard.user.email);
      return NextResponse.json({ ok: true });
    }
    /* ⚠ Cerrar una liberación exige EDICIÓN, no lectura. Aceptar una diferencia dice «esto está
       bien»; esto dice «yo anulé una factura», sobre un sistema que Nexus no puede verificar. */
    if ((raw as { accion?: unknown })?.accion === "resolver-liberacion") {
      const editor = await guardCobranzaEditor();
      if (editor instanceof NextResponse) return editor;
      const p = odooResolverLiberacionSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      await resolverLiberacion(p.data, editor.user.email);
      return NextResponse.json({ ok: true });
    }
    if ((raw as { accion?: unknown })?.accion === "reabrir") {
      const p = odooDiferenciaReabrirSchema.safeParse(raw);
      if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
      await reabrirDiferencia(p.data.clave);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof EmparejadoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
