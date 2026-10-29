/**
 * /api/marketing/posicionamiento — el position statement de la empresa que usa Nexus (K3, 2026-10-28): la frase y sus
 * frentes, en Marketing › Audiencia.
 * GET (cualquier interno) · PUT { frase, frentes } (editores de Marketing; Zod en la frontera).
 * Se guarda en el perfil de esa empresa (lib/smarteam/perfil-server.ts) y se lee por lib/smarteam/contexto.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { empresaQueUsaNexus, perfilDe } from "@/lib/smarteam/contexto";
import { ErrorDelPerfil, guardarPosicionamiento } from "@/lib/smarteam/perfil-server";
import { PosicionamientoEdicionSchema } from "@/lib/smarteam/posicionamiento-esquema";

const SIN_SQL = "Falta aplicar scripts/sql/2026-10-28-position-statement.sql y reiniciar.";
const SIN_EMPRESA = "Nexus no sabe cuál es la empresa que lo usa: falta su perfil en la ficha de Smarteam.";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const empresa = await empresaQueUsaNexus();
    if (!empresa) return NextResponse.json({ empresa: null, frase: null, frentes: [] });
    const perfil = await perfilDe(empresa.id);
    return NextResponse.json({ empresa, frase: perfil.positionStatement, frentes: perfil.frentes });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}

export async function PUT(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PosicionamientoEdicionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  try {
    const empresa = await empresaQueUsaNexus();
    if (!empresa) return NextResponse.json({ error: SIN_EMPRESA }, { status: 409 });
    await guardarPosicionamiento(empresa.id, parsed.data, guard.user.email);
    const perfil = await perfilDe(empresa.id);
    return NextResponse.json({ empresa, frase: perfil.positionStatement, frentes: perfil.frentes });
  } catch (e) {
    if (e instanceof ErrorDelPerfil) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}
