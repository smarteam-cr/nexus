/**
 * /api/marketing/sources — fuentes de inspiración (perfiles LinkedIn).
 * GET lista (con lastFetchedAt/lastFetchError) · POST crea. Escritura: editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getSources } from "@/lib/marketing/queries";
import { createSource } from "@/lib/marketing/mutations";
import { sourceCreateSchema } from "@/lib/marketing/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ sources: await getSources() });
}

export async function POST(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = sourceCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const source = await createSource({
      profileUrl: parsed.data.profileUrl,
      label: parsed.data.label ?? null,
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Esa URL de perfil ya está registrada." }, { status: 409 });
  }
}
