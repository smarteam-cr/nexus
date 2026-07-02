/**
 * /api/use-cases — catálogo de casos de uso (Ventas)
 *   GET  → lista completa (activos e inactivos; el admin ve todo)
 *   POST → crea { title, description, price?, appliesTo?, tags?, order? }
 *
 * Gateado con guardSalesAccess (VENTAS/DEV/CSL/SUPER_ADMIN). El catálogo es 100%
 * opcional: sin filas, el flujo del BC sigue idéntico (texto libre).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags } from "@/lib/tags/catalog";
import { bcTypeOrNull } from "@/lib/business-cases/case-types";

function sanitizeAppliesTo(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((s): s is string => typeof s === "string" && !!bcTypeOrNull(s)))];
}

export async function GET() {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const useCases = await prisma.useCase.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ useCases });
}

export async function POST(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: {
    title?: unknown;
    description?: unknown;
    price?: unknown;
    appliesTo?: unknown;
    tags?: unknown;
    order?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!title || !description) {
    return NextResponse.json({ error: "Título y descripción son obligatorios." }, { status: 400 });
  }

  const created = await prisma.useCase.create({
    data: {
      title,
      description,
      price: typeof body.price === "string" && body.price.trim() ? body.price.trim() : null,
      appliesTo: sanitizeAppliesTo(body.appliesTo),
      tags: sanitizeTags(body.tags),
      order: typeof body.order === "number" ? body.order : 0,
      createdByEmail: guard.user.email ?? null,
    },
  });
  return NextResponse.json({ useCase: created }, { status: 201 });
}
