/**
 * lib/finanzas/equilibrio.test.ts
 *
 * Los casos que importan no son "sumar doce números": son los bordes donde un cálculo
 * ingenuo produce un número creíble y falso — un piso bajo porque promedió meses a
 * medias, un mes que "cubre egresos" porque la mitad de los costos no estaba cargada,
 * o plata que desaparece del total porque faltaba el tipo de cambio.
 *
 * ÍNDICE
 *   A. periodosDelAnio — el año siempre tiene 12 filas
 *   B. convertir — el FX vive acá y en ningún otro lado
 *   C. armado — sumar sin mentir
 *   D. calidadDelMes — la etiqueta que sostiene todo el reporte
 *   E. promedioMensual — el número que va a leer dirección
 *   F. metasDe — el colchón es editable, no una tasa
 *   G. brechaDe — el signo importa
 *   H. reservaAguinaldoMensual — dos criterios que conviven
 *   H2. pisoVigente — lo que cuesta la operación HOY (el titular del reporte)
 *   I. calcularEquilibrio — composición e invariantes
 *   J. estructura y desglose por servicio
 *   K. el FX no se escapa del módulo (candado estructural)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  brechaDe,
  calcularEquilibrio,
  calidadDelMes,
  conceptosRecurrentes,
  convertir,
  metasDe,
  periodosDelAnio,
  pisoVigente,
  promedioMensual,
  reservaAguinaldoMensual,
  type EgresoDeMes,
  type FilaMes,
  type IngresoDeMes,
  type RubroEgreso,
} from "./equilibrio";

const HOY = "2026-08-17";

/** Egreso mínimo, con lo que casi nunca cambia ya puesto. */
const eg = (p: string, rubro: RubroEgreso, concepto: string, monto: number, extra: Partial<EgresoDeMes> = {}): EgresoDeMes => ({
  periodo: p,
  rubro,
  concepto,
  conceptoClave: concepto.toLowerCase(),
  monto,
  moneda: "USD",
  calidad: "MEDIDO",
  ...extra,
});

const ing = (p: string, tipo: IngresoDeMes["tipo"], monto: number, extra: Partial<IngresoDeMes> = {}): IngresoDeMes => ({
  periodo: p,
  tipo,
  monto,
  moneda: "USD",
  tipoServicio: "IMPLEMENTACION",
  ...extra,
});

/** Un año entero con el mismo costo todos los meses: el caso base para comparar. */
function anioParejo(monto: number): EgresoDeMes[] {
  return periodosDelAnio(2026).map((p) => eg(p, "FIJO_OPERACION", "Alquiler", monto));
}

// ── A ───────────────────────────────────────────────────────────────────────────

describe("A · periodosDelAnio", () => {
  it("A1 devuelve los 12 períodos en orden", () => {
    const p = periodosDelAnio(2026);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe("2026-01");
    expect(p[11]).toBe("2026-12");
  });

  it("A2 un año basura devuelve vacío en vez de fabricar fechas", () => {
    expect(periodosDelAnio(0)).toEqual([]);
    expect(periodosDelAnio(99999)).toEqual([]);
    expect(periodosDelAnio(2026.5)).toEqual([]);
  });

  it("A3 un mes sin ningún dato SALE igual, en cero: una fila ausente se lee como «no gastamos»", () => {
    const r = calcularEquilibrio([eg("2026-03", "FIJO_OPERACION", "Alquiler", 100)], [], { anio: 2026, hoyISO: HOY });
    expect(r.meses).toHaveLength(12);
    expect(r.meses[0]!.egresos).toBe(0);
    expect(r.meses[0]!.estado).toBe("PARCIAL");
  });
});

// ── B ───────────────────────────────────────────────────────────────────────────

describe("B · convertir", () => {
  const tasa = { periodo: "2026-01", crcPorUsd: 500, fuente: "BCCR" };

  it("B1 la misma moneda no toca el número y declara que no convirtió", () => {
    expect(convertir(1234.56, "USD", "USD", null)).toEqual({ monto: 1234.56, convertido: false });
  });

  it("B2 CRC→USD divide por la tasa y redondea a centavos", () => {
    expect(convertir(100_000, "CRC", "USD", tasa)).toEqual({ monto: 200, convertido: true });
  });

  it("B3 USD→CRC multiplica", () => {
    expect(convertir(200, "USD", "CRC", tasa)).toEqual({ monto: 100_000, convertido: true });
  });

  it("B4 SIN tasa devuelve null: no se aproxima ni se asume paridad", () => {
    expect(convertir(100_000, "CRC", "USD", null)).toBeNull();
  });

  it("B5 una tasa 0 o negativa se rechaza — dividir por ahí da Infinity y nadie lo ve", () => {
    expect(convertir(100, "CRC", "USD", { ...tasa, crcPorUsd: 0 })).toBeNull();
    expect(convertir(100, "CRC", "USD", { ...tasa, crcPorUsd: -500 })).toBeNull();
    expect(convertir(100, "CRC", "USD", { ...tasa, crcPorUsd: NaN })).toBeNull();
  });
});

