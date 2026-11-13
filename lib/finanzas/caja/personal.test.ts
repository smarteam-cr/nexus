/**
 * lib/finanzas/caja/personal.test.ts — a quien ve la caja sin el permiso de salarios ninguna LÍNEA le trae el monto de
 * UNA persona (revisión del 2026-11-13). Restar dos cortes sí deja ver un movimiento de una persona: es un límite
 * aceptado, escrito en DECISIONS, no algo que esto garantice.
 *
 * Antes: la planilla iba una línea por moneda (si una sola persona cobra en dólares, la línea en dólares era su salario)
 * y las comisiones de vendedor una línea por día con «(1 persona)». Ahora salarios y comisiones van juntos, una línea por
 * corte y en una moneda, y la caja sigue cuadrando: lo libre en dólares es el mismo.
 */
import { describe, expect, it } from "vitest";
import { proyectarCostos, type CostoProyeccionInput } from "@/lib/cobranza/engine";
import { corteDelDia, costosConPersonalJunto, juntarPersonal, monedaDelPersonal, type PartidaDePersonal } from "./personal";
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

  it("la comisión de un solo vendedor va dentro de la línea de personal de su corte (no en una línea propia)", () => {
    const [primera, segunda] = [...juntarPersonal(partidas, TC)].sort((a, b) => a.corteKey.localeCompare(b.corteKey));
    // ⚠ LÍMITE ACEPTADO, no una garantía: restar dos quincenas de «Personal» deja ver esta comisión (o un alta o una baja).
    // Quien ve la caja ve movimientos agregados, y por eso «Caja y pagos» se da solo a quien maneja los pagos, que de
    // todas formas los paga (DECISIONS «La caja y los pagos»). Lo que se garantiza es que ninguna LÍNEA sea de una persona.
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

describe("la caja neta con la planilla junta (segunda revisión del 13-nov)", () => {
  /** Tres salarios en colones, UNO en dólares, y herramientas en las dos monedas. */
  const costos: CostoProyeccionInput[] = [
    { costoId: "s-ana", nombre: "Ana", categoria: "SALARIO", monto: 2_000_000, moneda: "CRC", frecuencia: "MENSUAL", activo: true },
    { costoId: "s-beto", nombre: "Beto", categoria: "SALARIO", monto: 1_800_000, moneda: "CRC", frecuencia: "MENSUAL", activo: true },
    { costoId: "s-caro", nombre: "Caro", categoria: "SALARIO", monto: 1_600_000, moneda: "CRC", frecuencia: "MENSUAL", activo: true },
    { costoId: "s-dani", nombre: "Dani", categoria: "SALARIO", monto: 5_000, moneda: "USD", frecuencia: "MENSUAL", activo: true },
    { costoId: "h-hubspot", nombre: "HubSpot", categoria: "HERRAMIENTA", monto: 900, moneda: "USD", frecuencia: "MENSUAL", activo: true },
    { costoId: "h-local", nombre: "Hosting", categoria: "HERRAMIENTA", monto: 50_000, moneda: "CRC", frecuencia: "MENSUAL", activo: true },
  ];
  const hoy = "2026-11-13";
  const sinSalario = proyectarCostos(costos.filter((c) => c.categoria !== "SALARIO"), { todayISO: hoy });
  const salarios = proyectarCostos(costos.filter((c) => c.categoria === "SALARIO"), { todayISO: hoy });
  const junto = costosConPersonalJunto(sinSalario, salarios, TC);
  const completo = proyectarCostos(costos, { todayISO: hoy });

  it("⭐ lo que sale en dólares de cada corte es solo lo que no es salario: restar la herramienta ya no da el salario de Dani", () => {
    for (const b of junto.buckets) {
      const herramientasUsd = sinSalario.buckets.find((x) => x.key === b.key)!.totales.USD;
      expect(b.totales.USD, b.key).toBe(herramientasUsd);
    }
    // Sin juntar, lo de dólares sí traía el salario adentro (lo que la caja neta mandaba antes).
    expect(completo.buckets.some((b, i) => b.totales.USD !== sinSalario.buckets[i]!.totales.USD)).toBe(true);
    expect(junto.totalMensual.USD).toBe(sinSalario.totalMensual.USD);
  });

  it("y la caja neta sigue cuadrando en dólares, corte por corte y en el mes", () => {
    const enUsd = (t: { CRC: number; USD: number }) => t.USD + t.CRC / TC;
    for (const [i, b] of junto.buckets.entries()) expect(enUsd(b.totales)).toBeCloseTo(enUsd(completo.buckets[i]!.totales), 2);
    expect(enUsd(junto.totalMensual)).toBeCloseTo(enUsd(completo.totalMensual), 2);
  });
});
