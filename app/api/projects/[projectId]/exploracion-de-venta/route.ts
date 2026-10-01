/**
 * GET /api/projects/[projectId]/exploracion-de-venta
 *
 * La cuarta columna del contexto del handoff: la exploración de venta que le corresponde a este
 * proyecto (lib/exploraciones/handoff.ts decide cuál, o ninguna), resumida para que el CSE vea qué
 * le va a llegar al handoff y que es ESTIMADO. El CSE no tiene el permiso de Ventas: la ve por el
 * proyecto, con el mismo gate que el resto del contexto del handoff. El enlace al lienzo, solo
 * con `ventas.read`. Solo lee.
 *
 * Lo INTERNO (hipótesis, presupuesto, quién decide, lo no explorado…) llega SOLO por acá, a una
 * pantalla interna: al agente del handoff no se le manda (lib/exploraciones/para-el-handoff.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import type { Meta } from "@/lib/exploraciones/casillas";
import { exploracionDelProyecto } from "@/lib/exploraciones/handoff";
import { internoParaElCse } from "@/lib/exploraciones/para-el-handoff";
import { exploracionParaLaPropuesta } from "@/lib/exploraciones/servidor";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const id = await exploracionDelProyecto(projectId);
  if (!id) return NextResponse.json({ exploracion: null });
  const datos = await exploracionParaLaPropuesta(id);
  if (!datos) return NextResponse.json({ exploracion: null });

  const { estado, escala, chequeo } = datos;
  const nivel = (l: string | null) => (l ? (escala.niveles.find((n) => n.letra === l)?.nombre ?? l) : null);
  const metas = ((estado.contenido.casillas.metas ?? []) as Meta[]).map((m) =>
    [m.que, m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" "),
  );
  return NextResponse.json({
    exploracion: {
      id,
      edicion: escala.edicion?.nombre ?? null,
      areas: chequeo.areas.map((a) => ({
        nombre: a.nombre,
        base: nivel(a.capas.base.nivel),
        produccion: nivel(a.capas.produccion.nivel),
        objetivo: nivel(a.objetivo),
      })),
      metas,
      casosDeUso: Object.values(estado.contenido.casosDeUso).map((c) => c.titulo),
      interno: internoParaElCse(estado, escala),
      puedeAbrir: await can(guard.teamMember, "ventas", "read"),
    },
  });
}
