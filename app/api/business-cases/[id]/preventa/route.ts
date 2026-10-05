/**
 * GET /api/business-cases/[id]/preventa
 *   La columna «Preventa» del contexto de la propuesta: la que usa (resumida, como en el handoff) y
 *   las demás preventas vivas de su empresa, para usar otra. Pide `ventas.read`. Solo lee.
 *
 * PUT /api/business-cases/[id]/preventa   body: { exploracionId: string | null }
 *   Usar una preventa de la MISMA empresa, o dejar de usarla (null). Pide `ventas.write`. Es la
 *   misma escritura desde los dos lados: el contexto de la propuesta y el paso «Propuesta» de la
 *   preventa (lib/exploraciones/en-las-propuestas.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardPermission, guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { preventasDeLaEmpresa, resumenParaElContexto, usarPreventa } from "@/lib/exploraciones/en-las-propuestas";

type Ctx = { params: Promise<{ id: string }> };

/* ⛔ Sin `.cuid()`: hay ids UUID en la base. */
const Cuerpo = z.object({ exploracionId: z.string().trim().min(1).max(64).nullable() });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { clientId: true, exploracionId: true } });
  if (!bc) return NextResponse.json({ error: "Esa propuesta no existe." }, { status: 404 });

  const [usada, disponibles] = await Promise.all([
    bc.exploracionId ? resumenParaElContexto(bc.exploracionId, true) : Promise.resolve(null),
    preventasDeLaEmpresa(bc.clientId),
  ]);
  return NextResponse.json({ exploracionId: bc.exploracionId, usada, disponibles });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const r = await usarPreventa(id, cuerpo.data.exploracionId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
