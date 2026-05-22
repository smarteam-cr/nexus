import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { revalidateSessionCategories } from "@/lib/cache/session-categories";

const KIND_OPTIONS = ["internal", "partner", "custom"] as const;
type Kind = (typeof KIND_OPTIONS)[number];

// ── GET /api/session-categories ──────────────────────────────────────────────
// Lista todas las categorías, ordenadas por `order` ascendente.

export async function GET() {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.sessionCategory.findMany({
    orderBy: { order: "asc" },
  });

  return NextResponse.json(categories);
}

// ── POST /api/session-categories ─────────────────────────────────────────────
// Crea una nueva categoría. Valida slug único + dominios mínimos.

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const name: string | undefined = body.name?.trim();
  const slug: string | undefined = body.slug?.trim().toLowerCase();
  const domains: string[] = Array.isArray(body.domains)
    ? body.domains.map((d: unknown) => String(d).trim().toLowerCase()).filter(Boolean)
    : [];
  const kind: Kind = KIND_OPTIONS.includes(body.kind) ? body.kind : "custom";
  const color: string | null = body.color?.trim() || null;
  const order: number = Number.isFinite(body.order) ? body.order : 0;

  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug requerido (solo letras minúsculas, números y guiones)" },
      { status: 400 }
    );
  }
  if (domains.length === 0) {
    return NextResponse.json({ error: "al menos un dominio requerido" }, { status: 400 });
  }

  // Validar slug único
  const existing = await prisma.sessionCategory.findFirst({
    where: { OR: [{ slug }, { name }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Ya existe una categoría con ese slug o nombre` },
      { status: 409 }
    );
  }

  const created = await prisma.sessionCategory.create({
    data: {
      name,
      slug,
      domains,
      kind,
      color,
      order,
      isDefault: false, // las creadas por UI nunca son default
    },
  });

  revalidateSessionCategories();
  return NextResponse.json(created, { status: 201 });
}
