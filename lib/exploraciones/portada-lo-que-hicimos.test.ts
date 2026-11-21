/**
 * lib/exploraciones/portada-lo-que-hicimos.test.ts — la portada del Resumen abre con lo que hicimos (21 nov, Elías: «En el
 * H1 no debería estar el problema. Ahí debería estar las sesiones de exploración, cuántas horas de conversaciones, con
 * cuántas personas se ha hablado, la sección de lo que hicimos. Después debería explicar el problema principal, y ese
 * debería ser lo que hoy es el H1.»). El H1 sale de los números (nunca de la IA), la tesis baja a «El problema principal»
 * con su peso, y ninguna pieza de antes desaparece: cambia de lugar.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { faltaParaPublicar, tituloDeLoQueHicimos } from "@/lib/external/pagina-del-resumen";
import { CLAVES, huella } from "@/lib/external/textos-de-la-pagina";
import { resumenParaLaPagina, type ResumenGuardado } from "./resumen-de-la-escala";

const CITA = { reunion: "gmeet_r1", fecha: "2026-11-05T16:00:00.000Z", turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano en una hoja" };
const TESIS = "Las ventas se anotan a mano. Nadie ve el mes.";

function guardado(conTesis = true): ResumenGuardado {
  return {
    v: 2,
    at: "2026-11-18T18:00:00.000Z",
    por: null,
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: {
      sesiones: [
        { fecha: "2026-11-05T16:00:00.000Z", equipo: "Ventas", minutos: 300, quienes: ["diego rojas", "ana mora"] },
        { fecha: "2026-11-06T16:00:00.000Z", equipo: "Ventas", minutos: 180, quienes: ["diego rojas", "luis vega"] },
      ],
      personas: 3,
      texto: null,
    },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    negocio: {
      ...(conTesis ? { tesis: [{ id: "n1", texto: TESIS, citas: [CITA] }] } : {}),
      etiquetas: [{ id: "e1", texto: "Venta a crédito", citas: [CITA] }],
      fuera: [{ id: "f1", texto: "La división de desarrollo de software queda fuera.", citas: [CITA] }],
    },
    operativas: [],
    puntos: [{ id: "p1", titulo: "Las ventas van a mano", texto: "Cada venta se anota en una hoja.", areaId: null, citas: [CITA] }],
  };
}
const pestanas = [{ id: "resumen", nombre: "Resumen", href: "#" }];
const pinta = (g: ResumenGuardado, textos: Record<string, string> = {}) =>
  renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumenParaLaPagina(g, [], {}, {}, { conCitas: false }), empresa: "Empresa de prueba", pestanas, textos }));

describe("el titular de lo que hicimos", () => {
  it("dice sesiones, horas y personas, con singular y plural, y se acorta si falta un dato", () => {
    expect(tituloDeLoQueHicimos({ sesiones: 13, minutos: 480, personas: 3 })).toBe("13 sesiones y 8 h de conversación con 3 personas de tu equipo.");
    expect(tituloDeLoQueHicimos({ sesiones: 1, minutos: 73, personas: 1 })).toBe("1 sesión y 1 h 13 min de conversación con 1 persona de tu equipo.");
    expect(tituloDeLoQueHicimos({ sesiones: 2, minutos: 0, personas: 4 })).toBe("2 sesiones con 4 personas de tu equipo.");
    expect(tituloDeLoQueHicimos({ sesiones: 2, minutos: 90, personas: 0 })).toBe("2 sesiones y 1 h 30 min de conversación.");
  });

  it("sin sesiones no hay titular de números (la portada dice lo de siempre)", () => {
    expect(tituloDeLoQueHicimos({ sesiones: 0, minutos: 0, personas: 0 })).toBeNull();
    expect(pinta({ ...guardado(), hicimos: { sesiones: [], personas: 0, texto: null } })).toContain('<h1 class="re-titular rd-entra">Así entendimos tu negocio.</h1>');
  });

  it("⛔ el H1 dice los mismos números que las cifras de abajo, también si una persona las cambió", () => {
    const html = pinta(guardado());
    expect(html).toContain('<h1 class="re-titular rd-entra">2 sesiones y 8 h de conversación con 3 personas de tu equipo.</h1>');
    const cambiado = pinta(guardado(), {
      [CLAVES.delResumen(`hicimos.sesiones.${huella("2")}`)]: "3",
      [CLAVES.delResumen(`hicimos.tiempo.${huella("8 h")}`)]: "9 h",
      [CLAVES.delResumen(`hicimos.personas.${huella("3")}`)]: "4",
    });
    expect(cambiado).toContain('<h1 class="re-titular rd-entra">3 sesiones y 9 h de conversación con 4 personas de tu equipo.</h1>');
    expect(cambiado).toContain("<b>3</b><span>sesiones de exploración</span>");
    expect(cambiado).toContain("<b>9 h</b><span>de conversación</span>");
    expect(cambiado).toContain("<b>4</b><span>personas de tu equipo</span>");
  });

  it("el singular sale del número que se ve, no del que contó el sistema", () => {
    expect(tituloDeLoQueHicimos({ sesiones: 1, minutos: 60, personas: 1 }, { sesiones: "2", personas: "3" })).toBe("2 sesiones y 1 h de conversación con 3 personas de tu equipo.");
    expect(tituloDeLoQueHicimos({ sesiones: 2, minutos: 60, personas: 2 }, { sesiones: "1", personas: "1" })).toBe("1 sesión y 1 h de conversación con 1 persona de tu equipo.");
    expect(tituloDeLoQueHicimos({ sesiones: 2, minutos: 0, personas: 0 }, { sesiones: "dos" })).toBe("dos sesiones.");
  });

  it("el titular reescrito aguanta que se corrija una cifra (se ata a los números del sistema)", () => {
    const clave = CLAVES.delResumen(`titular.hicimos.${huella("2 sesiones y 8 h de conversación con 3 personas de tu equipo.")}`);
    const html = pinta(guardado(), { [clave]: "Ocho horas con tu equipo de ventas.", [CLAVES.delResumen(`hicimos.personas.${huella("3")}`)]: "4" });
    expect(html).toContain('<h1 class="re-titular rd-entra">Ocho horas con tu equipo de ventas.</h1>');
    expect(html).toContain("<b>4</b><span>personas de tu equipo</span>");
  });

  it("el titular se puede reescribir para esta empresa, y lo escrito se suelta cuando cambian las sesiones", () => {
    const original = "2 sesiones y 8 h de conversación con 3 personas de tu equipo.";
    const clave = CLAVES.delResumen(`titular.hicimos.${huella(original)}`);
    expect(pinta(guardado(), { [clave]: "Ocho horas con tu equipo de ventas." })).toContain('<h1 class="re-titular rd-entra">Ocho horas con tu equipo de ventas.</h1>');
    const conOtraSesion = guardado();
    conOtraSesion.hicimos.sesiones.push({ fecha: "2026-11-07T16:00:00.000Z", equipo: "Ventas", minutos: 60, quienes: ["diego rojas"] });
    expect(pinta(conOtraSesion, { [clave]: "Ocho horas con tu equipo de ventas." })).toContain('<h1 class="re-titular rd-entra">3 sesiones y 9 h');
  });
});

describe("el orden de la portada", () => {
  it("arriba lo que hicimos; después el problema principal (la tesis, con su peso); después los puntos clave", () => {
    const html = pinta(guardado());
    const h1 = html.indexOf("<h1");
    const cifras = html.indexOf('class="re-hicimos');
    const problema = html.indexOf("01 <span>/ El problema principal</span>");
    const tesis = html.indexOf(`<h2 class="re-tesis" id="re-t-problema">${TESIS}</h2>`);
    const puntos = html.indexOf("02 <span>/ Puntos clave</span>");
    expect([h1, cifras, problema, tesis, puntos].every((i) => i > -1)).toBe(true);
    expect(h1).toBeLessThan(cifras);
    expect(cifras).toBeLessThan(problema);
    expect(problema).toBeLessThan(tesis);
    expect(tesis).toBeLessThan(puntos);
    // La tesis ya no es el H1, y la parte de lo que hicimos ya no se repite más abajo.
    expect(html).not.toMatch(/<h1[^>]*>Las ventas se anotan/);
    expect(html).not.toContain("/ Lo que hicimos");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("⛔ no se esconde nada: cada pieza de antes sigue en la página", () => {
    const html = pinta(guardado());
    for (const pieza of [
      "Empresa de prueba <span>/ Diagnóstico</span>", // la ceja
      "Así entendimos tu negocio, cómo trabajan tus equipos y qué los frena hoy.", // la bajada
      "sesiones de exploración",
      "de conversación",
      "personas de tu equipo",
      "Venta a crédito", // las etiquetas
      "La división de desarrollo de software queda fuera.", // el alcance
      TESIS,
      "Las ventas van a mano", // un punto clave
    ])
      expect(html, pieza).toContain(pieza);
  });

  it("un Resumen de antes sin tesis: lo que vende va en «Tu negocio», debajo de lo que hicimos", () => {
    const g = guardado(false);
    g.negocio = { ...g.negocio, vende: [{ id: "v1", texto: "Vendes productos para hospedajes.", citas: [CITA] }] };
    const html = pinta(g);
    expect(html).toContain("01 <span>/ Tu negocio</span>");
    // Sin un «Así entendimos tu negocio.» que repita la bajada de arriba.
    expect(html).not.toContain("re-tesis");
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("Vendes productos para hospedajes."));
  });

  it("⛔ sin tesis sigue sin publicarse, aunque ya no sea el H1", () => {
    const pagina = resumenParaLaPagina(guardado(false), [], {}, {}, { conCitas: false });
    expect(faltaParaPublicar(pagina)).toMatch(/El problema principal/);
    expect(faltaParaPublicar(resumenParaLaPagina(guardado(), [], {}, {}, { conCitas: false }))).toBeNull();
  });
});
