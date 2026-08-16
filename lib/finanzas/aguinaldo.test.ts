/**
 * lib/finanzas/aguinaldo.test.ts
 *
 * Los casos que importan no son la división: son las formas de que el número
 * mienta. Un año parcial que se redondea hacia arriba, dos monedas sumadas, una
 * quincena pendiente contada como plata que salió, o una cobertura que no se
 * declara.
 */
import { describe, expect, it } from "vitest";
import { calcularAguinaldo, type QuincenaPagada } from "./aguinaldo";

const q = (p: Partial<QuincenaPagada> = {}): QuincenaPagada => ({
  sujetoTeamMemberId: "tm-1",
  sujetoNombre: "Marco Salas",
  periodo: "2026-01",
  fechaProgramada: "2026-01-15",
  estado: "PAGADO",
  monto: 600_000,
  moneda: "CRC",
  comisiones: 0,
  ...p,
});

/** Las 24 quincenas de un año completo, todas al mismo monto. */
function anioCompleto(monto: number, extra: Partial<QuincenaPagada> = {}): QuincenaPagada[] {
  const out: QuincenaPagada[] = [];
  const periodos = ["2025-12", ...Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`)];
  for (const p of periodos) {
    out.push(q({ periodo: p, fechaProgramada: `${p}-15`, monto, ...extra }));
    out.push(q({ periodo: p, fechaProgramada: `${p}-28`, monto, ...extra }));
  }
  return out;
}

describe("calcularAguinaldo · el año completo", () => {
  it("un salario parejo da exactamente un mes de salario", () => {
    // 24 quincenas de ₡600.000 = ₡14.400.000 al año ÷ 12 = ₡1.200.000, que es
    // justo el salario mensual. Es el sanity check de la fórmula entera.
    const r = calcularAguinaldo(anioCompleto(600_000), 2026);
    expect(r.personas).toHaveLength(1);
    expect(r.personas[0]!.sumaSalario).toBe(14_400_000);
    expect(r.personas[0]!.aguinaldoSalario).toBe(1_200_000);
    expect(r.personas[0]!.cobertura.texto).toBe("24 de 24 quincenas registradas");
  });

  it("la ventana es diciembre del año ANTERIOR a noviembre de éste", () => {
    const r = calcularAguinaldo(anioCompleto(600_000), 2026);
    expect(r.periodos[0]).toBe("2025-12");
    expect(r.periodos[11]).toBe("2026-11");
  });
});

describe("calcularAguinaldo · el año parcial", () => {
  it("quien entró a mitad de año sale PROPORCIONAL, sin fecha de ingreso cargada", () => {
    // 8 quincenas de ₡750.000 (entró en abril) = ₡6.000.000 ÷ 12 = ₡500.000.
    // La fórmula CR maneja sola el año parcial: los meses que no trabajó
    // simplemente no tienen quincenas.
    const parciales = anioCompleto(750_000).filter((x) => x.periodo >= "2026-04" && x.periodo <= "2026-07");
    const r = calcularAguinaldo(parciales, 2026);
    expect(r.personas[0]!.quincenas).toBe(8);
    expect(r.personas[0]!.aguinaldoSalario).toBe(500_000);
  });

  it("la fecha de ingreso sale del LIBRO, no de un campo de TeamMember", () => {
    const r = calcularAguinaldo(
      [
        q({ periodo: "2026-05", fechaProgramada: "2026-05-31" }),
        q({ periodo: "2026-04", fechaProgramada: "2026-04-15" }),
        q({ periodo: "2026-06", fechaProgramada: "2026-06-15" }),
      ],
      2026,
    );
    expect(r.personas[0]!.desde).toBe("2026-04-15");
  });

  it("declara la cobertura en vez de rellenar los meses que faltan", () => {
    const r = calcularAguinaldo([q(), q({ fechaProgramada: "2026-01-31" })], 2026);
    expect(r.personas[0]!.cobertura.texto).toBe("2 de 24 quincenas registradas");
  });
});

describe("calcularAguinaldo · lo que NO entra", () => {
  it("una quincena PENDIENTE no cuenta: todavía no es plata que salió", () => {
    const r = calcularAguinaldo(
      [q({ monto: 600_000 }), q({ monto: 600_000, estado: "PENDIENTE", fechaProgramada: "2026-01-31" })],
      2026,
    );
    expect(r.personas[0]!.quincenas).toBe(1);
    expect(r.personas[0]!.sumaSalario).toBe(600_000);
  });

  it("una quincena FUERA de la ventana no cuenta", () => {
    // Diciembre de 2026 pertenece al aguinaldo del 2027, no al de este año.
    const r = calcularAguinaldo(
      [q(), q({ periodo: "2026-12", fechaProgramada: "2026-12-15" })],
      2026,
    );
    expect(r.personas[0]!.quincenas).toBe(1);
  });

  it("sin nada pagado no hay personas ni totales inventados", () => {
    const r = calcularAguinaldo([], 2026);
    expect(r.personas).toEqual([]);
    expect(r.totales).toEqual({});
  });
});

describe("calcularAguinaldo · las dos monedas", () => {
  it("una persona pagada en DOS monedas produce DOS filas, nunca una convertida", () => {
    const r = calcularAguinaldo(
      [
        q({ monto: 600_000, moneda: "CRC" }),
        q({ monto: 1_000, moneda: "USD", fechaProgramada: "2026-01-31" }),
      ],
      2026,
    );
    expect(r.personas).toHaveLength(2);
    expect(r.personas.map((p) => p.moneda).sort()).toEqual(["CRC", "USD"]);
  });

  it("los totales van por moneda SEPARADA — jamás uno solo", () => {
    const r = calcularAguinaldo(
      [
        q({ sujetoTeamMemberId: "tm-1", monto: 1_200_000, moneda: "CRC" }),
        q({ sujetoTeamMemberId: "tm-2", sujetoNombre: "Lorena", monto: 1_836, moneda: "USD" }),
      ],
      2026,
    );
    expect(Object.keys(r.totales).sort()).toEqual(["CRC", "USD"]);
    expect(r.totales.CRC).toBe(100_000);
    expect(r.totales.USD).toBe(153);
  });
});

describe("calcularAguinaldo · las dos líneas", () => {
  it("muestra el aguinaldo solo-salario y el que incluye comisiones", () => {
    // No se elige por Nexus: se muestran los dos y decide dirección.
    const r = calcularAguinaldo(
      [q({ monto: 600_000, comisiones: 60_000 }), q({ monto: 600_000, comisiones: 0, fechaProgramada: "2026-01-31" })],
      2026,
    );
    const p = r.personas[0]!;
    expect(p.sumaSalario).toBe(1_200_000);
    expect(p.sumaConComisiones).toBe(1_260_000);
    expect(p.aguinaldoSalario).toBe(100_000);
    expect(p.aguinaldoConComisiones).toBe(105_000);
  });

  it("sin comisiones las dos líneas coinciden, y eso es correcto", () => {
    const r = calcularAguinaldo(anioCompleto(600_000), 2026);
    const p = r.personas[0]!;
    expect(p.aguinaldoConComisiones).toBe(p.aguinaldoSalario);
  });

  it("el TOTAL usa la línea de solo salario, que es la comparable con la hoja de Alex", () => {
    const r = calcularAguinaldo(anioCompleto(600_000, { comisiones: 100_000 }), 2026);
    expect(r.totales.CRC).toBe(r.personas[0]!.aguinaldoSalario);
  });
});
