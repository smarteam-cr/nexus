/**
 * lib/cobranza/planilla.test.ts
 *
 * El calendario del libro. Los casos que importan no son "el 15 es el 15": son
 * los bordes donde un cálculo ingenuo fabrica quincenas que nunca ocurrieron o
 * declara una cobertura que no tiene.
 */
import { describe, expect, it } from "vitest";
import { montoQuincena } from "./engine";
import {
  coberturaDe,
  esPeriodo,
  periodoDe,
  periodosDeAguinaldo,
  periodosEntre,
  primeraQuincenaDe,
  quincenaDe,
  quincenasDelPeriodo,
  quincenasDistintas,
} from "./planilla";

describe("quincenasDelPeriodo", () => {
  it("un mes de 31 días cierra el 31", () => {
    expect(quincenasDelPeriodo("2026-01")).toEqual([
      { periodo: "2026-01", quincena: 1, fechaProgramada: "2026-01-15" },
      { periodo: "2026-01", quincena: 2, fechaProgramada: "2026-01-31" },
    ]);
  });

  it("un mes de 30 cierra el 30", () => {
    expect(quincenasDelPeriodo("2026-04")[1]!.fechaProgramada).toBe("2026-04-30");
  });

  it("febrero NO inventa un día 30 ni un 29 que no existe", () => {
    // 2026 no es bisiesto. El clamp lo hace finQuincenaISO, el mismo helper que
    // agrupa "esta quincena" en la cola de cobros — una sola definición.
    expect(quincenasDelPeriodo("2026-02")[1]!.fechaProgramada).toBe("2026-02-28");
  });

  it("un febrero bisiesto sí llega al 29", () => {
    expect(quincenasDelPeriodo("2028-02")[1]!.fechaProgramada).toBe("2028-02-29");
  });

  it("un período basura devuelve vacío en vez de fechas inventadas", () => {
    expect(quincenasDelPeriodo("2026-13")).toEqual([]);
    expect(quincenasDelPeriodo("nope")).toEqual([]);
    expect(quincenasDelPeriodo("2026-00")).toEqual([]);
  });
});

describe("esPeriodo · periodoDe · quincenaDe", () => {
  it("valida el formato YYYY-MM", () => {
    expect(esPeriodo("2026-08")).toBe(true);
    expect(esPeriodo("2026-8")).toBe(false);
    expect(esPeriodo("2026-13")).toBe(false);
  });

  it("el día 15 todavía es la Q1 y el 16 ya es la Q2", () => {
    expect(quincenaDe("2026-08-15")).toBe(1);
    expect(quincenaDe("2026-08-16")).toBe(2);
    expect(quincenaDe("2026-08-01")).toBe(1);
    expect(quincenaDe("2026-08-31")).toBe(2);
  });

  it("periodoDe recorta a YYYY-MM", () => {
    expect(periodoDe("2026-08-16")).toBe("2026-08");
  });
});

