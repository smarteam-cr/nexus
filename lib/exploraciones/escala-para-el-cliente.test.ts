/**
 * lib/exploraciones/escala-para-el-cliente.test.ts — lo que ve el cliente en su escala: lo que el vendedor usó (con
 * evidencia, o por explorar si era una hipótesis), de las áreas que eligió, con el mismo cálculo del resultado del test
 * y sin nada que hable de un test (tercera vuelta, 2026-11-08).
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
import { areasDeLaPagina, partesDeLaPagina, resultadosDeLaEscala } from "./escala-para-el-cliente";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
const area = lienzo.areas[0];
const otra = lienzo.areas[1];
const queAplican = area.dimensiones.filter((d) => d.aplica);
const [a, b, c] = queAplican;
const deOtra = otra.dimensiones.filter((d) => d.aplica)[0];

const estado = (chequeo: Record<string, Partial<EstimadoGuardado>>, areas = [area.id], areasAlCliente?: string[]) => ({
  areas,
  contenido: {
    ...contenidoVacio(),
    chequeo: Object.fromEntries(Object.entries(chequeo).map(([id, e]) => [id, { nivel: "I", fuente: "reunion", ...e } as EstimadoGuardado])),
    ...(areasAlCliente ? { areasAlCliente } : {}),
  },
});

describe("la escala que ve el cliente", () => {
  it("la hipótesis que el vendedor usó llega como «por explorar»; la evidencia y lo que contestó en el test, como nivel", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { fuente: "reunion" }, [b.id]: { fuente: "hipotesis", nivel: "O" }, [c.id]: { fuente: "test", nivel: "E" } }));
    expect(x.resultado.dimensiones.filter((d) => d.preguntada).map((d) => d.id)).toEqual([a.id, b.id, c.id]);
    expect(x.porExplorar).toEqual([b.id]);
    expect(x.resultado.dimensiones.find((d) => d.id === b.id)).toMatchObject({ preguntada: true, nivel: "O" });
    expect([x.resultado.preguntadas, x.resultado.total]).toEqual([3, queAplican.length]);
  });

  it("⛔ con partes sin nada no hay nivel general, ni lo que más frena, ni la capa incompleta: 1 de 8 en Óptimo no dice «Óptimo»", () => {
    const [{ resultado: r }] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { nivel: "O" } }));
    expect(r).toMatchObject({ nivel: null, nivelNombre: null, puntaje: null, recomendacion: null, casos: [] });
    expect(r.capas.every((c) => c.nivel === null)).toBe(true);
    // Sin conteos de partes (8 nov): dice qué falta conocer para darle un nivel general.
    expect(r.sintesis).toContain("nivel general");
    expect(r.sintesis).not.toMatch(/\d/);
  });

  it("con todas las partes ubicadas, aunque algunas sean por explorar, hay nivel; la síntesis no lo repite (lo muestra el radar)", () => {
    const todas = Object.fromEntries(queAplican.map((d, i) => [d.id, { nivel: "F" as const, fuente: i < 2 ? ("hipotesis" as const) : ("reunion" as const) }]));
    const [x] = resultadosDeLaEscala(escala, lienzo, estado(todas));
    expect(x.resultado.nivel).toBe("F");
    expect(x.porExplorar).toHaveLength(2);
    expect(x.resultado.sintesis).not.toMatch(/de las|por explorar|confirmamos|lo que creemos/);
    expect(x.descripcion).toMatchObject({ origen: "respaldo", texto: x.resultado.sintesis });
  });

  it("⛔ la vista no trae nada del test, y marca lo que está por explorar", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: { nivel: "F" }, [b.id]: { nivel: "I", fuente: "hipotesis" } }));
    const html = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r: x.resultado,
        empresa: "Una empresa",
        agenda: "https://agenda.test",
        deLaEscala: { areas: [{ id: x.resultado.areaId, nombre: x.resultado.areaNombre, href: "#" }], porExplorar: x.porExplorar },
      }),
    );
    expect(html).not.toMatch(/Estimado|respondiste|Hacer otro test|Diagnosticar otra|Revisemos juntos|agenda\.test|No se preguntó|este test/);
    expect(html).toContain("En medición");
    expect(html).toContain(`Medido en 2 de ${queAplican.length} partes`);
    expect(html).toContain("1 por explorar");
    expect(html).toContain("por explorar");
  });

  it("las áreas: sin elegir, solo las en juego con algo; elegidas, esas (aunque no estén en juego)", () => {
    const e = estado({ [a.id]: {}, [deOtra.id]: { fuente: "hipotesis" } });
    expect(areasDeLaPagina(lienzo, e)).toEqual([area.id]);
    expect(resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: {}, [deOtra.id]: {} }, [area.id], [area.id, otra.id])).map((x) => x.resultado.areaId)).toEqual([area.id, otra.id]);
    const elegida = estado({ [a.id]: {}, [deOtra.id]: {} }, [area.id], [otra.id]);
    expect(resultadosDeLaEscala(escala, lienzo, elegida).map((x) => x.resultado.areaId)).toEqual([otra.id]);
    expect(partesDeLaPagina(lienzo, elegida)).toBe(otra.dimensiones.filter((d) => d.aplica).length);
  });

  it("sin nada usado y sin elegir no hay resultado; un área elegida sin nada sale «En medición» (8 nov)", () => {
    expect(resultadosDeLaEscala(escala, lienzo, estado({}))).toEqual([]);
    const [x] = resultadosDeLaEscala(escala, lienzo, estado({ [a.id]: {} }, [area.id], [otra.id]));
    expect(x.resultado.areaId).toBe(otra.id);
    expect(x.resultado.preguntadas).toBe(0);
    expect(x.resultado.nivel).toBeNull();
    expect(x.resultado.recomendacion).toBeNull();
    expect(x.resultado.capas.every((c) => c.nivel === null)).toBe(true);
    expect(x.resultado.sintesis).toMatch(/Todavía no conocemos cómo trabaja tu equipo/);
    const html = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r: x.resultado,
        empresa: "Una empresa",
        agenda: "",
        deLaEscala: { areas: [{ id: x.resultado.areaId, nombre: x.resultado.areaNombre, href: "#" }], porExplorar: [] },
      }),
    );
    expect(html).toMatch(/En medición/);
  });

  it("el resumen no habla de respuestas, preguntas ni estimaciones", () => {
    const [{ resultado: r }] = resultadosDeLaEscala(escala, lienzo, estado(Object.fromEntries(queAplican.map((d) => [d.id, {}]))));
    expect(r.sintesis).toContain(`Tu equipo de ${r.areaNombre}`);
    expect(r.sintesis).not.toMatch(/respondiste|pregunta|estimaci|hemos visto|hasta ahora/i);
  });

  it("en el radar, lo que falta dice «Sin medir» y una hipótesis dice «por explorar»", () => {
    expect(textoDelEstado(estadoDeLaDimension({ clave: "1.7", nombre: "x", capa: "base", preguntada: false, sinMedir: true, nivel: null, puntaje: null }), () => "")).toBe("Sin medir");
    expect(textoDelEstado(estadoDeLaDimension({ clave: "1.7", nombre: "x", capa: "base", preguntada: false, nivel: null, puntaje: null }), () => "")).toBe("No se preguntó");
    expect(textoDelEstado(estadoDeLaDimension({ clave: "1.7", nombre: "x", capa: "base", preguntada: true, nivel: "I", porExplorar: true, puntaje: 30 }), () => "Inicial")).toBe("Inicial · por explorar");
  });

  it("⛔ el mismo cálculo del test: lo medido da lo mismo que las mismas respuestas", () => {
    const niveles = Object.fromEntries(queAplican.map((d) => [d.id, { nivel: "F" as const, noLoSe: false, riesgo: false }]));
    const delTest = resultadoDeLosNiveles({ escala, areaId: area.id, version: "marketing", preguntadas: new Set(Object.keys(niveles)), niveles, orden: area.paraChequeo.orden })!;
    const [{ resultado: r }] = resultadosDeLaEscala(escala, lienzo, estado(Object.fromEntries(queAplican.map((d) => [d.id, { nivel: "F" as const }]))));
    expect({ ...r, sintesis: "" }).toEqual({ ...delTest, sintesis: "" });
    expect(delTest.sintesis).toBe(resumenSinIa(delTest));
  });
});

describe("los casos del detalle de cada área (10 nov, Centauro)", () => {
  it("«Reactivar el uso del HubSpot que ya pagas» no sale sin HubSpot confirmado en uso; con él, no se ofrece migrar a HubSpot", () => {
    // En Inicial es donde la escala lo recomendaba (con Centauro, el 9 nov).
    const todasEnInicial = Object.fromEntries(queAplican.map((d) => [d.id, { nivel: "I" as const }]));
    const ids = (contenido: Record<string, unknown> = {}) => {
      const e = estado(todasEnInicial);
      return resultadosDeLaEscala(escala, lienzo, { ...e, contenido: { ...e.contenido, ...contenido } }).flatMap((x) => x.resultado.casos.map((c) => c.id));
    };
    // Sin saber qué CRM usa, y con el de Centauro (un CRM sin nombre), nunca.
    expect(ids()).not.toContain("reactiva-hubspot");
    expect(ids({ casillas: { hubspotActual: "Luis lleva las interacciones de Customer Success en el CRM actual como tareas." } })).not.toContain("reactiva-hubspot");
    const conHubspot = ids({ casillas: { hubspotActual: "Usan HubSpot Sales Hub desde 2023." } });
    expect(conHubspot).toContain("reactiva-hubspot");
    expect(conHubspot).not.toContain("migra-a-hubspot");
  });
});
