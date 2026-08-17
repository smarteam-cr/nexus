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

/**
 * Los 13 casos originales afirman el aguinaldo FINAL, así que se los ancla a un
 * día en que la ventana 2026 (dic-25 → nov-26) ya cerró. El período abierto
 * tiene sus propios casos abajo — mezclarlos haría que un cambio en la regla de
 * cierre rompiera trece tests que no son de eso.
 */
const YA_CERRO = "2026-12-01";

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
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, YA_CERRO);
    expect(r.personas).toHaveLength(1);
    expect(r.personas[0]!.sumaSalario).toBe(14_400_000);
    expect(r.personas[0]!.aguinaldoSalario).toBe(1_200_000);
    expect(r.personas[0]!.cobertura.texto).toBe("24 de 24 quincenas registradas");
  });

  it("la ventana es diciembre del año ANTERIOR a noviembre de éste", () => {
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, YA_CERRO);
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
    const r = calcularAguinaldo(parciales, 2026, YA_CERRO);
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
       YA_CERRO,
    );
    expect(r.personas[0]!.desde).toBe("2026-04-15");
  });

  it("declara la cobertura en vez de rellenar los meses que faltan", () => {
    const r = calcularAguinaldo([q(), q({ fechaProgramada: "2026-01-31" })], 2026, YA_CERRO);
    expect(r.personas[0]!.cobertura.texto).toBe("2 de 24 quincenas registradas");
  });
});

describe("calcularAguinaldo · lo que NO entra", () => {
  it("una quincena PENDIENTE no cuenta: todavía no es plata que salió", () => {
    const r = calcularAguinaldo(
      [q({ monto: 600_000 }), q({ monto: 600_000, estado: "PENDIENTE", fechaProgramada: "2026-01-31" })],
       2026,
       YA_CERRO,
    );
    expect(r.personas[0]!.quincenas).toBe(1);
    expect(r.personas[0]!.sumaSalario).toBe(600_000);
  });

  it("una quincena FUERA de la ventana no cuenta", () => {
    // Diciembre de 2026 pertenece al aguinaldo del 2027, no al de este año.
    const r = calcularAguinaldo(
      [q(), q({ periodo: "2026-12", fechaProgramada: "2026-12-15" })],
       2026,
       YA_CERRO,
    );
    expect(r.personas[0]!.quincenas).toBe(1);
  });

  it("sin nada pagado no hay personas ni totales inventados", () => {
    const r = calcularAguinaldo([], 2026, YA_CERRO);
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
       YA_CERRO,
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
       YA_CERRO,
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
       YA_CERRO,
    );
    const p = r.personas[0]!;
    expect(p.sumaSalario).toBe(1_200_000);
    expect(p.sumaConComisiones).toBe(1_260_000);
    expect(p.aguinaldoSalario).toBe(100_000);
    expect(p.aguinaldoConComisiones).toBe(105_000);
  });

  it("sin comisiones las dos líneas coinciden, y eso es correcto", () => {
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, YA_CERRO);
    const p = r.personas[0]!;
    expect(p.aguinaldoConComisiones).toBe(p.aguinaldoSalario);
  });

  it("el TOTAL usa la línea de solo salario, que es la comparable con la hoja de Alex", () => {
    const r = calcularAguinaldo(anioCompleto(600_000, { comisiones: 100_000 }), 2026, YA_CERRO);
    expect(r.totales.CRC).toBe(r.personas[0]!.aguinaldoSalario);
  });
});

describe("calcularAguinaldo · el período abierto (lo que la pantalla no decía)", () => {
  it("A1 · en agosto la ventana sigue abierta: el número NO es el final", () => {
    // El defecto que esto cierra: la pantalla mostraba «Aguinaldo ₡529.166» sin
    // aclarar que faltaban meses de sumar. El número estaba bien y el rótulo
    // afirmaba otra cosa.
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, "2026-08-16");
    expect(r.periodoAbierto).toBe(true);
    expect(r.cierraEn).toBe("2026-11");
  });

  it("A2 · el último mes de la ventana TODAVÍA cuenta como abierto", () => {
    // Estando en noviembre pueden entrar las dos quincenas de noviembre: cerrar
    // ahí diría «final» sobre un número al que le falta un mes entero.
    expect(calcularAguinaldo([], 2026, "2026-11-30").periodoAbierto).toBe(true);
  });

  it("A3 · en diciembre ya cerró y el número es el que se paga", () => {
    expect(calcularAguinaldo([], 2026, "2026-12-01").periodoAbierto).toBe(false);
  });

  it("A4 · mirar un año viejo lo muestra cerrado", () => {
    expect(calcularAguinaldo([], 2025, "2026-08-16").periodoAbierto).toBe(false);
  });
});

describe("calcularAguinaldo · quién NO aparece", () => {
  it("F1 · un salario activo sin ninguna quincena se DECLARA, no desaparece", () => {
    // El caso real: Andrés Pinzón, USD 2.500/mes activo, cero quincenas en el
    // libro. Antes no se pintaba en ningún lado y el total se leía completo.
    const r = calcularAguinaldo([], 2026, "2026-08-16", [
      { teamMemberId: "tm-9", nombre: "Andrés Pinzón", moneda: "USD" },
    ]);
    expect(r.personas).toHaveLength(0);
    expect(r.faltantes).toEqual([
      { nombre: "Andrés Pinzón", moneda: "USD", motivo: "SIN_QUINCENAS" },
    ]);
  });

  it("F2 · sin persona ligada el motivo es OTRO, porque no se arregla solo", () => {
    // Jerson Escudero: su costo no tiene teamMemberId, así que generar la
    // quincena nunca lo va a incluir. Decir «no tiene quincenas» mandaría a
    // esperar al mes que viene, que es exactamente lo que no hay que hacer.
    const r = calcularAguinaldo([], 2026, "2026-08-16", [
      { teamMemberId: null, nombre: "Jerson Escudero", moneda: "USD" },
    ]);
    expect(r.faltantes[0]!.motivo).toBe("SIN_PERSONA_LIGADA");
  });

  it("F3 · quien SÍ tiene quincenas no se reporta como faltante", () => {
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, "2026-08-16", [
      { teamMemberId: "tm-1", nombre: "Marco Salas", moneda: "CRC" },
    ]);
    expect(r.personas).toHaveLength(1);
    expect(r.faltantes).toEqual([]);
  });

  it("F4 · la MONEDA es parte de la identidad: el mismo salario en otra moneda falta", () => {
    // Coherente con el resto del módulo: CRC y USD son dos filas, nunca una
    // convertida. Alguien con quincenas en colones y un salario en dólares
    // tiene el de dólares sin registrar, y hay que decirlo.
    const r = calcularAguinaldo(anioCompleto(600_000), 2026, "2026-08-16", [
      { teamMemberId: "tm-1", nombre: "Marco Salas", moneda: "USD" },
    ]);
    expect(r.faltantes).toEqual([
      { nombre: "Marco Salas", moneda: "USD", motivo: "SIN_QUINCENAS" },
    ]);
  });

  it("F5 · sin salarios activos no se inventa ningún faltante", () => {
    expect(calcularAguinaldo(anioCompleto(600_000), 2026, "2026-08-16").faltantes).toEqual([]);
  });
});
