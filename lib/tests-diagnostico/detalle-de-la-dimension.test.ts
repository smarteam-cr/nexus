/**
 * lib/tests-diagnostico/detalle-de-la-dimension.test.ts — lo que se dice de cada dimensión del resultado: la tarjeta del
 * radar (cómo está) y «Ver detalles» de su barra (qué priorizar). Sale de la escala, o de la redacción de la IA si la
 * hay, y los dos no repiten lo mismo. Con la mini-escala de los tests del lector.
 */
import { describe, expect, it } from "vitest";
import { nombreDeNivel, parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { borradorDesdeLaEscala } from "./banco";
import { detallesDelResultado, MAX_CRITERIOS_DEL_NIVEL, primeraOracion, TOPE_DE_LA_PRIORIDAD } from "./detalle-de-la-dimension";
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

describe("lo que se dice de cada dimensión del resultado", () => {
  it("sin IA: cómo está = la descripción de su nivel; qué priorizar = la primera oración de la del nivel de arriba", () => {
    const r = resultado(["I", "F"]);
    const det = detallesDelResultado(escala, r);
    const d0 = area.dimensiones[0];
    const x = det[d0.id];
    expect(x.queMide).toBe(d0.descripcion?.trim() || null);
    expect(x.lectura).toBe(d0.niveles.find((n) => n.letra === "I")!.descripcion.trim());
    expect(x.esteNivel?.nombre).toBe(nombreDeNivel(escala, "I"));
    expect(x.esteNivel?.criterios).toEqual(d0.niveles.find((n) => n.letra === "I")!.criterios.map((c) => c.texto.trim()).slice(0, MAX_CRITERIOS_DEL_NIVEL));
    expect(x.siguiente).toEqual({ nombre: nombreDeNivel(escala, "F"), prioridad: primeraOracion(d0.niveles.find((n) => n.letra === "F")!.descripcion) });
    // Cada dimensión con SU nivel, nunca el de otra.
    expect(det[area.dimensiones[1].id].siguiente?.nombre).toBe(nombreDeNivel(escala, "E"));
  });

  it("la tarjeta (cómo está) y «Ver detalles» (qué priorizar) no dicen lo mismo", () => {
    for (const letras of [["D", "I"], ["I", "F"], ["F", "E"]]) {
      for (const x of Object.values(detallesDelResultado(escala, resultado(letras)))) {
        expect(x.siguiente?.prioridad).not.toBe(x.lectura);
        expect(x.esteNivel?.criterios ?? []).not.toContain(x.siguiente?.prioridad);
      }
    }
  });

  it("con la redacción de la IA, sus textos van primero; uno que falta cae al de la escala", () => {
    const r = resultado(["I", "F"]);
    const d0 = area.dimensiones[0].id;
    const d1 = area.dimensiones[1].id;
    const det = detallesDelResultado(escala, {
      ...r,
      redaccion: { modelo: "m", at: "2026-10-29T00:00:00.000Z", resumen: null, dimensiones: { [d0]: { lectura: "Lectura IA", prioridad: null }, [d1]: { lectura: null, prioridad: "Prioriza esto" } } },
    });
    expect(det[d0].lectura).toBe("Lectura IA");
    expect(det[d0].siguiente?.prioridad).toBe(primeraOracion(area.dimensiones[0].niveles.find((n) => n.letra === "F")!.descripcion));
    expect(det[d1].lectura).toBe(area.dimensiones[1].niveles.find((n) => n.letra === "F")!.descripcion.trim());
    expect(det[d1].siguiente?.prioridad).toBe("Prioriza esto");
  });

  it(`«En la escala, este nivel es:» lleva a lo sumo ${MAX_CRITERIOS_DEL_NIVEL} criterios`, () => {
    const d0 = area.dimensiones[0];
    const muchos: Escala = {
      ...escala,
      areas: escala.areas.map((a, ai) =>
        ai !== 0
          ? a
          : {
              ...a,
              dimensiones: a.dimensiones.map((d, di) =>
                di !== 0
                  ? d
                  : { ...d, niveles: d.niveles.map((n) => ({ ...n, criterios: [1, 2, 3, 4, 5, 6].map((k) => ({ ...n.criterios[0], id: `${n.letra}${k}`, texto: `Criterio ${n.letra}${k}` })) })) },
              ),
            },
      ),
    };
    const x = detallesDelResultado(muchos, resultado(["I", "F"], muchos))[d0.id];
    expect(x.esteNivel?.criterios).toEqual(["Criterio I1", "Criterio I2", "Criterio I3", "Criterio I4"]);
  });

  it("en el último nivel no hay siguiente; un área que ya no existe, nada", () => {
    const r = resultado(["?", "O"]);
    const det = detallesDelResultado(escala, r);
    expect(det[area.dimensiones[0].id].esteNivel?.nombre).toBe(nombreDeNivel(escala, "D"));
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

describe("qué priorizar sin IA, corto", () => {
  it("la primera oración, y no más de su tope (la descripción larga cortaba la hoja 3 del PDF)", () => {
    expect(primeraOracion("Todo el equipo sigue el mismo proceso. Además, el líder lo revisa.")).toBe("Todo el equipo sigue el mismo proceso.");
    expect(primeraOracion("Sin punto final")).toBe("Sin punto final");
    const larga = primeraOracion(`${"palabra ".repeat(80)}fin.`);
    expect(larga.length).toBeLessThanOrEqual(TOPE_DE_LA_PRIORIDAD);
    expect(larga.endsWith("palabra…")).toBe(true);
  });
});
