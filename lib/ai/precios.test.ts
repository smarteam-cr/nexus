import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
    // Sonnet 4.5 ya tiene tarifa (C-01): el "sin tarifa" pasa a ser un id que no existe.
    expect(costoDeLlamada("claude-sonnet-99", { inputTokens: 999_999, outputTokens: 999_999 })).toBeNull();
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

describe("Sonnet 5 y Sonnet 4.5 tienen tarifa (C-01)", () => {
  /* La edición que lo pone en rojo: sacar la entrada de Sonnet 5 «hasta verificarla» — un agente
     migrado a ese modelo gastaría con costo null y el tope diario no lo vería. */
  it("Sonnet 5 cobra $3/$15 (el precio de lanzamiento venció el 2026-08-31) y dice que hay que verificarlo", () => {
    const p = precioDe("claude-sonnet-5");
    expect(p).not.toBeNull();
    expect(p?.entrada).toBe(3);
    expect(p?.salida).toBe(15);
    expect(p?.nota, "la tarifa salió del SDK: tiene que decir que falta verificarla").toContain("verificar en consola");
    expect(costoDeLlamada("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(18);
  });

  it("Sonnet 4.5 cobra igual que 4.6 por su id corto y por el datado", () => {
    const corto = costoDeLlamada("claude-sonnet-4-5", { inputTokens: 1_000_000, outputTokens: 0 });
    const datado = costoDeLlamada("claude-sonnet-4-5-20250929", { inputTokens: 1_000_000, outputTokens: 0 });
    expect(corto).toBe(3);
    expect(datado).toBe(corto);
  });

  it("toda tarifa lleva fecha de verificación (los precios envejecen)", () => {
    for (const [modelo, p] of Object.entries(PRECIOS)) {
      expect(p.verificado, modelo).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("los cuatro caminos que más gastaban sin dueño salen atribuidos (C-01)", () => {
  /**
   * Hasta el 2026-09-04 solo el runner de /analyze envolvía sus llamadas con `conContextoDeIA`: el
   * post-proceso de sesiones, el clasificador, el vigilante y el agente de canvas emitían filas de
   * LlmCall con agente, cliente y humano en null — y sin humano no se puede saber contra qué
   * presupuesto cobrar. Cada uno declara ahora `triggeredByEmail` a propósito (null = automático).
   */
  const RAIZ = process.cwd();
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !l.trimStart().startsWith("//")).join("\n");
  const CAMINOS = [
    "lib/sessions/post-process.ts",
    "lib/sessions/classify-session-project.ts",
    "lib/cs/watchdog.ts",
    "lib/canvas/update-agent.ts",
  ];

  it("cada llamada a Claude de esos archivos está adentro de conContextoDeIA, con triggeredByEmail explícito", () => {
    /* La edición que lo pone en rojo: sacarle el wrap a una llamada «porque total corre solo». */
    for (const rel of CAMINOS) {
      const src = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
      const llamadas = src.split("anthropic.messages.create(").length - 1;
      expect(llamadas, `${rel}: el escaneo no encontró la llamada`).toBeGreaterThan(0);
      const envueltas = src.split("conContextoDeIA(").length - 1;
      expect(envueltas, `${rel}: llamadas a Claude sin atribuir`).toBe(llamadas);
      expect(src, `${rel}: el contexto tiene que decir quién apretó el botón (o null a propósito)`).toContain("triggeredByEmail:");
    }
  });
});
