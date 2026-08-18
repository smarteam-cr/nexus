import { describe, expect, it } from "vitest";
import { resumirGasto, type FilaDeGasto } from "./gasto";

/**
 * lib/ai/gasto.test.ts — LO QUE EL RESUMEN DE GASTO NO PUEDE MENTIR.
 *
 * ── EL MODO DE FALLA QUE ESTO CAZA ───────────────────────────────────────────
 * Un total de plata equivocado no se parece a nada: es un número plausible en una pantalla. No hay
 * excepción, ni fila roja, ni nada que se vea raro. Las dos formas concretas de equivocarse acá son
 * sumar como 0 lo que no está tarifado (el total baja y sigue siendo creíble) y bucketear «hoy» por
 * UTC (el día aparece vacío hasta el mediodía de Costa Rica). Las dos tienen su assert.
 */

const BASE: Omit<FilaDeGasto, "at"> = {
  model: "claude-sonnet-4-6",
  ok: true,
  costUsd: 0.1,
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  agentSlug: "agent-handoff",
  agentRunId: "run-1",
  triggeredByEmail: "cse@smarteamcr.com",
  origen: null,
};

const fila = (over: Partial<FilaDeGasto> & { at: Date }): FilaDeGasto => ({ ...BASE, ...over });

describe("⭐ lo que no está tarifado se cuenta, no se suma como 0", () => {
  const ahora = new Date("2026-08-17T15:00:00Z");

  it("una llamada sin tarifa no baja el costo en silencio", () => {
    const r = resumirGasto(
      [
        fila({ at: new Date("2026-08-17T14:00:00Z"), costUsd: 0.5 }),
        fila({ at: new Date("2026-08-17T14:05:00Z"), costUsd: null, model: "modelo-nuevo" }),
      ],
      ahora,
    );
    expect(r.ultimos30.costoUsd).toBeCloseTo(0.5, 6);
    expect(r.ultimos30.llamadas).toBe(2);
    expect(
      r.ultimos30.sinTarifa,
      "el total de plata cubre 1 de 2 llamadas y la pantalla no tiene cómo saberlo",
    ).toBe(1);
  });

  it("el desglose por agente arrastra el mismo aviso", () => {
    const r = resumirGasto([fila({ at: ahora, costUsd: null, model: "modelo-nuevo" })], ahora);
    expect(r.porAgente[0].costoUsd).toBe(0);
    expect(r.porAgente[0].sinTarifa).toBe(1);
  });
});

describe("⭐ «hoy» es el día de Costa Rica, no el de UTC", () => {
  /* Costa Rica es UTC-6 todo el año, así que a partir de las 18:00 de acá el reloj UTC ya pasó de
     día. El caso que discrimina: son las 22:00 del 17 en Costa Rica (04:00 UTC del 18) y la llamada
     fue a las 14:00 del 17 (20:00 UTC del 17). En Costa Rica los dos son el 17 y la llamada tiene
     que contar; en UTC son días distintos y el total de hoy aparecería vacío toda la noche. */
  const ahoraSonLas22EnCostaRica = new Date("2026-08-18T04:00:00Z");

  it("una llamada de esta tarde cuenta aunque en UTC ya sea mañana", () => {
    const estaTarde = new Date("2026-08-17T20:00:00Z"); // 14:00 del 17 en CR
    const r = resumirGasto([fila({ at: estaTarde, costUsd: 0.3 })], ahoraSonLas22EnCostaRica);
    expect(r.hoy.llamadas, "la llamada se cayó del día por bucketear en UTC").toBe(1);
    expect(r.hoy.costoUsd).toBeCloseTo(0.3, 6);
  });

  it("una llamada de ayer NO entra en hoy, pero sí en los 7 días", () => {
    const ayerALaMismaHora = new Date("2026-08-17T04:00:00Z"); // 22:00 del 16 en CR
    const r = resumirGasto([fila({ at: ayerALaMismaHora, costUsd: 0.3 })], ahoraSonLas22EnCostaRica);
    expect(r.hoy.llamadas).toBe(0);
    expect(r.ultimos7.llamadas).toBe(1);
  });
});

