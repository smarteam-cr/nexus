import { describe, expect, it } from "vitest";
import { armarLaBase, ETIQUETA_DEL_BARRIDO, type FilaAgente } from "./proyeccion-base";

/**
 * lib/ai/proyeccion-base.test.ts — LA BASE DE LA PROYECCIÓN SALE DE LO MEDIDO.
 *
 * Con las filas de 30 días (armadas a mano, con los números del 17-sep al 17-oct): leer una reunión incluye lo que su
 * lectura dispara, el resto no se cuenta dos veces, y las fracciones de ahorro salen de los tokens.
 */

const fila = (o: Partial<FilaAgente>): FilaAgente => ({ agentSlug: null, esAvance: false, esLectura: false, model: "claude-sonnet-4-6", costo: 0, llamadas: 0, corridas: 0, entrada: 0, ...o });

const AGENTES: FilaAgente[] = [
  fila({ agentSlug: "agent-post-session", costo: 14.24, llamadas: 171, corridas: 171 }),
  fila({ agentSlug: "agent-session-project-classifier", costo: 8.47, llamadas: 365 }),
  fila({ agentSlug: "agent-timeline-progress", costo: 1.65, llamadas: 10 }),
  fila({ agentSlug: "ficha-del-cliente", model: "claude-haiku-4-5-20251001", costo: 0.69, llamadas: 127 }),
  fila({ agentSlug: "agent-cs-watchdog", costo: 3.05, llamadas: 70, corridas: 70 }),
  fila({ agentSlug: "asistente-chat", model: "claude-sonnet-5", costo: 1.43, llamadas: 21 }),
  fila({ agentSlug: "procesos-mapeo", model: "claude-opus-5-5", costo: 13.86, llamadas: 55, corridas: 6 }),
  fila({ agentSlug: "exploracion-de-venta", costo: 21.24, llamadas: 209 }),
  fila({ agentSlug: "agent-kickoff-canvas", costo: 0.75, llamadas: 12 }),
  fila({ agentSlug: null, costo: 13.06, llamadas: 236 }),
];

const base = () =>
  armarLaBase({
    ahora: new Date("2026-10-18T15:00:00Z"),
    desde: new Date("2026-09-18T15:00:00Z"),
    agentes: AGENTES,
    hechos: [{ agentSlug: "sondeo-de-hechos", costo: 4.59, llamadas: 65, entrada: 65 * 12_700 }],
    corridasDelVigia: { [ETIQUETA_DEL_BARRIDO]: 50, "Watchdog CS (debounce)": 15, "Watchdog CS (entrada)": 5 },
    tandasDelVigia: 20,
    largoDelPromptDelVigia: 7_274,
    proyectosActivos: 55,
    hechosPrendidosHoy: false,
  });

describe("⭐ los componentes", () => {
  it("leer una reunión suma la lectura, el clasificador, el avance y la ficha, entre las lecturas", () => {
    const r = base().componentes.find((c) => c.clave === "reuniones")!;
    expect(r.volumenMensual).toBe(171);
    expect(r.costoUnitario).toBeCloseTo((14.24 + 8.47 + 1.65 + 0.69) / 171, 10);
  });

  it("todo lo medido está en un componente y nada dos veces", () => {
    const b = base();
    const total = b.componentes.filter((c) => c.clave !== "hechos").reduce((s, c) => s + c.costoUnitario * c.volumenMensual, 0);
    expect(total).toBeCloseTo(AGENTES.reduce((s, f) => s + f.costo, 0), 8);
  });

  it("los procesos con Opus se cuentan por mapeo, no por llamada", () => {
    const p = base().componentes.find((c) => c.clave === "procesos")!;
    expect(p.volumenMensual).toBe(6);
    expect(p.costoUnitario).toBeCloseTo(13.86 / 6, 10);
  });

  it("los hechos, del sondeo, y el primer mes es el siguiente", () => {
    const b = base();
    expect(b.componentes.find((c) => c.clave === "hechos")!.costoUnitario).toBeCloseTo(4.59 / 65, 10);
    expect(b.primerMes).toBe("2026-11");
  });
});

describe("⭐ las fracciones de ahorro", () => {
  it("Haiku en el clasificador: su parte de las reuniones × 2/3", () => {
    const b = base();
    expect(b.ahorros.modelosBaratos).toBeCloseTo((8.47 / (14.24 + 8.47 + 1.65 + 0.69)) * (1 - 1 / 3), 10);
  });

  it("el barrido es la parte del vigía que va por lote", () => {
    expect(base().ahorros.lotesVigia).toBeCloseTo((50 / 70) * 0.5, 10);
  });

  it("la caché del prompt y el prefijo compartido dan algo entre 0 y 0,9", () => {
    const a = base().ahorros;
    expect(a.cacheVigia).toBeGreaterThan(0);
    expect(a.cacheVigia).toBeLessThan(0.9);
    expect(a.prefijoCompartido).toBeGreaterThan(0.3);
    expect(a.prefijoCompartido).toBeLessThan(0.9);
  });
});
