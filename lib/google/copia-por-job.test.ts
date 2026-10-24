/**
 * lib/google/copia-por-job.test.ts — el job `google-meet-sync` lanza la copia sin esperarla y anota solo lo que corrió.
 *
 * Correr: `npx vitest run lib/google/copia-por-job.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { ESPERA_DEL_JOB_MS, lanzarCopiaDeMeet, type DepsDeLaCopia } from "./copia-por-job";
import { COOLDOWN_MS } from "./auto-sync";

type Corrida = Awaited<ReturnType<DepsDeLaCopia["correr"]>>;

function mundo(correr: () => Promise<Corrida>) {
  const anotadas: { inicio: Date; resultado: Prisma.InputJsonObject }[] = [];
  const avisos: Error[] = [];
  const deps: DepsDeLaCopia = {
    correr,
    anotar: async (inicio, resultado) => {
      anotadas.push({ inicio, resultado });
    },
    avisar: (e) => avisos.push(e),
    ahora: () => new Date("2026-10-25T15:00:00Z"),
  };
  return { deps, anotadas, avisos };
}

describe("lanzarCopiaDeMeet", () => {
  it("vuelve enseguida y una segunda llamada con la corrida en vuelo no arranca otra", async () => {
    let soltar: () => void = () => {};
    const puerta = new Promise<void>((r) => (soltar = r));
    let corridas = 0;
    const { deps, anotadas } = mundo(async () => {
      corridas++;
      await puerta;
      return { skipped: false, sync: { synced: 2, alreadyExisted: 5, canceladas: 1, invitados: 3 }, enrich: { enriched: 1, skipped: 0, errors: 0 }, duracionSeg: 7 };
    });
    const a = lanzarCopiaDeMeet(deps);
    const b = lanzarCopiaDeMeet(deps);
    expect(a.estado).toBe("lanzada");
    expect(b.estado).toBe("en-vuelo");
    expect(anotadas, "no espera a que termine").toEqual([]);
    soltar();
    await a.esperar;
    expect(corridas).toBe(1);
    expect(anotadas).toHaveLength(1);
    expect(anotadas[0].resultado).toMatchObject({ ok: true, nuevas: 2, canceladas: 1, invitados: 3, enriquecidas: 1, duracionSeg: 7 });
  });

  it("sin turno (en espera, o la otra vía corriendo) no anota nada: el semáforo no se pinta de una corrida que no hubo", async () => {
    const { deps, anotadas, avisos } = mundo(async () => ({ skipped: true, reason: "cooldown" }));
    await lanzarCopiaDeMeet(deps).esperar;
    expect(anotadas).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it("un fallo se anota en rojo con su motivo y va a Sentry", async () => {
    const { deps, anotadas, avisos } = mundo(async () => ({ skipped: true, reason: "error", error: "Calendar 500" }));
    await lanzarCopiaDeMeet(deps).esperar;
    expect(anotadas[0].resultado).toMatchObject({ ok: false });
    expect(String(anotadas[0].resultado.error)).toContain("Calendar 500");
    expect(avisos).toHaveLength(1);
  });

  it("si anotar falla, no lanza (corre fuera del try/catch del scheduler)", async () => {
    const { deps, avisos } = mundo(async () => ({ skipped: false, sync: { synced: 0, alreadyExisted: 0 }, enrich: { enriched: 0, skipped: 0, errors: 0 } }));
    deps.anotar = async () => {
      throw new Error("la base no responde");
    };
    await expect(lanzarCopiaDeMeet(deps).esperar).resolves.toBeUndefined();
    expect(avisos[0]?.message).toContain("la base no responde");
  });
});

describe("la espera del job y la vuelta atrás", () => {
  it("el job corre con 10 minutos de espera, no con los 20 del disparo al abrir la app", () => {
    /* La edición que la pone en rojo: llamar a autoSyncGoogleMeet() sin su `cooldownMs` (la copia volvería a ir cada 20). */
    expect(ESPERA_DEL_JOB_MS).toBe(10 * 60 * 1000);
    expect(ESPERA_DEL_JOB_MS).toBeLessThan(COOLDOWN_MS);
    const src = fs.readFileSync(path.join(process.cwd(), "lib/google/copia-por-job.ts"), "utf8");
    expect(src).toMatch(/autoSyncGoogleMeet\(undefined,\s*\{\s*cooldownMs:\s*ESPERA_DEL_JOB_MS\s*\}\)/);
  });

  it("la ruta del disparo al abrir la app no corre donde la copia la hace el job, y no le pasa el error al navegador", () => {
    /* La edición que la pone en rojo: borrar la compuerta; las dos vías se turnan y la del servidor pasa a 20 minutos. */
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/integrations/google/auto-sync/route.ts"), "utf8");
    const compuerta = src.indexOf("if (copiaDeMeetPorJob(process.env))");
    expect(compuerta, "la compuerta").toBeGreaterThan(0);
    expect(compuerta, "antes de correr").toBeLessThan(src.indexOf("await autoSyncGoogleMeet("));
    expect(src).toContain("NextResponse.json({ ...result, error: undefined })");
  });
});

describe("el job en defs.ts", () => {
  it("lanza la copia y devuelve SIN_TURNO: nunca espera la corrida dentro del tick", () => {
    /* La edición que lo pone en rojo: `await lanzarCopiaDeMeet().esperar` o llamar a autoSyncGoogleMeet en el run. */
    const defs = fs.readFileSync(path.join(process.cwd(), "lib/jobs/defs.ts"), "utf8");
    const inicio = defs.indexOf('key: "google-meet-sync"');
    expect(inicio, "el job existe").toBeGreaterThan(0);
    const cuerpo = defs.slice(inicio, defs.indexOf("};", inicio));
    expect(cuerpo).toContain("lanzarCopiaDeMeet();");
    expect(cuerpo).toContain("return SIN_TURNO;");
    expect(cuerpo).not.toMatch(/await\s+lanzarCopiaDeMeet|autoSyncGoogleMeet/);
  });
});
