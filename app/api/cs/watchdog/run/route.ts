/**
 * POST /api/cs/watchdog/run   body opcional: { clientId? , projectId? }
 *
 * Disparo MANUAL del watchdog de Éxito del cliente (y única vía en dev, donde el cron no corre).
 *
 *  · Con `clientId` o `projectId` revisa UN cliente (todos sus proyectos de cartera, o ese
 *    proyecto). Lo puede pedir cualquier persona interna con acceso a ese cliente (D14, Elías
 *    2026-10-05: «lo puede correr quien sea»). Se rechaza con un mensaje claro si ya hay una
 *    revisión en curso para ese cliente o si corrió hace menos de 10 minutos: un doble clic, una
 *    pestaña que reintenta o un script costaban una llamada a Claude cada vez
 *    (lib/cs/vigia-por-cliente.ts).
 *  · Sin ninguno corre el BARRIDO de la cartera (pre-filtrado, hasta 10 llamadas a Claude): ése
 *    sigue en `seeAllClients` — es el botón «Correr watchdog» del índice — con un solo barrido a la
 *    vez en el proceso.
 *
 * ⛔ El interruptor de la base (CsSettings.watchdogEnabled) frena las dos (y por dentro, cada
 * corrida: runWatchdogForProject lo vuelve a mirar). El barrido por cron depende además de
 * CS_WATCHDOG_ENABLED.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardAccessToProject, guardCapability } from "@/lib/auth/api-guards";
import { runWatchdogSweep, watchdogEnabled } from "@/lib/cs/watchdog";
import { vigiaAMano, type MotivoSinCorrer } from "@/lib/cs/vigia-por-cliente";

let sweepInFlight = false;

/** El código HTTP de cada rechazo: 429 = vuelve a pedirlo más tarde; 409 = hoy no se puede. */
const ESTADO_DEL_RECHAZO: Record<MotivoSinCorrer, number> = {
  apagado: 409,
  en_curso: 409,
  reciente: 429,
  espera_tras_fallo: 429,
  sin_proyectos: 409,
  no_es_de_la_cartera: 409,
};

export async function POST(req: NextRequest) {
  let body: { projectId?: unknown; clientId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body = barrido */
  }
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  const pedidoClientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;

  // ── UN cliente: cualquier interno con acceso a ese cliente ────────────────────────────────
  if (projectId || pedidoClientId) {
    const guard = projectId ? await guardAccessToProject(projectId) : await guardAccessToClient(pedidoClientId!);
    if (guard instanceof NextResponse) return guard;
    const clientId = "clientId" in guard ? guard.clientId : pedidoClientId!;
    if (projectId && pedidoClientId && pedidoClientId !== clientId) {
      return NextResponse.json({ error: "Ese proyecto no es de ese cliente." }, { status: 400 });
    }
    try {
      const r = await vigiaAMano(clientId, { projectId, quien: guard.user.email ?? null });
      if (!r.corrio) {
        return NextResponse.json({ error: r.mensaje, motivo: r.motivo }, { status: ESTADO_DEL_RECHAZO[r.motivo] });
      }
      return NextResponse.json({ status: "ok", clientId, resultados: r.resultados });
    } catch (e) {
      console.error("[cs/watchdog/run] error:", e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "El agente vigía falló." }, { status: 500 });
    }
  }

  // ── El BARRIDO de la cartera: sigue siendo de quien ve todos los clientes ─────────────────
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;
  try {
    if (!(await watchdogEnabled())) {
      return NextResponse.json(
        { error: "El agente vigía está apagado desde los ajustes de Éxito del cliente." },
        { status: 409 },
      );
    }
    if (sweepInFlight) {
      return NextResponse.json({ error: "Ya hay un barrido del agente vigía corriendo: espera a que termine." }, { status: 409 });
    }
    sweepInFlight = true;
    try {
      const result = await runWatchdogSweep(new Date());
      return NextResponse.json({ status: "ok", ...result });
    } finally {
      sweepInFlight = false;
    }
  } catch (e) {
    console.error("[cs/watchdog/run] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El watchdog falló." },
      { status: 500 },
    );
  }
}
