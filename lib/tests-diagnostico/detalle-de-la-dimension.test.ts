/**
 * lib/tests-diagnostico/detalle-de-la-dimension.test.ts — «Ver detalles» de cada barra del resultado: todo sale de la
 * escala y de lo que respondió la persona, nada se redacta. Con la mini-escala de los tests del lector.
 */
import { describe, expect, it } from "vitest";
import { nombreDeNivel, parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { borradorDesdeLaEscala } from "./banco";
import { detallesDelResultado, MAX_RIESGOS_DEL_DETALLE } from "./detalle-de-la-dimension";
import { resultadoDelTest } from "./resultado";
import type { Escala } from "@/lib/escala/documento/tipos";
import { NO_LO_SE } from "./tipos";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];
const web = borradorDesdeLaEscala(escala, area.id, "web");
const elegir = (letras: string[]) =>
  Object.fromEntries(web.map((p, i) => [p.id, { opcion: letras[i] === "?" ? NO_LO_SE : p.opciones.find((o) => o.nivel === letras[i])!.id }]));

describe("el detalle de cada dimensión del resultado", () => {
  it("dice lo que respondió, su nivel en la escala y los criterios del nivel de arriba", () => {
    // Opciones con su propio texto (en el borrador salen de la descripción del nivel, y entonces no se repite: abajo).
    const propias = web.map((p) => ({ ...p, opciones: p.opciones.map((o) => ({ ...o, texto: `Así lo hacemos en ${p.dimensionId} (${o.nivel})` })) }));
    const respuestas = elegir(["I", "F"]);
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: propias, respuestas })!;
    const det = detallesDelResultado(escala, r, { preguntas: propias, respuestas });
    const d0 = area.dimensiones[0];
    const x = det[d0.id];
    expect(x.respondiste).toBe(`Así lo hacemos en ${d0.id} (I)`);
    // Cada dimensión con SU respuesta, nunca la de otra.
    expect(det[area.dimensiones[1].id].respondiste).toBe(`Así lo hacemos en ${area.dimensiones[1].id} (F)`);
    expect(x.esteNivel).toEqual({ nombre: nombreDeNivel(escala, "I"), descripcion: d0.niveles.find((n) => n.letra === "I")!.descripcion.trim() });
    expect(x.siguiente?.nombre).toBe(nombreDeNivel(escala, "F"));
    expect(x.siguiente?.criterios).toEqual(d0.niveles.find((n) => n.letra === "F")!.criterios.map((c) => c.texto.trim()));
    expect(x.queMide).toBe(d0.descripcion?.trim() || null);
  });

  it("si la opción que eligió es el texto del nivel en la escala, no se repite", () => {
    const d0 = area.dimensiones[0];
    const descripcion = d0.niveles.find((n) => n.letra === "I")!.descripcion;
    const igual = web.map((p, i) => (i === 0 ? { ...p, opciones: p.opciones.map((o) => (o.nivel === "I" ? { ...o, texto: `${descripcion.toUpperCase()}. ` } : o)) } : p));
    const respuestas = elegir(["I", "F"]);
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: igual, respuestas })!;
    const x = detallesDelResultado(escala, r, { preguntas: igual, respuestas })[d0.id];
    expect(x.respondiste).toBe(`${descripcion.toUpperCase()}. `);
    expect(x.esteNivel).toBeNull();
  });

  it("los riesgos son los de los niveles que todavía no alcanza, y no más de tres", () => {
    const respuestas = elegir(["D", "D"]);
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas })!;
    const det = detallesDelResultado(escala, r, { preguntas: web, respuestas });
    expect(det[area.dimensiones[0].id].riesgos.length).toBeGreaterThan(0);
    for (const d of area.dimensiones) {
      const esperados = d.niveles
        .filter((n) => n.letra !== "D")
        .flatMap((n) => n.criterios.filter((c) => c.riesgo && escala.riesgos[c.id]).map((c) => escala.riesgos[c.id]));
      expect(det[d.id].riesgos).toEqual([...new Set(esperados)].slice(0, MAX_RIESGOS_DEL_DETALLE));
    }
  });

  describe("con una escala de prueba con riesgos en todos los niveles", () => {
    // La primera dimensión: dos criterios de riesgo por nivel (uno de E repite el mensaje de otro) y su descripción.
    const d0 = area.dimensiones[0];
    const conRiesgos: Escala = {
      ...escala,
      riesgos: { ...escala.riesgos },
      areas: escala.areas.map((a, ai) =>
        ai !== 0
          ? a
          : {
              ...a,
              dimensiones: a.dimensiones.map((d, di) =>
                di !== 0
                  ? d
                  : {
                      ...d,
                      descripcion: "Mide algo de prueba.",
                      niveles: d.niveles.map((n) => ({
                        ...n,
                        criterios: [1, 2].map((k) => ({ ...n.criterios[0], id: `${d.id}.${n.letra}R${k}`, texto: `Criterio ${n.letra}${k}`, riesgo: true })),
                      })),
                    },
              ),
            },
      ),
    };
    for (const n of conRiesgos.areas[0].dimensiones[0].niveles)
      for (const k of [1, 2]) conRiesgos.riesgos[`${d0.id}.${n.letra}R${k}`] = n.letra === "E" && k === 2 ? "Riesgo E1" : `Riesgo ${n.letra}${k}`;
    const detalleCon = (letra: string) => {
      const respuestas = elegir([letra, "F"]);
      const r = resultadoDelTest({ escala: conRiesgos, areaId: area.id, version: "web", preguntas: web, respuestas })!;
      return detallesDelResultado(conRiesgos, r, { preguntas: web, respuestas })[d0.id];
    };

    it("solo los de los niveles de arriba, sin repetir y no más de tres", () => {
      expect(MAX_RIESGOS_DEL_DETALLE).toBe(3);
      expect(detalleCon("I").riesgos).toEqual(["Riesgo F1", "Riesgo F2", "Riesgo E1"]);
      expect(detalleCon("E").riesgos).toEqual(["Riesgo O1", "Riesgo O2"]);
      expect(detalleCon("O").riesgos).toEqual([]);
    });

    it("los criterios del nivel de arriba y qué mide la dimensión", () => {
      expect(detalleCon("I").siguiente?.criterios).toEqual(["Criterio F1", "Criterio F2"]);
      expect(detalleCon("I").queMide).toBe("Mide algo de prueba.");
    });
  });

  it("«No lo sé» se dice tal cual; en el último nivel no hay siguiente", () => {
    const respuestas = elegir(["?", "O"]);
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas })!;
    const det = detallesDelResultado(escala, r, { preguntas: web, respuestas });
    expect(det[area.dimensiones[0].id].respondiste).toBe("No lo sé");
    expect(det[area.dimensiones[1].id].siguiente).toBeNull();
    expect(det[area.dimensiones[1].id].riesgos).toEqual([]);
  });

  it("sin las preguntas (un resultado de la app vieja) no hay «respondiste»; un área que ya no existe, nada", () => {
    const respuestas = elegir(["F", "F"]);
    const r = resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas: web, respuestas })!;
    expect(Object.values(detallesDelResultado(escala, r)).every((x) => x.respondiste === null)).toBe(true);
    expect(detallesDelResultado(escala, { ...r, areaId: "9" })).toEqual({});
  });

  it("lo que no se preguntó no lleva detalle", () => {
    const mk = borradorDesdeLaEscala(escala, area.id, "marketing");
    const respuestas = { [mk[0].id]: { opcion: mk[0].opciones[2].id } };
    const r = resultadoDelTest({ escala, areaId: area.id, version: "marketing", preguntas: mk, respuestas })!;
    const det = detallesDelResultado(escala, r, { preguntas: mk, respuestas });
    for (const d of r.dimensiones) expect(Boolean(det[d.id])).toBe(d.preguntada && d.nivel !== null);
  });
});
