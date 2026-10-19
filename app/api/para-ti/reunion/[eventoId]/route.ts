/**
 * /api/para-ti/reunion/[eventoId] — el panel de una reunión de tu agenda en el inicio (ficha D, 2026-10-17).
 *
 * GET ?cliente=<id>&inicio=<ISO>[&propio=1] → la guía con su objetivo, quién viene, la última vez, lo pendiente, el negocio y,
 *   si ya pasó, lo que dejó. Sin `cliente` (una reunión interna), solo lo que preparaste. Pide acceso al cliente: sin
 *   acceso, 404. El evento se lee del calendario de quien lo pide.
 *   Con `propio=1` (un evento propio de la agenda, 2026-10-19) no se lee el evento y, sin acceso a la cuenta, se
 *   responde lo tuyo sin la cuenta en vez de 404: el evento es tuyo aunque nombre a una empresa que no ves.
 * PUT { objetivo?, notas? } → guarda TU objetivo y TUS notas de esa reunión (las ve solo quien las escribe).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { crDateParts } from "@/lib/jobs/time";
import { panelDeLaReunion } from "@/lib/mi-dia/panel-server";
import { guardarPreparacion, TOPE_DE_LAS_NOTAS, TOPE_DEL_OBJETIVO } from "@/lib/mi-dia/preparacion-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ eventoId: string }> };

const EVENTO = z.string().min(1).max(300);
const ID = z.string().min(1).max(60);

export async function GET(req: NextRequest, { params }: Params) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const evento = EVENTO.safeParse(decodeURIComponent((await params).eventoId));
  if (!evento.success) return NextResponse.json({ error: "El evento no es válido." }, { status: 400 });
  const clienteCrudo = req.nextUrl.searchParams.get("cliente");
  const cliente = clienteCrudo ? ID.safeParse(clienteCrudo) : null;
  if (cliente && !cliente.success) return NextResponse.json({ error: "El cliente no es válido." }, { status: 400 });
  const inicioCrudo = req.nextUrl.searchParams.get("inicio");
  const inicio = inicioCrudo && !Number.isNaN(Date.parse(inicioCrudo)) ? new Date(inicioCrudo).toISOString() : null;
  const propio = req.nextUrl.searchParams.get("propio") === "1";
  let clientId = cliente?.success ? cliente.data : null;
  if (clientId) {
    try {
      await requireAccessToClient(clientId);
    } catch (e) {
      if (!(e instanceof ForbiddenError || e instanceof UnauthorizedError)) throw e;
      if (!propio) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
      clientId = null;
    }
  }
  const permisos = await getEffectivePermissions(g.teamMember);
  const ahora = new Date();
  const panel = await panelDeLaReunion({
    eventoId: evento.data,
    clientId,
    user: g.user,
    email: g.teamMember.email,
    rol: g.role,
    veAlertas: esLiderDeCs(g.role),
    veMontos: g.role === "SUPER_ADMIN" || permisos.sections?.ventas?.read === true,
    hoyISO: crDateParts(ahora).dateKey,
    ahora,
    inicio,
    propio,
  });
  if (!panel) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.json(panel, { headers: { "Cache-Control": "no-store" } });
}

const Guardar = z
  .object({
    objetivo: z.string().max(TOPE_DEL_OBJETIVO).nullish(),
    notas: z.string().max(TOPE_DE_LAS_NOTAS).nullish(),
  })
  .refine((b) => b.objetivo !== undefined || b.notas !== undefined, { message: "No hay nada que guardar." });

export async function PUT(req: NextRequest, { params }: Params) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  // Con «Ver como», el objetivo y las notas son de la persona mirada: nadie más los escribe (el GET tampoco los lee).
  if (g.user.verComoDe) return NextResponse.json({ error: "Mientras ves Nexus como otra persona no se guarda su preparación." }, { status: 403 });
  const evento = EVENTO.safeParse(decodeURIComponent((await params).eventoId));
  if (!evento.success) return NextResponse.json({ error: "El evento no es válido." }, { status: 400 });
  const body = Guardar.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Lo que mandaste no es válido." }, { status: 400 });
  const r = await guardarPreparacion(g.teamMember.email, evento.data, body.data);
  if (r === "sin-tabla") {
    return NextResponse.json({ error: "Todavía no se puede guardar: falta aplicar scripts/sql/2026-10-17-ficha-d-preparacion-de-reunion.sql." }, { status: 503 });
  }
  return NextResponse.json(r);
}
