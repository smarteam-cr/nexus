import { describe, expect, it } from "vitest";
import { compararConLaFactura, diaSobreElTope, diasDelMes, finDeMesAlRitmo, nombreDelMes, procesoDeLaFila, resumirMeses, type FilaMesModelo } from "./gasto-mensual";

/**
 * lib/ai/gasto-mensual.test.ts — EL MES SUMA LO QUE TIENE QUE SUMAR.
 *
 * Lo que se cuida: que el ahorro de la caché salga de la tarifa del modelo (y que una caché que nadie lee se vea como
 * recargo), que lo pagado por lote cuente como ahorro igual a lo pagado, que los días sobre el tope se cuenten con la
 * misma regla que el presupuesto, y que la factura pida revisión solo cuando la diferencia importa.
 */

const LIMITES = { automatico: 10, humano: 20 };
const fila = (o: Partial<FilaMesModelo>): FilaMesModelo => ({
  mes: "2026-10",
  model: "claude-sonnet-4-6",
  lote: false,
  llamadas: 10,
  fallidas: 0,
  sinTarifa: 0,
  costo: 5,
  costoHumano: 2,
  tokensEntrada: 100_000,
  tokensSalida: 10_000,
  tokensCacheLectura: 0,
  tokensCacheEscritura: 0,
  ...o,
});
const vacio = { agentes: [], dias: [], reuniones: [], clientes: [] };

describe("⭐ el mes", () => {
  it("suma modelos, separa lo humano de lo automático y ordena del más viejo al más nuevo", () => {
    const m = resumirMeses({ ...vacio, modelos: [fila({}), fila({ model: "claude-haiku-4-5-20251001", costo: 1, costoHumano: 0 }), fila({ mes: "2026-09" })] }, LIMITES);
    expect(m.map((x) => x.mes)).toEqual(["2026-09", "2026-10"]);
    expect(m[1]).toMatchObject({ costo: 6, costoHumano: 2, costoAutomatico: 4, llamadas: 20 });
  });

  it("el ahorro de la caché sale de la tarifa: 1M leídos en Sonnet ahorran US$2,70; 1M escritos en Haiku sin leer, −0,25", () => {
    const [m] = resumirMeses({ ...vacio, modelos: [fila({ tokensCacheLectura: 1_000_000 }), fila({ model: "claude-haiku-4-5-20251001", tokensCacheEscritura: 1_000_000 })] }, LIMITES);
    // Haiku: escribir 1M cuesta 0,25 × US$1 de más.
    expect(m.ahorroCache).toBeCloseTo(2.7 - 0.25, 10);
    expect(m.parteDeLaCache).toBeCloseTo(1_000_000 / 2_200_000, 10);
  });

  it("lo pagado por lote es la mitad: el ahorro es igual a lo pagado", () => {
    const [m] = resumirMeses({ ...vacio, modelos: [fila({ lote: true, costo: 3 })] }, LIMITES);
    expect(m.costoPorLote).toBe(3);
    expect(m.ahorroLote).toBe(3);
  });

  it("los días sobre el tope y el día más caro", () => {
    const [m] = resumirMeses(
      {
        ...vacio,
        modelos: [fila({})],
        dias: [
          { dia: "2026-10-01", costoAutomatico: 12, costoHumano: 1 },
          { dia: "2026-10-02", costoAutomatico: 10, costoHumano: 25 },
          { dia: "2026-10-03", costoAutomatico: 1, costoHumano: 1 },
        ],
      },
      LIMITES,
    );
    expect(m.diasSobreElTope).toEqual({ automatico: 2, humano: 1 });
    expect(m.diaMasCaro).toEqual({ dia: "2026-10-02", costo: 35 });
  });

  it("el costo por reunión es lo de sus lecturas entre las reuniones; sin reuniones, null", () => {
    const [m] = resumirMeses({ ...vacio, modelos: [fila({})], reuniones: [{ mes: "2026-10", reuniones: 40, costo: 8 }] }, LIMITES);
    expect(m.costoPorReunion).toBeCloseTo(0.2, 10);
    expect(resumirMeses({ ...vacio, modelos: [fila({})] }, LIMITES)[0].costoPorReunion).toBeNull();
  });

  it("los procesos salen de los agentes, también los sin agente por su origen", () => {
    const [m] = resumirMeses(
      {
        ...vacio,
        modelos: [fila({})],
        agentes: [
          { mes: "2026-10", agentSlug: "agent-cs-watchdog", esAvance: false, esLectura: false, costo: 3, llamadas: 70, corridas: 70 },
          { mes: "2026-10", agentSlug: null, esAvance: false, esLectura: true, costo: 1, llamadas: 5, corridas: 0 },
          { mes: "2026-10", agentSlug: "agent-post-session", esAvance: false, esLectura: true, costo: 4, llamadas: 30, corridas: 30 },
        ],
      },
      LIMITES,
    );
    expect(m.procesos.map((p) => [p.clave, p.costo])).toEqual([
      ["lectura", 5],
      ["vigia", 3],
    ]);
  });

  it("los 10 clientes que más gastan", () => {
    const clientes = Array.from({ length: 12 }, (_, i) => ({ mes: "2026-10", clientId: `c${i}`, nombre: `C${i}`, costo: i, llamadas: 1 }));
    const [m] = resumirMeses({ ...vacio, modelos: [fila({})], clientes }, LIMITES);
    expect(m.clientes).toHaveLength(10);
    expect(m.clientes[0].clientId).toBe("c11");
  });
});

describe("el tope, el ritmo y los nombres", () => {
  it("llegar al tope ya es pasarlo, como en el presupuesto", () => {
    expect(diaSobreElTope({ dia: "x", costoAutomatico: 10, costoHumano: 0 }, LIMITES)).toEqual({ automatico: true, humano: false });
  });

  it("al ritmo de 10 días, un mes de 31", () => {
    expect(finDeMesAlRitmo(20, { dia: 10, diasDelMes: 31 })).toBeCloseTo(62, 10);
    expect(diasDelMes("2026-02")).toBe(28);
    expect(diasDelMes("2026-10")).toBe(31);
    expect(nombreDelMes("2026-10")).toBe("oct 2026");
  });

  it("un agente desconocido va a «otros», no se adivina", () => {
    expect(procesoDeLaFila({ agentSlug: "agente-nuevo", esAvance: false, esLectura: false })).toBe("otros");
    expect(procesoDeLaFila({ agentSlug: null, esAvance: false, esLectura: false })).toBe("sin-identificar");
  });
});

describe("⭐ la factura contra lo medido", () => {
  it("pide revisar con más del 10 % y más de US$5; con menos, no", () => {
    const [sep, oct] = compararConLaFactura(
      [
        { mes: "2026-09", costo: 33 },
        { mes: "2026-10", costo: 100 },
      ],
      [
        { mes: "2026-09", montoUsd: 35 },
        { mes: "2026-10", montoUsd: 130 },
      ],
    );
    expect(sep).toMatchObject({ diferencia: 2, revisar: false });
    expect(oct.revisar).toBe(true);
    expect(oct.parte).toBeCloseTo(30 / 130, 10);
  });

  it("un mes sin factura no se compara; uno facturado sin medición aparece con 0", () => {
    const filas = compararConLaFactura([{ mes: "2026-10", costo: 50 }], [{ mes: "2026-07", montoUsd: 12 }]);
    expect(filas.map((f) => [f.mes, f.medido, f.facturado, f.revisar])).toEqual([
      ["2026-07", 0, 12, true],
      ["2026-10", 50, null, false],
    ]);
  });
});
