/**
 * lib/jobs/cadencias.test.ts — un job que DEJA de correr se ve (U24).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CADENCIA_DE_JOB, jobsQueDejaronDeCorrer } from "./cadencias";
import { monitorDeJob } from "./latido";

const AHORA = new Date("2026-10-25T18:00:00Z");
const hace = (h: number) => new Date(+AHORA - h * 3_600_000);

describe("jobsQueDejaronDeCorrer", () => {
  it("avisa del que lleva más de lo esperado sin correr; del que corrió hace poco, no", () => {
    const r = jobsQueDejaronDeCorrer(
      [
        { key: "negocios-abiertos", ultimaCorrida: hace(12), apagado: false },
        { key: "contactos-y-tickets", ultimaCorrida: hace(1), apagado: false },
        { key: "indice-de-reuniones", ultimaCorrida: hace(3), apagado: false },
      ],
      AHORA,
    );
    expect(r.map((x) => x.key)).toEqual(["negocios-abiertos", "indice-de-reuniones"]);
  });
  it("⭐ el que nunca corrió, el apagado a propósito y el que no tiene cadencia no cuentan", () => {
    const r = jobsQueDejaronDeCorrer(
      [
        { key: "cs-watchdog-daily", ultimaCorrida: null, apagado: false },
        { key: "odoo-espejo-daily", ultimaCorrida: hace(100), apagado: true },
        { key: "ia-lotes", ultimaCorrida: hace(100), apagado: false },
        { key: "jobs-vigia", ultimaCorrida: hace(100), apagado: false },
      ],
      AHORA,
    );
    expect(r).toEqual([]);
  });
  it("un job de días hábiles aguanta el fin de semana (viernes 7:00 → lunes 7:00)", () => {
    expect(jobsQueDejaronDeCorrer([{ key: "cs-watchdog-daily", ultimaCorrida: hace(72), apagado: false }], AHORA)).toEqual([]);
  });
});

describe("la tabla de cadencias", () => {
  it("cada clave es un job de verdad (un nombre mal escrito no vigilaría nada)", () => {
    // Se lee defs.ts como texto: cargarlo arrastra media app. Las claves de los jobs de allá van como `key: "…"`.
    const defs = fs.readFileSync(path.join(process.cwd(), "lib/jobs/defs.ts"), "utf8") + fs.readFileSync(path.join(process.cwd(), "lib/cs/watchdog.ts"), "utf8");
    expect(Object.keys(CADENCIA_DE_JOB).filter((k) => !defs.includes(`key: "${k}"`))).toEqual([]);
  });
  it("el nombre del monitor de Sentry entra en 50 caracteres", () => {
    for (const k of Object.keys(CADENCIA_DE_JOB)) expect(monitorDeJob(k).length).toBeLessThanOrEqual(50);
  });
});
