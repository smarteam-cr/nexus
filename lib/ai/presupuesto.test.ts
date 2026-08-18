import { describe, expect, it } from "vitest";
import { claseDeGasto } from "./contexto-de-corrida";
import {
  evaluarPresupuesto,
  inicioDelDiaCr,
  limitesDelEntorno,
  PresupuestoDeIaAgotado,
  PRESUPUESTO_DIARIO_USD,
  type LimitesDePresupuesto,
} from "./presupuesto";

/**
 * lib/ai/presupuesto.test.ts — EL TOPE NO PUEDE CORTAR LO QUE NO DEBE, NI DEJAR PASAR LO QUE SÍ.
 *
 * ── EL MODO DE FALLA QUE ESTO CAZA ───────────────────────────────────────────
 * El tope tiene dos formas de arruinarse y las dos son silenciosas. Si una llamada sin dueño cayera
 * al presupuesto humano —el generoso—, justamente lo que puede dispararse solo gastaría con la vara
 * larga por no estar cableado: el olvido saldría premiado. Y si un gasto que no se pudo leer contara
 * como excedido, un problema de base tumbaría todos los agentes con un mensaje de plata.
 */

const LIMITES: LimitesDePresupuesto = { automatico: 10, humano: 100, bloquea: false };
const BLOQUEANDO: LimitesDePresupuesto = { ...LIMITES, bloquea: true };

describe("⭐ lo que nadie disparó cae al presupuesto que frena", () => {
  it("sin `triggeredByEmail` la clase es automática", () => {
    expect(claseDeGasto(undefined)).toBe("automatico");
    expect(claseDeGasto({})).toBe("automatico");
    expect(claseDeGasto({ triggeredByEmail: null })).toBe("automatico");
    expect(claseDeGasto({ triggeredByEmail: "cse@smarteamcr.com" })).toBe("humano");
  });

  it("⛔ el automático es MÁS CHICO que el humano — invertirlos premia el olvido", () => {
    expect(
      PRESUPUESTO_DIARIO_USD.automatico,
      "el presupuesto de lo que se dispara solo dejó de ser el estricto",
    ).toBeLessThan(PRESUPUESTO_DIARIO_USD.humano);
  });

  it("con el mismo gasto, lo automático se excede y lo humano no", () => {
    const gastado = 12;
    expect(evaluarPresupuesto("automatico", gastado, LIMITES).excedido).toBe(true);
    expect(evaluarPresupuesto("humano", gastado, LIMITES).excedido).toBe(false);
  });
});

describe("⭐ lo que no se sabe, no frena", () => {
  it("gasto desconocido nunca excede", () => {
    const v = evaluarPresupuesto("automatico", null, BLOQUEANDO);
    expect(
      v.excedido,
      "un problema de lectura de base se convirtió en un corte de todos los agentes",
    ).toBe(false);
    expect(v.bloquea).toBe(false);
    expect(v.mensaje).toBeNull();
  });

  it("gasto en cero tampoco", () => {
    expect(evaluarPresupuesto("humano", 0, BLOQUEANDO).excedido).toBe(false);
  });
});

