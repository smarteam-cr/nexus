/**
 * /api/para-ti/ya-la-agende — «Ya la agendé» de una cuenta sin siguiente paso (2026-10-20, decisión de Elías).
 *
 * GET ?cliente=<id> → las reuniones de tu calendario de los próximos 30 días (leído AHORA, sin lo guardado: la acabas de
 *   agendar), con las de esa cuenta primero. Solo reuniones con alguien más: un evento tuyo solo no es una reunión
 *   agendada con el cliente.
 * POST { clientId, eventoId } → Nexus busca esa reunión en tu calendario y, si está, la deja como reunión planeada de la
 *   cuenta (`planearReunion` con `origenId` «elegida:…», lib/tareas/reunion-elegida.ts): la regla de servicio la cuenta
 *   como el siguiente paso hasta 30 días. Si no está, 404: Nexus no toma la palabra sin verla.
 *
 * Pide acceso a la cuenta (404 si no). Con «Ver como» no se escribe nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/supabase";
import { releerCalendario } from "@/lib/mi-dia/calendario-server";
import { DIAS_PARA_UNA_REUNION_ELEGIDA } from "@/lib/mi-dia/constantes";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { planearReunion } from "@/lib/tareas/mutaciones";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const ID = z.string().min(1).max(60);
const Elegir = z.object({ clientId: ID, eventoId: z.string().min(1).max(300) });

/** Una reunión para elegir. */
export interface ReunionParaElegir {
  id: string;
  titulo: string;
  inicio: string;
  /** Tiene invitados de esa cuenta. */
  deLaCuenta: boolean;
  /** Las empresas de Nexus que reconoce en los invitados, por nombre. */
  empresas: string[];
}

async function conAcceso(clientId: string): Promise<NextResponse | null> {
  try {
    await requireAccessToClient(clientId);
    return null;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const cliente = ID.safeParse(req.nextUrl.searchParams.get("cliente"));
  if (!cliente.success) return NextResponse.json({ error: "Falta la cuenta." }, { status: 400 });
  const sinAcceso = await conAcceso(cliente.data);
  if (sinAcceso) return sinAcceso;
  const ahora = new Date();
  const cal = await releerCalendario(g.teamMember.email, DIAS_PARA_UNA_REUNION_ELEGIDA, ahora);
  if (!cal) return NextResponse.json({ error: "Nexus no pudo leer tu calendario ahora. Prueba en un rato." }, { status: 503 });
  const vienen = cal.reuniones.filter((r) => r.externos + r.internos > 0 && Date.parse(r.fin ?? r.inicio) >= ahora.getTime());
  const ids = [...new Set(vienen.flatMap((r) => r.empresas))];
  const nombres = new Map(
    ids.length ? (await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name] as const) : [],
  );
  const reuniones: ReunionParaElegir[] = vienen
    .map((r) => ({
      id: r.id,
      titulo: r.titulo,
      inicio: r.inicio,
      deLaCuenta: r.empresas.includes(cliente.data),
      empresas: r.empresas.map((e) => nombres.get(e) ?? "").filter(Boolean),
    }))
    .sort((a, b) => Number(b.deLaCuenta) - Number(a.deLaCuenta) || a.inicio.localeCompare(b.inicio));
  return NextResponse.json({ reuniones, dias: DIAS_PARA_UNA_REUNION_ELEGIDA }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  if (g.user.verComoDe) return NextResponse.json({ error: "Mientras ves Nexus como otra persona no se guarda nada." }, { status: 403 });
  const body = Elegir.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Elige una reunión." }, { status: 400 });
  const sinAcceso = await conAcceso(body.data.clientId);
  if (sinAcceso) return sinAcceso;
  const p = await prepararTareas(g);
  if (p instanceof NextResponse) return p;
  const cal = await releerCalendario(g.teamMember.email, DIAS_PARA_UNA_REUNION_ELEGIDA);
  if (!cal) return NextResponse.json({ error: "Nexus no pudo leer tu calendario ahora. Prueba en un rato." }, { status: 503 });
  const r = cal.reuniones.find((x) => x.id === body.data.eventoId);
  if (!r) return NextResponse.json({ error: "Esa reunión ya no está en tu calendario." }, { status: 404 });
  try {
    const t = await planearReunion(p.ctx, p.clientes, { clientId: body.data.clientId, titulo: r.titulo || "Reunión", inicio: r.inicio, eventoId: r.id });
    return NextResponse.json({ ok: true, tareaId: t.id, inicio: r.inicio, titulo: r.titulo });
  } catch (e) {
    return respuestaDeError(e);
  }
}
