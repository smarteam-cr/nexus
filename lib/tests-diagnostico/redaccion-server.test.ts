/**
 * lib/tests-diagnostico/redaccion-server.test.ts — la espera a la IA al terminar el test: tres pedidos en paralelo, cada
 * uno con su tiempo y sin reintentos, medidos con su slug; uno que falla no se lleva a los otros, y nunca rompe el test
 * (sin redacción, la página usa los textos de los datos). Con el cliente de Claude simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({ getAnthropic: () => ({ messages: { create } }) }));
const contextos: unknown[] = [];
vi.mock("@/lib/ai/contexto-de-corrida", () => ({
  conContextoDeIA: (ctx: unknown, fn: () => unknown) => {
    contextos.push(ctx);
    return fn();
  },
}));

import { parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { borradorDesdeLaEscala } from "./banco";
import { ESPERA_DE_LA_REDACCION_MS, SLUG_DE_LA_REDACCION } from "./redaccion";
import { redactarElResultado } from "./redaccion-server";
import { resultadoDelTest } from "./resultado";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];
const web = borradorDesdeLaEscala(escala, area.id, "web");
const respuestas = Object.fromEntries(web.map((p, i) => [p.id, { opcion: p.opciones.find((o) => o.nivel === ["I", "F"][i])!.id }]));
const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas })!;
const entrada = { escala, r, industria: "Turismo", preguntas: web, respuestas, clientId: "c1" };
const texto = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
const partes = () => contextos.map((c) => String((c as { origen: string }).origen).split(" › ")[1]);

beforeEach(() => {
  create.mockReset();
  contextos.length = 0;
  process.env.ANTHROPIC_API_KEY = "prueba";
});

describe("redactar el resultado al terminar el test", () => {
  it("un pedido por parte, cada uno con su tiempo y sin reintentos, medido con su slug y la empresa", async () => {
    create.mockResolvedValue(texto({}));
    await redactarElResultado(entrada);
    const capas = [...new Set(r.dimensiones.filter((d) => d.preguntada && d.nivel).map((d) => d.capa))];
    expect(create).toHaveBeenCalledTimes(1 + capas.length);
    for (const [, opciones] of create.mock.calls) expect(opciones).toEqual({ timeout: ESPERA_DE_LA_REDACCION_MS, maxRetries: 0 });
    expect(partes()).toEqual(["resumen", ...capas]);
    for (const c of contextos) expect(c).toMatchObject({ agentSlug: SLUG_DE_LA_REDACCION, clientId: "c1" });
  });

  it("si una parte falla, las otras se quedan", async () => {
    create.mockImplementation((pedido: { system: string }) =>
      pedido.system.includes('{"resumen"') ? Promise.reject(new Error("se cayó")) : Promise.resolve(texto({ dimensiones: [{ id: area.dimensiones[0].id, impacto: "Hay etapas.", prioridad: "Escribe el proceso." }] })),
    );
    const x = await redactarElResultado(entrada);
    expect(x?.resumen).toBeNull();
    expect(x?.dimensiones[area.dimensiones[0].id]).toEqual({ impacto: "Hay etapas.", prioridad: "Escribe el proceso." });
  });

  it("⛔ la revisión recibe la industria: un resumen que la nombra se descarta", async () => {
    create.mockResolvedValue(texto({ resumen: "En turismo, cada reserva depende de quien la toma.", dimensiones: [] }));
    expect(await redactarElResultado(entrada)).toBeNull();
    create.mockResolvedValue(texto({ resumen: "Cada reserva depende de quien la toma.", dimensiones: [] }));
    expect((await redactarElResultado(entrada))?.resumen).toBe("Cada reserva depende de quien la toma.");
  });

  it("⛔ nunca rompe el test: si todo falla, sin redacción (la página usa los datos)", async () => {
    create.mockRejectedValue(new Error("timeout"));
    await expect(redactarElResultado(entrada)).resolves.toBeNull();
  });

  it("sin clave de la API, o sin nivel, ni lo intenta", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(redactarElResultado(entrada)).resolves.toBeNull();
    process.env.ANTHROPIC_API_KEY = "prueba";
    await expect(redactarElResultado({ ...entrada, r: { ...r, nivel: null } })).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("⛔ lo que devuelve son solo textos: ningún número del resultado cambia", async () => {
    create.mockResolvedValue(texto({ resumen: "El área opera a medias.", nivel: "O", puntaje: 99, dimensiones: [{ id: area.dimensiones[0].id, nivel: "O", puntaje: 99, impacto: "Bien." }] }));
    const antes = JSON.stringify(r);
    const x = await redactarElResultado(entrada);
    expect(Object.keys(x!).sort()).toEqual(["at", "dimensiones", "modelo", "resumen", "v"]);
    expect(Object.keys(x!.dimensiones[area.dimensiones[0].id]).sort()).toEqual(["impacto", "prioridad"]);
    expect(JSON.stringify(r)).toBe(antes);
  });
});
