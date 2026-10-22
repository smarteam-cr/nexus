/**
 * /api/cobranza/ordenado — lo que Nexus ordenó solo en «Lo que no cuadra» (2026-10-22, lib/cobranza/libro/ordenar.ts).
 *   GET  → lo ordenado en los últimos 30 días que nadie deshizo, por factura, y las facturas que se parecen a un papel
 *          por ordenar pero que Nexus no ordena (más de una forma de leerlas): esas las mira una persona.
 *   POST → «Deshacer» una orden entera: sus cuotas vuelven a como estaban y Nexus no la vuelve a ordenar.
 *
 * Acceso: leer, guardCobranzaAccess; deshacer, guardCobranzaEditor (cambia cuotas), como el resto de Conciliación.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { cargarLoOrdenado, deshacerOrden } from "@/lib/cobranza/libro/ordenar-server";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { deshacerOrdenSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await cargarLoOrdenado(crDateParts(new Date()).dateKey));
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
  const p = deshacerOrdenSchema.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  try {
    return NextResponse.json(await deshacerOrden(p.data.grupo, editor.user.email));
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
