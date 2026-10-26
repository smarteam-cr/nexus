/**
 * /api/clients/[id]/documentos — los documentos de la EMPRESA, sin proyecto (R3 etapas 2 y 3, 2026-10-27).
 *
 *   GET                         → { documentos }: los de la empresa (sin proyecto ni propuesta), con lo compartido.
 *   POST { pieza, plantilla? }  → crea el de esa pieza (hoy, el diagnóstico) con las secciones de su plantilla, o
 *                                 devuelve el que ya existe (uno por pieza y empresa).
 *
 * Pide acceso a la empresa (el mismo row-level que la ficha).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  crearDocumentoDeLaEmpresa,
  ErrorDelDocumento,
  estadoDeLoCompartido,
  PIEZAS_DE_LA_EMPRESA,
  type PiezaDeLaEmpresa,
} from "@/lib/clients/documentos-de-la-empresa-compartir";

type Params = { params: Promise<{ id: string }> };

const Id = z.string().min(1).max(64).regex(/^[\w-]+$/);
const Nuevo = z.strictObject({
  pieza: z.enum(Object.keys(PIEZAS_DE_LA_EMPRESA) as [PiezaDeLaEmpresa, ...PiezaDeLaEmpresa[]]),
  plantilla: z.string().min(1).max(80).optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const filas = await prisma.projectCanvas.findMany({
    where: { clientId: id, projectId: null, businessCaseId: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, slug: true, updatedAt: true },
  });
  const documentos = await Promise.all(
    filas.map(async (f) => ({ id: f.id, nombre: f.name, pieza: f.slug, actualizado: f.updatedAt.toISOString(), compartido: await estadoDeLoCompartido(f.id) })),
  );
  return NextResponse.json({ documentos });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Nuevo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Elige qué documento armar." }, { status: 400 });
  try {
    const r = await crearDocumentoDeLaEmpresa(id, cuerpo.data.pieza, cuerpo.data.plantilla ?? null, guard.user.email);
    return NextResponse.json(r, { status: r.creado ? 201 : 200 });
  } catch (e) {
    if (e instanceof ErrorDelDocumento) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
