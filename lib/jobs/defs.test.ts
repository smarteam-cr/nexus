/**
 * lib/jobs/defs.test.ts — LOS JOBS REALES LANZAN CUANDO FALLAN Y DICEN CUANDO NO CORRIERON.
 *
 * `scheduler.test.ts` prueba el scheduler con jobs de mentira: un `run` que lanza queda en rojo y
 * un `SIN_TURNO` no anota «ok». Eso no protege nada si el job real no lanza. Hasta el 2026-09-12
 * `odoo-espejo-daily` escribía el fallo en el log y volvía como si nada, y el semáforo quedó en
 * verde diez días con el espejo muerto. `marketing-weekly` anotaba «ok» cada diez minutos toda la
 * semana, así que un viernes fallido se tapaba al tick siguiente.
 *
 * Acá corren los `run` de `defs.ts`, con el sync de Odoo, el turno del día y la base simulados.
 *
 * Correr: `npx vitest run lib/jobs/defs.test.ts --project unit`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultadoSync } from "@/lib/cobranza/odoo/sync";

const { claimDateKey, liberarTurno, sincronizarOdoo, tickMarketingCron } = vi.hoisted(() => ({
  claimDateKey: vi.fn(),
  liberarTurno: vi.fn(),
  sincronizarOdoo: vi.fn(),
  tickMarketingCron: vi.fn(),
}));

// El turno del día se reclama contra la base: cada test decide si este proceso lo ganó.
vi.mock("./registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./registry")>()),
  claimDateKey,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { cronJobState: { updateMany: liberarTurno } } }));
vi.mock("@/lib/cobranza/odoo/sync", () => ({ sincronizarOdoo }));
vi.mock("@/lib/marketing/cron", () => ({ tickMarketingCron }));
// El resto de lo que importa defs.ts arrastra HubSpot, Anthropic y media app, y acá no corre.
vi.mock("@/lib/hubspot/cs-signals", () => ({ refreshAllCsSignals: vi.fn() }));
vi.mock("@/lib/cs/partner-sync", () => ({ syncPartnerClients: vi.fn() }));
vi.mock("@/lib/ventas/sync-ganadas", () => ({ syncVentasGanadas: vi.fn() }));
vi.mock("@/lib/cs/watchdog", () => ({
  watchdogJobs: {
    daily: { key: "cs-watchdog-daily", shouldRun: () => false, run: vi.fn() },
    debounce: { key: "cs-watchdog-debounce", shouldRun: () => false, run: vi.fn() },
  },
}));

import { allJobs } from "./defs";
import { SIN_TURNO } from "./registry";

const AHORA = new Date("2026-09-12T12:05:00Z"); // 6:05 en Costa Rica, cuando corre el espejo
const HOY = "2026-09-12";

function job(key: string) {
  const encontrado = allJobs().find((j) => j.key === key);
  if (!encontrado) throw new Error(`defs.ts no tiene el job ${key}`);
  return encontrado;
}

function corrida(cambios: Partial<ResultadoSync>): ResultadoSync {
  return {
    corridaId: "corrida-1",
    ok: true,
    parcial: false,
    facturasVistas: 347,
    espejadas: 347,
    creadas: 0,
    actualizadas: 0,
    desaparecidas: 0,
    cambios: 0,
    rechazadas: [],
    sinCuenta: 0,
    movidasDesdeLaUltima: 0,
    error: null,
    clase: null,
    duracionMs: 1,
    ...cambios,
  };
}

beforeEach(() => {
  claimDateKey.mockReset().mockResolvedValue(true);
  liberarTurno.mockReset().mockResolvedValue({ count: 1 });
  sincronizarOdoo.mockReset();
  tickMarketingCron.mockReset();
});

describe("odoo-espejo-daily", () => {
  it("un rechazo de credenciales LANZA y retiene el turno: rojo en el semáforo, sin reintentar cada minuto", async () => {
    /* La edición que lo pone en rojo: volver a `console.error(…); return;`. El scheduler anota «ok»
       y el semáforo queda en verde con el espejo muerto, que es como pasaron diez días. */
    sincronizarOdoo.mockResolvedValue(corrida({ ok: false, clase: "AUTENTICACION", error: "Access Denied" }));
    const run = job("odoo-espejo-daily").run(AHORA);
    await expect(run).rejects.toThrow(/FALLÓ \(AUTENTICACION\): Access Denied; turno RETENIDO/);
    await expect(run).rejects.toMatchObject({ name: "SyncOdooFallido" });
    expect(claimDateKey).toHaveBeenCalledWith("odoo-espejo-daily", HOY, AHORA);
    expect(liberarTurno, "reintentar con la clave rechazada suma al bloqueo en Odoo").not.toHaveBeenCalled();
  });

  it("un fallo de red LANZA y libera el turno de hoy para reintentar en el tick siguiente", async () => {
    sincronizarOdoo.mockResolvedValue(corrida({ ok: false, clase: "RED", error: "ECONNRESET" }));
    await expect(job("odoo-espejo-daily").run(AHORA)).rejects.toThrow(/FALLÓ \(RED\).*turno liberado/);
    expect(liberarTurno).toHaveBeenCalledWith({
      where: { id: "odoo-espejo-daily", lastRunDateKey: HOY },
      data: { lastRunDateKey: null },
    });
  });

  it("una corrida parcial LANZA y retiene el turno", async () => {
    sincronizarOdoo.mockResolvedValue(corrida({ ok: false, parcial: true, error: "Odoo devolvió 120 de 347" }));
    await expect(job("odoo-espejo-daily").run(AHORA)).rejects.toThrow(/corrida PARCIAL.*turno RETENIDO/);
    expect(liberarTurno).not.toHaveBeenCalled();
  });

  it("una corrida buena termina sin lanzar y cuenta como corrida", async () => {
    sincronizarOdoo.mockResolvedValue(corrida({ ok: true }));
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(job("odoo-espejo-daily").run(AHORA)).resolves.not.toBe(SIN_TURNO);
    } finally {
      silencio.mockRestore();
    }
  });

  it("sin el turno del día no llama a Odoo y devuelve SIN_TURNO", async () => {
    claimDateKey.mockResolvedValue(false);
    await expect(job("odoo-espejo-daily").run(AHORA)).resolves.toBe(SIN_TURNO);
    expect(sincronizarOdoo).not.toHaveBeenCalled();
  });
});

describe("marketing-weekly", () => {
  it("si no dispara devuelve SIN_TURNO; el viernes que dispara es una corrida", async () => {
    /* La edición que lo pone en rojo: volver a `await tickMarketingCron(now)` pelado. El scheduler
       anota «ok» cada diez minutos toda la semana y tapa el rojo de un viernes fallido. */
    tickMarketingCron.mockResolvedValue({ fired: false, reason: "no es viernes en CR (es Sat)" });
    await expect(job("marketing-weekly").run(AHORA)).resolves.toBe(SIN_TURNO);
    tickMarketingCron.mockResolvedValue({ fired: true, runId: "run-1" });
    await expect(job("marketing-weekly").run(AHORA)).resolves.not.toBe(SIN_TURNO);
  });
});
