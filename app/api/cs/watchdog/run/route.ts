/**
 * POST /api/cs/watchdog/run   body opcional: { projectId? }
 *
 * Disparo MANUAL del watchdog de Éxito del cliente — botón "Correr watchdog"
 * del panel (y única vía en dev, donde el cron no corre). Con projectId tria
 * ese proyecto; sin projectId corre el sweep completo (pre-filtrado).
 *
 * Guardas contra abuso/doble-click (el sweep = hasta 10 llamadas a Claude):
 *   - El sweep manual SÍ respeta el kill-switch de DB (CsSettings.watchdogEnabled):
 *     es la única palanca que frena el gasto sin deploy. El run por-proyecto lo
 *     bypassa (deliberado: la CSL puede querer triar UN proyecto puntual).
 *   - Lock en-proceso: un solo sweep a la vez; el run por-proyecto ya está
 *     serializado por el mutex del runner.
 * Gateado con seeAllClients.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { runWatchdogForProject, runWatchdogSweep, watchdogEnabled } from "@/lib/cs/watchdog";

let sweepInFlight = false;

export async function POST(req: NextRequest) {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  let body: { projectId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body = sweep */
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : null;

  try {
    if (projectId) {
      const result = await runWatchdogForProject(projectId, "manual");
      return NextResponse.json(result);
    }
    if (!(await watchdogEnabled())) {
      return NextResponse.json(
        { error: "El watchdog está desactivado (CsSettings.watchdogEnabled)." },
        { status: 409 },
      );
    }
    if (sweepInFlight) {
      return NextResponse.json({ error: "Ya hay un sweep corriendo — esperá a que termine." }, { status: 409 });
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
