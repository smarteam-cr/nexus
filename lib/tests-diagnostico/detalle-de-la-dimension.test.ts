/**
 * lib/tests-diagnostico/detalle-de-la-dimension.test.ts — lo que se dice de cada dimensión del resultado: la tarjeta del
 * radar (qué le pasa al área por operar así) y «Ver detalles» de su barra (qué priorizar), y de qué dimensión es cada
 * riesgo. Sale de la escala, o de la redacción de la IA si la hay, y los dos no repiten lo mismo. Con la mini-escala.
 */
import { describe, expect, it } from "vitest";
import { nombreDeNivel, parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { borradorDesdeLaEscala } from "./banco";
import { detallesDelResultado, dimensionDeCadaRiesgo, primeraOracion, TOPE_DE_LA_PRIORIDAD } from "./detalle-de-la-dimension";
import { resultadoDelTest } from "./resultado";
import type { Escala } from "@/lib/escala/documento/tipos";
import { NO_LO_SE } from "./tipos";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];
const web = borradorDesdeLaEscala(escala, area.id, "web");
const elegir = (letras: string[]) =>
  Object.fromEntries(web.map((p, i) => [p.id, { opcion: letras[i] === "?" ? NO_LO_SE : p.opciones.find((o) => o.nivel === letras[i])!.id }]));
const resultado = (letras: string[], e: Escala = escala) =>
  resultadoDelTest({ escala: e, areaId: area.id, version: "web", preguntas: web, respuestas: elegir(letras) })!;
const nivelDe = (d: (typeof area.dimensiones)[number], l: string) => d.niveles.find((n) => n.letra === l)!;

describe("lo que se dice de cada dimensión del resultado", () => {
  it("sin IA: debajo de la base, el impacto es lo que cuesta quedarse; desde la base, lo que logra su nivel", () => {
    const r = resultado(["I", "F"]);
    const det = detallesDelResultado(escala, r);
    const [d0, d1] = area.dimensiones;
    expect(det[d0.id].impacto).toBe(primeraOracion(d0.costoDeQuedarse) || null);
    const f = nivelDe(d1, "F");
    expect(det[d1.id].impacto).toBe(primeraOracion(f.resultado ?? f.descripcion));
    expect(det[d0.id].siguiente).toEqual({ nombre: nombreDeNivel(escala, "F"), prioridad: primeraOracion(nivelDe(d0, "F").descripcion) });
    // Cada dimensión con SU nivel, nunca el de otra.
    expect(det[d1.id].siguiente?.nombre).toBe(nombreDeNivel(escala, "E"));
  });

  it("la tarjeta (el impacto) y «Ver detalles» (qué priorizar) no dicen lo mismo", () => {
    for (const letras of [["D", "I"], ["I", "F"], ["F", "E"]]) {
      for (const x of Object.values(detallesDelResultado(escala, resultado(letras)))) expect(x.siguiente?.prioridad).not.toBe(x.impacto);
    }
  });

  it("con la redacción de la IA, sus textos van primero; uno que falta cae al de la escala", () => {
    const r = resultado(["I", "F"]);
    const [d0, d1] = area.dimensiones;
    const det = detallesDelResultado(escala, {
      ...r,
      redaccion: { modelo: "m", at: "2026-10-29T00:00:00.000Z", resumen: null, dimensiones: { [d0.id]: { impacto: "Impacto IA", prioridad: null }, [d1.id]: { impacto: null, prioridad: "Prioriza esto" } } },
    });
    expect(det[d0.id].impacto).toBe("Impacto IA");
    expect(det[d0.id].siguiente?.prioridad).toBe(primeraOracion(nivelDe(d0, "F").descripcion));
    expect(det[d1.id].impacto).toBe(primeraOracion(nivelDe(d1, "F").resultado ?? nivelDe(d1, "F").descripcion));
    expect(det[d1.id].siguiente?.prioridad).toBe("Prioriza esto");
  });

  it("en el último nivel no hay siguiente; un área que ya no existe, nada", () => {
    const r = resultado(["?", "O"]);
    const det = detallesDelResultado(escala, r);
    expect(det[area.dimensiones[0].id].impacto).toBe(primeraOracion(area.dimensiones[0].costoDeQuedarse) || null);
    expect(det[area.dimensiones[1].id].siguiente).toBeNull();
    expect(detallesDelResultado(escala, { ...r, areaId: "9" })).toEqual({});
  });

  it("lo que no se preguntó no lleva detalle", () => {
    const mk = borradorDesdeLaEscala(escala, area.id, "marketing");
    const respuestas = { [mk[0].id]: { opcion: mk[0].opciones[2].id } };
    const r = resultadoDelTest({ escala, areaId: area.id, version: "marketing", preguntas: mk, respuestas })!;
    const det = detallesDelResultado(escala, r);
    for (const d of r.dimensiones) expect(Boolean(det[d.id])).toBe(d.preguntada && d.nivel !== null);
  });
});

describe("de qué dimensión es cada riesgo (el subtítulo de su tarjeta)", () => {
  it("cada riesgo del resultado lleva el nombre de la dimensión que lo dispara", () => {
    const r = resultado(["D", "D"]);
    const titulos = dimensionDeCadaRiesgo(escala, r);
    expect(r.riesgos.length).toBeGreaterThan(0);
    for (const x of r.riesgos) {
      // La dimensión del subtítulo es la que tiene ESE riesgo en un nivel que todavía no alcanza.
      const dim = area.dimensiones.find((d) => d.nombre === titulos[x])!;
      const nivel = r.dimensiones.find((d) => d.id === dim.id)!.nivel!;
      const suyos = dim.niveles
        .filter((n) => "DIFEO".indexOf(n.letra) > "DIFEO".indexOf(nivel))
        .flatMap((n) => n.criterios.filter((c) => c.riesgo).map((c) => escala.riesgos[c.id]));
      expect(suyos, `«${x}»`).toContain(x);
    }
    // Solo los riesgos del resultado; un área que ya no existe, nada.
    expect(Object.keys(titulos).every((x) => r.riesgos.includes(x))).toBe(true);
    expect(dimensionDeCadaRiesgo(escala, { ...r, areaId: "9" })).toEqual({});
  });
});

describe("qué priorizar sin IA, corto", () => {
  it("la primera oración, y no más de su tope (la descripción larga cortaba la hoja 3 del PDF)", () => {
    expect(primeraOracion("Todo el equipo sigue el mismo proceso. Además, el líder lo revisa.")).toBe("Todo el equipo sigue el mismo proceso.");
    expect(primeraOracion("Sin punto final")).toBe("Sin punto final");
    const larga = primeraOracion(`${"palabra ".repeat(80)}fin.`);
    expect(larga.length).toBeLessThanOrEqual(TOPE_DE_LA_PRIORIDAD);
    expect(larga.endsWith("palabra…")).toBe(true);
  });
});
