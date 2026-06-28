/**
 * /api/business-cases/[id]
 *   GET    → detalle completo (bloques + transcripts + acceso + cliente)
 *   PUT    { name?, status?, hubspotCompanyId? } → actualiza metadatos
 *   DELETE → borra el caso y, por cascade, todo su contenido
 *
 * Gateado con guardSalesAccess (VENTAS/CSL/SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import {
  getBusinessCase,
  updateBusinessCase,
  deleteBusinessCase,
  UpdateBusinessCaseBody,
} from "@/lib/business-cases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const businessCase = await getBusinessCase(id);
  if (!businessCase) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }
  return NextResponse.json({ businessCase });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = UpdateBusinessCaseBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const updated = await updateBusinessCase(id, parsed.data);
  return NextResponse.json({ businessCase: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const businessCase = await getBusinessCase(id);
  if (!businessCase) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  await deleteBusinessCase(id);
  return NextResponse.json({ ok: true });
}