// ── C ───────────────────────────────────────────────────────────────────────────

describe("C · armado — sumar sin mentir", () => {
  it("C1 dos conceptos del mismo mes y rubro suman", () => {
    const r = calcularEquilibrio(
      [eg("2026-01", "FIJO_OPERACION", "Alquiler", 200), eg("2026-01", "FIJO_OPERACION", "CCSS", 300)],
      [],
      { anio: 2026, hoyISO: HOY },
    );
    expect(r.meses[0]!.egresosPorRubro.FIJO_OPERACION).toBe(500);
  });

  it("C2 un monto SIN tasa no entra al total y queda listado — no desaparece", () => {
    const r = calcularEquilibrio(
      [eg("2026-01", "FIJO_OPERACION", "Alquiler", 100_000, { moneda: "CRC" }), eg("2026-01", "FIJO_OPERACION", "CCSS", 300)],
      [],
      { anio: 2026, hoyISO: HOY }, // sin tasas
    );
    expect(r.meses[0]!.egresos).toBe(300);
    expect(r.fx.montosNoConvertidos).toHaveLength(1);
    expect(r.fx.periodosSinTasa).toEqual(["2026-01"]);
    expect(r.calidad.avisos.find((a) => a.codigo === "SIN_TIPO_DE_CAMBIO")?.severidad).toBe("ALTA");
  });

  it("C3 con la tasa del mes, el mismo monto SÍ entra convertido", () => {
    const r = calcularEquilibrio([eg("2026-01", "FIJO_OPERACION", "Alquiler", 100_000, { moneda: "CRC" })], [], {
      anio: 2026,
      hoyISO: HOY,
      tasas: [{ periodo: "2026-01", crcPorUsd: 500, fuente: "BCCR" }],
    });
    expect(r.meses[0]!.egresos).toBe(200);
    expect(r.fx.convertidos).toBe(1);
    expect(r.fx.montosNoConvertidos).toEqual([]);
  });

  it("C4 la tasa de enero NO se usa para febrero: cada mes con la suya o ninguna", () => {
    const r = calcularEquilibrio(
      [
        eg("2026-01", "FIJO_OPERACION", "Alquiler", 100_000, { moneda: "CRC" }),
        eg("2026-02", "FIJO_OPERACION", "Alquiler", 100_000, { moneda: "CRC" }),
      ],
      [],
      { anio: 2026, hoyISO: HOY, tasas: [{ periodo: "2026-01", crcPorUsd: 500, fuente: "BCCR" }] },
    );
    expect(r.meses[0]!.egresos).toBe(200);
    expect(r.meses[1]!.egresos).toBe(0);
    expect(r.fx.periodosSinTasa).toEqual(["2026-02"]);
  });

  it("C5 un egreso de otro año se ignora en vez de contaminar el reporte", () => {
    const r = calcularEquilibrio([eg("2025-12", "FIJO_OPERACION", "Alquiler", 9999)], [], { anio: 2026, hoyISO: HOY });
    expect(r.indicadores.egresosTotales).toBe(0);
  });
});

// ── D ───────────────────────────────────────────────────────────────────────────

