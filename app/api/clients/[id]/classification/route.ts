/**
 * PATCH /api/clients/[id]/classification
 *
 * Los DOS datos que dicen qué es una empresa para el negocio y cuánto puede valer:
 *   - `kind`   — cliente / prospecto / aliado / interno   → celda `clientes.classify`
 *   - `tamUsd` — el techo anual estimado en dólares       → celda `ventas.write`
 *
 * Van juntos en un endpoint porque se editan en el MISMO formulario de la ficha, pero
 * cada campo lleva su propio guard: quien clasifica no necesariamente estima plata, y
 * el área de Ventas no necesariamente decide categorías. Un usuario con solo uno de los
 * dos permisos puede mandar solo ese campo; si manda el otro, se lo rechaza con 403 sin
 * escribir NADA (nunca un guardado a medias).
 *
 * NO se agregó a `PATCH /api/clients/[id]`: esa ruta solo gatea `guardAccessToClient`
 * (tener acceso al cliente), que es mucho más laxo que estos dos permisos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { parseClientKind, parseTamUsd } from "@/lib/clients/kind";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1) Row-level: ¿tenés acceso a ESTE cliente? (ortogonal a la matriz de permisos)
  const access = await guardAccessToClient(id);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;

  const data: Prisma.ClientUpdateInput = {};

  // 2) kind — solo quien puede clasificar
  if ("kind" in raw) {
    const perm = await guardPermission("clientes", "classify");
    if (perm instanceof NextResponse) return perm;
    const kind = parseClientKind(raw.kind);
    if (!kind) {
      return NextResponse.json({ error: "Categoría de empresa desconocida." }, { status: 400 });
    }
    data.kind = kind;
  }

  // 3) tamUsd — solo el área de Ventas
  if ("tamUsd" in raw) {
    const perm = await guardPermission("ventas", "write");
    if (perm instanceof NextResponse) return perm;
    const tam = parseTamUsd(raw.tamUsd);
    if (!tam.ok) return NextResponse.json({ error: tam.error }, { status: 400 });
    data.tamUsd = tam.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No mandaste ningún cambio." }, { status: 400 });
  }

  const updated = await prisma.client.update({
    where: { id },
    data,
    select: { id: true, kind: true, tamUsd: true },
  });

  // El tag `clients-sidebar` hoy no tiene lectores (ver el header de lib/cache/clients),
  // pero re-clasificar cambia quién es cliente: se invalida igual, como el resto de las
  // mutaciones de Client, para que el día que vuelva a leerse no nazca desfasado.
  revalidateClientsSidebar();

  return NextResponse.json({
    id: updated.id,
    kind: updated.kind,
    // Prisma.Decimal no es serializable: se cruza a number en la frontera, acá.
    tamUsd: updated.tamUsd === null ? null : Number(updated.tamUsd),
  });
}
