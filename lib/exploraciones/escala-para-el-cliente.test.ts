/**
 * lib/exploraciones/escala-para-el-cliente.test.ts — lo que ve el cliente en su escala: solo lo confirmado con evidencia,
 * con el mismo cálculo del resultado del test y sin nada que hable de un test.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { estadoDeLaDimension, textoDelEstado } from "@/lib/escala/radar-de-una-empresa";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { resultadoDeLosNiveles } from "@/lib/tests-diagnostico/resultado";
import { resumenSinIa } from "@/lib/tests-diagnostico/redaccion";
import { contenidoVacio, type EstimadoGuardado } from "./contenido";
import { escalaParaElLienzo } from "./escala-del-lienzo";
import { partesEnJuego, resultadosDeLaEscala } from "./escala-para-el-cliente";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
const area = lienzo.areas[0];
const queAplican = area.dimensiones.filter((d) => d.aplica);
const [a, b, c] = queAplican;

const estado = (chequeo: Record<string, Partial<EstimadoGuardado>>, areas = [area.id]) => ({
  areas,
  contenido: { ...contenidoVacio(), chequeo: Object.fromEntries(Object.entries(chequeo).map(([id, e]) => [id, { nivel: "I", fuente: "reunion", ...e } as EstimadoGuardado])) },
});

describe("la escala que ve el cliente", () => {
  it("⛔ una hipótesis no llega al cliente, ni la que alguien usó ni la del test", () => {
    const [r] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { fuente: "reunion" }, [b.id]: { fuente: "hipotesis", nivel: "O" }, [c.id]: { fuente: "test", nivel: "O" } }));
    expect(r.dimensiones.filter((d) => d.preguntada).map((d) => d.id)).toEqual([a.id]);
    expect(r.dimensiones.find((d) => d.id === b.id)).toMatchObject({ preguntada: false, nivel: null, puntaje: null });
    expect([r.preguntadas, r.total]).toEqual([1, queAplican.length]);
    // Contra todas las partes de las áreas en juego, aunque otra área no tenga evidencia.
    expect(partesEnJuego(lienzo, { areas: lienzo.areas.slice(0, 2).map((x) => x.id) })).toBeGreaterThan(queAplican.length);
  });

  it("⛔ con partes sin medir no hay nivel general, ni lo que más frena, ni la capa incompleta: 1 de 8 en Óptimo no dice «Óptimo»", () => {
    const [r] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { nivel: "O" } }));
    expect(r).toMatchObject({ nivel: null, nivelNombre: null, puntaje: null, recomendacion: null, casos: [] });
    expect(r.capas.every((c) => c.nivel === null)).toBe(true);
    expect(r.sintesis).toContain(`1 de las ${queAplican.length} partes`);
    expect(r.dimensiones.find((d) => d.id === a.id)).toMatchObject({ preguntada: true, nivel: "O" });
  });

  it("⛔ la vista no trae nada del test: ni Estimado, ni otro test, ni la agenda", () => {
    const [r] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { nivel: "F" } }));
    const html = renderToStaticMarkup(createElement(ResultadoDelTestVista, { r, empresa: "Una empresa", agenda: "https://agenda.test", deLaEscala: { areas: [{ id: r.areaId, nombre: r.areaNombre, href: "#" }] } }));
    expect(html).not.toMatch(/Estimado|respondiste|Hacer otro test|Diagnosticar otra|Revisemos juntos|agenda\.test|No se preguntó|este test/);
    expect(html).toContain("En medición");
    expect(html).toContain(`Medido en 1 de ${queAplican.length} partes`);
  });

  it("sin nada con evidencia no hay resultado, y un área que no está en juego no sale", () => {
    expect(resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { fuente: "hipotesis" } }))).toEqual([]);
    expect(resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: {} }, []))).toEqual([]);
  });

  it("el resumen no habla de respuestas, preguntas ni estimaciones", () => {
    const [r] = resultadosDeLaEscala(escala, lienzo, estado(Object.fromEntries(queAplican.map((d) => [d.id, {}]))));
    expect(r.sintesis).toContain("Por lo que hemos visto");
    expect(r.sintesis).not.toMatch(/respondiste|pregunta|estimaci/i);
  });

  it("en el radar, lo que falta dice «Sin medir»: acá nadie preguntó nada", () => {
    expect(textoDelEstado(estadoDeLaDimension({ clave: "1.7", nombre: "x", capa: "base", preguntada: false, sinMedir: true, nivel: null, puntaje: null }), () => "")).toBe("Sin medir");
    expect(textoDelEstado(estadoDeLaDimension({ clave: "1.7", nombre: "x", capa: "base", preguntada: false, nivel: null, puntaje: null }), () => "")).toBe("No se preguntó");
  });

  it("⛔ el mismo cálculo del test: lo medido da lo mismo que las mismas respuestas", () => {
    const niveles = Object.fromEntries(queAplican.map((d) => [d.id, { nivel: "F" as const, noLoSe: false, riesgo: false }]));
    const delTest = resultadoDeLosNiveles({ escala, areaId: area.id, version: "marketing", preguntadas: new Set(Object.keys(niveles)), niveles, orden: area.paraChequeo.orden })!;
    const [r] = resultadosDeLaEscala(escala, lienzo, estado(Object.fromEntries(queAplican.map((d) => [d.id, { nivel: "F" as const }]))));
    expect({ ...r, sintesis: "" }).toEqual({ ...delTest, sintesis: "" });
    expect(delTest.sintesis).toBe(resumenSinIa(delTest));
  });
});