describe("D · calidadDelMes", () => {
  // clave → primer mes en que se espera (la ventana se abre, no se cierra).
  const esperados = new Map<RubroEgreso, Map<string, string>>([
    ["FIJO_OPERACION", new Map([["alquiler", "2026-01"], ["ccss", "2026-01"]])],
    ["PLANILLA", new Map([["planilla", "2026-01"]])],
  ]);
  const RUBROS_ANIO = new Set<RubroEgreso>(["FIJO_OPERACION", "PLANILLA"]);

  it("D1 con todos los conceptos recurrentes presentes, el mes está COMPLETO", () => {
    const presentes = new Map<RubroEgreso, Set<string>>([
      ["FIJO_OPERACION", new Set(["alquiler", "ccss"])],
      ["PLANILLA", new Set(["planilla"])],
    ]);
    expect(calidadDelMes("2026-06", presentes, esperados, RUBROS_ANIO, true)).toEqual({ estado: "COMPLETO", faltantes: [] });
  });

  it("D1b un concepto EXTRA que no se esperaba no rompe nada: el pago anual cae donde cae", () => {
    const presentes = new Map<RubroEgreso, Set<string>>([
      ["FIJO_OPERACION", new Set(["alquiler", "ccss", "hosting-anual"])],
      ["PLANILLA", new Set(["planilla"])],
    ]);
    expect(calidadDelMes("2026-06", presentes, esperados, RUBROS_ANIO, true).estado).toBe("COMPLETO");
  });

  it("D2 si falta un concepto recurrente, es PARCIAL y lo NOMBRA (un conteo no sirve para actuar)", () => {
    const presentes = new Map<RubroEgreso, Set<string>>([
      ["FIJO_OPERACION", new Set(["alquiler"])],
      ["PLANILLA", new Set(["planilla"])],
    ]);
    const r = calidadDelMes("2026-06", presentes, esperados, RUBROS_ANIO, true);
    expect(r.estado).toBe("PARCIAL");
    expect(r.faltantes).toEqual(["ccss"]);
  });

  it("D3 un rubro entero ausente se nombra por el rubro", () => {
    const presentes = new Map<RubroEgreso, Set<string>>([["FIJO_OPERACION", new Set(["alquiler", "ccss"])]]);
    expect(calidadDelMes("2026-06", presentes, esperados, RUBROS_ANIO, true).faltantes).toEqual(["planilla"]);
  });

  it("D4 un mes SIN egresos es PARCIAL, jamás COMPLETO por omisión: no es un mes barato", () => {
    expect(calidadDelMes("2026-06", new Map(), esperados, RUBROS_ANIO, false)).toEqual({
      estado: "PARCIAL",
      faltantes: ["todo el mes"],
    });
  });

  it("D5 enero-marzo sin costos fijos (el bloque oculto del Excel) quedan PARCIALES", () => {
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "PLANILLA", "Planilla", 21_004)),
      ...periodosDelAnio(2026).slice(3).map((p) => eg(p, "FIJO_OPERACION", "Alquiler", 2_147)),
    ];
    const r = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: HOY });
    expect(r.meses.slice(0, 3).every((m) => m.estado === "PARCIAL")).toBe(true);
    expect(r.meses[0]!.faltantes).toEqual(["costos fijos"]);
    expect(r.meses[3]!.estado).toBe("COMPLETO");
  });

  it("D6 un mes posterior a hoy queda marcado futuro aunque traiga datos de plan", () => {
    const r = calcularEquilibrio(anioParejo(1000), [], { anio: 2026, hoyISO: HOY });
    expect(r.meses[7]!.futuro).toBe(false); // agosto: hoy es 2026-08-17
    expect(r.meses[8]!.futuro).toBe(true); // septiembre
  });

  it("D7 EL BUG QUE ENCONTRARON LOS DATOS REALES: un pago anual no vuelve parciales a los otros once", () => {
    // Hostinger se paga una vez, en abril. La primera versión exigía todos los
    // conceptos del año en todos los meses: los doce salían PARCIAL, ninguno entraba
    // al promedio y el punto de equilibrio daba CERO. Coherente e inútil.
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "HERRAMIENTA", "HubSpot", 535)),
      eg("2026-04", "HERRAMIENTA", "Hostinger", 371.88),
    ];
    const r = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: HOY });
    expect(r.meses.every((m) => m.estado === "COMPLETO")).toBe(true);
    expect(r.equilibrio.base).toBeGreaterThan(0);
  });

  it("D8 pero una QUINCENA de planilla que falta sí se ve: aparece en casi todos los meses", () => {
    const egresos = periodosDelAnio(2026).flatMap((p) => [
      eg(p, "PLANILLA", "Planilla 1ª quincena", 5000, { conceptoClave: "planilla-q1" }),
      // Agosto se quedó sin segunda quincena — es el caso real del libro.
      ...(p === "2026-08" ? [] : [eg(p, "PLANILLA", "Planilla 2ª quincena", 5000, { conceptoClave: "planilla-q2" })]),
    ]);
    const r = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: HOY });
    expect(r.meses[7]!.estado).toBe("PARCIAL");
    expect(r.meses[7]!.faltantes).toEqual(["planilla-q2"]);
    expect(r.meses[0]!.estado).toBe("COMPLETO");
  });
});

