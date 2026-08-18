import { describe, expect, it } from "vitest";
import { costoDeLlamada, formatearUsd, precioDe, PRECIOS } from "./precios";

/**
 * lib/ai/precios.test.ts — QUE EL MEDIDOR NO SUBESTIME.
 *
 * El modo de falla que importa no es «da error»: es que dé un número plausible y BAJO. Un medidor
 * que subestima es peor que ninguno, porque produce confianza. Los dos casos que lo causarían:
 *
 *  1. Cobrar entrada y salida al mismo precio (son hasta 5× distintos).
 *  2. Cobrar la escritura de caché como si fuera lectura (son 12,5× distintos entre sí).
 *
 * Los dos se ven acá como asserts que fallan con un número, no con una excepción.
 */

describe("⭐ entrada y salida NO cuestan lo mismo", () => {
  it("un millón de tokens de salida cuesta 5× lo que uno de entrada (sonnet)", () => {
    const entrada = costoDeLlamada("claude-sonnet-4-6", { inputTokens: 1_000_000, outputTokens: 0 });
    const salida = costoDeLlamada("claude-sonnet-4-6", { inputTokens: 0, outputTokens: 1_000_000 });
    expect(entrada).toBe(3);
    expect(salida).toBe(15);
    /* Si alguien "simplifica" a un precio único, este assert se cae con el número a la vista. */
    expect(salida! / entrada!).toBe(5);
  });

  it("una corrida típica del handoff: 25k de entrada + 8k de salida", () => {
    const usd = costoDeLlamada("claude-sonnet-4-6", { inputTokens: 25_000, outputTokens: 8_000 });
    expect(usd).toBeCloseTo(25_000 * 3e-6 + 8_000 * 15e-6, 10);
    expect(usd).toBeCloseTo(0.195, 4);
  });
});

describe("⭐ las cuatro clases de token se cobran por separado", () => {
  const base = { inputTokens: 0, outputTokens: 0 };

  it("leer de caché cuesta 10× MENOS que entrada normal", () => {
    const normal = costoDeLlamada("claude-sonnet-4-6", { ...base, inputTokens: 100_000 })!;
    const cacheado = costoDeLlamada("claude-sonnet-4-6", { ...base, cacheReadTokens: 100_000 })!;
    expect(normal / cacheado).toBeCloseTo(10, 6);
  });

  it("⛔ escribir caché cuesta MÁS que entrada normal — no menos", () => {
    /* La confusión natural es «caché = barato». La escritura NO lo es: se paga 1,25×. Tratarla
       como lectura subestima ese tramo 12,5 veces. */
    const normal = costoDeLlamada("claude-sonnet-4-6", { ...base, inputTokens: 100_000 })!;
    const escritura = costoDeLlamada("claude-sonnet-4-6", { ...base, cacheCreationTokens: 100_000 })!;
    const lectura = costoDeLlamada("claude-sonnet-4-6", { ...base, cacheReadTokens: 100_000 })!;
    expect(escritura).toBeGreaterThan(normal);
    expect(escritura / lectura).toBeCloseTo(12.5, 6);
  });

  it("las cuatro juntas suman, no se pisan", () => {
    const uso = {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cacheReadTokens: 40_000,
      cacheCreationTokens: 40_000,
    };
    const partes =
      costoDeLlamada("claude-sonnet-4-6", { inputTokens: 10_000, outputTokens: 0 })! +
      costoDeLlamada("claude-sonnet-4-6", { inputTokens: 0, outputTokens: 2_000 })! +
      costoDeLlamada("claude-sonnet-4-6", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 40_000 })! +
      costoDeLlamada("claude-sonnet-4-6", { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 40_000 })!;
    expect(costoDeLlamada("claude-sonnet-4-6", uso)).toBeCloseTo(partes, 10);
  });
});

describe("un modelo sin tarifa devuelve null, no cero", () => {
  it("⛔ null y no 0 — un 0 se suma en silencio y deja el total mintiendo", () => {
    expect(costoDeLlamada("claude-sonnet-4-5", { inputTokens: 999_999, outputTokens: 999_999 })).toBeNull();
    expect(costoDeLlamada("modelo-inventado", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });

  it("haiku resuelve por su alias sin fecha y por su id completo — al mismo precio", () => {
    const conFecha = costoDeLlamada("claude-haiku-4-5-20251001", { inputTokens: 1_000_000, outputTokens: 0 });
    const alias = costoDeLlamada("claude-haiku-4-5", { inputTokens: 1_000_000, outputTokens: 0 });
    expect(conFecha).toBe(1);
    expect(alias).toBe(conFecha);
  });
});

describe("haiku es más barato que sonnet, en las dos direcciones", () => {
  it("3× en entrada y 3× en salida", () => {
    const uso = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const sonnet = costoDeLlamada("claude-sonnet-4-6", uso)!;
    const haiku = costoDeLlamada("claude-haiku-4-5-20251001", uso)!;
    expect(sonnet / haiku).toBe(3);
  });
});

describe("cada precio declara cuándo se verificó", () => {
  it("ninguna entrada queda sin fecha", () => {
    /* Un precio sin fecha no se puede auditar: nadie sabe si sigue vigente. */
    for (const [modelo, p] of Object.entries(PRECIOS)) {
      expect(p.verificado, `${modelo} sin fecha de verificación`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.salida, `${modelo}: la salida debería costar más que la entrada`).toBeGreaterThan(p.entrada);
    }
  });

  it("`precioDe` devuelve null para lo desconocido", () => {
    expect(precioDe("claude-opus-5")).toBeNull();
  });
});

describe("el formato no dice «gratis» cuando no lo es", () => {
  it("sub-centavo se muestra con 4 decimales", () => {
    /* $0,0003 formateado como «$0,00» se lee como gratis, y el punto de medir es que no lo es. */
    expect(formatearUsd(0.0003)).toBe("$0.0003");
    expect(formatearUsd(0.195)).toBe("$0.20");
    expect(formatearUsd(0)).toBe("$0");
    expect(formatearUsd(null)).toBe("—");
  });
});
