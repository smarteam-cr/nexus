/**
 * GET /api/tareas/agenda/semana?semana=AAAA-MM-DD — lo ocupado de TU calendario esa semana (lunes a viernes), para
 * proponer horarios. Solo el tuyo: nunca se lee el calendario de otra persona. Sin Google configurado (local), vacío.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas } from "@/lib/tareas/http";
import { googleConfigurado, ocupadoEntre } from "@/lib/google/agenda";
import { lunesDeFecha, lunesDeHoy, sumarDias } from "@/lib/tareas/semana";
import { instanteCR } from "@/lib/tareas/agenda";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const pedida = req.nextUrl.searchParams.get("semana");
  const lunes = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? lunesDeFecha(pedida) : lunesDeHoy();
  if (!googleConfigurado()) return NextResponse.json({ semana: lunes, ocupado: [], sinGoogle: true });
  try {
    const ocupado = await ocupadoEntre(p.ctx.email, instanteCR(lunes, 0), instanteCR(sumarDias(lunes, 5), 0));
    return NextResponse.json({ semana: lunes, ocupado, sinGoogle: false });
  } catch (e) {
    // Sin el calendario igual se agenda: la grilla queda sin lo ocupado y la pantalla lo dice.
    console.error(`[tareas] no se pudo leer el calendario de ${p.ctx.email}: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ semana: lunes, ocupado: [], sinGoogle: true, error: "No se pudo leer tu calendario." });
  }
}
