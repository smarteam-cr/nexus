/**
 * lib/exploraciones/portada-lo-que-hicimos.test.ts — la portada del Resumen abre con lo que hicimos (21 nov, Elías: «En el
 * H1 no debería estar el problema […]»): las cifras de lo que hicimos van arriba, la tesis baja a «El problema principal»
 * con su peso, y ninguna pieza de antes desaparece: cambia de lugar. Desde el 24 nov (Elías: «El nombre del entregable con
 * un resumen») el H1 es «Diagnóstico de <los equipos explorados> en HubSpot», con el resumen del agente debajo; las
 * sesiones, las horas y las personas siguen en las cifras.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { faltaParaPublicar, TITULO_DEL_DIAGNOSTICO, titularDelResumen } from "@/lib/external/pagina-del-resumen";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
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

/** Un equipo de la escala mínimo, para que la página tenga su tarjeta (y su nombre en el título). */
const equipo = (areaId: string, areaNombre: string) =>
  ({
    edicion: null,
    areaId,
    areaNombre,
    version: areaNombre.toLowerCase(),
    nivel: "I",
    nivelNombre: "Inicial",
    puntaje: null,
    capas: [],
    dimensiones: [],
    niveles: [],
    recomendacion: null,
    riesgos: [],
    casos: [],
    sintesis: "",
    preguntadas: 0,
    total: 0,
  }) as unknown as ResultadoDelTest;
const VENTAS = equipo("1", "Ventas");
const MARKETING = equipo("2", "Marketing");
const conEquipos = (g: ResumenGuardado, textos: Record<string, string> = {}) =>
  renderToStaticMarkup(
    createElement(ResumenDeLaEscalaVista, { resumen: resumenParaLaPagina(g, [VENTAS, MARKETING], {}, {}, { conCitas: false }), empresa: "Empresa de prueba", pestanas, textos }),
  );
/** Las sesiones de las dos áreas (con su `areaId`): los dos equipos quedan explorados. */
const deLasDos = (g: ResumenGuardado): ResumenGuardado => ({
  ...g,
  hicimos: {
    ...g.hicimos,
    sesiones: [
      { fecha: "2026-11-05T16:00:00.000Z", equipo: "Ventas", areaId: "1", minutos: 300, quienes: ["diego rojas"] },
      { fecha: "2026-11-06T16:00:00.000Z", equipo: "Marketing", areaId: "2", minutos: 180, quienes: ["ana mora"] },
    ],
  },
});

describe("el título: el nombre del entregable (24 nov)", () => {
  it("⛔ dice «Diagnóstico de rendimiento»: ni las sesiones (siguen en las cifras de abajo) ni las áreas (están en las tarjetas)", () => {
    expect(TITULO_DEL_DIAGNOSTICO).toBe("Diagnóstico de rendimiento");
    const html = conEquipos(deLasDos(guardado()));
    expect(html).toContain('<h1 class="re-titular rd-entra">Diagnóstico de rendimiento</h1>');
    expect(html).not.toMatch(/<h1[^>]*>\d+ sesiones/);
    expect(html).not.toContain("en HubSpot");
    expect(html).toContain("<b>2</b><span>sesiones de exploración</span>");
    expect(html).toContain("<span>de conversación</span>");
  });

  it("sin Resumen, la portada dice lo de siempre", () => {
    expect(pinta({ ...guardado(), hicimos: { sesiones: [], personas: 0, texto: null } })).toContain('<h1 class="re-titular rd-entra">Así entendimos tu negocio.</h1>');
  });

  it("el título se reescribe para esta empresa (a mano o con «✨ Mejorar con IA», el mismo texto fijo)", () => {
    const clave = CLAVES.delResumen(`titular.diagnostico.${huella("Diagnóstico de rendimiento")}`);
    expect(titularDelResumen({ [clave]: "Diagnóstico comercial" })).toMatchObject({ clave, original: "Diagnóstico de rendimiento", valor: "Diagnóstico comercial" });
    expect(conEquipos(deLasDos(guardado()), { [clave]: "Diagnóstico comercial" })).toContain('<h1 class="re-titular rd-entra">Diagnóstico comercial</h1>');
  });
});