describe("⭐ humano y automático se separan por quién apretó el botón", () => {
  const ahora = new Date("2026-08-17T15:00:00Z");

  it("sin `triggeredByEmail` el gasto es automático — el default que frena", () => {
    const r = resumirGasto(
      [
        fila({ at: ahora, costUsd: 1, triggeredByEmail: "cse@smarteamcr.com" }),
        fila({ at: ahora, costUsd: 2, triggeredByEmail: null }),
      ],
      ahora,
    );
    expect(r.ultimos30.costoHumano).toBeCloseTo(1, 6);
    expect(
      r.ultimos30.costoAutomatico,
      "una llamada sin dueño cayó al presupuesto generoso justamente por no estar cableada",
    ).toBeCloseTo(2, 6);
    expect(r.ultimos30.costoHumano + r.ultimos30.costoAutomatico).toBeCloseTo(r.ultimos30.costoUsd, 6);
  });
});

describe("⭐ la tabla de corridas no se puede leer como si fuera el total", () => {
  const ahora = new Date("2026-08-17T15:00:00Z");

  it("lo que no cuelga de una corrida se declara aparte", () => {
    const r = resumirGasto(
      [
        fila({ at: ahora, costUsd: 1, agentRunId: "run-a" }),
        fila({ at: ahora, costUsd: 4, agentRunId: null, agentSlug: null }),
      ],
      ahora,
    );
    expect(r.corridasCaras).toHaveLength(1);
    expect(
      r.costoSinCorrida,
      "sin este número la tabla de corridas parece cubrir todo el gasto y cubre el 20%",
    ).toBeCloseTo(4, 6);
    expect(r.llamadasSinCorrida).toBe(1);
  });

  it("las llamadas de una corrida se suman y se ordena por costo", () => {
    const r = resumirGasto(
      [
        fila({ at: new Date("2026-08-17T10:00:00Z"), costUsd: 1, agentRunId: "barata" }),
        fila({ at: new Date("2026-08-17T11:00:00Z"), costUsd: 2, agentRunId: "cara" }),
        fila({ at: new Date("2026-08-17T12:00:00Z"), costUsd: 3, agentRunId: "cara" }),
      ],
      ahora,
    );
    expect(r.corridasCaras.map((c) => c.agentRunId)).toEqual(["cara", "barata"]);
    expect(r.corridasCaras[0].costoUsd).toBeCloseTo(5, 6);
    expect(r.corridasCaras[0].llamadas).toBe(2);
    expect(r.corridasCaras[0].desde.toISOString()).toBe("2026-08-17T11:00:00.000Z");
  });

  it("`topCorridas` recorta, y recorta las baratas", () => {
    const filas = [1, 2, 3, 4].map((n) =>
      fila({ at: ahora, costUsd: n, agentRunId: `run-${n}` }),
    );
    const r = resumirGasto(filas, ahora, { topCorridas: 2 });
    expect(r.corridasCaras.map((c) => c.agentRunId)).toEqual(["run-4", "run-3"]);
  });
});

describe("⭐ una llamada fallida se mide igual", () => {
  /* Una racha de errores es la señal más temprana de un loop disparado, y un 429 puede haber
     consumido tokens de entrada igual. Filtrarlas escondería justo el caso que hay que ver. */
  const ahora = new Date("2026-08-17T15:00:00Z");

  it("cuenta en `fallidas` y su costo suma al total", () => {
    const r = resumirGasto([fila({ at: ahora, ok: false, costUsd: 0.2 })], ahora);
    expect(r.ultimos30.fallidas).toBe(1);
    expect(r.ultimos30.llamadas).toBe(1);
    expect(r.ultimos30.costoUsd).toBeCloseTo(0.2, 6);
    expect(r.porAgente[0].fallidas).toBe(1);
  });
});

describe("⭐ los períodos no se pisan entre sí", () => {
  it("algo de hace 40 días no entra en ningún período", () => {
    const ahora = new Date("2026-08-17T15:00:00Z");
    const r = resumirGasto([fila({ at: new Date("2026-07-08T15:00:00Z"), costUsd: 9 })], ahora);
    expect(r.ultimos30.llamadas).toBe(0);
    expect(r.ultimos30.costoUsd).toBe(0);
    expect(r.porAgente).toEqual([]);
    expect(r.corridasCaras).toEqual([]);
  });
});