describe("D · conceptosRecurrentes", () => {
  it("un concepto de un solo mes NO es recurrente; uno de todos los meses sí", () => {
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "HERRAMIENTA", "HubSpot", 535)),
      eg("2026-04", "HERRAMIENTA", "Hostinger", 371.88),
    ];
    const r = conceptosRecurrentes(egresos);
    expect([...r.get("HERRAMIENTA")!.keys()]).toEqual(["hubspot"]);
  });

  it("EL SEGUNDO CASO REAL: una herramienta que arranca en junio se espera DESDE junio", () => {
    // Supabase empezó a cobrarse en junio. Medido contra el año entero da 7/12 y
    // "faltaría" en abril y mayo — meses en que la herramienta no existía, y por eso
    // abril y mayo quedaban fuera del promedio del equilibrio. Medido contra su propia
    // ventana da 7/7 y solo se exige desde junio.
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "HERRAMIENTA", "HubSpot", 535)),
      ...periodosDelAnio(2026).slice(5).map((p) => eg(p, "HERRAMIENTA", "Supabase", 25)),
    ];
    const r = conceptosRecurrentes(egresos).get("HERRAMIENTA")!;
    expect(r.get("hubspot")).toBe("2026-01");
    expect(r.get("supabase")).toBe("2026-06");

    // Y el efecto que importa: los doce meses quedan COMPLETOS.
    const rep = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: HOY });
    expect(rep.meses.every((m) => m.estado === "COMPLETO")).toBe(true);
  });

  it("cada rubro se mide contra SUS propios meses, no contra el año", () => {
    // Los costos fijos solo existen abr-dic (el bloque oculto del Excel). El alquiler
    // está en los 9 y es recurrente, aunque sean 9 de 12 meses del año.
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "HERRAMIENTA", "HubSpot", 535)),
      ...periodosDelAnio(2026).slice(3).map((p) => eg(p, "FIJO_OPERACION", "Alquiler", 200)),
    ];
    expect([...conceptosRecurrentes(egresos).get("FIJO_OPERACION")!.keys()]).toEqual(["alquiler"]);
  });

  it("un concepto esporádico dentro de su ventana tampoco se exige", () => {
    // Aparece 2 de 9 meses desde su primer cargo: no hay ninguna regularidad que
    // permita afirmar que "falta" en los otros siete.
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "HERRAMIENTA", "HubSpot", 535)),
      eg("2026-04", "HERRAMIENTA", "Extra", 50),
      eg("2026-09", "HERRAMIENTA", "Extra", 50),
    ];
    expect([...conceptosRecurrentes(egresos).get("HERRAMIENTA")!.keys()]).toEqual(["hubspot"]);
  });
});

// ── E ───────────────────────────────────────────────────────────────────────────

describe("E · promedioMensual", () => {
  // Solo los cuatro campos que `promedioMensual` mira. El resto de FilaMes no
  // interviene en la decisión y llenarlo escondería de qué depende el promedio.
  const fila = (periodo: string, egresos: number, estado: "COMPLETO" | "PARCIAL", futuro = false): FilaMes =>
    ({ periodo, egresos, estado, futuro, faltantes: [] }) as unknown as FilaMes;

  it("E1 SOLO_MEDIDOS promedia únicamente los meses completos que ya ocurrieron", () => {
    const r = promedioMensual(
      [fila("2026-01", 100, "COMPLETO"), fila("2026-02", 200, "COMPLETO"), fila("2026-12", 900, "COMPLETO", true)],
      "SOLO_MEDIDOS",
    );
    expect(r.promedio).toBe(150);
    expect(r.mesesUsados).toEqual(["2026-01", "2026-02"]);
  });

  it("E2 INCLUIR_PLANIFICADOS da OTRO número, y por eso las dos ventanas existen", () => {
    const meses = [fila("2026-01", 100, "COMPLETO"), fila("2026-12", 900, "COMPLETO", true)];
    expect(promedioMensual(meses, "SOLO_MEDIDOS").promedio).toBe(100);
    expect(promedioMensual(meses, "INCLUIR_PLANIFICADOS").promedio).toBe(500);
  });

  it("E3 cada mes excluido trae su motivo: cero exclusiones mudas", () => {
    const r = promedioMensual([fila("2026-01", 100, "PARCIAL"), fila("2026-02", 0, "COMPLETO")], "SOLO_MEDIDOS");
    expect(r.mesesExcluidos).toEqual([
      { periodo: "2026-01", motivo: "mes incompleto" },
      { periodo: "2026-02", motivo: "sin egresos registrados" },
    ]);
  });

  it("E4 sin meses elegibles el promedio es 0 pero mesesUsados queda VACÍO — no es un piso de cero", () => {
    const r = promedioMensual([fila("2026-01", 100, "PARCIAL")], "SOLO_MEDIDOS");
    expect(r.promedio).toBe(0);
    expect(r.mesesUsados).toEqual([]);
  });

  it("E5 con un solo mes elegible promedia ese mes y lo declara (n=1 no se disimula)", () => {
    const r = promedioMensual([fila("2026-04", 27_529.94, "COMPLETO")], "SOLO_MEDIDOS");
    expect(r.promedio).toBe(27_529.94);
    expect(r.mesesUsados).toHaveLength(1);
  });
});

