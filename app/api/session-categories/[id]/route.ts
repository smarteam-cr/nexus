import { NextResponse } from "next/server";
import { withAuth, withRole } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { revalidateSessionCategories } from "@/lib/cache/session-categories";

const KIND_OPTIONS = ["internal", "partner", "custom"] as const;
type Kind = (typeof KIND_OPTIONS)[number];

interface RouteCtx {
  params: Promise<{ id: string }>;
}

// ── PATCH /api/session-categories/[id] ───────────────────────────────────────
// Actualiza una categoría. Campos parciales permitidos.
// El campo `isDefault` NO se puede modificar desde aquí (lo controla el sistema).

export const PATCH = withAuth(async (request, ctx: RouteCtx) => {
  const { id } = await ctx.params;

  const existing = await prisma.sessionCategory.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name no puede ser vacío" }, { status: 400 });
    if (name !== existing.name) {
      const dup = await prisma.sessionCategory.findFirst({ where: { name, NOT: { id } } });
      if (dup) return NextResponse.json({ error: "Otra categoría ya usa ese nombre" }, { status: 409 });
    }
    updates.name = name;
  }

  if (typeof body.slug === "string") {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "slug inválido (solo letras minúsculas, números y guiones)" },
        { status: 400 }
      );
    }
    if (slug !== existing.slug) {
      const dup = await prisma.sessionCategory.findFirst({ where: { slug, NOT: { id } } });
      if (dup) return NextResponse.json({ error: "Otra categoría ya usa ese slug" }, { status: 409 });
    }
    updates.slug = slug;
  }

  if (Array.isArray(body.domains)) {
    const domains: string[] = body.domains
      .map((d: unknown) => String(d).trim().toLowerCase())
      .filter(Boolean);
    if (domains.length === 0) {
      return NextResponse.json({ error: "domains debe tener al menos uno" }, { status: 400 });
    }
    updates.domains = domains;
  }

  if (typeof body.kind === "string" && KIND_OPTIONS.includes(body.kind as Kind)) {
    updates.kind = body.kind;
  }

  if (typeof body.color === "string" || body.color === null) {
    updates.color = body.color?.trim() || null;
  }

  if (Number.isFinite(body.order)) {
    updates.order = body.order;
  }

  const updated = await prisma.sessionCategory.update({
    where: { id },
    data: updates,
  });

  revalidateSessionCategories();
  return NextResponse.json(updated);
});

// ── DELETE /api/session-categories/[id] ──────────────────────────────────────
// Elimina una categoría. Rechaza si es isDefault=true.

export const DELETE = withRole("SUPER_ADMIN", async (_request, ctx: RouteCtx) => {
  const { id } = await ctx.params;

  const existing = await prisma.sessionCategory.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  if (existing.isDefault) {
    return NextResponse.json(
      { error: "No se puede eliminar una categoría default. Editá sus dominios si necesitás." },
      { status: 403 }
    );
  }

  await prisma.sessionCategory.delete({ where: { id } });
  revalidateSessionCategories();
  return NextResponse.json({ ok: true });
});
