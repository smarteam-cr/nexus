/**
 * /api/marketing/personas — buyer personas. GET lista · POST crea. Escritura: editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getPersonas } from "@/lib/marketing/queries";
import { createPersona } from "@/lib/marketing/mutations";
import { personaCreateSchema } from "@/lib/marketing/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ personas: await getPersonas() });
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
  const parsed = personaCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }
  const { name, role, description, pains, goals } = parsed.data;
  const persona = await createPersona({
    name,
    role: role ?? null,
    description,
    pains: pains ?? null,
    goals: goals ?? null,
  });
  return NextResponse.json({ persona }, { status: 201 });
}