// ── F, G, H ─────────────────────────────────────────────────────────────────────

describe("F · metasDe", () => {
  it("F1 +10% y +15% sobre el piso, redondeados a centavos", () => {
    expect(metasDe(26_968.71)).toEqual([
      { colchonPct: 10, monto: 29_665.58, etiqueta: "piso +10%" },
      { colchonPct: 15, monto: 31_014.02, etiqueta: "piso +15%" },
    ]);
  });

  it("F2 un colchón 0 devuelve el piso tal cual", () => {
    expect(metasDe(1000, [0])).toEqual([{ colchonPct: 0, monto: 1000, etiqueta: "el piso" }]);
  });

  it("F3 un colchón negativo se descarta en vez de producir una meta BAJO el piso", () => {
    expect(metasDe(1000, [-10, 20])).toEqual([{ colchonPct: 20, monto: 1200, etiqueta: "piso +20%" }]);
  });
});

describe("G · brechaDe", () => {
  it("G1 ingresos por encima: brecha positiva y cubre", () => {
    expect(brechaDe(55_096, 24_409.63)).toEqual({ brecha: 30_686.37, cubre: true, pctCobertura: 225.7 });
  });

  it("G2 ingresos por debajo: la brecha se muestra NEGATIVA, sin Math.abs", () => {
    const r = brechaDe(18_928.66, 27_529.94);
    expect(r.brecha).toBe(-8601.28);
    expect(r.cubre).toBe(false);
  });

  it("G3 egresos en cero: pctCobertura null, nunca Infinity", () => {
    expect(brechaDe(100, 0).pctCobertura).toBeNull();
  });
});

describe("H · reservaAguinaldoMensual", () => {
  it("H1 total/12 es la regla de Nexus", () => {
    expect(reservaAguinaldoMensual(16_027.67)).toBe(1335.64);
  });

  it("H2 el divisor 10 del Excel da OTRO número, y los dos son defendibles", () => {
    expect(reservaAguinaldoMensual(16_027.67, 10)).toBe(1602.77);
  });

  it("H3 un divisor inválido devuelve 0 en vez de Infinity", () => {
    expect(reservaAguinaldoMensual(1000, 0)).toBe(0);
  });
});

// ── H2 · pisoVigente ────────────────────────────────────────────────────────────

describe("H2 · pisoVigente — lo que cuesta la operación HOY", () => {
  const cv = (rubro: RubroEgreso, concepto: string, monto: number, moneda: "CRC" | "USD" = "USD") => ({
    rubro,
    concepto,
    monto,
    moneda,
  });
  const TASA = { periodo: "2026-08", crcPorUsd: 500, fuente: "Excel" };

  it("suma los costos vigentes por rubro, sin promediar nada", () => {
    const r = pisoVigente(
      [cv("PLANILLA", "Marco", 2400), cv("PLANILLA", "Elías", 3000), cv("HERRAMIENTA", "HubSpot", 535)],
      { monedaPresentacion: "USD", tasa: TASA },
    );
    expect(r.porRubro.PLANILLA).toBe(5400);
    expect(r.porRubro.HERRAMIENTA).toBe(535);
    expect(r.base).toBe(5935);
    expect(r.cuantos).toBe(3);
  });

  it("convierte los colones con la tasa del mes en curso", () => {
    const r = pisoVigente([cv("PLANILLA", "Marco", 1_200_000, "CRC")], {
      monedaPresentacion: "USD",
      tasa: TASA,
    });
    expect(r.base).toBe(2400);
  });

  it("SIN tasa, lo que está en colones queda fuera del piso y se lista", () => {
    // Un piso inflado por una conversión inventada es peor que uno que declara lo que
    // le falta: con el primero alguien decide, con el segundo alguien pregunta.
    const r = pisoVigente([cv("PLANILLA", "Marco", 1_200_000, "CRC"), cv("PLANILLA", "Andrés", 2500)], {
      monedaPresentacion: "USD",
      tasa: null,
    });
    expect(r.base).toBe(2500);
    expect(r.noConvertidos).toEqual([{ concepto: "Marco", moneda: "CRC", monto: 1_200_000 }]);
    expect(r.cuantos).toBe(1);
  });

  it("la reserva de aguinaldo entra aparte: es un devengo, no un costo dado de alta", () => {
    const r = pisoVigente([cv("PLANILLA", "Marco", 2400)], {
      monedaPresentacion: "USD",
      tasa: TASA,
      reservaAguinaldoMensual: 1261.85,
    });
    expect(r.porRubro.RESERVA_AGUINALDO).toBe(1261.85);
    expect(r.base).toBe(3661.85);
    // No cuenta como "costo vigente": nadie la dio de alta.
    expect(r.cuantos).toBe(1);
  });

  it("sin costos el piso es 0 y lo dice, en vez de fingir un número", () => {
    const r = pisoVigente([], { monedaPresentacion: "USD", tasa: TASA });
    expect(r.base).toBe(0);
    expect(r.cuantos).toBe(0);
  });

  it("EL CASO REAL de agosto 2026: 13 salarios dan un piso distinto al promedio histórico", () => {
    // El promedio de los meses medidos daba $22.967 porque el libro de pagos tenía 12
    // personas; la nómina real son 13 y cuesta $22.668 solo de planilla. Medir el piso
    // sobre el pasado dejaba $11.000/mes afuera antes de corregir la nómina.
    const r = pisoVigente(
      [
        cv("PLANILLA", "planilla completa", 12_500),
        cv("PLANILLA", "planilla en colones", 5_084_000, "CRC"),
        cv("FIJO_OPERACION", "fijos", 2111.33),
        cv("HERRAMIENTA", "herramientas", 1708.6),
        cv("TARJETA", "tarjeta", 130.6),
      ],
      { monedaPresentacion: "USD", tasa: TASA, reservaAguinaldoMensual: 1261.85 },
    );
    expect(r.porRubro.PLANILLA).toBe(22_668);
    expect(r.base).toBe(27_880.38);
    expect(r.metas.map((m) => m.monto)).toEqual([30_668.42, 32_062.44]);
  });
});

