/**
 * lib/finanzas/caja/personal.test.ts — a quien ve la caja sin el permiso de salarios nunca le llega el monto de UNA
 * persona (revisión del 2026-11-13).
 *
 * Antes: la planilla iba una línea por moneda (si una sola persona cobra en dólares, la línea en dólares era su salario)
 * y las comisiones de vendedor una línea por día con «(1 persona)». Ahora salarios y comisiones van juntos, una línea por
 * corte y en una moneda, y la caja sigue cuadrando: lo libre en dólares es el mismo.
 */
import { describe, expect, it } from "vitest";
import { corteDelDia, juntarPersonal, monedaDelPersonal, type PartidaDePersonal } from "./personal";
import { proyectarCaja, type EntradaDeProyeccion } from "./proyeccion";

const TC = 500;
const q1 = { key: "2026-11-q2", etiqueta: "16–30 nov", granularidad: "quincena" as const, desdeISO: "2026-11-16", hastaISO: "2026-11-30" };
const q2 = { key: "2026-12-q1", etiqueta: "1–15 dic", granularidad: "quincena" as const, desdeISO: "2026-12-01", hastaISO: "2026-12-15" };

/** Tres personas en colones, UNA en dólares, y UN vendedor con comisión en la primera quincena. */
const partidas: PartidaDePersonal[] = [
  { corteKey: q1.key, persona: "ana", moneda: "CRC", monto: 1_000_000 },
  { corteKey: q1.key, persona: "beto", moneda: "CRC", monto: 900_000 },
  { corteKey: q1.key, persona: "caro", moneda: "CRC", monto: 800_000 },
  { corteKey: q1.key, persona: "dani", moneda: "USD", monto: 2_500 },
  { corteKey: q1.key, persona: "eli-vendedor", moneda: "USD", monto: 700 },
  { corteKey: q2.key, persona: "ana", moneda: "CRC", monto: 1_000_000 },
  { corteKey: q2.key, persona: "beto", moneda: "CRC", monto: 900_000 },
  { corteKey: q2.key, persona: "caro", moneda: "CRC", monto: 800_000 },
  { corteKey: q2.key, persona: "dani", moneda: "USD", monto: 2_500 },
];

describe("juntarPersonal", () => {
  it("una sola línea por corte, en una sola moneda: el salario en dólares de una persona no se ve", () => {
    const r = juntarPersonal(partidas, TC);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((p) => p.moneda)).size).toBe(1);
    // Ningún monto que viaja es el de una persona.
    const montosDeUnaPersona = new Set([2_500, 700, 2_500 * TC, 700 * TC]);
    for (const p of r) {
      expect(montosDeUnaPersona.has(p.monto)).toBe(false);
      expect(p.personas).toBeGreaterThanOrEqual(2);
    }
  });

  it("la comisión de un solo vendedor va dentro de la línea de personal de su corte", () => {
    const [primera, segunda] = [...juntarPersonal(partidas, TC)].sort((a, b) => a.corteKey.localeCompare(b.corteKey));
    expect(primera!.monto - segunda!.monto).toBeCloseTo(700 * TC, 2);
    expect(primera!.personas).toBe(5);
  });

  it("lo junto vale lo mismo en dólares que lo separado", () => {
    const r = juntarPersonal(partidas, TC);
    const enUsd = (m: "CRC" | "USD", n: number) => (m === "CRC" ? n / TC : n);
    const antes = partidas.reduce((s, p) => s + enUsd(p.moneda, p.monto), 0);
    const despues = r.reduce((s, p) => s + enUsd(p.moneda, p.monto), 0);
    expect(despues).toBeCloseTo(antes, 2);
  });

  it("la moneda es la que más pesa", () => {
    expect(monedaDelPersonal(partidas, TC)).toBe("CRC");
    expect(monedaDelPersonal([{ corteKey: "k", persona: "a", moneda: "USD", monto: 10_000 }, { corteKey: "k", persona: "b", moneda: "CRC", monto: 1_000 }], TC)).toBe("USD");
  });

  it("sin tipo de cambio no inventa uno: va por moneda (lo que no queda garantizado, escrito en personal.ts)", () => {
    const r = juntarPersonal(partidas, null);
    expect(r.filter((p) => p.corteKey === q2.key).map((p) => p.moneda).sort()).toEqual(["CRC", "USD"]);
  });
});

describe("la caja sigue cuadrando", () => {
  it("lo libre al cierre en dólares es el mismo con personal junto que separado por moneda", () => {
    const base = (costos: EntradaDeProyeccion["cortes"][number]["costos"][]): EntradaDeProyeccion => ({
      hoyISO: "2026-11-16",
      cierreISO: "2026-12-15",
      crcPorUsd: TC,
      saldos: [
        { cuentaId: "bcr", nombre: "BCR", moneda: "CRC", monto: 20_000_000, fechaISO: "2026-11-16" },
        { cuentaId: "usd", nombre: "Dólares", moneda: "USD", monto: 30_000, fechaISO: "2026-11-16" },
      ],
      cortes: [
        { ...q1, cobros: { CRC: 0, USD: 0 }, costos: costos[0]! },
        { ...q2, cobros: { CRC: 0, USD: 0 }, costos: costos[1]! },
      ],
      fechados: [],
      reservas: [],
    });
    const separado = [q1, q2].map((c) => {
      const crc = partidas.filter((p) => p.corteKey === c.key && p.moneda === "CRC").reduce((s, p) => s + p.monto, 0);
      const usd = partidas.filter((p) => p.corteKey === c.key && p.moneda === "USD").reduce((s, p) => s + p.monto, 0);
      return [
        { rubro: "PLANILLA" as const, moneda: "CRC" as const, monto: crc },
        { rubro: "PLANILLA" as const, moneda: "USD" as const, monto: usd },
      ];
    });
    const junto = [q1, q2].map((c) =>
      juntarPersonal(partidas, TC)
        .filter((p) => p.corteKey === c.key)
        .map((p) => ({ rubro: "PLANILLA" as const, moneda: p.moneda, monto: p.monto })),
    );
    const a = proyectarCaja(base(separado));
    const b = proyectarCaja(base(junto));
    expect(b.alCierre.libreEnUsd).toBeCloseTo(a.alCierre.libreEnUsd!, 2);
    // Y en la proyección que viaja, el rubro de personal tiene una sola moneda por corte.
    for (const c of b.cortes) expect(c.sale.PLANILLA.CRC === 0 || c.sale.PLANILLA.USD === 0).toBe(true);
  });
});

describe("corteDelDia", () => {
  it("lo de antes va al primero; lo de después del último, a ninguno", () => {
    expect(corteDelDia([q1, q2], "2026-11-07")?.key).toBe(q1.key);
    expect(corteDelDia([q1, q2], "2026-11-30")?.key).toBe(q1.key);
    expect(corteDelDia([q1, q2], "2026-12-01")?.key).toBe(q2.key);
    expect(corteDelDia([q1, q2], "2027-01-31")).toBeNull();
  });
});
