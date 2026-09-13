/**
 * /api/cobranza/cuentas/[cuentaId]/sociedades — las sociedades que le facturan a la cuenta (etapa 12).
 *   GET                  → la lista: fichas de Odoo y sociedades de Mercury y QuickBooks.
 *   POST                 → agregar una de Mercury o QuickBooks (las de Odoo se vinculan en el emparejado).
 *   DELETE ?sociedadId=  → soltarla (409 si tiene cobros facturados o si es una ficha de Odoo).
 *
 * Leer: guardCobranzaAccess, el mismo que abrir la cuenta. Escribir: guardCobranzaEditor, que firma con el
 * email. ⛔ Nada de acá decide a qué sociedad se le factura un cobro.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { agregarSociedad, listarSociedades, soltarSociedad, SociedadError } from "@/lib/cobranza/sociedades-servicio";
import { idDeBase, sociedadAgregarSchema } from "@/lib/cobranza/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ cuentaId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const sociedades = await listarSociedades(cuentaId);
  if (!sociedades) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
  return NextResponse.json({ sociedades });
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = sociedadAgregarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json(await agregarSociedad(cuentaId, parsed.data, guard.user.email), { status: 201 });
  } catch (e) {
    if (e instanceof SociedadError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;

  const sociedadId = idDeBase.safeParse(req.nextUrl.searchParams.get("sociedadId") ?? "");
  if (!sociedadId.success) return NextResponse.json({ error: "Falta decir qué sociedad." }, { status: 400 });

  try {
    await soltarSociedad(cuentaId, sociedadId.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SociedadError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
