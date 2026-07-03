/**
 * /api/marketing/icp — ítems del ICP (1 fila = 1 bullet).
 *   GET  → todos, agrupados por sección (lectura: cualquier rol interno)
 *   POST → crea { section, label } (escritura: guardMarketingEditor)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getIcpItemsGrouped } from "@/lib/marketing/queries";
import { createIcpItem } from "@/lib/marketing/mutations";
import { icpItemCreateSchema } from "@/lib/marketing/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const sections = await getIcpItemsGrouped();
  return NextResponse.json({ sections });
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
  const parsed = icpItemCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  const item = await createIcpItem(parsed.data.section, parsed.data.label);
  return NextResponse.json({ item }, { status: 201 });
}
