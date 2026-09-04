/**
 * lib/jobs/scheduler.test.ts — UN JOB QUE FALLA LLEGA A SENTRY CON SU NOMBRE.
 *
 * B-02 (auditoría 2026-09-03): el catch por job del scheduler solo hacía `console.error`, y en el
 * VPS eso es una línea en `docker logs` que nadie lee. Diez jobs podían fallar todos los días y el
 * primero en enterarse era un cliente. Ahora el error viaja a Sentry con `tags.job` (sin DSN es
 * no-op), y el job siguiente corre igual: el try/catch sigue siendo POR JOB.
 *
 * Correr: `npx vitest run lib/jobs/scheduler.test.ts --project unit`.
 */
import { describe, expect, it, vi } from "vitest";

const { captureException, corridas } = vi.hoisted(() => ({
  captureException: vi.fn(),
  corridas: [] as string[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

// El registry real arrastra prisma, HubSpot y media app: acá alcanzan dos jobs de mentira.
vi.mock("./defs", () => ({
  allJobs: () => [
    {
      key: "explota",
      shouldRun: () => true,
      run: async () => {
        throw new Error("boom del job");
      },
    },
    {
      key: "sano",
      shouldRun: () => true,
      run: async () => {
        corridas.push("sano");
      },
    },
  ],
}));

import { runSchedulerTick } from "./scheduler";

describe("runSchedulerTick", () => {
  it("un job que lanza llega a Sentry con tags.job, y el siguiente corre igual", async () => {
    /* La edicion que lo pone en rojo: sacar captureException del catch, o mandarlo sin tags.job. */
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await runSchedulerTick(new Date("2026-09-04T12:00:00Z"));
    } finally {
      silencio.mockRestore();
    }
    expect(captureException, "el fallo del job no llegó a Sentry").toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("boom del job");
    expect(ctx, "sin tags.job, en Sentry no se sabe QUÉ job falló").toMatchObject({ tags: { job: "explota" } });
    expect(corridas, "un job roto no tumba a los demás").toEqual(["sano"]);
  });
});
