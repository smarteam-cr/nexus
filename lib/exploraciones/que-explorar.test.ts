/**
 * lib/exploraciones/que-explorar.test.ts — qué explorar en la próxima reunión según lo que cambió en la escala.
 * Correr: `npx vitest run lib/exploraciones/que-explorar.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { EstadoDeExploracion } from "./contenido";
import { fotoDeLaExploracion } from "./foto-de-la-escala";
import { chequeoDelMapa, posicionesDelMapa } from "./mapa";
import { queExplorar } from "./que-explorar";
import { ESCALA_DE_PRUEBA, estadoDePrueba, propuestoDePrueba, todasEn } from "./escala-de-prueba.test-helpers";

function sugerir(e: EstadoDeExploracion, anterior: EstadoDeExploracion | null, max?: number) {
  const posiciones = posicionesDelMapa(e, e.propuesta.items);
  return queExplorar({
    escala: ESCALA_DE_PRUEBA,
    areas: e.areas,
    posiciones,
    chequeo: chequeoDelMapa(ESCALA_DE_PRUEBA, e.areas, posiciones),
    ahora: fotoDeLaExploracion(ESCALA_DE_PRUEBA, e),
    anterior: anterior ? { dia: "2026-10-10", foto: fotoDeLaExploracion(ESCALA_DE_PRUEBA, anterior) } : null,
    aExplorar: e.contenido.aExplorar,
    nombreDeNivel: (l) => `N${l}`,
    max,
  });
}

describe("qué explorar", () => {
  it("primero lo que cambió desde la última versión", () => {
    const c = todasEn("F");
    c["1.2"] = { nivel: "I", fuente: "reunion" };
    const s = sugerir(estadoDePrueba(c), estadoDePrueba(todasEn("F")));
    expect(s[0]).toMatchObject({ dimensionId: "1.2", por: "cambio", motivo: "indicio" });
    expect(s[0].razon).toBe("Bajó de NF a NI desde el 2026-10-10: pregunta qué pasó.");
  });

  it("después lo nuevo de una reunión y lo que no tiene dato", () => {
    const c = todasEn("F");
    delete c["1.8"];
    const e = estadoDePrueba(c);
    e.propuesta.items = [propuestoDePrueba("1.6", { nivel: "E", fuente: "reunion", evidencia: "ya lo automatizamos" })];
    const s = sugerir(e, null);
    const por = Object.fromEntries(s.map((x) => [x.dimensionId, x.por]));
    expect(por["1.6"]).toBe("reunion");
    expect(por["1.8"]).toBe("sinDato");
    expect(s.length).toBeLessThanOrEqual(4);
  });

  it("una hipótesis que frena al área se pide confirmar, y lo ya marcado se dice", () => {
    const c = todasEn("F");
    c["1.3"] = { nivel: "I", fuente: "hipotesis" };
    const e = estadoDePrueba(c);
    e.contenido.aExplorar = { "1.3": { motivo: "indicio" } };
    const s = sugerir(e, null);
    expect(s[0]).toMatchObject({ dimensionId: "1.3", por: "frena", marcada: true });
  });

  it("sin áreas en juego no sugiere nada", () => {
    expect(sugerir(estadoDePrueba(todasEn("I"), { areas: [] }), null)).toEqual([]);
  });
});
