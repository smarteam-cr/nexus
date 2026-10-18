/**
 * /api/para-ti/agenda — la agenda del inicio al moverse por ella (2026-10-17).
 *
 * GET ?vista=dia|semana&dia=AAAA-MM-DD → las reuniones de ese día (o de esa semana, de lunes a viernes) del calendario
 *   de quien pide, con su empresa. Un sábado o un domingo se ve como el lunes que viene (lib/mi-dia/agenda-dias.ts).
 *
 * GET ?hueco=1 → `{ hueco: { inicio, fin } | null }`: la primera hora libre de trabajo (una hora) de los próximos 8 días,
 *   leída del calendario entero (lib/mi-dia/calendario-server.ts). «Planificar acción» la usa cuando la agenda no está
 *   en pantalla y no sabe qué hay ocupado. null = el calendario no se pudo leer.
 *
 * Existe para que ‹ ›, «Hoy» y Día ↔ Semana no vuelvan a armar «Para ti» entero (unos 6 segundos medidos el
 * 2026-10-17): solo se lee el calendario, y lo leído se guarda un minuto (lib/mi-dia/agenda-server.ts). Solo lectura.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { veLaAgenda } from "@/lib/equipos/registro";
import { agendaDeLaVista } from "@/lib/mi-dia/agenda-server";
import { diaQueSeVe } from "@/lib/mi-dia/agenda-dias";
import { calendarioDeLosProximosDias } from "@/lib/mi-dia/calendario-server";
import { primerHuecoLaboral } from "@/lib/mi-dia/inicio";
import { MINUTOS_DEL_BORRADOR } from "@/lib/mi-dia/agenda-borrador";

export const dynamic = "force-dynamic";

const Pedido = z.object({
  vista: z.enum(["dia", "semana"]),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  if (!veLaAgenda(g.role)) return NextResponse.json({ error: "Tu inicio no tiene agenda." }, { status: 403 });
  if (req.nextUrl.searchParams.get("hueco") === "1") {
    const ahora = new Date();
    const cal = await calendarioDeLosProximosDias(g.teamMember.email, ahora);
    const hueco = cal ? primerHuecoLaboral([...cal.ocupado], ahora, { minutos: MINUTOS_DEL_BORRADOR }) : null;
    return NextResponse.json({ hueco }, { headers: { "Cache-Control": "no-store" } });
  }
  const p = Pedido.safeParse({ vista: req.nextUrl.searchParams.get("vista"), dia: req.nextUrl.searchParams.get("dia") });
  if (!p.success) return NextResponse.json({ error: "El día no es válido." }, { status: 400 });
  const dia = diaQueSeVe(p.data.vista, p.data.dia);
  const agenda = await agendaDeLaVista(g.teamMember.email, p.data.vista, dia);
  return NextResponse.json({ vista: p.data.vista, dia, agenda }, { headers: { "Cache-Control": "no-store" } });
}