describe("⭐ excederse y bloquear son dos cosas distintas", () => {
  it("en modo aviso (el default) se excede pero NO bloquea", () => {
    const v = evaluarPresupuesto("automatico", 50, LIMITES);
    expect(v.excedido).toBe(true);
    expect(v.bloquea, "el tope salió bloqueando sin que nadie lo encendiera").toBe(false);
    expect(v.mensaje).toContain("modo aviso");
  });

  it("con el bloqueo encendido sí bloquea, y el mensaje deja de decir «modo aviso»", () => {
    const v = evaluarPresupuesto("automatico", 50, BLOQUEANDO);
    expect(v.bloquea).toBe(true);
    expect(v.mensaje).not.toContain("modo aviso");
  });

  it("el error dice la causa y cómo levantarlo", () => {
    const e = new PresupuestoDeIaAgotado(evaluarPresupuesto("automatico", 50, BLOQUEANDO));
    expect(e.name).toBe("PresupuestoDeIaAgotado");
    expect(e.message).toContain("PRESUPUESTO_IA_AUTOMATICO_USD_DIA");
    expect(e.message).toContain("PRESUPUESTO_IA_BLOQUEA=0");
    expect(e.clase).toBe("automatico");
  });

  it("el límite se alcanza al llegar, no al pasarse", () => {
    /* `>=` y no `>`: con `>` el tope de $10 deja pasar la llamada que lo deja clavado en $10 y
       recién frena en la siguiente — un off-by-one que en un loop rápido no se nota. */
    expect(evaluarPresupuesto("automatico", 10, LIMITES).excedido).toBe(true);
    expect(evaluarPresupuesto("automatico", 9.99, LIMITES).excedido).toBe(false);
  });
});

describe("⭐ la configuración del entorno no puede romper el tope", () => {
  it("sin variables, los defaults y el modo aviso", () => {
    const l = limitesDelEntorno({} as NodeJS.ProcessEnv);
    expect(l.automatico).toBe(PRESUPUESTO_DIARIO_USD.automatico);
    expect(l.humano).toBe(PRESUPUESTO_DIARIO_USD.humano);
    expect(l.bloquea, "el bloqueo se prendió sin que nadie lo pidiera").toBe(false);
  });

  it("un valor basura cae al default en vez de dejar el tope en cero", () => {
    /* Con `Number("")` === 0, un `.env` con la variable vacía habría puesto el tope en $0 y —con el
       bloqueo encendido— cortado TODAS las llamadas. */
    for (const basura of ["", "  ", "gratis", "-5", "0", "NaN"]) {
      const l = limitesDelEntorno({ PRESUPUESTO_IA_AUTOMATICO_USD_DIA: basura } as NodeJS.ProcessEnv);
      expect(l.automatico, `"${basura}" no cayó al default`).toBe(PRESUPUESTO_DIARIO_USD.automatico);
    }
  });

  it("un valor válido manda, y solo `1` enciende el bloqueo", () => {
    const l = limitesDelEntorno({
      PRESUPUESTO_IA_AUTOMATICO_USD_DIA: "42.5",
      PRESUPUESTO_IA_BLOQUEA: "1",
    } as NodeJS.ProcessEnv);
    expect(l.automatico).toBe(42.5);
    expect(l.bloquea).toBe(true);
    expect(limitesDelEntorno({ PRESUPUESTO_IA_BLOQUEA: "true" } as NodeJS.ProcessEnv).bloquea).toBe(false);
    expect(limitesDelEntorno({ PRESUPUESTO_IA_BLOQUEA: "0" } as NodeJS.ProcessEnv).bloquea).toBe(false);
  });
});

describe("⭐ el día es el de Costa Rica", () => {
  /* Mismo corte que el resto del sistema. Con el día en UTC, el presupuesto se reiniciaría a las
     18:00 de acá: media tarde de trabajo arrancaría con el contador en cero. */
  it("a las 22:00 de Costa Rica el día todavía es el de hoy", () => {
    const lasDiezDeLaNoche = new Date("2026-08-18T04:00:00Z"); // 22:00 del 17 en CR
    expect(inicioDelDiaCr(lasDiezDeLaNoche).toISOString()).toBe("2026-08-17T06:00:00.000Z");
  });

  it("a las 06:00 UTC arranca el día nuevo, no antes", () => {
    expect(inicioDelDiaCr(new Date("2026-08-17T05:59:00Z")).toISOString()).toBe("2026-08-16T06:00:00.000Z");
    expect(inicioDelDiaCr(new Date("2026-08-17T06:01:00Z")).toISOString()).toBe("2026-08-17T06:00:00.000Z");
  });
});
