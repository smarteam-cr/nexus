/**
 * /api/projects/[projectId]/acceso-al-portal — si el cliente ya nos dio acceso a su portal de HubSpot (Q2 etapa 2 del
 * roadmap, 2026-10-27, lib/kickoff/acceso-al-portal.ts).
 *
 *   GET            → { dadoEn, marcadoPor, pedidoDesde, diasHabiles }: el estado y, si ya está dado, en cuántos días
 *                    hábiles desde que el kickoff lo pide (la tarjeta; el criterio de éxito es menos de 10).
 *   PUT { dado }   → lo marca dado (hoy) o lo vuelve a pendiente. Lo marca quien edita el proyecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { diasHabilesEntre, pedidoDesde } from "@/lib/kickoff/acceso-al-portal";
import { tarjetasDelAcceso } from "@/lib/kickoff/acceso-al-portal-server";

type Params = { params: Promise<{ projectId: string }> };

const Id = z.string().cuid();
const Cuerpo = z.strictObject({ dado: z.boolean() });

const sinSql = () =>
  NextResponse.json(
  { error: "Falta aplicar scripts/sql/2026-10-27-kickoff-planificacion.sql para guardar el acceso al portal." },
  { status: 503 },
);

/** El estado, con los días hábiles desde que el kickoff lo pide (la tarjeta) hasta que se dio. */
async function respuesta(projectId: string, p: { accesoAlPortalDadoEn: Date | null; accesoAlPortalMarcadoPor: string | null; kickoffPublishedAt: Date | null }) {
  const desde = pedidoDesde((await tarjetasDelAcceso([projectId])).get(projectId) ?? null, p.kickoffPublishedAt);
  return {
    dadoEn: p.accesoAlPortalDadoEn?.toISOString() ?? null,
    marcadoPor: p.accesoAlPortalMarcadoPor,
    pedidoDesde: desde?.toISOString() ?? null,
    diasHabiles: p.accesoAlPortalDadoEn && desde ? diasHabilesEntre(desde, p.accesoAlPortalDadoEn) : null,
  };
}

const SELECT = { accesoAlPortalDadoEn: true, accesoAlPortalMarcadoPor: true, kickoffPublishedAt: true } as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!Id.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: SELECT });
    if (!p) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
    return NextResponse.json(await respuesta(projectId, p));
  } catch (e) {
    if (esquemaDesactualizado(e)) return sinSql();
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!Id.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Falta decir si ya está dado." }, { status: 400 });
  try {
    const p = await prisma.project.update({
      where: { id: projectId },
      data: cuerpo.data.dado
        ? { accesoAlPortalDadoEn: new Date(), accesoAlPortalMarcadoPor: guard.user.email }
        : { accesoAlPortalDadoEn: null, accesoAlPortalMarcadoPor: guard.user.email },
      select: SELECT,
    });
    return NextResponse.json(await respuesta(projectId, p));
  } catch (e) {
    if (esquemaDesactualizado(e)) return sinSql();
    throw e;
  }
}
