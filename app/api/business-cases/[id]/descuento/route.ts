/**
 * /api/business-cases/[id]/descuento — la aprobación de un descuento grande de la propuesta (2026-10-18).
 *
 * Un descuento de más del `UMBRAL_DE_APROBACION` en los servicios lo aprueba dirección (Marco), y queda quién, cuándo y
 * hasta qué porcentaje (lib/business-cases/descuento.ts). Vive en la entry `__descuento` del Json de secciones del
 * canvas v0 de la propuesta: sin SQL, y una versión nueva de la propuesta no la pierde.
 *
 *  GET  → las aprobaciones guardadas. Gate: Ventas (lectura).
 *  POST → aprueba el descuento de la versión que se está viendo (`canvasId`; sin él, la activa). El porcentaje lo
 *         calcula el SERVIDOR con lo guardado: lo que diga el navegador no se aprueba. Gate: Ventas + rol de dirección.
 *
 * No cambia la propuesta ni llega al cliente: el snapshot, el PDF y la propuesta publicada no leen el v0.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { INVERSION_SECTION_KEY } from "@/lib/landing/inversion";
import {
  UMBRAL_DE_APROBACION,
  aprobacionesDe,
  conAprobacion,
  descuentoDeServicios,
  puedeAprobarDescuentos,
  textoPorcentaje,
} from "@/lib/business-cases/descuento";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const v0 = await prisma.projectCanvas.findFirst({ where: { businessCaseId: id, version: 0 }, select: { sections: true } });
  return NextResponse.json({ aprobaciones: aprobacionesDe(v0?.sections) });
}

const cuerpo = z.strictObject({ canvasId: z.string().min(1).max(64).optional() });

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  if (!puedeAprobarDescuentos(guard.role)) {
    return NextResponse.json({ error: "Un descuento de más del " + UMBRAL_DE_APROBACION + " % lo aprueba dirección." }, { status: 403 });
  }
  const parsed = cuerpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  const versiones = await prisma.projectCanvas.findMany({
    where: { businessCaseId: id, version: { gt: 0 } },
    select: {
      id: true,
      isActive: true,
      version: true,
      canvasSections: {
        where: { key: INVERSION_SECTION_KEY },
        select: { blocks: { orderBy: { order: "asc" }, select: { data: true }, take: 1 } },
      },
    },
  });
  const pedida = parsed.data.canvasId;
  const leida = pedida
    ? versiones.find((v) => v.id === pedida)
    : (versiones.find((v) => v.isActive) ?? [...versiones].sort((a, b) => b.version - a.version)[0]);
  if (!leida) return NextResponse.json({ error: "Esta propuesta todavía no tiene una versión." }, { status: 404 });

  const descuento = descuentoDeServicios(leida.canvasSections[0]?.blocks[0]?.data ?? null);
  if (descuento.porcentaje <= UMBRAL_DE_APROBACION) {
    return NextResponse.json(
      { error: `El descuento guardado es del ${textoPorcentaje(descuento.porcentaje)}: no hace falta aprobarlo. Si lo acabas de cambiar, espera a que se guarde.` },
      { status: 409 },
    );
  }

  const aprobaciones = await prisma.$transaction(async (tx) => {
    const v0 = await tx.projectCanvas.findFirst({ where: { businessCaseId: id, version: 0 }, select: { id: true, sections: true } });
    if (!v0) return null;
    const sections = conAprobacion(v0.sections, {
      porcentaje: descuento.porcentaje,
      descontado: descuento.descontado,
      moneda: descuento.moneda,
      porEmail: guard.user.email ?? "",
      porNombre: guard.teamMember.name,
      en: new Date().toISOString(),
    });
    await tx.projectCanvas.update({ where: { id: v0.id }, data: { sections: sections as object[] } });
    return aprobacionesDe(sections);
  });
  if (!aprobaciones) return NextResponse.json({ error: "A esta propuesta le falta su versión base." }, { status: 409 });
  return NextResponse.json({ aprobaciones });
}