// ── I ───────────────────────────────────────────────────────────────────────────

describe("I · calcularEquilibrio — composición e invariantes", () => {
  it("I1 la suma de los rubros de un mes es igual al egreso del mes", () => {
    const r = calcularEquilibrio(
      [eg("2026-01", "PLANILLA", "Planilla", 21_004), eg("2026-01", "HERRAMIENTA", "HubSpot", 535)],
      [],
      { anio: 2026, hoyISO: HOY },
    );
    const m = r.meses[0]!;
    const suma = Object.values(m.egresosPorRubro).reduce((a, b) => a + b, 0);
    expect(suma).toBe(m.egresos);
  });

  it("I2 la suma de los 12 meses es igual al total del año", () => {
    const r = calcularEquilibrio(anioParejo(1000), [], { anio: 2026, hoyISO: HOY });
    expect(r.indicadores.egresosTotales).toBe(12_000);
  });

  it("I3 EL CASO DEL REPORTE ORIGINAL: enero cierra exactamente como el prototipo", () => {
    // Del reporte que se está replicando: cobrado 31.595 + facturado sin cobrar 23.501
    // = 55.096 de ingresos; egresos 24.409,63; brecha 30.686,37.
    const r = calcularEquilibrio(
      [eg("2026-01", "PLANILLA", "Planilla", 21_004), eg("2026-01", "HERRAMIENTA", "Tools", 1802.86), eg("2026-01", "RESERVA_AGUINALDO", "Reserva", 1602.77)],
      [ing("2026-01", "COBRADO", 31_595), ing("2026-01", "POR_COBRAR", 23_501)],
      { anio: 2026, hoyISO: HOY },
    );
    const m = r.meses[0]!;
    expect(m.egresos).toBe(24_409.63);
    expect(m.facturado).toBe(55_096);
    expect(m.ingresosTotales).toBe(55_096);
    expect(m.brecha).toBe(30_686.37);
  });

  it("I4 la brecha se mide contra los EGRESOS del mes, no contra el piso", () => {
    // Abril del prototipo: ingresos 18.928,66 · egresos 27.529,94 · brecha −8.601,28.
    // Contra un piso de 26.968,71 daría −8.040,05, que es otro número y otra historia.
    const r = calcularEquilibrio(
      [eg("2026-04", "PLANILLA", "Planilla", 27_529.94)],
      [ing("2026-04", "COBRADO", 16_098.66), ing("2026-04", "POR_COBRAR", 2830)],
      { anio: 2026, hoyISO: HOY },
    );
    expect(r.meses[3]!.brecha).toBe(-8601.28);
  });

  it("I5 el partnership suma a los ingresos aunque todavía no se haya cobrado", () => {
    const r = calcularEquilibrio([], [ing("2026-11", "COMISION_PARTNER", 53_849.25, { tipoServicio: null, cobrada: false })], {
      anio: 2026,
      hoyISO: HOY,
    });
    const m = r.meses[10]!;
    expect(m.partnership).toBe(53_849.25);
    expect(m.partnershipCobrado).toBe(0);
    expect(m.ingresosTotales).toBe(53_849.25);
  });

  it("I6 lo PROGRAMADO (sin facturar) NO es ingreso: es backlog y va aparte", () => {
    const r = calcularEquilibrio([], [ing("2026-09", "PROGRAMADO", 17_847)], { anio: 2026, hoyISO: HOY });
    expect(r.meses[8]!.ingresosTotales).toBe(0);
    expect(r.meses[8]!.pendienteFacturar).toBe(17_847);
    expect(r.indicadores.pendienteFacturarTotal).toBe(17_847);
  });

  it("I7 un mes PARCIAL no afirma que cubre egresos: la respuesta es null", () => {
    const egresos = [
      ...periodosDelAnio(2026).map((p) => eg(p, "PLANILLA", "Planilla", 1000)),
      eg("2026-02", "FIJO_OPERACION", "Alquiler", 500),
    ];
    const r = calcularEquilibrio(egresos, [ing("2026-01", "COBRADO", 99_999)], { anio: 2026, hoyISO: HOY });
    expect(r.meses[0]!.estado).toBe("PARCIAL");
    expect(r.meses[0]!.cubreEgresos).toBeNull();
    expect(r.meses[1]!.cubreEgresos).toBe(false);
  });

  it("I8 sin ningún dato devuelve un reporte válido, no NaN ni una excepción", () => {
    const r = calcularEquilibrio([], [], { anio: 2026, hoyISO: HOY });
    expect(r.meses).toHaveLength(12);
    expect(r.indicadores.egresosTotales).toBe(0);
    expect(r.indicadores.tasaCobro).toBeNull();
    expect(r.equilibrio.base).toBe(0);
    expect(r.calidad.avisos.some((a) => a.codigo === "SIN_MESES_ELEGIBLES")).toBe(true);
  });

  it("I9 avisa del solape tarjeta/herramientas cuando conviven en un mes", () => {
    const r = calcularEquilibrio(
      [eg("2026-05", "TARJETA", "Visa", 130.6), eg("2026-05", "HERRAMIENTA", "HubSpot", 535)],
      [],
      { anio: 2026, hoyISO: HOY },
    );
    const aviso = r.calidad.avisos.find((a) => a.codigo === "TARJETA_SOLAPA_HERRAMIENTAS");
    expect(aviso?.severidad).toBe("ALTA");
    expect(aviso?.periodos).toEqual(["2026-05"]);
  });

  it("I10 hoyISO entra por parámetro: mismo input y distinto hoy da resultados distintos y deterministas", () => {
    const egresos = anioParejo(1000);
    const enMayo = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: "2026-05-15" });
    const enDiciembre = calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: "2026-12-31" });
    expect(enMayo.equilibrio.mesesUsados).toHaveLength(5);
    expect(enDiciembre.equilibrio.mesesUsados).toHaveLength(12);
    // Determinismo: dos corridas idénticas dan exactamente lo mismo.
    expect(calcularEquilibrio(egresos, [], { anio: 2026, hoyISO: "2026-05-15" })).toEqual(enMayo);
  });

  it("I11 las dos ventanas viajan juntas para poder compararlas", () => {
    const r = calcularEquilibrio(anioParejo(1000), [], { anio: 2026, hoyISO: HOY });
    expect(r.equilibrio.ventana).toBe("SOLO_MEDIDOS");
    expect(r.equilibrio.base).toBe(1000);
    expect(r.equilibrio.baseOtraVentana).toBe(1000);
    expect(r.equilibrio.mesesUsados).toHaveLength(8); // ene..ago
    expect(r.equilibrio.mesesExcluidos).toHaveLength(4); // sep..dic, futuros
    expect(r.equilibrio.mesesExcluidos[0]!.motivo).toContain("todavía no ocurre");
  });

  it("I12 el margen del año es ingresos totales menos egresos", () => {
    const r = calcularEquilibrio(anioParejo(1000), [ing("2026-01", "COBRADO", 20_000)], { anio: 2026, hoyISO: HOY });
    expect(r.indicadores.ingresosTotales).toBe(20_000);
    expect(r.indicadores.margenAnual).toBe(8000);
  });
});

