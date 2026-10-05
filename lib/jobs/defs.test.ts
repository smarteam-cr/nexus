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

const { claimDateKey, liberarTurno, sincronizarOdoo, sincronizarMercury, tickMarketingCron, refrescarAlertasDeCobranza, barrerTokens, barrerIntentos } =
  vi.hoisted(() => ({
    claimDateKey: vi.fn(),
    liberarTurno: vi.fn(),
    sincronizarOdoo: vi.fn(),
    sincronizarMercury: vi.fn(),
    tickMarketingCron: vi.fn(),
    refrescarAlertasDeCobranza: vi.fn(),
    barrerTokens: vi.fn(),
    barrerIntentos: vi.fn(),
  }));

// El turno del día se reclama contra la base: cada test decide si este proceso lo ganó.
vi.mock("./registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./registry")>()),
  claimDateKey,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    cronJobState: { updateMany: liberarTurno },
    printJobToken: { deleteMany: barrerTokens },
    externalVerifyAttempt: { deleteMany: barrerIntentos },
  },
}));
vi.mock("@/lib/cobranza/odoo/sync", () => ({ sincronizarOdoo }));
vi.mock("@/lib/cobranza/mercury/sync", () => ({ sincronizarMercury }));
vi.mock("@/lib/cobranza/alertas-refresco", () => ({ refrescarAlertasDeCobranza }));
vi.mock("@/lib/marketing/cron", () => ({ tickMarketingCron }));
// «Para ti»: el mantenimiento borra los avisos viejos (la base acá está simulada).
const borrarAvisosViejos = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/lib/para-ti/avisos-server", () => ({ borrarAvisosViejos }));
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
import { NOMBRE_DE_JOB, nombreDeJob } from "./nombres";

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
    clientesNuevos: 0,
    ...cambios,
  };
}

beforeEach(() => {
  claimDateKey.mockReset().mockResolvedValue(true);
  liberarTurno.mockReset().mockResolvedValue({ count: 1 });
  sincronizarOdoo.mockReset();
  sincronizarMercury.mockReset();
  tickMarketingCron.mockReset();
  refrescarAlertasDeCobranza.mockReset();
  barrerTokens.mockReset().mockResolvedValue({ count: 0 });
  barrerIntentos.mockReset().mockResolvedValue({ count: 0 });
});

describe("maintenance-daily", () => {
  /* Desde el 2026-09-12 refresca también las alertas de cobranza: el corte quincenal estaba apagado
     y una promesa rota tardaba hasta 15 días en subir. Va colgado de este job porque ya corre en
     producción sin ninguna variable. */
  const MEDIANOCHE = new Date("2026-09-13T06:05:00Z"); // 00:05 del 13 en Costa Rica

  it("barre y refresca las alertas de cobranza con la hora del tick", async () => {
    refrescarAlertasDeCobranza.mockResolvedValue({ hoy: "2026-09-13", creadas: 1, fundidas: 3, suprimidas: 0, cerradas: 17 });
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(job("maintenance-daily").run(MEDIANOCHE)).resolves.not.toBe(SIN_TURNO);
    } finally {
      silencio.mockRestore();
    }
    expect(claimDateKey).toHaveBeenCalledWith("maintenance-daily", "2026-09-13", MEDIANOCHE);
    expect(barrerTokens).toHaveBeenCalled();
    expect(refrescarAlertasDeCobranza).toHaveBeenCalledWith(MEDIANOCHE);
  });

  it("un refresco que falla LANZA y retiene el turno: rojo en Integraciones, sin reintentar cada minuto", async () => {
    refrescarAlertasDeCobranza.mockRejectedValue(new Error("ECONNRESET"));
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(job("maintenance-daily").run(MEDIANOCHE)).rejects.toThrow("ECONNRESET");
    } finally {
      silencio.mockRestore();
    }
    expect(liberarTurno).not.toHaveBeenCalled();
  });

  it("sin el turno del día no barre ni refresca", async () => {
    claimDateKey.mockResolvedValue(false);
    await expect(job("maintenance-daily").run(MEDIANOCHE)).resolves.toBe(SIN_TURNO);
    expect(barrerTokens).not.toHaveBeenCalled();
    expect(refrescarAlertasDeCobranza).not.toHaveBeenCalled();
  });

  it("⭐ si el borrado de avisos de «Para ti» lanza, las alertas de cobranza se refrescan igual y el job termina en rojo", async () => {
    /* Hasta el 2026-10-05 el borrado de avisos corría ANTES del refresco sin aislarlo: si lanzaba, las
       alertas de cobranza no se refrescaban ese día. La edición que lo pone en rojo: volver a llamar
       los pasos en fila, sin `correrPasosAislados`. */
    borrarAvisosViejos.mockRejectedValueOnce(new Error("timeout de la base"));
    refrescarAlertasDeCobranza.mockResolvedValue({ hoy: "2026-09-13", creadas: 0, fundidas: 0, suprimidas: 0, cerradas: 0 });
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    let lanzado: unknown = null;
    try {
      await job("maintenance-daily").run(MEDIANOCHE);
    } catch (e) {
      lanzado = e;
    } finally {
      silencio.mockRestore();
      errores.mockRestore();
    }
    expect(refrescarAlertasDeCobranza, "un paso roto dejó sin refrescar las alertas de cobranza").toHaveBeenCalledWith(MEDIANOCHE);
    expect(barrerTokens).toHaveBeenCalled();
    // Y el fallo llega al scheduler: rojo en Integraciones y Sentry, con QUÉ paso falló.
    expect(lanzado, "el job terminó sin lanzar: el fallo del paso quedó tapado").toMatchObject({
      name: "PasosDelJobFallidos",
      fallidos: ["avisos viejos de «Para ti»"],
    });
    expect((lanzado as Error).message).toMatch(/avisos viejos de «Para ti»: timeout de la base/);
    expect(liberarTurno, "el turno del día se queda: no se martilla la base cada minuto").not.toHaveBeenCalled();
  });
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

  it("si alguien pidió la copia con el botón justo a las 6, suelta el turno y no anota ni un ok ni un fallo", async () => {
    /* La edición que lo pone en rojo: tratar `enCurso` como un fallo (lanzaría y pintaría Integraciones de rojo por
       una copia que sí se está haciendo) o quedarse con el turno (la copia de la mañana no correría ese día). */
    sincronizarOdoo.mockResolvedValue(corrida({ ok: false, enCurso: true, corridaId: "", error: "Ya hay una copia de Odoo en curso." }));
    await expect(job("odoo-espejo-daily").run(AHORA)).resolves.toBe(SIN_TURNO);
    expect(liberarTurno).toHaveBeenCalledWith({
      where: { id: "odoo-espejo-daily", lastRunDateKey: HOY },
      data: { lastRunDateKey: null },
    });
  });
});

