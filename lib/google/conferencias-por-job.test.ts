/**
 * lib/google/conferencias-por-job.test.ts — el job `google-meet-conferencias` lanza la revisión sin esperarla, una por
 * proceso, y anota solo la corrida completa (la que dispara un aviso de Meet no pisa la fila del job).
 *
 * Correr: `npx vitest run lib/google/conferencias-por-job.test.ts --project unit`.
 */
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));

import { lanzarRevision, tramoDe, type DepsDeLaRevision } from "./conferencias-por-job";
import type { ResultadoDeLaRevision } from "./conferencias";

const VACIO: ResultadoDeLaRevision = { miradas: 0, ocurrieron: 0, noOcurrieron: 0, sinAcceso: 0, cerradas: 0, frases: 0, asistentes: 0, aLeer: 0, sinCuenta: 0 };

function mundo(correr: (urgente: boolean) => Promise<ResultadoDeLaRevision>) {
  const anotadas: Prisma.InputJsonObject[] = [];
  const avisos: Error[] = [];
  const deps: DepsDeLaRevision = {
    correr,
    anotar: async (r) => {
      anotadas.push(r);
    },
    avisar: (e) => avisos.push(e),
    ahora: () => new Date("2026-10-25T15:00:00Z"),
  };
  return { deps, anotadas, avisos };
}

describe("tramoDe", () => {
  it("un tramo cada 10 minutos", () => {
    expect(tramoDe(new Date("2026-10-25T14:39:59Z"))).toBe("2026-10-25T14:3");
    expect(tramoDe(new Date("2026-10-25T14:40:00Z"))).toBe("2026-10-25T14:4");
    expect(tramoDe(new Date("2026-10-25T14:05:00Z"))).toBe("2026-10-25T14:0");
  });
});

describe("lanzarRevision", () => {
  it("vuelve enseguida, no arranca otra con una en vuelo y anota la completa al terminar", async () => {
    let soltar: () => void = () => {};
    const puerta = new Promise<void>((r) => (soltar = r));
    let corridas = 0;
    const { deps, anotadas } = mundo(async () => {
      corridas++;
      await puerta;
      return { ...VACIO, miradas: 3, ocurrieron: 2, noOcurrieron: 1, frases: 40 };
    });
    const a = lanzarRevision({}, deps);
    const b = lanzarRevision({ urgente: true }, deps);
    expect([a.estado, b.estado]).toEqual(["lanzada", "en-vuelo"]);
    expect(anotadas).toEqual([]);
    soltar();
    await a.esperar;
    expect(corridas).toBe(1);
    expect(anotadas[0]).toMatchObject({ ok: true, miradas: 3, ocurrieron: 2, noOcurrieron: 1, frases: 40 });
  });

  it("la urgente (por un aviso de Meet) no anota en la fila del job: la frescura la dice la completa", async () => {
    const { deps, anotadas } = mundo(async () => ({ ...VACIO, miradas: 1 }));
    await lanzarRevision({ urgente: true }, deps).esperar;
    expect(anotadas).toEqual([]);
  });

  it("un fallo va a Sentry y queda anotado como fallo; nunca lanza", async () => {
    const { deps, anotadas, avisos } = mundo(async () => {
      throw new Error("Google no devolvió ningún usuario del dominio");
    });
    await expect(lanzarRevision({}, deps).esperar).resolves.toBeUndefined();
    expect(avisos).toHaveLength(1);
    expect(anotadas[0]).toMatchObject({ ok: false });
    expect(String(anotadas[0].error)).toContain("ningún usuario");
  });

});
