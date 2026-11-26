/**
 * /api/clients/[id]/unidades/juntar — el SIMULACRO de juntar una unidad con su principal (2026-11-26).
 *
 *   POST → { unidadId } (lib/clients/unidades.ts › `PedidoDeJuntarSchema`): lo que pasaría a la principal (proyectos,
 *          reuniones, propuestas, preventas, gente confirmada, cuenta de cobro). No escribe nada.
 *
 * Solo el Super Admin o la CSL (Elías, 26 nov; `puedeJuntarUnidades`). Juntar borra la ficha de la unidad y no se puede
 * deshacer: después de ver esto lo aplica una persona con scripts/merge-duplicate-clients.ts (CLAUDE.md, invariante 3).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { clientesQueNoAbre } from "@/lib/auth/access";
import { puedeJuntarUnidades } from "@/lib/clients/unidades";
import { PedidoDeJuntarSchema } from "@/lib/clients/unidades-esquema";
import { fichasDeLaEmpresa } from "@/lib/clients/personas-de-la-empresa-server";
import { RechazoDeUnidad, simularJuntar } from "@/lib/clients/unidades-server";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  if (!puedeJuntarUnidades(guard.user.teamMember?.roleEnum)) {
    return NextResponse.json({ error: "Juntar unidades lo hace un Super Admin o la CSL." }, { status: 403 });
  }
  const leido = PedidoDeJuntarSchema.safeParse(await req.json().catch(() => null));
  if (!leido.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { unidadId } = leido.data;
  const empresa = await fichasDeLaEmpresa(id);
  if (!empresa.some((f) => f.id === unidadId && !f.principal)) return NextResponse.json({ error: "Esa ficha no es una unidad de esta empresa." }, { status: 400 });
  const teamMemberId = guard.user.teamMember?.id;
  if (unidadId !== id && (!teamMemberId || (await clientesQueNoAbre(teamMemberId, [unidadId])).size > 0)) {
    return NextResponse.json({ error: "No tienes acceso a esa unidad." }, { status: 403 });
  }
  try {
    return NextResponse.json(await simularJuntar(unidadId));
  } catch (e) {
    if (e instanceof RechazoDeUnidad) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