// ── J ───────────────────────────────────────────────────────────────────────────

describe("J · estructura y desglose", () => {
  it("J1 los porcentajes de la estructura suman 100", () => {
    const r = calcularEquilibrio(
      [
        eg("2026-01", "PLANILLA", "Planilla", 21_004),
        eg("2026-01", "FIJO_OPERACION", "Fijos", 2353),
        eg("2026-01", "HERRAMIENTA", "Tools", 1878),
        eg("2026-01", "RESERVA_AGUINALDO", "Reserva", 1603),
        eg("2026-01", "TARJETA", "Visa", 131),
      ],
      [],
      { anio: 2026, hoyISO: HOY },
    );
    const suma = r.estructura.reduce((n, e) => n + e.pctDelTotal, 0);
    expect(suma).toBeCloseTo(100, 1);
    expect(r.estructura.find((e) => e.rubro === "PLANILLA")!.pctDelTotal).toBeCloseTo(77.9, 1);
  });

  it("J2 un rubro sin datos aparece en cero, no desaparece de la estructura", () => {
    const r = calcularEquilibrio([eg("2026-01", "PLANILLA", "Planilla", 1000)], [], { anio: 2026, hoyISO: HOY });
    expect(r.estructura).toHaveLength(5);
    expect(r.estructura.find((e) => e.rubro === "TARJETA")).toMatchObject({ montoAnual: 0, pctDelTotal: 0 });
  });

  it("J3 un rubro con calidades mezcladas se declara MIXTO en vez de elegir una", () => {
    const r = calcularEquilibrio(
      [
        eg("2026-01", "FIJO_OPERACION", "Alquiler", 200),
        eg("2026-11", "FIJO_OPERACION", "Alquiler", 200, { calidad: "PLANIFICADO" }),
      ],
      [],
      { anio: 2026, hoyISO: HOY },
    );
    expect(r.estructura.find((e) => e.rubro === "FIJO_OPERACION")!.calidad).toBe("MIXTO");
  });

  it("J4 el desglose agrupa por tipo de servicio y ordena por facturado", () => {
    const r = calcularEquilibrio(
      [],
      [
        ing("2026-01", "COBRADO", 100, { tipoServicio: "WEB" }),
        ing("2026-01", "COBRADO", 900, { tipoServicio: "IMPLEMENTACION" }),
        ing("2026-02", "POR_COBRAR", 500, { tipoServicio: "WEB" }),
      ],
      { anio: 2026, hoyISO: HOY },
    );
    expect(r.ingresosPorServicio.map((s) => s.tipoServicio)).toEqual(["IMPLEMENTACION", "WEB"]);
    expect(r.ingresosPorServicio[1]).toMatchObject({ facturado: 600, cobrado: 100, porCobrar: 500 });
  });

  it("J5 un ingreso sin servicio cae en OTRO, no se reparte entre los servicios reales", () => {
    const r = calcularEquilibrio([], [ing("2026-01", "COBRADO", 300, { tipoServicio: null })], { anio: 2026, hoyISO: HOY });
    expect(r.ingresosPorServicio).toEqual([
      { tipoServicio: "OTRO", facturado: 300, cobrado: 300, porCobrar: 0, pctDelFacturado: 100 },
    ]);
  });

  it("J6 la comisión de partner NO entra al desglose por servicio: no sale de un servicio", () => {
    const r = calcularEquilibrio([], [ing("2026-02", "COMISION_PARTNER", 41_553.36, { tipoServicio: null, cobrada: true })], {
      anio: 2026,
      hoyISO: HOY,
    });
    expect(r.ingresosPorServicio).toEqual([]);
    expect(r.indicadores.partnershipTotal).toBe(41_553.36);
    expect(r.indicadores.partnershipCobradoTotal).toBe(41_553.36);
  });
});