describe("⛔ una escala publicada antes del 24 nov se ve como se publicó (Elías: «Que esperen a publicar»)", () => {
  const conEquipo = (g: ResumenGuardado): ResumenGuardado => ({
    ...g,
    operativas: [
      { id: "o1", nombre: "Ventas", areaId: "1", organizacion: [], bien: [], frena: [{ id: "f1", texto: "La gerencia no ve qué vende cada asesor", citas: [CITA] }], retos: [], cifras: [], falta: null },
    ],
  });
  // La foto publicada antes: la página de entonces, sin la forma de la portada.
  const deAntes = () => {
    const hoy = resumenParaLaPagina(conEquipo(deLasDos(guardado())), [VENTAS, MARKETING], {}, {}, { conCitas: false });
    const { formaDeLaPortada, ...foto } = hoy;
    void formaDeLaPortada;
    return foto as typeof hoy;
  };
  const pintaLaFoto = (textos: Record<string, string> = {}) => renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: deAntes(), empresa: "Empresa de prueba", pestanas, textos }));

  it("sin la forma nueva: el titular de lo que hicimos y sin el dolor de cada equipo; la de hoy, con los dos", () => {
    const foto = pintaLaFoto();
    expect(foto).toContain('<h1 class="re-titular rd-entra">2 sesiones y 8 h de conversación con 2 personas de tu equipo.</h1>');
    expect(foto).not.toContain("re-dolores");
    const hoy = conEquipos(conEquipo(deLasDos(guardado())));
    expect(hoy).toContain('<h1 class="re-titular rd-entra">Diagnóstico de rendimiento</h1>');
    expect(hoy).toContain("re-dolores");
  });

  it("lo que se escribió sobre el titular de antes se sigue viendo en esa foto", () => {
    const clave = CLAVES.delResumen(`titular.hicimos.${huella("2 sesiones y 8 h de conversación con 2 personas de tu equipo.")}`);
    expect(pintaLaFoto({ [clave]: "Ocho horas con tu equipo." })).toContain('<h1 class="re-titular rd-entra">Ocho horas con tu equipo.</h1>');
  });
});

describe("el resumen debajo del título (24 nov)", () => {
  const PARRAFO = "Empresa de prueba invierte en 3 tiendas, pero las ventas se anotan a mano.";
  it("va debajo del H1, en lugar de la bajada de siempre", () => {
    const g = guardado();
    g.negocio = { ...g.negocio, portada: [{ id: "n9", texto: PARRAFO, citas: [CITA] }] };
    const html = conEquipos(deLasDos(g));
    expect(html.indexOf(PARRAFO)).toBeGreaterThan(html.indexOf("<h1"));
    expect(html.indexOf(PARRAFO)).toBeLessThan(html.indexOf('class="re-hicimos'));
    expect(html).not.toContain("Así entendimos tu negocio, cómo trabajan tus equipos y qué los frena hoy.");
  });

  it("sin resumen (un Resumen de antes), la bajada de siempre", () => {
    expect(conEquipos(deLasDos(guardado()))).toContain("Así entendimos tu negocio, cómo trabajan tus equipos y qué los frena hoy.");
  });
});

describe("⛔ una escala publicada antes no dice «Hay cambios que el cliente no ve» por las partes nuevas (24 nov)", () => {
  it("afuera, el resumen de la portada y quién es quién solo van si tienen algo; adentro, siempre (para escribirlos)", () => {
    const tipos = (conCitas: boolean, g = guardado()) => resumenParaLaPagina(g, [], {}, {}, { conCitas }).negocio?.map((p) => p.tipo);
    expect(tipos(false)).toEqual(["tesis", "etiquetas", "tamano", "vende", "ingresos", "abarca", "fuera", "motivo", "busca"]);
    expect(tipos(true)).toContain("portada");
    expect(tipos(true)).toContain("quienes");
    const conPortada = guardado();
    conPortada.negocio = { ...conPortada.negocio, portada: [{ id: "n9", texto: "La empresa invierte en tres tiendas.", citas: [CITA] }] };
    expect(tipos(false, conPortada)).toContain("portada");
  });
});

describe("el dolor de cada equipo y quién es quién (24 nov)", () => {
  const conEquipo = (g: ResumenGuardado): ResumenGuardado => ({
    ...g,
    operativas: [
      { id: "o1", nombre: "Ventas", areaId: "1", organizacion: [], bien: [], frena: [{ id: "f1", texto: "La gerencia no ve qué vende cada asesor", citas: [CITA] }], retos: [], cifras: [], falta: null },
    ],
  });
  it("el reto principal de cada equipo sale en una línea debajo del problema principal (la misma pieza)", () => {
    const html = conEquipos(conEquipo(deLasDos(guardado())));
    expect(html).toContain('<ul class="re-dolores"><li><b>Ventas:</b> La gerencia no ve qué vende cada asesor</li></ul>');
    expect(html.indexOf("re-dolores")).toBeGreaterThan(html.indexOf("/ El problema principal"));
    expect(html.indexOf("re-dolores")).toBeLessThan(html.indexOf("/ Puntos clave"));
  });

  it("quién es quién va arriba de las filas de los equipos, con el equipo en negrita", () => {
    const g = conEquipo(deLasDos(guardado()));
    g.negocio = { ...g.negocio, quienes: [{ id: "q1", texto: "Lidera: Diego, gerente general", citas: [CITA] }, { id: "q2", texto: "Ventas: Ana y Luis", citas: [CITA] }] };
    const html = conEquipos(g);
    expect(html).toContain("<h3>Quién es quién</h3>");
    expect(html).toContain("<li><b>Lidera</b><span>Diego, gerente general</span></li>");
    expect(html).toContain("<li><b>Ventas</b><span>Ana y Luis</span></li>");
    expect(html.indexOf("re-mapa")).toBeGreaterThan(html.indexOf("/ Equipos y hallazgos"));
    expect(html.indexOf("re-mapa")).toBeLessThan(html.indexOf("re-equipo-nombre"));
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
