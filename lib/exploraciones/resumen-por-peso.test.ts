/**
 * El Resumen de la escala por peso (18 nov, Cemaco · Ecuador): el titular es el problema principal, el agente sabe el título
 * y los minutos de cada reunión, el texto se reparte justo, las reuniones mal leídas se avisan, los 5 puntos clave y las
 * cifras que dijo Smarteam y la empresa no corrigió (por confirmar). Ver DECISIONS «El Resumen de la escala por peso».
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseObject } from "@/lib/ai/section-schema";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { leerResumenGuardado } from "./esquemas";
import {
  bloqueDelPeso,
  conIdsDeLaCorrida,
  conLasPiezas,
  loQueDijoLaEmpresa,
  pesoDeLasSesiones,
  soloLaDijoSmarteam,
  citaVerificada,
  comoSeLeyo,
  editarElResumen,
  estadoDeLaCifra,
  juntarConLoEditado,
  leerElResumen,
  MAX_CANDIDATOS_A_PUNTO,
  MAX_PUNTOS,
  NOTA_SIN_CORREGIR,
  noLaCorrigio,
  pedidoDelResumen,
  quitarLoQueNoPasa,
  repartirElTope,
  resumenParaLaPagina,
  type ContextoDelResumen,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

// ── Una reunión de cobranza como la de Cemaco (turnos inventados con la misma forma) ──────────────────────────────

const COBRANZA: ReunionParaElResumen = {
  id: "gmeet_cobranza",
  clave: "R1",
  fecha: "2026-11-05T16:00:00.000Z",
  equipo: null,
  titulo: "EMPRESA | COBRANZA",
  minutos: 73,
  delCliente: ["Andrea Mora", "Nora Castro"],
  deSmarteam: ["Marco Salas"],
  turnos: [
    { n: 95, hablante: "Andrea Mora", texto: "somos el gerente, un jefe de crédito, tres personas en crédito y seis gestores de cobranza" },
    { n: 104, hablante: "Marco Salas", texto: "Entonces, tenemos, digamos que 4800 clientes en la cartera de los gestores" },
    { n: 105, hablante: "Andrea Mora", texto: "Mhm." },
    { n: 106, hablante: "Marco Salas", texto: "y cada gestor atiende 800 clientes, más o menos" },
    { n: 107, hablante: "Andrea Mora", texto: "Sí, unos 800 cada uno." },
    { n: 120, hablante: "Marco Salas", texto: "y se cobran unos 3 millones al mes en esa cartera" },
    { n: 121, hablante: "Nora Castro", texto: "No, no tanto, es como 1,5 millones." },
    { n: 130, hablante: "Marco Salas", texto: "¿y llaman unas 20 llamadas por hora cada uno?" },
    { n: 131, hablante: "Nora Castro", texto: "¿20? Eso depende del día." },
    { n: 140, hablante: "Marco Salas", texto: "ustedes tienen unos 5000 clientes activos en la base" },
    { n: 141, hablante: "Andrea Mora", texto: "Sí, bueno, en realidad son como 3200." },
    { n: 150, hablante: "Marco Salas", texto: "pierden unos 40 clientes por mes en la mora" },
    { n: 151, hablante: "Nora Castro", texto: "Eso no es así, se pierden muchos menos." },
    { n: 160, hablante: "Laura de HubSpot", texto: "ustedes tienen unos 1200 contactos en la base de datos" },
    { n: 161, hablante: "Andrea Mora", texto: "Mhm." },
    { n: 170, hablante: "Marco Salas", texto: "y en total son unos 90 gestores en las tres marcas" },
    { n: 200, hablante: "Andrea Mora", texto: "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte" },
    { n: 230, hablante: "Nora Castro", texto: "no tenemos un reporte que nos diga cuánto cobró cada gestor, lo cruzamos a mano todos los meses" },
  ],
};

const CTX: ContextoDelResumen = {
  empresa: "Empresa de prueba",
  reuniones: [COBRANZA],
  instrucciones: "",
  areas: [
    {
      id: "3",
      nombre: "Servicio",
      nivel: null,
      arriba: null,
      abajo: null,
      loQueMasFrena: null,
      dimensiones: [{ id: "3.3", nombre: "Datos", capa: "Base operativa", nivel: "Deficiente", porExplorar: false }],
      contexto: null,
    },
  ],
};

const REGLAS = { personas: ["Marco Salas", "Andrea Mora", "Nora Castro"], parse: parseObject, firmas: {} };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });
const C = (turno: number, texto: string) => ({ reunion: "R1", turno, texto });

describe("el peso de cada reunión llega al agente", () => {
  it("cada reunión va con su título y sus minutos, y antes una tabla con el peso de cada sesión", () => {
    const p = pedidoDelResumen({
      ...CTX,
      reuniones: [{ ...COBRANZA, recortada: true }],
      peso: [
        { fecha: "2026-11-05T16:00:00.000Z", titulo: "EMPRESA | COBRANZA", minutos: 73, clave: "R1" },
        { fecha: "2026-11-13T16:00:00.000Z", titulo: "EMPRESA | MARKETING DEMO", minutos: 11, clave: null },
        { fecha: "2026-11-06T16:00:00.000Z", titulo: "EMPRESA | MARKETING", minutos: 70, clave: "R2" },
      ],
    });
    const texto = String((p.messages[0] as { content: string }).content);
    expect(texto).toContain("### R1 · 2026-11-05 · «EMPRESA | COBRANZA» · 73 min · (se omitió un pedazo del medio por largo)");
    // La más larga primero, con su parte del tiempo; la que no tiene texto va igual, marcada.
    const tabla = texto.slice(texto.indexOf("El peso de cada sesión"));
    expect(tabla.indexOf("COBRANZA")).toBeLessThan(tabla.indexOf("| MARKETING»"));
    expect(tabla).toContain("73 min (47 %)");
    expect(tabla).toContain("sin texto · 2026-11-13");
  });

  it("las reglas piden el problema principal en el titular, el espacio por peso y los 5 puntos clave", () => {
    const sistema = String(pedidoDelResumen(CTX).system);
    // 24 nov: la regla 0 busca primero el dolor que cruza equipos, y los retos tienen un piso de 2.
    for (const regla of [/PROBLEMA PRINCIPAL/, /NUNCA dos hechos neutros/, /EL PROBLEMA PRINCIPAL Y EL PESO/, /«retos» \(de 2 a 4 según el PESO/, /«cifras» \(de 0 a 2 según el PESO/, /PUNTOS CLAVE \(7 candidatos/, /SOLO si la empresa la dijo/, /USA TODO/])
      expect(sistema).toMatch(regla);
    expect(sistema).not.toMatch(/exactamente 2, el más respaldado/);
  });

  it("bloqueDelPeso sin minutos no inventa porcentajes", () => {
    expect(bloqueDelPeso([{ fecha: "2026-11-05T00:00:00.000Z", titulo: null, minutos: null, clave: "R1" }])).toBe("- R1 · 2026-11-05 · «sin título» · duración desconocida");
  });
});

describe("el texto se reparte justo", () => {
  it("si todo cabe, ninguna reunión se corta (Cemaco: 294 mil de 320 mil)", () => {
    const largos = [38_000, 22_000, 49_000, 42_000, 48_000, 36_000, 59_000];
    expect(repartirElTope(largos, 320_000, 120_000)).toEqual(largos);
  });

  it("si no cabe, las cortas van enteras y el resto se reparte entre las largas", () => {
    const topes = repartirElTope([10_000, 100_000, 200_000], 150_000, 120_000);
    expect(topes[0]).toBe(10_000);
    expect(topes[1]).toBe(70_000);
    expect(topes[2]).toBe(70_000);
    expect(topes.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(150_000);
  });

  it("ninguna pasa del tope de una, aunque sobre", () => {
    expect(repartirElTope([300_000], 320_000, 120_000)).toEqual([120_000]);
    expect(repartirElTope([], 320_000, 120_000)).toEqual([]);
  });
});

describe("«Esta reunión no se pudo leer bien»", () => {
  it("una reunión recortada o casi sin la voz de la empresa se avisa, con sus números", () => {
    expect(comoSeLeyo(COBRANZA, { largo: 60_000, leido: 41_000, delCliente: 16_000 })).toEqual({
      reunion: "gmeet_cobranza",
      fecha: COBRANZA.fecha,
      titulo: "EMPRESA | COBRANZA",
      motivos: ["recortada", "poco-del-cliente"],
      leido: 68,
      delCliente: 27,
    });
    expect(comoSeLeyo(COBRANZA, { largo: 49_000, leido: 49_000, delCliente: 25_000 })).toBeNull();
  });

  it("sin saber quién habló de la empresa, no se dice que habló poco", () => {
    expect(comoSeLeyo({ ...COBRANZA, delCliente: [] }, { largo: 10_000, leido: 10_000, delCliente: 0 })).toBeNull();
  });
});

describe("lo que dijo Smarteam y la empresa no corrigió: por confirmar", () => {
  it("con un «Mhm.» después vale como cita de una cifra, marcada; sin la opción, no", () => {
    const c = citaVerificada(C(104, "tenemos, digamos que 4800 clientes en la cartera de los gestores"), [COBRANZA], { sinCorregir: true });
    expect(c?.hablante).toBe("Marco Salas");
    expect(c?.sinCorregir).toBe(true);
    expect(citaVerificada(C(104, "tenemos, digamos que 4800 clientes en la cartera de los gestores"), [COBRANZA])).toBeNull();
  });

  it("la que la empresa corrigió («No, no tanto…») o puso en duda («¿20?») no entra", () => {
    expect(noLaCorrigio(COBRANZA, 120, "se cobran unos 3 millones al mes")).toBe(false);
    expect(noLaCorrigio(COBRANZA, 130, "unas 20 llamadas por hora")).toBe(false);
    expect(citaVerificada(C(120, "y se cobran unos 3 millones al mes en esa cartera"), [COBRANZA], { sinCorregir: true })).toBeNull();
  });

  it("una sin números no entra por esta puerta (solo las cifras)", () => {
    const sinNumero: ReunionParaElResumen = { ...COBRANZA, turnos: [{ n: 1, hablante: "Marco Salas", texto: "ustedes cruzan todo a mano en la hoja de cálculo" }, { n: 2, hablante: "Andrea Mora", texto: "Mhm." }] };
    expect(citaVerificada(C(1, "ustedes cruzan todo a mano en la hoja de cálculo"), [sinNumero], { sinCorregir: true })).toBeNull();
  });

  it("su estado es «por confirmar» con la nota del código; confirmada por una persona, «Lo dijiste tú»", () => {
    const c = citaVerificada(C(104, "digamos que 4800 clientes en la cartera"), [COBRANZA], { sinCorregir: true })!;
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "4800", nota: null, citas: [c] })).toEqual({ estado: "pendiente", nota: NOTA_SIN_CORREGIR });
    expect(estadoDeLaCifra({ estado: "pendiente", cifra: "4800", nota: null, citas: [c], confirmada: true })).toEqual({ estado: "declarado", nota: null });
  });

  it("el agente: la de Smarteam sin corregir entra por confirmar; la corregida no", () => {
    const e = leerElResumen(
      responde({
        areas: [
          {
            nombre: "Crédito y cobro",
            area: "3",
            organizacion: [],
            bien: [],
            frena: [],
            retos: [{ texto: "Asignar la cartera sin hacerlo a mano", dimension: "3.3", citas: [C(200, "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte")] }],
            cifras: [
              { cifra: "4800", texto: "clientes en la cartera", estado: "pendiente", nota: null, dimension: null, citas: [C(104, "digamos que 4800 clientes en la cartera de los gestores")] },
              { cifra: "3 millones", texto: "por cobrar al mes", estado: "pendiente", nota: null, dimension: null, citas: [C(120, "y se cobran unos 3 millones al mes en esa cartera")] },
            ],
            falta: null,
          },
        ],
      }),
      CTX,
      REGLAS,
    );
    const cifras = e.operativas[0]?.cifras ?? [];
    expect(cifras.map((c) => [c.cifra, c.estado, c.nota])).toEqual([["4800", "pendiente", NOTA_SIN_CORREGIR]]);
    expect(e.descartados.some((d) => d.includes("3 millones"))).toBe(true);
    // La revisión de antes de guardar no la quita.
    expect(quitarLoQueNoPasa({ operativas: e.operativas }, [COBRANZA]).resumen.operativas?.[0].cifras).toHaveLength(1);
  });
});

describe("los 5 puntos clave", () => {
  const conPuntos = (puntos: unknown[]) => leerElResumen(responde({ areas: [], puntos }), CTX, REGLAS);

  it("cada punto pasa con su cita de la empresa; sin cita, con un número que no dijo o sin título, no", () => {
    const e = conPuntos([
      { titulo: "La cartera se asigna a mano", texto: "Cada vez que cambia el corte, la asignación de la cartera se hace a mano en Excel.", area: "3", citas: [C(200, "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte")] },
      { titulo: "Sin reporte por gestor", texto: "No hay un reporte de cuánto cobró cada gestor: se cruza a mano todos los meses.", area: "9", citas: [C(230, "no tenemos un reporte que nos diga cuánto cobró cada gestor, lo cruzamos a mano todos los meses")] },
      { titulo: "Sin cita", texto: "Algo que nadie dijo en la reunión de cobranza.", area: null, citas: [] },
      { titulo: "15 gestores sin metas", texto: "Los gestores trabajan sin metas claras de cobro cada mes.", area: "3", citas: [C(95, "tres personas en crédito y seis gestores de cobranza")] },
      { titulo: "", texto: "Sin título.", citas: [C(95, "tres personas en crédito y seis gestores de cobranza")] },
    ]);
    expect(e.puntos.map((p) => [p.titulo, p.areaId])).toEqual([
      ["La cartera se asigna a mano", "3"],
      ["Sin reporte por gestor", null],
    ]);
  });

  it("uno que se cae por algo de forma (un número que la cita no dice) se pide corregido y vuelve a su lugar", () => {
    const e = conPuntos([
      { titulo: "Sin reporte por gestor", texto: "Hay 12 reportes que se cruzan a mano todos los meses.", area: "3", citas: [C(230, "no tenemos un reporte que nos diga cuánto cobró cada gestor, lo cruzamos a mano todos los meses")] },
    ]);
    expect(e.puntos).toEqual([]);
    const caido = e.piezasPorArreglar.find((p) => p.lugar === "puntos");
    expect(caido).toMatchObject({ titulo: "Sin reporte por gestor", areaId: "3", indice: 0 });
    const corregido = conLasPiezas({ negocio: {}, operativas: [], puntos: e.puntos }, [{ ...caido!, texto: "No hay un reporte de cuánto cobró cada gestor: se cruza a mano cada mes." }]);
    expect(corregido.puntos?.map((p) => [p.titulo, p.areaId])).toEqual([["Sin reporte por gestor", "3"]]);
  });

  it("la lectura guarda hasta 7 candidatos (24 nov: si la revisión de lo resuelto saca uno, entra el siguiente); al guardar quedan 5", () => {
    const uno = (i: number) => ({ titulo: `Cartera a mano, punto ${"ABCDEFGH"[i]}`, texto: "La asignación de la cartera la hacemos a mano en Excel.", citas: [C(200, "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte")] });
    expect(conPuntos([0, 1, 2, 3, 4, 5, 6, 7].map(uno)).puntos).toHaveLength(MAX_CANDIDATOS_A_PUNTO);
    expect(MAX_PUNTOS).toBe(5);
  });
});

// ── Guardar, editar, rehacer y pintar ──────────────────────────────────────────────────────────────────────────

const CITA_ANDREA = { reunion: "gmeet_cobranza", fecha: COBRANZA.fecha, turno: 200, hablante: "Andrea Mora", texto: "la asignación de la cartera la hacemos a mano en Excel" };
const CITA_MARCO = { reunion: "gmeet_cobranza", fecha: COBRANZA.fecha, turno: 104, hablante: "Marco Salas", texto: "digamos que 4800 clientes en la cartera", sinCorregir: true as const };

function guardado(): ResumenGuardado {
  return {
    v: 2,
    at: "2026-11-18T18:00:00.000Z",
    por: null,
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: { sesiones: [{ fecha: COBRANZA.fecha, equipo: null, minutos: 73, areaId: null, quienes: ["andrea mora"] }], personas: 1, texto: null },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    operativas: [
      {
        id: "o1",
        nombre: "Crédito y cobro",
        areaId: "3",
        organizacion: [],
        bien: [],
        frena: [],
        retos: [],
        cifras: [{ id: "c1", cifra: "4800", texto: "clientes en la cartera", estado: "pendiente", nota: NOTA_SIN_CORREGIR, dimensionId: null, citas: [CITA_MARCO] }],
        falta: null,
      },
    ],
    puntos: [{ id: "k1", titulo: "La cartera se asigna a mano", texto: "Cada corte, la cartera se asigna a mano en Excel.", areaId: "3", citas: [CITA_ANDREA] }],
    malLeidas: [{ reunion: "gmeet_cobranza", fecha: COBRANZA.fecha, titulo: "EMPRESA | COBRANZA", motivos: ["recortada"], leido: 77, delCliente: 45 }],
  };
}

const SERVICIO = {
  v: 1,
  escalaVersion: "9.0.0",
  edicion: null,
  areaId: "3",
  areaNombre: "Servicio",
  version: "servicio",
  nivel: null,
  nivelNombre: null,
  puntaje: null,
  capas: [],
  dimensiones: [{ id: "3.3", nombre: "Datos", capa: "base", preguntada: false, nivel: null, nivelNombre: null, puntaje: null, noLoSe: false }],
  niveles: [],
  recomendacion: null,
  riesgos: [],
  casos: [],
  sintesis: "",
  preguntadas: 0,
  total: 1,
} as unknown as ResultadoDelTest;
const pagina = (g: ResumenGuardado, conCitas: boolean) => resumenParaLaPagina(g, [SERVICIO], {}, { escalaVersion: "9.0.0" }, { conCitas });
const EDITAR = { firmaDe: () => "", areas: new Set(["3"]), en: "2026-11-18T19:00:00.000Z" };

describe("guardar, editar, rehacer y pintar", () => {
  it("la página trae los puntos con su equipo; afuera sin citas ni «Confirmar», adentro con las reuniones mal leídas", () => {
    const afuera = pagina(guardado(), false);
    expect(afuera.puntos).toEqual([{ id: "k1", titulo: "La cartera se asigna a mano", texto: "Cada corte, la cartera se asigna a mano en Excel.", clave: "punto:k1", areaNombre: "Servicio" }]);
    const cifraAfuera = afuera.tarjetas[0].subequipos[0].cifras[0];
    expect([cifraAfuera.estado, cifraAfuera.porConfirmar, afuera.malLeidas]).toEqual(["pendiente", undefined, undefined]);
    const adentro = pagina(guardado(), true);
    expect(adentro.tarjetas[0].subequipos[0].cifras[0].porConfirmar).toBe(true);
    expect(adentro.malLeidas?.[0].motivos).toEqual(["recortada"]);
    expect(adentro.puntoNuevo).toBe("punto:nuevo");
  });

  it("un Resumen sin puntos no suma claves afuera: una escala ya publicada no pasa a «Hay cambios que el cliente no ve»", () => {
    const sinPuntos = { ...guardado(), puntos: [] };
    const afuera = pagina(sinPuntos, false);
    expect(["puntos", "puntoNuevo", "malLeidas"].filter((k) => k in afuera)).toEqual([]);
  });

  it("«Confirmar» deja la cifra como dicha por la empresa, sin la nota, y no vuelve a pedir confirmación", () => {
    const r = editarElResumen(guardado(), "op:o1:cifra:c1:confirmar", "si", EDITAR);
    if (!r.ok) throw new Error(r.error);
    const c = r.resumen.operativas![0].cifras[0];
    expect([c.confirmada, c.mano, c.nota]).toEqual([true, true, null]);
    const enLaPagina = pagina(r.resumen, true).tarjetas[0].subequipos[0].cifras[0];
    expect([enLaPagina.estado, enLaPagina.porConfirmar]).toEqual(["declarado", undefined]);
  });

  it("un punto se agrega, se cambia y se quita en su lugar; quitado, no vuelve al rehacer", () => {
    const nuevo = editarElResumen(guardado(), "punto:nuevo", "Sin reporte por gestor", EDITAR);
    if (!nuevo.ok) throw new Error(nuevo.error);
    expect(nuevo.resumen.puntos?.map((p) => [p.titulo, p.texto, p.mano])).toEqual([
      ["La cartera se asigna a mano", "Cada corte, la cartera se asigna a mano en Excel.", undefined],
      ["Sin reporte por gestor", "", true],
    ]);
    const cambiado = editarElResumen(guardado(), "punto:k1:texto", "Se asigna a mano en cada corte.", EDITAR);
    if (!cambiado.ok) throw new Error(cambiado.error);
    expect(cambiado.resumen.puntos?.[0]).toMatchObject({ texto: "Se asigna a mano en cada corte.", mano: true });
    expect(editarElResumen(guardado(), "punto:k1:titulo", "", EDITAR).ok).toBe(false);
    const quitado = editarElResumen(guardado(), "punto:k1:titulo", null, EDITAR);
    if (!quitado.ok) throw new Error(quitado.error);
    expect(quitado.resumen.puntos).toEqual([]);
    // «Rehacer con IA»: el agente lo vuelve a escribir con la misma cita, y no vuelve.
    const rehecho = juntarConLoEditado(guardado(), quitado.resumen);
    expect(rehecho.puntos).toEqual([]);
    // Lo escrito a mano se queda al rehacer.
    expect(juntarConLoEditado(guardado(), cambiado.resumen).puntos?.[0].texto).toBe("Se asigna a mano en cada corte.");
  });

  it("lo guardado se relee pieza por pieza: los puntos, las mal leídas, la cita sin corregir y la cifra confirmada", () => {
    const g = guardado();
    g.operativas![0].cifras[0].confirmada = true;
    const leido = leerResumenGuardado(JSON.parse(JSON.stringify(g)));
    expect(leido?.puntos?.[0].titulo).toBe("La cartera se asigna a mano");
    expect(leido?.malLeidas?.[0].leido).toBe(77);
    expect(leido?.operativas?.[0].cifras[0].citas[0].sinCorregir).toBe(true);
    expect(leido?.operativas?.[0].cifras[0].confirmada).toBe(true);
    // Un Resumen de antes (sin puntos) se lee igual.
    const viejo: Partial<ResumenGuardado> = guardado();
    delete viejo.puntos;
    delete viejo.malLeidas;
    expect(leerResumenGuardado(JSON.parse(JSON.stringify(viejo)))?.puntos).toBeUndefined();
  });

  it("la vista pinta «Puntos clave» numerados debajo de lo que hicimos (la portada, 21 nov); sin puntos (una foto de antes), no", () => {
    const pestanas = [{ id: "resumen", nombre: "Resumen", href: "#" }];
    const html = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: pagina(guardado(), false), empresa: "Empresa de prueba", pestanas }));
    expect(html).toContain("01 <span>/ Puntos clave</span>");
    // Desde el 21 nov lo que hicimos es el H1 de la portada, arriba de los puntos, y ya no lleva número.
    expect(html).not.toContain("/ Lo que hicimos");
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("Puntos clave"));
    expect(html).toContain("La cartera se asigna a mano");
    const deAntes = pagina(guardado(), false);
    delete deAntes.puntos;
    const sin = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: deAntes, empresa: "Empresa de prueba", pestanas }));
    expect(sin).not.toContain("Puntos clave");
    expect(sin).toContain("01 <span>/ Equipos y hallazgos</span>");
  });
});

// ── Lo que pidió la revisión del 18 nov ────────────────────────────────────────────────────────────────────────

describe("«no la corrigió» se exige de verdad", () => {
  it("una corrección que empieza con «Sí» o que no trae número corrige igual", () => {
    expect(noLaCorrigio(COBRANZA, 140, "ustedes tienen unos 5000 clientes activos en la base")).toBe(false);
    expect(noLaCorrigio(COBRANZA, 150, "pierden unos 40 clientes por mes en la mora")).toBe(false);
  });

  it("la respuesta a la frase siguiente de Smarteam no cuenta como corrección de la anterior", () => {
    // Andrea dice «Mhm.» al 4800 y «Sí, unos 800 cada uno» a lo que Marco dijo después.
    expect(noLaCorrigio(COBRANZA, 104, "digamos que 4800 clientes en la cartera")).toBe(true);
  });

  it("si lo que sigue no se leyó (una reunión recortada), no se sabe si la corrigió: no entra", () => {
    expect(noLaCorrigio(COBRANZA, 170, "son unos 90 gestores")).toBe(false);
  });

  it("solo vale lo de Smarteam: lo de alguien de HubSpot o sin identificar no entra aunque nadie lo corrija", () => {
    expect(citaVerificada(C(160, "ustedes tienen unos 1200 contactos en la base de datos"), [COBRANZA], { sinCorregir: true })).toBeNull();
    expect(citaVerificada(C(104, "digamos que 4800 clientes en la cartera"), [{ ...COBRANZA, deSmarteam: [] }], { sinCorregir: true })).toBeNull();
  });

  it("una cifra que Smarteam resumió y la empresa confirmó sigue estimada, no «por confirmar»", () => {
    const confirmada = { reunion: "gmeet_cobranza", fecha: COBRANZA.fecha, turno: 104, hablante: "Marco Salas", texto: "digamos que 4800 clientes", confirmo: { hablante: "Andrea Mora", texto: "Sí, exacto." } };
    expect(soloLaDijoSmarteam({ cifra: "4800", citas: [confirmada] })).toBe(false);
    expect(estadoDeLaCifra({ estado: "pendiente", cifra: "4800", nota: null, citas: [confirmada] }).nota).not.toBe(NOTA_SIN_CORREGIR);
  });
});

describe("lo de Smarteam sin corregir no entra fuera de las cifras", () => {
  it("un punto clave, un reto y la tesis que solo citan a Smarteam se caen", () => {
    const deMarco = [C(104, "digamos que 4800 clientes en la cartera de los gestores")];
    const e = leerElResumen(
      responde({
        negocio: { tesis: [{ texto: "La cartera es enorme. Hay 4800 clientes.", citas: deMarco }] },
        areas: [{ nombre: "Crédito y cobro", area: "3", organizacion: [], bien: [], frena: [], retos: [{ texto: "Ordenar la cartera de 4800 clientes", dimension: null, citas: deMarco }], cifras: [], falta: null }],
        puntos: [{ titulo: "Cartera de 4800 clientes", texto: "La cartera tiene 4800 clientes entre los gestores.", area: "3", citas: deMarco }],
      }),
      CTX,
      REGLAS,
    );
    expect([e.negocio.tesis, e.puntos, e.operativas.flatMap((o) => o.retos)]).toEqual([undefined, [], []]);
  });
});

describe("la página: los puntos clave no muestran lo que el cliente no ve", () => {
  it("ni el de un equipo que no está en la página, ni el que nombra a uno que no ve", () => {
    const g = guardado();
    g.puntos = [
      ...g.puntos!,
      { id: "k2", titulo: "Algo de Ventas", texto: "La asignación de la cartera se hace a mano.", areaId: "1", citas: [CITA_ANDREA] },
      { id: "k3", titulo: "Algo con Marketing", texto: "Marketing no recibe la cartera.", areaId: null, citas: [CITA_ANDREA] },
    ];
    const p = resumenParaLaPagina(g, [SERVICIO], {}, { escalaVersion: "9.0.0" }, { conCitas: false, areasFuera: ["Marketing", "Ventas"] });
    expect(p.puntos?.map((x) => x.id)).toEqual(["k1"]);
  });

  it("ni el de un equipo sin explorar (su tarjeta dice «Por explorar»)", () => {
    const g = guardado();
    // Servicio no tuvo sesión: la única es de Ventas, que también está en la página.
    g.hicimos = { ...g.hicimos, sesiones: [{ fecha: "2026-11-06T16:00:00.000Z", equipo: "Ventas", minutos: 60, areaId: "1", quienes: [] }] };
    const VENTAS = { ...SERVICIO, areaId: "1", areaNombre: "Ventas" } as ResultadoDelTest;
    const p = resumenParaLaPagina(g, [SERVICIO, VENTAS], {}, { escalaVersion: "9.0.0" }, { conCitas: false });
    expect(p.sinExplorar).toEqual(["3"]);
    expect(p.puntos).toBeUndefined();
  });
});

describe("lo demás que cuida la revisión", () => {
  it("los puntos llevan la marca de la corrida: una pestaña vieja no edita otro punto", () => {
    const e = conIdsDeLaCorrida({ negocio: {}, recorrido: [], operativas: [], pendientes: [], entendimos: [], puntos: guardado().puntos }, "zz12");
    expect(e.puntos?.[0].id).toBe("k1-zz12");
  });

  it("al guardar se relee la transcripción: una cita «sin corregir» que la empresa sí corrigió se quita", () => {
    const g = guardado();
    g.operativas![0].cifras = [
      { id: "c9", cifra: "5000", texto: "clientes activos", estado: "pendiente", nota: NOTA_SIN_CORREGIR, dimensionId: null, citas: [{ reunion: "gmeet_cobranza", fecha: COBRANZA.fecha, turno: 140, hablante: "Marco Salas", texto: "ustedes tienen unos 5000 clientes activos", sinCorregir: true }] },
    ];
    expect(quitarLoQueNoPasa({ operativas: g.operativas }, [COBRANZA]).resumen.operativas?.[0].cifras).toEqual([]);
  });

  it("un punto editado con un número que su cita no dice pierde la cita", () => {
    const r = editarElResumen(guardado(), "punto:k1:texto", "Se asignan 900 cuentas a mano.", EDITAR);
    if (!r.ok) throw new Error(r.error);
    expect(r.resumen.puntos?.[0].citas).toEqual([]);
  });

  it("un punto corregido vuelve a su lugar en el orden del agente, y quedan los candidatos (los 5 primeros se eligen al guardar)", () => {
    const base = (n: number) => ({ id: `k${n}`, titulo: `Punto ${"ABCDEFGHI"[n]}`, texto: "x", areaId: null, citas: [CITA_ANDREA] });
    const corregido = conLasPiezas({ negocio: {}, operativas: [], puntos: [1, 3, 4, 5, 6, 7, 8].map(base) }, [{ lugar: "puntos", indice: 1, titulo: "El segundo", areaId: null, texto: "y", citas: [CITA_ANDREA], problema: "" }]);
    expect(corregido.puntos?.map((p) => p.id)).toEqual(["k1", "k2", "k3", "k4", "k5", "k6", "k7"]);
  });

  it("el peso deja fuera las sesiones de un equipo que el cliente no ve, y lo de la empresa se mide con la regla de las citas", () => {
    const peso = pesoDeLasSesiones(
      [
        { id: "a", origen: "meet", fecha: "2026-11-05", titulo: "COBRANZA", minutos: 73, areaId: "3" },
        { id: "b", origen: "meet", fecha: "2026-11-06", titulo: "MARKETING", minutos: 70, areaId: "2" },
        { id: "c", origen: "hubspot", fecha: "2026-11-07", titulo: "Llamada", minutos: null, areaId: null },
        { id: "d", origen: "meet", fecha: "2026-10-30", titulo: "", minutos: 82, areaId: null },
      ],
      new Set(["3"]),
      new Map([["a", "R1"]]),
    );
    expect(peso).toEqual([
      { fecha: "2026-11-05", titulo: "COBRANZA", minutos: 73, clave: "R1" },
      { fecha: "2026-10-30", titulo: null, minutos: 82, clave: null },
    ]);
    // «ANDREA MORA» es «Andrea Mora»: mismo criterio que las citas.
    expect(loQueDijoLaEmpresa([{ hablante: "ANDREA MORA", texto: "hola" }, { hablante: "Marco Salas", texto: "chau" }], ["Andrea Mora"])).toBe("ANDREA MORA".length + 4 + 4);
  });
});