// ── K ───────────────────────────────────────────────────────────────────────────

/**
 * El candado de la doctrina.
 *
 * La licencia para convertir monedas es de ESTE archivo y de nadie más: la base guarda
 * en moneda nativa y los motores nunca convierten (DECISIONS §El reporte anual de
 * equilibrio). Un comentario que lo diga envejece; este test no. El día que alguien
 * necesite el tipo de cambio dentro de un motor, este caso se pone rojo y obliga a
 * pasar por la decisión en vez de deslizarla en un PR.
 */
describe("K · el FX no se escapa de acá", () => {
  const MOTORES = [
    "lib/cobranza/engine.ts",
    "lib/cobranza/tarjetas.ts",
    "lib/cobranza/comisiones.ts",
    "lib/cobranza/partners.ts",
    "lib/cobranza/planilla.ts",
    "lib/cobranza/antiguedad.ts",
    "lib/finanzas/aguinaldo.ts",
  ];

  /** Sin comentarios ni strings: mencionar la regla no puede contar como violarla. */
  const soloCodigo = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");

  for (const ruta of MOTORES) {
    it(`K · ${ruta} no convierte moneda ni importa el reporte`, () => {
      const codigo = soloCodigo(readFileSync(ruta, "utf8"));
      expect(codigo).not.toMatch(/crcPorUsd/);
      expect(codigo).not.toMatch(/tipoCambio|TipoCambioMes/);
      expect(codigo).not.toMatch(/from\s+["'][^"']*finanzas\/equilibrio["']/);
    });
  }
});
