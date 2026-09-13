/**
 * lib/jobs/scheduler.test.ts — UN JOB QUE FALLA LLEGA A SENTRY CON SU NOMBRE, Y SU ROJO NO SE TAPA.
 *
 * B-02 (auditoría 2026-09-03): el catch por job del scheduler solo hacía `console.error`, y en el
 * VPS eso es una línea en `docker logs` que nadie lee. Diez jobs podían fallar todos los días y el
 * primero en enterarse era un cliente. Ahora el error viaja a Sentry con `tags.job` (sin DSN es
 * no-op), y el job siguiente corre igual: el try/catch sigue siendo POR JOB.
 *
 * 2026-09-12: el rojo duraba un minuto. En el tick siguiente el job perdía el claim del día,
 * volvía sin hacer nada y el scheduler anotaba «ok» encima del fallo. Y todos los rojos de
 * `invariants-daily` caían en el mismo issue de Sentry, así que un invariante nuevo en rojo no
 * abría nada.
 *
 * Correr: `npx vitest run lib/jobs/scheduler.test.ts --project unit`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

type JobDeMentira = { key: string; shouldRun: () => boolean; run: () => Promise<unknown> };

const { captureException, corridas, registrarResultado, registro } = vi.hoisted(() => ({
  captureException: vi.fn(),
  corridas: [] as string[],
  registrarResultado: vi.fn(),
  registro: { jobs: [] as JobDeMentira[] },
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));
// El registro del resultado toca prisma: acá solo importa QUÉ se anota.
vi.mock("./estado", () => ({ registrarResultado }));

// El registry real arrastra prisma, HubSpot y media app: acá alcanzan jobs de mentira, que cada test carga.
vi.mock("./defs", () => ({ allJobs: () => registro.jobs }));

import { runSchedulerTick } from "./scheduler";
import { SIN_TURNO } from "./registry";
import { InvariantesVioladosError } from "@/lib/invariantes/job";

const TICK = new Date("2026-09-04T12:00:00Z");

/** Corre un tick con la consola de errores callada (el scheduler loguea cada fallo). */
async function tickCallado(now = TICK) {
  const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runSchedulerTick(now);
  } finally {
    silencio.mockRestore();
  }
}

beforeEach(() => {
  captureException.mockReset();
  registrarResultado.mockReset();
  corridas.length = 0;
});

describe("runSchedulerTick", () => {
  it("un job que lanza llega a Sentry con tags.job, y el siguiente corre igual", async () => {
    /* La edicion que lo pone en rojo: sacar captureException del catch, o mandarlo sin tags.job. */
    registro.jobs = [
      { key: "explota", shouldRun: () => true, run: async () => { throw new Error("boom del job"); } },
      { key: "sano", shouldRun: () => true, run: async () => { corridas.push("sano"); } },
    ];
    await tickCallado();
    expect(captureException, "el fallo del job no llegó a Sentry").toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("boom del job");
    expect(ctx, "sin tags.job, en Sentry no se sabe QUÉ job falló").toMatchObject({ tags: { job: "explota" } });
    expect(corridas, "un job roto no tumba a los demás").toEqual(["sano"]);
    // B-03: cada corrida deja su resultado; el fallo, con nombre + mensaje.
    expect(registrarResultado).toHaveBeenCalledWith(
      "explota",
      expect.objectContaining({ ok: false, error: "Error: boom del job" }),
    );
    expect(registrarResultado).toHaveBeenCalledWith("sano", expect.objectContaining({ ok: true }));
  });

  it("un job que falla y en la vuelta siguiente no toma el turno SIGUE en rojo", async () => {
    /* La edición que lo pone en rojo: volver a anotar `ok` después de cualquier `run` que no
       lance. Es exactamente lo que pasaba: invariants-daily fallaba a las 7:00, a las 7:01 perdía
       el claim del día, volvía sin hacer nada, y el «ok» pisaba el rojo hasta mañana. */
    let vuelta = 0;
    registro.jobs = [
      {
        key: "diario",
        shouldRun: () => true,
        run: async () => {
          vuelta++;
          if (vuelta === 1) throw new Error("invariante en rojo");
          return SIN_TURNO;
        },
      },
    ];
    await tickCallado();
    await tickCallado(new Date(TICK.getTime() + 60_000));
    await tickCallado(new Date(TICK.getTime() + 120_000));
    expect(vuelta).toBe(3);
    expect(registrarResultado).toHaveBeenCalledTimes(1);
    expect(registrarResultado).toHaveBeenCalledWith("diario", expect.objectContaining({ ok: false }));
    expect(registrarResultado, "un tick sin turno no corrió: no anota nada").not.toHaveBeenCalledWith(
      "diario",
      expect.objectContaining({ ok: true }),
    );
  });

  it("Sentry agrupa los invariantes en rojo por la LISTA de violados: cambiarla abre otro issue", async () => {
    /* La edición que lo pone en rojo: mandar el error sin `fingerprint` — todos los rojos de
       invariants-daily caen en el mismo issue y un invariante nuevo en rojo no abre nada. */
    let violados = ["3"];
    registro.jobs = [
      {
        key: "invariants-daily",
        shouldRun: () => true,
        run: async () => {
          throw new InvariantesVioladosError(violados, `${violados.length} invariante(s) en rojo`);
        },
      },
      { key: "otro", shouldRun: () => true, run: async () => { throw new Error("un fallo cualquiera"); } },
    ];
    await tickCallado();
    violados = ["3", "31"];
    await tickCallado();

    const huellas = captureException.mock.calls
      .filter(([, ctx]) => (ctx as { tags: { job: string } }).tags.job === "invariants-daily")
      .map(([, ctx]) => (ctx as { fingerprint?: string[] }).fingerprint);
    expect(huellas).toHaveLength(2);
    expect(huellas[0]).toEqual(expect.arrayContaining(["invariants-daily", "3"]));
    expect(huellas[1]).toEqual(expect.arrayContaining(["invariants-daily", "3", "31"]));
    expect(huellas[0], "otra lista, otra huella").not.toEqual(huellas[1]);

    const otro = captureException.mock.calls.find(([, ctx]) => (ctx as { tags: { job: string } }).tags.job === "otro");
    expect(otro?.[1], "los demás fallos conservan el agrupamiento de Sentry").not.toHaveProperty("fingerprint");
  });

  it("ningún job que reclama el día vuelve con un return pelado cuando pierde el claim", () => {
    /* La edición que lo pone en rojo: un job nuevo copiado del molde viejo,
       `if (!(await claimDateKey(...))) return;` — su «ok» taparía su propio rojo. */
    const sinComentarios = (rel: string) =>
      fs
        .readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    for (const rel of ["lib/jobs/defs.ts", "lib/cs/watchdog.ts"]) {
      const src = sinComentarios(rel);
      const claims = src.match(/if \(!\(await claimDateKey\([^\n]*/g) ?? [];
      expect(claims.length, `${rel} tiene jobs que reclaman el día`).toBeGreaterThan(0);
      for (const linea of claims) expect(linea, `${rel}: ${linea}`).toMatch(/return SIN_TURNO;/);
    }
  });

  it("el semáforo está montado en Integraciones y lee el estado de los jobs (B-03)", () => {
    /* La edicion que lo pone en rojo: sacar <JobsSemaforo de la página «porque ensucia». */
    const src = fs.readFileSync(path.join(process.cwd(), "app/(shell)/integrations/page.tsx"), "utf8");
    expect(src, "la tarjeta tiene que estar montada").toContain("<JobsSemaforo");
    expect(src, "y alimentada con el estado real").toContain("leerEstadoDeJobs(");
  });
});
