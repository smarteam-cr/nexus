/**
 * /api/clients/[id]/unidades — «Unidades de negocio» de Información del cliente (2026-11-26).
 *
 *   GET  → la empresa de esta ficha: la principal y sus unidades, o el grupo armado por gente confirmada en dos fichas
 *          (Teamnet y Stratosphere), con siglas, dominios, proyectos, reuniones y la gente confirmada de cada una
 *          (lib/clients/unidades-server.ts › `vistaDeLasUnidades`), y qué puede hacer quien mira.
 *   POST → { accion: "simular" | "guardar", fichaId?, nombre?, siglas, dominios, proyectos?, asignar?, moverIgual?, huella? }
 *          (lib/clients/unidades.ts › `PedidoDeUnidadSchema`). Con `fichaId` cambia las siglas o el dominio de esa ficha;
 *          sin él agrega una unidad a la principal. `simular` devuelve la vista previa (qué reuniones cambian de ficha, cuáles
 *          se protegen, qué proyectos pueden pasar) sin escribir; `guardar` escribe exactamente lo que se vio (`huella`) o
 *          responde 409 con `vistaNueva`.
 *
 * Acceso: lo ve quien abre la ficha. Crear unidades y cambiarles siglas o dominio: Customer Success y el Super Admin
 * (Elías, 26 nov; lib/clients/unidades.ts › `puedeEditarUnidades`). Un cambio que movería reuniones de una ficha que quien
 * pide no abre se rechaza entero, también la vista previa.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { HubspotNoRespondio } from "@/lib/sessions/resolve-client";
import { puedeEditarUnidades, puedeJuntarUnidades } from "@/lib/clients/unidades";
import { PedidoDeUnidadSchema } from "@/lib/clients/unidades-esquema";
import { RechazoDeUnidad, guardarUnidad, simularUnidad, vistaDeLasUnidades } from "@/lib/clients/unidades-server";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

const FALTA_EL_SQL = "Falta correr el SQL de los interlocutores (scripts/sql/2026-11-25-interlocutores-confirmados.sql).";

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const rol = guard.user.teamMember?.roleEnum ?? null;
  try {
    const vista = await vistaDeLasUnidades(id, guard.user.teamMember?.id ?? null);
    return NextResponse.json(
      { ...vista, puedeEditar: puedeEditarUnidades(rol), puedeJuntar: puedeJuntarUnidades(rol) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  if (!puedeEditarUnidades(guard.user.teamMember?.roleEnum)) {
    return NextResponse.json({ error: "Las unidades las crea y las cambia Customer Success." }, { status: 403 });
  }
  const leido = PedidoDeUnidadSchema.safeParse(await req.json().catch(() => null));
  if (!leido.success) return NextResponse.json({ error: leido.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
  const { accion, ...pedido } = leido.data;
  const teamMemberId = guard.user.teamMember?.id ?? null;
  try {
    if (accion === "simular") return NextResponse.json(await simularUnidad(id, pedido, teamMemberId));
    const hecho = await guardarUnidad(id, pedido, { teamMemberId, email: guard.user.email });
    const vista = await vistaDeLasUnidades(id, teamMemberId);
    return NextResponse.json({ ...hecho, vista: { ...vista, puedeEditar: true, puedeJuntar: puedeJuntarUnidades(guard.user.teamMember?.roleEnum) } });
  } catch (e) {
    if (e instanceof RechazoDeUnidad) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    if (e instanceof HubspotNoRespondio) {
      return NextResponse.json({ error: "No se pudo comprobar en HubSpot de quién son algunas reuniones. Prueba en un momento." }, { status: 503 });
    }
    throw e;
  }
}
