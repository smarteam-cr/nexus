/**
 * /api/cobranza/mercury/diferencias — todo lo que no cuadra entre Nexus y Mercury.
 *   GET  → la lista, recalculada en cada carga con la copia de Mercury y los cobros de hoy, con lo ya marcado aparte.
 *   POST → «está bien así» fila por fila (`marcar`) y su «Deshacer» (`deshacer-marcas`).
 *
 * Mismo contrato y mismas reglas que /api/cobranza/odoo/diferencias: leer pide `cobranza.read`; marcar y deshacer piden
 * EDICIÓN. ⚠ Marcar guarda la huella de los números: si uno cambia, la fila vuelve sola.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import {
  MercuryServicioError,
  cargarDiferenciasMercury,
  deshacerMarcasMercury,
  marcarFilasMercury,
  ultimoMotivoMercury,
} from "@/lib/cobranza/mercury/servicio";
import { odooDeshacerMarcasSchema, odooMarcarFilasSchema } from "@/lib/cobranza/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const [diferencias, bienAsi] = await Promise.all([cargarDiferenciasMercury(), ultimoMotivoMercury(guard.user.email)]);
  return NextResponse.json({ ...diferencias, ultimosMotivos: { bienAsi, anulada: null } });
}

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
  const invalido = (issues: ReadonlyArray<{ message: string }>) => NextResponse.json({ error: issues[0]?.message ?? "Input inválido" }, { status: 400 });
  try {
    if (accion === "marcar") {
      const p = odooMarcarFilasSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      return NextResponse.json(await marcarFilasMercury(p.data, editor.user.email));
    }
    if (accion === "deshacer-marcas") {
      const p = odooDeshacerMarcasSchema.safeParse(raw);
      if (!p.success) return invalido(p.error.issues);
      return NextResponse.json({ deshechas: await deshacerMarcasMercury(p.data, editor.user.email) });
    }
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    if (e instanceof MercuryServicioError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
