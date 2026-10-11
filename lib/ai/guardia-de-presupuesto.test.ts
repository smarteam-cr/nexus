/**
 * lib/ai/guardia-de-presupuesto.test.ts — EL JOB QUE ARRANCA UNA TANDA PREGUNTA SI QUEDA PRESUPUESTO, AUNQUE EL BLOQUEO
 * ESTÉ APAGADO (memoria de la cuenta, etapa 2).
 *
 * La lectura de cada reunión (`seguimiento-reuniones`) prefiere no arrancar una tanda a cortarla a la mitad. Por defecto
 * la guardia solo avisa (`PRESUPUESTO_IA_BLOQUEA` apagado), así que el job no puede esperar a que una llamada lance:
 * pregunta antes con `quedaPresupuestoAutomatico`. Y del gasto de la clave `reunion:` en `LlmCall` sale el costo por
 * reunión (`origenDeLaFila`).
 *
 * Correr: `npx vitest run lib/ai/guardia-de-presupuesto.test.ts --project unit`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aggregate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { llmCall: { aggregate } } }));

import { _reiniciarCacheDePresupuesto, quedaPresupuestoAutomatico } from "./guardia-de-presupuesto";
import { conContextoDeIA, conLaReunion, contextoDeIA, origenDeLaFila, reunionDelOrigen } from "./contexto-de-corrida";

const AHORA = new Date("2026-10-10T15:00:00Z");

/** El gasto del día: el primer aggregate es el humano, el segundo el automático (el orden de `refrescar`). */
function gasto(humano: number, automatico: number) {
  aggregate.mockReset();
  aggregate.mockResolvedValueOnce({ _sum: { costUsd: humano } }).mockResolvedValueOnce({ _sum: { costUsd: automatico } });
}

describe("quedaPresupuestoAutomatico", () => {
  beforeEach(() => {
    _reiniciarCacheDePresupuesto();
    vi.stubEnv("PRESUPUESTO_IA_AUTOMATICO_USD_DIA", "15");
    vi.stubEnv("PRESUPUESTO_IA_BLOQUEA", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("con gasto por debajo del tope, queda", async () => {
    gasto(40, 3);
    await expect(quedaPresupuestoAutomatico(AHORA)).resolves.toBe(true);
  });

  it("⭐ excedido, NO queda aunque el bloqueo esté apagado (el job se salta la tanda)", async () => {
    gasto(0, 15.2);
    await expect(quedaPresupuestoAutomatico(AHORA)).resolves.toBe(false);
  });

  it("el gasto humano no cuenta contra el automático", async () => {
    gasto(500, 1);
    await expect(quedaPresupuestoAutomatico(AHORA)).resolves.toBe(true);
  });

  it("espera el refresco: la primera pregunta del proceso ya sabe el gasto (no devuelve «queda» por caché vacía)", async () => {
    gasto(0, 99);
    await expect(quedaPresupuestoAutomatico(AHORA)).resolves.toBe(false);
    expect(aggregate).toHaveBeenCalledTimes(2);
  });

  it("⭐ lo que no se sabe no frena: si la base falla, queda", async () => {
    aggregate.mockReset();
    aggregate.mockRejectedValue(new Error("pooler caído"));
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(quedaPresupuestoAutomatico(AHORA)).resolves.toBe(true);
    consola.mockRestore();
  });

  it("con la caché fresca no vuelve a preguntar a la base", async () => {
    gasto(0, 1);
    await quedaPresupuestoAutomatico(AHORA);
    await quedaPresupuestoAutomatico(new Date(+AHORA + 10_000));
    expect(aggregate).toHaveBeenCalledTimes(2);
  });
});

describe("el costo por reunión: el origen de cada llamada lleva la reunión que la disparó", () => {
  it("sin reunión, el origen es el del sitio (no cambia nada para el resto del sistema)", () => {
    expect(origenDeLaFila({ origen: "timeline/progress" })).toBe("timeline/progress");
    expect(origenDeLaFila(undefined)).toBeNull();
  });

  it("con reunión, «reunion:<id> › <sitio>», y solo «reunion:<id>» si el sitio no dijo nada", () => {
    expect(origenDeLaFila({ reunionId: "s1", origen: "sessions/post-process" })).toBe("reunion:s1 › sessions/post-process");
    expect(origenDeLaFila({ reunionId: "s1" })).toBe("reunion:s1");
  });

  it("⭐ un sitio de adentro pone su origen y la reunión sobrevive (el contexto se acumula)", () => {
    const visto = conLaReunion("s9", () => conContextoDeIA({ agentSlug: "agent-x", origen: "sessions/post-process › avance" }, () => contextoDeIA()));
    expect(origenDeLaFila(visto)).toBe("reunion:s9 › sessions/post-process › avance");
  });

  it("reunionDelOrigen lee la reunión de vuelta (y nada de lo que no es una reunión)", () => {
    expect(reunionDelOrigen("reunion:s1 › sessions/post-process")).toBe("s1");
    expect(reunionDelOrigen("reunion:s2")).toBe("s2");
    expect(reunionDelOrigen("sessions/post-process")).toBeNull();
    expect(reunionDelOrigen(null)).toBeNull();
  });
});
