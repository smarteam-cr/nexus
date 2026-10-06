/**
 * POST /api/cs/watchdog/al-entrar   body: { clientId }
 *
 * El disparo POR NAVEGACIÓN del agente vigía (D14, Elías 2026-10-05: «que se actualice cada vez que
 * alguien entra al cliente y tenga más de 2 días sin correr para ese cliente»). Lo llaman la ficha
 * del cliente y su cuenta en Éxito del cliente al abrirse (`components/cs/DisparoDelVigia.tsx`),
 * en segundo plano: contesta enseguida y la revisión sigue en el servidor. Si el vigía corrió para
 * algún proyecto de cartera del cliente en las últimas 48 h, no hace nada.
 *
 * El freno vive en `vigiaAlEntrar` (lib/cs/vigia-por-cliente.ts, molde del auto-sync de Meet): lee
 * la última corrida antes de escribir, el proceso recuerda hasta cuándo no toca, una sola revisión a
 * la vez por cliente y una hora de espera tras un fallo. El interruptor de la base la frena.
 * Cualquier interno con acceso a ese cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { vigiaAlEntrar } from "@/lib/cs/vigia-por-cliente";

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body → 400 abajo */
  }
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (!clientId) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });

  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  // En segundo plano: la página no espera una revisión que puede tardar minutos.
  void vigiaAlEntrar(clientId)
    .then((r) => {
      if (r.corrio) {
        const ok = r.resultados.filter((x) => x.status === "ok").length;
        console.log(`[cs/watchdog/al-entrar] cliente ${clientId}: ${ok}/${r.resultados.length} proyectos revisados`);
      }
    })
    .catch((e) => console.error(`[cs/watchdog/al-entrar] cliente ${clientId}:`, e instanceof Error ? e.message : e));

  return NextResponse.json({ lanzado: true }, { status: 202 });
}
