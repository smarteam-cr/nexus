/**
 * /api/cobranza/odoo/diferencias — la mesa de trabajo con el CFO.
 *   GET  → todo lo que no cuadra entre Nexus y Odoo, ordenado por plata, con lo ya marcado aparte y el motivo que se
 *          le propone a quien mira.
 *   POST → «está bien así» fila por fila (`marcar`) y su «Deshacer» (`deshacer-marcas`); cerrar a mano una factura
 *          soltada que nada puede verificar (`resolver-liberacion`, «Ya está anulada») y su «Deshacer»
 *          (`reabrir-liberacion`).
 *
 * Acceso: leer, guardCobranzaAccess (ADMIN + SUPER_ADMIN), el mismo gate que el resto del módulo. ⚠ Todo lo que marca
 * o deshace pide EDICIÓN (guardCobranzaEditor), igual que «Ya está anulada» desde el principio: saca cosas de la lista
 * de alguien más. Medido el 2026-09-25: hoy todos los que ven Cobranza la editan, así que a nadie se le quita nada.
 *
 * ⚠ Marcar guarda la HUELLA de los números de cada documento, no solo la fila: si un número cambia, la fila vuelve
 * sola. Una marca no puede convertirse en el lugar donde se esconde un problema nuevo.
 * ⛔ La marca por grupo («Está bien así» y «Volver a abrir» de la línea entera, `DiferenciaOdooAceptada`) ya no existe
 * acá desde el 2026-09-25. La tabla no se borra: su única marca pasa a marcas por fila con un script aparte.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import {
  EmparejadoError,
  cargarDiferencias,
  deshacerMarcas,
  marcarFilas,
  reabrirLiberacion,
  resolverLiberacion,
  ultimosMotivos,
} from "@/lib/cobranza/odoo/servicio";
import {
  odooDeshacerMarcasSchema,
  odooMarcarFilasSchema,
  odooReabrirLiberacionSchema,
  odooResolverLiberacionSchema,
} from "@/lib/cobranza/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const [diferencias, motivos] = await Promise.all([cargarDiferencias(), ultimosMotivos(guard.user.email)]);
  return NextResponse.json({ ...diferencias, ultimosMotivos: motivos });
}

const invalido = (issues: ReadonlyArray<{ message: string }>) =>
  NextResponse.json({ error: issues[0]?.message ?? "Input inválido" }, { status: 400 });

export async function POST(req: NextRequest) {
  const editor = await guardCobranzaEditor();
  if (editor instanceof NextResponse) return editor;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const accion = (raw as { accion?: unknown })?.accion;

  try {
    if (accion === "marcar") {
      const p = odooMarcarFilasSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      return NextResponse.json(await marcarFilas(p.data, editor.user.email));
    }
    if (accion === "deshacer-marcas") {
      const p = odooDeshacerMarcasSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      return NextResponse.json({ deshechas: await deshacerMarcas(p.data, editor.user.email) });
    }
    /* «Ya está anulada» dice «yo anulé una factura», sobre un sistema que Nexus no puede verificar: con motivo. */
    if (accion === "resolver-liberacion") {
      const p = odooResolverLiberacionSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      await resolverLiberacion(p.data, editor.user.email);
      return NextResponse.json({ ok: true });
    }
    if (accion === "reabrir-liberacion") {
      const p = odooReabrirLiberacionSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      await reabrirLiberacion(p.data, editor.user.email);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof EmparejadoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