describe("mercury-espejo-daily", () => {
  const copia = (c: Record<string, unknown>) => ({
    corridaId: "m-1",
    ok: true,
    parcial: false,
    facturasVistas: 76,
    clientesVistos: 30,
    movimientosVistos: 600,
    creadas: 0,
    actualizadas: 0,
    desaparecidas: 0,
    clientesNuevos: 0,
    movimientosNuevos: 0,
    rechazadas: [],
    error: null,
    clase: null,
    duracionMs: 1,
    ...c,
  });

  it("un token rechazado LANZA y retiene el turno: no se reintenta cada minuto con un token muerto", async () => {
    sincronizarMercury.mockResolvedValue(copia({ ok: false, clase: "TOKEN", error: "401" }));
    const run = job("mercury-espejo-daily").run(AHORA);
    await expect(run).rejects.toThrow(/FALLÓ \(TOKEN\).*turno RETENIDO/);
    await expect(run).rejects.toMatchObject({ name: "SyncMercuryFallido" });
    expect(liberarTurno).not.toHaveBeenCalled();
  });

  it("un fallo de red o un «esperá» de Mercury LANZA y libera el turno para reintentar", async () => {
    for (const clase of ["RED", "LIMITE"]) {
      liberarTurno.mockClear();
      sincronizarMercury.mockResolvedValue(copia({ ok: false, clase, error: "x" }));
      await expect(job("mercury-espejo-daily").run(AHORA)).rejects.toThrow(/turno liberado/);
      expect(liberarTurno).toHaveBeenCalledWith({ where: { id: "mercury-espejo-daily", lastRunDateKey: HOY }, data: { lastRunDateKey: null } });
    }
  });

  it("una corrida parcial LANZA y retiene el turno; una buena cuenta como corrida", async () => {
    sincronizarMercury.mockResolvedValue(copia({ ok: false, parcial: true, clase: "RED", error: "trajo 10 de 76" }));
    await expect(job("mercury-espejo-daily").run(AHORA)).rejects.toThrow(/corrida PARCIAL.*turno RETENIDO/);
    expect(liberarTurno).not.toHaveBeenCalled();
    sincronizarMercury.mockResolvedValue(copia({ ok: true }));
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(job("mercury-espejo-daily").run(AHORA)).resolves.not.toBe(SIN_TURNO);
    } finally {
      silencio.mockRestore();
    }
  });

  it("con otra copia en curso suelta el turno y no anota nada", async () => {
    sincronizarMercury.mockResolvedValue(copia({ ok: false, enCurso: true, corridaId: "" }));
    await expect(job("mercury-espejo-daily").run(AHORA)).resolves.toBe(SIN_TURNO);
    expect(liberarTurno).toHaveBeenCalled();
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

describe("cada job tiene nombre legible («Para ti» dice QUÉ falló)", () => {
  /* Hasta el 2026-10-05 el mapa de nombres vivía escrito a mano en lib/para-ti/fuentes/equipo-y-sistema.ts y un job
     que no estaba ahí se descartaba en silencio: el fallo de `tipo-cambio-daily`, `google-enrich-retry` o
     `cs-watchdog-debounce` no le llegaba a nadie. La edición que la pone en rojo: agregar un job a `allJobs()` sin
     su nombre en lib/jobs/nombres.ts. */
  it("cada clave de allJobs() está en NOMBRE_DE_JOB", () => {
    const sinNombre = allJobs()
      .map((j) => j.key)
      .filter((k) => !NOMBRE_DE_JOB[k]);
    expect(sinNombre, "jobs sin nombre legible en lib/jobs/nombres.ts").toEqual([]);
  });

  it("los que faltaban están, y el vigía diario sigue", () => {
    for (const k of ["tipo-cambio-daily", "google-enrich-retry", "cs-watchdog-debounce", "cs-watchdog-daily"]) {
      expect(NOMBRE_DE_JOB[k], k).toBeTruthy();
    }
  });

  it("un job sin nombre no se descarta: sale con su clave", () => {
    expect(nombreDeJob("job-que-no-existe")).toBe("job-que-no-existe");
    expect(nombreDeJob("odoo-espejo-daily")).toBe("La copia de Odoo");
  });
});

// ── tipo-cambio-daily (auditoría 2026-10-05) ─────────────────────────────────────
// vi.mock y vi.hoisted suben solos al principio del archivo: acá quedan junto a las pruebas que los usan.
const { sincronizarTipoDeCambio, estadoDelTurno } = vi.hoisted(() => ({ sincronizarTipoDeCambio: vi.fn(), estadoDelTurno: vi.fn() }));
vi.mock("@/lib/finanzas/tipo-cambio-server", () => ({ sincronizarTipoDeCambio }));

describe("tipo-cambio-daily", () => {
  const resultado = (c: Record<string, unknown>) => ({
    ok: true,
    fuente: "HACIENDA",
    nuevos: 1,
    corregidos: 0,
    desde: "2026-09-09",
    hasta: HOY,
    faltaHistorico: false,
    avisos: [],
    transitorio: false,
    ...c,
  });
  const pasajero = resultado({ ok: false, fuente: null, nuevos: 0, avisos: ["La tasa de hoy de Hacienda: no respondió (timeout)"], transitorio: true });

  beforeEach(async () => {
    sincronizarTipoDeCambio.mockReset();
    estadoDelTurno.mockReset().mockResolvedValue(null);
    // El estado del turno se lee con findUnique: se cuelga del prisma simulado de arriba sin tocar su forma.
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.cronJobState as unknown as { findUnique: typeof estadoDelTurno }).findUnique = estadoDelTurno;
  });

  it("un fallo pasajero LANZA, suelta el turno y dice cuándo vuelve a probar", async () => {
    sincronizarTipoDeCambio.mockResolvedValue(pasajero);
    await expect(job("tipo-cambio-daily").run(AHORA)).rejects.toThrow(/turno liberado: reintenta en 30 minutos/);
    expect(liberarTurno).toHaveBeenCalledWith({ where: { id: "tipo-cambio-daily", lastRunDateKey: HOY }, data: { lastRunDateKey: null } });
  });

  it("⭐ después de un fallo pasajero NO reintenta al minuto siguiente: espera, y pasada la espera vuelve a probar", async () => {
    /* Hasta el 2026-10-05 el turno suelto se volvía a tomar en el tick siguiente: con Hacienda caída eran cientos de
       intentos por día, cada uno con su evento en Sentry y el tick trabado esperando a Hacienda. La edición que lo pone
       en rojo: sacar la lectura de `lastRunAt` antes del claim. */
    const { ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS } = await import("./defs");
    sincronizarTipoDeCambio.mockResolvedValue(resultado({}));
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Un minuto después del fallo: el turno está suelto, pero todavía no pasó la espera.
      estadoDelTurno.mockResolvedValue({ lastRunDateKey: null, lastRunAt: new Date(AHORA.getTime() - 60_000) });
      const salida = await job("tipo-cambio-daily").run(AHORA);
      expect(sincronizarTipoDeCambio, "reintentó un minuto después del fallo").not.toHaveBeenCalled();
      expect(claimDateKey).not.toHaveBeenCalled();
      expect(salida, "esperar no es una corrida: no anota «ok»").toBe(SIN_TURNO);

      // Pasada la espera, vuelve a probar.
      estadoDelTurno.mockResolvedValue({ lastRunDateKey: null, lastRunAt: new Date(AHORA.getTime() - ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS) });
      await expect(job("tipo-cambio-daily").run(AHORA)).resolves.not.toBe(SIN_TURNO);
    } finally {
      silencio.mockRestore();
    }
    expect(sincronizarTipoDeCambio).toHaveBeenCalledTimes(1);
  });

  it("el turno de un día anterior no hace esperar: el primer intento del día corre", async () => {
    estadoDelTurno.mockResolvedValue({ lastRunDateKey: "2026-09-11", lastRunAt: new Date(AHORA.getTime() - 60_000) });
    sincronizarTipoDeCambio.mockResolvedValue(resultado({}));
    const silencio = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(job("tipo-cambio-daily").run(AHORA)).resolves.not.toBe(SIN_TURNO);
    } finally {
      silencio.mockRestore();
    }
    expect(claimDateKey).toHaveBeenCalledWith("tipo-cambio-daily", HOY, AHORA);
  });
});
