/**
 * /api/projects/[projectId]/presentacion-del-diagnostico — cuándo se le presenta el diagnóstico al
 * cliente (2026-10-07). Las reglas: lib/canvas/presentacion-del-diagnostico.ts.
 *
 *   GET                                      → la fecha, lo propuesto, el estado y si puedes cambiarla
 *   PATCH { accion: "fijar", fecha }         → fija la fecha (AAAA-MM-DD)
 *   PATCH { accion: "sin-fecha" }            → «Todavía no sé»
 *   PATCH { accion: "usar-propuesta" }       → usa la fecha que leyó Nexus en una reunión
 *   PATCH { accion: "descartar-propuesta" }  → no se vuelve a proponer
 *   PATCH { accion: "listo", fecha }         → está terminado y la fecha queda reconfirmada: avisa
 *                                              al vendedor dueño de la empresa en HubSpot
 *
 * Cambiarla pide lo mismo que presentar el diagnóstico (acceso al proyecto + diagnostico.generate).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { estadoDeLaPresentacion, esFecha, hoyEnCostaRica } from "@/lib/canvas/presentacion-del-diagnostico";
import { cambiarPresentacion, presentacionDelProyecto, SinPropuesta } from "@/lib/canvas/presentacion-del-diagnostico-server";

type Params = { params: Promise<{ projectId: string }> };

const SQL = "scripts/sql/2026-10-07-presentacion-del-diagnostico.sql";
const esquemaAtrasado = () =>
  NextResponse.json({ error: `Falta aplicar la migración de la fecha de presentación (${SQL}).`, esquemaAtrasado: true }, { status: 503 });

export async function GET(_req: Request, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const presentacion = await presentacionDelProyecto(projectId);
    const hoy = hoyEnCostaRica(new Date());
    const tm = guard.user.teamMember;
    const puedeCambiar = !!tm && (await can(tm, "diagnostico", "generate"));
    return NextResponse.json({ presentacion, estado: estadoDeLaPresentacion(presentacion, hoy), hoy, puedeCambiar });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

const Fecha = z.string().refine(esFecha, "Fecha inválida.");
const PedidoSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("fijar"), fecha: Fecha }),
  z.object({ accion: z.literal("listo"), fecha: Fecha }),
  z.object({ accion: z.literal("sin-fecha") }),
  z.object({ accion: z.literal("usar-propuesta") }),
  z.object({ accion: z.literal("descartar-propuesta") }),
]);

export async function PATCH(req: Request, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardContextoDelDocumento(projectId, "diagnostico");
  if (guard instanceof NextResponse) return guard;
  const parsed = PedidoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const actor = guard.teamMember.email ?? guard.user.email;
  try {
    const { presentacion, aviso } = await cambiarPresentacion(projectId, parsed.data, actor);
    const hoy = hoyEnCostaRica(new Date());
    return NextResponse.json({ presentacion, estado: estadoDeLaPresentacion(presentacion, hoy), hoy, puedeCambiar: true, aviso });
  } catch (e) {
    if (e instanceof SinPropuesta) return NextResponse.json({ error: e.message }, { status: 409 });
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}
