/**
 * /api/projects/[projectId]/timeline/pagina-del-cliente — la página del cronograma que ve el cliente, desde adentro
 * (2026-11-27). lib/external/pagina-del-cliente(-server).ts.
 *
 *   GET → la vista previa: lo que el cliente vería al «Subir al cliente» (el mismo chokepoint que la foto), con lo que
 *         el equipo decidió de la página. Pide acceso al proyecto.
 *   PUT { titulo?, conNombre?, conLogo?, bienvenida?, conAtrasadas?, conResponsables?, conResumen? } → guarda (NO
 *         publica: queda «sin subir»). La vara del cronograma (`guardTimelineEdit`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardTimelineEdit } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { PaginaDelClienteSchema } from "@/lib/external/pagina-del-cliente-schema";
import { guardarPaginaDelProyecto, vistaPreviaDelProyecto } from "@/lib/external/pagina-del-cliente-server";

type Ctx = { params: Promise<{ projectId: string }> };

const SQL = "scripts/sql/2026-11-27-pagina-del-cliente.sql";

async function responder(hacer: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await hacer();
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: `Falta aplicar ${SQL} y reiniciar.` }, { status: 503 });
    throw e;
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return responder(async () => {
    const vista = await vistaPreviaDelProyecto(projectId);
    if (!vista) return NextResponse.json({ error: "Este proyecto todavía no tiene cronograma." }, { status: 404 });
    return NextResponse.json(vista);
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = await req.json().catch(() => null);
  const parsed = PaginaDelClienteSchema.safeParse(cuerpo);
  if (!parsed.success) return NextResponse.json({ error: "Lo que se quiso guardar de la página no se entiende." }, { status: 400 });
  return responder(async () => {
    const ok = await guardarPaginaDelProyecto(projectId, parsed.data);
    if (!ok) return NextResponse.json({ error: "Este proyecto todavía no tiene cronograma." }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
