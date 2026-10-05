/**
 * PUT /api/marketing/tanda — { empresaCount, personaCount } guarda cuánto pide cada tanda sin correr el motor
 * (pantalla Generación, rediseño de Marketing 2026-10-04). Antes solo se guardaba al apretar «Generar». El cron de
 * los viernes y «Generar ahora» leen de acá. Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { guardarTanda } from "@/lib/marketing/mutations";
import { tandaPutSchema } from "@/lib/marketing/schema";

export async function PUT(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = tandaPutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Cantidades inválidas." }, { status: 400 });
  }
  const settings = await guardarTanda(parsed.data.empresaCount, parsed.data.personaCount);
  return NextResponse.json({ settings });
}