describe("periodosEntre", () => {
  it("incluye las dos puntas", () => {
    expect(periodosEntre("2026-01-10", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("cruza el año", () => {
    expect(periodosEntre("2025-11-01", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("un solo mes devuelve un solo período", () => {
    expect(periodosEntre("2026-08-01", "2026-08-31")).toEqual(["2026-08"]);
  });

  it("un rango INVERTIDO devuelve vacío, no meses fantasma", () => {
    expect(periodosEntre("2026-08-01", "2026-01-01")).toEqual([]);
  });
});

describe("periodosDeAguinaldo", () => {
  it("va de diciembre del año anterior a noviembre del año en curso", () => {
    const p = periodosDeAguinaldo(2026);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe("2025-12");
    expect(p[11]).toBe("2026-11");
  });
});

describe("coberturaDe", () => {
  it("declara lo registrado sobre lo posible", () => {
    const c = coberturaDe(8, periodosDeAguinaldo(2026));
    expect(c).toEqual({ registradas: 8, posibles: 24, texto: "8 de 24 quincenas registradas" });
  });

  it("el año completo dice 24 de 24", () => {
    expect(coberturaDe(24, periodosDeAguinaldo(2026)).texto).toBe("24 de 24 quincenas registradas");
  });

  it("nunca reporta MÁS de lo posible", () => {
    // Si alguien cargó una quincena fuera del período, el numerador mentiría
    // hacia arriba y la cobertura diría que está más completa de lo que está.
    expect(coberturaDe(99, periodosDeAguinaldo(2026)).registradas).toBe(24);
  });

  it("cero registradas se dice, no se esconde", () => {
    expect(coberturaDe(0, periodosDeAguinaldo(2026)).texto).toBe("0 de 24 quincenas registradas");
  });

  it("un negativo se clampea a cero", () => {
    expect(coberturaDe(-3, ["2026-01"]).registradas).toBe(0);
  });

  it("el singular está bien escrito", () => {
    expect(coberturaDe(1, ["2026-01"]).texto).toBe("1 de 2 quincenas registradas");
  });
});

describe("primeraQuincenaDe", () => {
  it("la antigüedad es la quincena MÁS VIEJA del libro", () => {
    expect(primeraQuincenaDe(["2026-05-15", "2026-01-31", "2026-03-15"])).toBe("2026-01-31");
  });

  it("sin pagos no hay antigüedad que afirmar", () => {
    expect(primeraQuincenaDe([])).toBeNull();
  });
});

describe("montoQuincena (hoist del motor — sugerencia de UI, nunca derivación)", () => {
  it("reparte mitad y mitad y la Q2 absorbe el centavo", () => {
    expect(montoQuincena(1000, 1)).toBe(500);
    expect(montoQuincena(1000, 2)).toBe(500);
    // Impar: Q1 + Q2 tiene que dar el mensual EXACTO.
    const m = 1000.01;
    expect(montoQuincena(m, 1) + montoQuincena(m, 2)).toBeCloseTo(m, 10);
  });

  it("un monto en colones sin decimales también cierra exacto", () => {
    const m = 1_500_000;
    expect(montoQuincena(m, 1)).toBe(750_000);
    expect(montoQuincena(m, 1) + montoQuincena(m, 2)).toBe(m);
  });
});

describe("quincenasDistintas — el numerador de la cobertura son QUINCENAS, no filas", () => {
  // El libro tiene UNA FILA POR PERSONA Y POR QUINCENA. Pasarle el conteo de
  // filas a coberturaDe hacía que el clamp lo recortara al máximo y la pantalla
  // dijera "18 de 18" con el libro incompleto. Con más de una persona ese aviso
  // no podía volverse a poner en falso NUNCA — que es su única razón de existir.
  const persona = (nombre: string, pares: Array<[string, number]>) =>
    pares.map(([periodo, quincena]) => ({ sujetoNombre: nombre, periodo, quincena }));

  it("Q1 · doce personas en la misma quincena son UNA quincena", () => {
    const pagos = Array.from({ length: 12 }, (_, i) => ({ periodo: "2026-08", quincena: 1, id: i }));
    expect(quincenasDistintas(pagos)).toBe(1);
  });

  it("Q2 · el caso real: 2 personas × 9 meses con agosto a medias son 17, no 34", () => {
    const meses = ["2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07"];
    const completos = meses.flatMap((m) => [[m, 1], [m, 2]] as Array<[string, number]>);
    const pagos = [
      ...persona("Ana", [...completos, ["2026-08", 1]]),
      ...persona("Beto", [...completos, ["2026-08", 1]]),
    ];
    expect(pagos.length).toBe(34);
    expect(quincenasDistintas(pagos)).toBe(17);
  });

  it("Q3 · y así la cobertura SÍ puede decir que el libro está incompleto", () => {
    // Ésta es la regresión de verdad: con el conteo de filas el clamp devolvía
    // 18 de 18 (libro completo) sobre exactamente los mismos datos.
    const meses = ["2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07"];
    const completos = meses.flatMap((m) => [[m, 1], [m, 2]] as Array<[string, number]>);
    const pagos = [
      ...persona("Ana", [...completos, ["2026-08", 1]]),
      ...persona("Beto", [...completos, ["2026-08", 1]]),
    ];
    const periodos = [...meses, "2026-08"];
    expect(coberturaDe(quincenasDistintas(pagos), periodos).texto).toBe(
      "17 de 18 quincenas registradas",
    );
    expect(coberturaDe(pagos.length, periodos).texto).toBe("18 de 18 quincenas registradas");
  });

  it("Q4 · sin pagos son cero quincenas", () => {
    expect(quincenasDistintas([])).toBe(0);
  });
});
