/**
 * lib/exploraciones/resumen-de-la-escala.test.ts — el Resumen de la escala que ve el cliente (9 nov). Correr:
 * `npx vitest run lib/exploraciones/resumen-de-la-escala.test.ts --project unit`.
 *
 * Lo que cuida, en orden de lo que más duele si se rompe:
 *   1. NINGUNA CIFRA SIN SU CITA: un número que nadie dijo, que dijo solo Smarteam (sin que la empresa lo confirme), o que
 *      el modelo calculó, no sale. Las citas de Centauro (9 nov) son las del caso real.
 *   2. El cliente nunca ve las citas ni quién habló.
 *   3. El armado: lo que hicimos (con la duración real), dónde queda cada equipo (el «por qué» viejo no sale) y las
 *      ediciones en su lugar, que «Rehacer con IA» no pisa.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { ajustarAlto } from "@/components/external/test/TextoEditableDeLaPagina";
import { parseObject } from "@/lib/ai/section-schema";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { aplicarOperaciones, cambioLoConfirmado, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { firmaDelArea } from "./descripcion-de-la-escala";
import { CambiosSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import {
  cifrasDeMas,
  citaVerificada,
  conIdsDeLaCorrida,
  conLoArreglado,
  confirmacion,
  delClienteDe,
  editarElResumen,
  enHoras,
  escribirElResumen,
  juntarConLoEditado,
  leerElArreglo,
  leerElResumen,
  loQueHicimos,
  minutosDeLaReunion,
  pedidoDelArreglo,
  pedidoDelResumen,
  porqueDeRespaldo,
  resumenParaLaPagina,
  reunionesQueLee,
  textoValido,
  type ContextoDelResumen,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

const RAIZ = process.cwd();

// ── Una reunión como la de Centauro del 9 nov (turnos reales, recortados) ─────────────────────────────────────

const R2: ReunionParaElResumen = {
  id: "gmeet_servicio",
  clave: "R2",
  fecha: "2026-11-09T15:00:00.000Z",
  equipo: "Servicio al cliente",
  delCliente: ["Emiley Calvo Jiménez", "Luis Humberto Rodríguez Acevedo"],
  turnos: [
    { n: 59, hablante: "Emiley Calvo Jiménez", texto: "tengo otro en soporte. Estamos viendo si ampliamos un poco más soporte, porque, o sea, si son 500 clientes y solo uno atendiendo tickets es bastante complicado." },
    { n: 161, hablante: "Emiley Calvo Jiménez", texto: "Mm, si tenemos algo como un 2,8% si no me equivoco, por ahí." },
    { n: 164, hablante: "Marco Salas", texto: "Okay. Que digamos de 500 es un buen número, ¿verdad?" },
    { n: 165, hablante: "Emiley Calvo Jiménez", texto: "Sí, no," },
    { n: 170, hablante: "Marco Salas", texto: "Sí, porque es que digamos si estamos captando como cuántos clientes eran 25 clientes y se nos van 14, ¿verdad?" },
    { n: 171, hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." },
    { n: 980, hablante: "Emiley Calvo Jiménez", texto: "Ajá. Aproximadamente unos 100" },
    { n: 981, hablante: "Marco Salas", texto: "Okay. 1800 al mes." },
    { n: 982, hablante: "Emiley Calvo Jiménez", texto: "porque Fer en realidad. Okay. Ventas atienden los tres productos, pero soporte atiende cuatro, que es factura." },
  ],
};

const R1: ReunionParaElResumen = {
  id: "gmeet_ventas",
  clave: "R1",
  fecha: "2026-11-06T20:00:00.000Z",
  equipo: "Ventas",
  delCliente: ["Fernando Segura", "Emiley Calvo Jiménez"],
  turnos: [
    { n: 198, hablante: "Emiley Calvo Jiménez", texto: "por asesor, pero son 50 a la semana en grupal." },
    { n: 235, hablante: "Marco Salas", texto: "¿cuántas cuánta cuántas están?" },
    { n: 236, hablante: "Emiley Calvo Jiménez", texto: "Digamos que 25 25 la mitad." },
    { n: 369, hablante: "Fernando Segura", texto: "No usamos correo WhatsApp. Eh, llamamos desde celular, WhatsApp desde celular. Cada asesor tiene su propio celular, cada uno con un número distinto." },
  ],
};

const CTX: ContextoDelResumen = {
  empresa: "Centauro Solutions",
  reuniones: [R1, R2],
  instrucciones: "",
  areas: [
    {
      id: "1",
      nombre: "Ventas",
      nivel: "Deficiente",
      arriba: "Inicial",
      abajo: null,
      loQueMasFrena: "Aprendizaje de Ganadas y Perdidas",
      dimensiones: [
        { id: "1.2", nombre: "Comunicación", capa: "Base operativa", nivel: "Inicial", porExplorar: false },
        { id: "1.7", nombre: "Actividad", capa: "Producción", nivel: "Inicial", porExplorar: false },
        { id: "1.8", nombre: "Aprendizaje de Ganadas y Perdidas", capa: "Producción", nivel: "Deficiente", porExplorar: true },
      ],
      contexto: null,
    },
    { id: "3", nombre: "Servicio", nivel: null, arriba: null, abajo: null, loQueMasFrena: null, dimensiones: [{ id: "3.8", nombre: "Capacidad", capa: "Base operativa", nivel: null, porExplorar: false }], contexto: null },
  ],
};

const REGLAS = { personas: ["Marco Salas", "Emiley Calvo Jiménez", "Fernando Segura"], parse: parseObject, firmas: { "1": "firma-de-ventas" } };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });

describe("1 · ninguna cifra sin su cita", () => {
  it("una cita dicha por alguien de la empresa vale; la que no está en la reunión, o es de tres palabras, no", () => {
    expect(citaVerificada({ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }, CTX.reuniones)?.hablante).toBe("Emiley Calvo Jiménez");
    // El número de turno equivocado no importa: se busca en la conversación entera.
    expect(citaVerificada({ reunion: "R1", turno: 1, texto: "son 50 a la semana en grupal" }, CTX.reuniones)?.turno).toBe(198);
    expect(citaVerificada({ reunion: "R1", turno: 236, texto: "Digamos que 40 son la mitad de todo" }, CTX.reuniones)).toBeNull();
    expect(citaVerificada({ reunion: "R1", turno: 369, texto: "desde celular WhatsApp" }, CTX.reuniones)).toBeNull();
    expect(citaVerificada({ reunion: "R9", turno: 236, texto: "Digamos que 25 25 la mitad." }, CTX.reuniones)).toBeNull();
  });

  it("lo que dijo Smarteam solo vale si la empresa lo confirma justo después («Ajá. Exacto.»), no con «Sí, no,» ni con «Okay»", () => {
    const c = citaVerificada({ reunion: "R2", turno: 170, texto: "si estamos captando como cuántos clientes eran 25 clientes y se nos van 14" }, CTX.reuniones);
    expect(c?.hablante).toBe("Marco Salas");
    expect(c?.confirmo).toEqual({ hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." });
    expect(confirmacion(R2, 164)).toBeNull();
    // «1800 al mes» lo dijo Marco y nadie lo confirmó: no sale (Centauro, 6 nov).
    expect(citaVerificada({ reunion: "R2", turno: 981, texto: "Okay. 1800 al mes." }, CTX.reuniones)).toBeNull();
  });

  it("todos los números del texto tienen que estar en lo citado, con lo que los multiplica", () => {
    expect(cifrasDeMas("14 de 25", "25 clientes y se nos van 14")).toEqual([]);
    expect(cifrasDeMas("56 % se va", "25 clientes y se nos van 14")).toEqual(["56·"]);
    expect(cifrasDeMas("25 mil al mes", "facturamos 25 al mes")).toEqual(["25·mil"]);
    expect(cifrasDeMas("dos de cada tres", "son 2 de cada 3")).toEqual([]);
  });

  it("el agente: el dato rojo con su cita pasa; el que calcula un porcentaje, el de Smarteam sin confirmar o el de un equipo que no sale, no", () => {
    const e = leerElResumen(
      responde({
        datosRojos: [
          { cifra: "14 de 25", texto: "Por cada 25 clientes que ganas, pierdes 14.", area: "3", dimension: "3.8", citas: [{ reunion: "R2", turno: 170, texto: "eran 25 clientes y se nos van 14" }] },
          { cifra: "56 %", texto: "Pierdes el 56 % de lo que ganas.", area: "3", dimension: null, citas: [{ reunion: "R2", turno: 170, texto: "eran 25 clientes y se nos van 14" }] },
          { cifra: "1800 al mes", texto: "Recibes 1800 casos al mes.", area: "3", dimension: null, citas: [{ reunion: "R2", turno: 981, texto: "Okay. 1800 al mes." }] },
          { cifra: "25 de 50", texto: "Tu equipo tiene la mitad de las 50 reuniones de la semana.", area: "2", dimension: null, citas: [{ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }] },
          { cifra: "25 de 50", texto: "Tu equipo tiene 25 de las 50 reuniones que busca cada semana.", area: "1", dimension: "1.7", citas: [{ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }, { reunion: "R1", turno: 198, texto: "son 50 a la semana en grupal" }] },
        ],
        areas: [],
      }),
      CTX,
      REGLAS,
    );
    expect(e.datosRojos.map((d) => d.cifra)).toEqual(["14 de 25", "25 de 50"]);
    expect(e.datosRojos[0].citas[0].confirmo?.texto).toBe("Ajá. Exacto.");
    expect(e.datosRojos[1].dimensionId).toBe("1.7");
    expect(e.descartados.join(" | ")).toMatch(/56/);
    expect(e.descartados.join(" | ")).toMatch(/1800/);
    expect(e.descartados.join(" | ")).toMatch(/no sale \(2\)/);
  });

  it("la cifra que se cayó por una resta se pide corregida con sus citas, y lo corregido se vuelve a verificar", () => {
    const e = leerElResumen(
      responde({ datosRojos: [{ cifra: "11 netos", texto: "Ganas 25 y pierdes 14: te quedan 11.", area: "3", dimension: "3.8", citas: [{ reunion: "R2", turno: 170, texto: "eran 25 clientes y se nos van 14" }] }] }),
      CTX,
      REGLAS,
    );
    expect(e.datosRojos).toEqual([]);
    expect(e.porArreglar).toHaveLength(1);
    expect(e.porArreglar[0].sobran).toEqual(["11·", "11·"]);
    const pedido = pedidoDelArreglo(e.porArreglar);
    expect(JSON.stringify(pedido.messages)).toContain("eran 25 clientes y se nos van 14");
    // Sin las transcripciones: solo las cifras caídas y sus citas.
    expect(JSON.stringify(pedido.messages)).not.toContain("Digamos que 25 25");
    const arreglado = leerElArreglo(
      responde({ datosRojos: [{ i: 0, cifra: "14 de 25", texto: "De cada 25 clientes que ganas, pierdes 14." }, { i: 0, cifra: "otra", texto: "repetida" }, { i: 5, cifra: "9", texto: "x" }] }),
      e.porArreglar,
      REGLAS,
    );
    expect(arreglado.datosRojos).toMatchObject([{ cifra: "14 de 25", areaId: "3", dimensionId: "3.8" }]);
    expect(arreglado.datosRojos[0].citas[0].confirmo?.texto).toBe("Ajá. Exacto.");
    const sigueMal = leerElArreglo(responde({ datosRojos: [{ i: 0, cifra: "11 de 25", texto: "Te quedan 11." }] }), e.porArreglar, REGLAS);
    expect(sigueMal.datosRojos).toEqual([]);
    expect(sigueMal.descartados[0]).toMatch(/11/);
    const juntos = conLoArreglado([{ id: "r1", cifra: "25 de 50", texto: "x", areaId: "1", dimensionId: null, citas: [] }], [...arreglado.datosRojos, { ...arreglado.datosRojos[0] }]);
    expect(juntos.map((d) => [d.id, d.cifra])).toEqual([
      ["r1", "25 de 50"],
      ["r2", "14 de 25"],
    ]);
  });

  it("«1 800» con un espacio es «1800»", () => {
    expect(cifrasDeMas("1 800 tickets al mes", "Okay. 1800 al mes.")).toEqual([]);
    expect(cifrasDeMas("1 800 tickets", "unos 100 al día")).toEqual(["1800·"]);
  });

  it("un volumen no es un dato rojo: si el agente no dice qué se le escapa a la empresa, no sale", () => {
    const cita = [{ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }, { reunion: "R1", turno: 198, texto: "son 50 a la semana en grupal" }];
    const e = leerElResumen(
      responde({
        datosRojos: [
          { cifra: "50 por semana", texto: "Tu equipo busca 50 reuniones por semana.", seEscapa: "", area: "1", dimension: null, citas: cita },
          { cifra: "25 de 50", texto: "Tu equipo tiene 25 de las 50 reuniones que busca.", seEscapa: "la mitad de las reuniones", area: "1", dimension: null, citas: cita },
        ],
      }),
      CTX,
      REGLAS,
    );
    expect(e.datosRojos.map((d) => d.cifra)).toEqual(["25 de 50"]);
    expect(e.descartados.join(" | ")).toMatch(/volumen/);
  });

  it("como mucho tres datos rojos, sin repetir la misma cifra", () => {
    const uno = { cifra: "25 de 50", texto: "Tu equipo tiene 25 de las 50 reuniones.", area: "1", dimension: null, citas: [{ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }, { reunion: "R1", turno: 198, texto: "son 50 a la semana en grupal" }] };
    const e = leerElResumen(responde({ datosRojos: [uno, uno, { ...uno, cifra: "50 por semana" }, { ...uno, cifra: "25 reuniones" }, { ...uno, cifra: "50 reuniones" }] }), CTX, REGLAS);
    expect(e.datosRojos.map((d) => d.cifra)).toEqual(["25 de 50", "50 por semana", "25 reuniones"]);
  });

  it("un hallazgo necesita su cita y no puede traer números que ella no diga; el «por qué» y las preguntas, números que nadie dijo", () => {
    const e = leerElResumen(
      responde({
        areas: [
          {
            area: "1",
            hallazgos: [
              { texto: "Cada asesor llama desde su propio celular: no hay registro de llamadas.", dimension: "1.2", citas: [{ reunion: "R1", turno: 369, texto: "Cada asesor tiene su propio celular, cada uno con un número distinto." }] },
              { texto: "Cada asesor hace 80 llamadas desde su celular.", dimension: "1.2", citas: [{ reunion: "R1", turno: 369, texto: "Cada asesor tiene su propio celular, cada uno con un número distinto." }] },
              { texto: "No hay forma de saber por qué se pierde un negocio.", dimension: "1.8", citas: [{ reunion: "R1", turno: 10, texto: "nunca sabemos por qué perdemos un negocio" }] },
            ],
            porque: "Está en Deficiente porque «Aprendizaje de Ganadas y Perdidas» no existe; el 90 % de lo demás está en Inicial.",
          },
          { area: "3", hallazgos: [], porque: "Está en Inicial." },
          { area: "9", hallazgos: [], porque: "x" },
        ],
        entendimos: ["Que cada asesor usa su propio celular.", "Que pierdes 30 clientes al mes.", "Que soporte recibe 1800 tickets al mes."],
        falta: ["¿Cómo atiendes los 500 clientes con una sola persona en soporte?"],
      }),
      CTX,
      REGLAS,
    );
    expect(e.areas["1"].hallazgos.map((h) => h.texto)).toEqual(["Cada asesor llama desde su propio celular: no hay registro de llamadas."]);
    expect(e.areas["1"].hallazgos[0].citas[0].turno).toBe(369);
    // El «por qué» con un 90 que nadie dijo no sale; Servicio no tiene nivel general, así que no lleva «por qué».
    expect(e.areas["1"].porque).toBeNull();
    expect(e.areas["3"].porque).toBeNull();
    expect(e.areas["9"]).toBeUndefined();
    expect(e.entendimos.map((p) => p.texto)).toEqual(["Que cada asesor usa su propio celular."]);
    expect(e.falta).toHaveLength(1);
  });

  it("lo que lee el cliente: sin voseo, sin nombres de personas, sin precios ni Smarteam", () => {
    const o = { personas: ["Marco Salas", "Emiley Calvo"] };
    expect(textoValido("Tu equipo pierde clientes.", 100, o).ok).toBe(true);
    expect(textoValido("Vos tenés que medirlo.", 100, o).ok).toBe(false);
    expect(textoValido("Como dijo Emiley, se pierden clientes.", 100, o).ok).toBe(false);
    expect(textoValido("El presupuesto no alcanza.", 100, o).ok).toBe(false);
    expect(textoValido("Smarteam lo vio en la reunión.", 100, o).ok).toBe(false);
    expect(textoValido("x".repeat(101), 100, o).ok).toBe(false);
    expect(textoValido("En Servicio, Priorización de Clientes (3.6) quedó sin nivel.", 100, o).ok).toBe(false);
    expect(textoValido("Tu churn ronda el 2.8 % mensual.", 100, o).ok).toBe(true);
  });

  it("el pedido lleva las reuniones numeradas por turno y pide citas palabra por palabra", () => {
    const p = pedidoDelResumen(CTX);
    const texto = JSON.stringify(p.messages);
    expect(texto).toContain("[236] Emiley Calvo Jiménez: Digamos que 25 25 la mitad.");
    expect(String(p.system)).toMatch(/palabra por palabra/);
    expect(p.model).toBe("claude-sonnet-4-6");
  });
});

// ── El armado de la página ──────────────────────────────────────────────────────────────────────────────

const NIVELES = (["D", "I", "F", "E", "O"] as const).map((l, i) => ({ letra: l, nombre: ["Deficiente", "Inicial", "Funcional", "Eficiente", "Óptimo"][i] }));

function resultado(areaId: string, nombre: string, nivel: ResultadoDelTest["nivel"], dims: [string, string, ResultadoDelTest["nivel"]][]): ResultadoDelTest {
  return {
    v: 1,
    escalaVersion: "9.0.0",
    edicion: null,
    areaId,
    areaNombre: nombre,
    version: "marketing",
    nivel,
    nivelNombre: nivel ? NIVELES.find((n) => n.letra === nivel)!.nombre : null,
    puntaje: null,
    capas: [],
    dimensiones: dims.map(([id, n, l]) => ({ id, nombre: n, capa: "base", preguntada: !!l, nivel: l, nivelNombre: l ? NIVELES.find((x) => x.letra === l)!.nombre : null, puntaje: null, noLoSe: false })),
    niveles: NIVELES,
    recomendacion: nivel ? { tipo: "trabajar", dimensionId: dims[dims.length - 1][0], dimensionNombre: dims[dims.length - 1][1], objetivo: "I", objetivoNombre: "Inicial", razon: "", costoDeQuedarse: "" } : null,
    riesgos: [],
    casos: [],
    sintesis: "",
    preguntadas: dims.filter((d) => d[2]).length,
    total: dims.length,
  };
}

const VENTAS = resultado("1", "Ventas", "D", [
  ["1.2", "Comunicación", "I"],
  ["1.7", "Actividad", "I"],
  ["1.8", "Aprendizaje de Ganadas y Perdidas", "D"],
]);
const SERVICIO = resultado("3", "Servicio", null, [["3.8", "Capacidad", null]]);
const CHEQUEO = { "1.2": { nivel: "I", fuente: "reunion" }, "1.8": { nivel: "D", fuente: "hipotesis" } } as unknown as EstadoDeExploracion["contenido"]["chequeo"];
const ENTORNO = { escalaVersion: "9.0.0" };

const CITA = { reunion: "gmeet_servicio", fecha: "2026-11-09T15:00:00.000Z", turno: 170, hablante: "Marco Salas", texto: "eran 25 clientes y se nos van 14", confirmo: { hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." } };

function guardado(): ResumenGuardado {
  return {
    v: 1,
    at: "2026-11-09T18:00:00.000Z",
    por: "marco@smarteamcr.com",
    modelo: "claude-sonnet-4-6",
    agentRunId: "run1",
    hicimos: {
      sesiones: [
        { fecha: "2026-11-05T21:30:00.000Z", equipo: null, minutos: null },
        { fecha: "2026-11-06T20:00:00.000Z", equipo: "Ventas", minutos: 99 },
        { fecha: "2026-11-09T15:00:00.000Z", equipo: "Servicio al cliente", minutos: 75 },
      ],
      personas: 4,
      texto: null,
    },
    datosRojos: [
      { id: "r1", cifra: "14 de 25", texto: "Por cada 25 clientes que ganas, pierdes 14.", areaId: "3", dimensionId: "3.8", citas: [CITA] },
      { id: "r2", cifra: "3 de 4", texto: "De Marketing.", areaId: "2", dimensionId: null, citas: [{ ...CITA, turno: 300, texto: "son 3 de cada 4", confirmo: undefined }] },
    ],
    areas: {
      "1": { hallazgos: [{ id: "h1-1", texto: "Cada asesor llama desde su celular.", dimensionId: "1.2", citas: [{ ...CITA, hablante: "Fernando Segura", texto: "Cada asesor tiene su propio celular" }] }], porque: { texto: "Lo frena el aprendizaje.", firma: firmaDelArea(CHEQUEO, "1", ENTORNO) } },
    },
    entendimos: [{ id: "e1", texto: "Que cada asesor usa su celular." }],
    falta: [{ id: "f1", texto: "¿Qué pasa en Marketing?" }],
  };
}

describe("2 · el cliente nunca ve las citas", () => {
  it("la página del cliente lleva las cifras y la fecha, sin lo dicho ni quién lo dijo; la interna sí lo lleva", () => {
    const afuera = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    const json = JSON.stringify(afuera);
    expect(json).toContain("14 de 25");
    expect(afuera.datosRojos[0].fecha).toBe("2026-11-09T15:00:00.000Z");
    for (const prohibido of ["Marco Salas", "Emiley", "Fernando", "se nos van", "Exacto", "gmeet_servicio", "citas", "cita"]) expect(json).not.toContain(prohibido);
    const adentro = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: true });
    expect(adentro.datosRojos[0].citas?.[0].confirmo?.texto).toBe("Ajá. Exacto.");
    expect(adentro.areas[0].hallazgos[0].citas?.[0].hablante).toBe("Fernando Segura");
  });

  it("la página pública pide el Resumen sin citas y la interna con ellas (escala-para-el-cliente-server.ts)", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "lib/exploraciones/escala-para-el-cliente-server.ts"), "utf8");
    expect(codigo).toMatch(/resumen: resumenParaLaPagina\(estado\.contenido\.resumenDeLaEscala,[\s\S]{0,200}conCitas: !o\.publica,/);
  });

  it("la portada pintada para el cliente no trae citas, y cada dato lleva a su equipo", () => {
    const afuera = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, {
        resumen: afuera,
        empresa: "Centauro Solutions",
        pestanas: [
          { id: "resumen", nombre: "Resumen", href: "/external/escala/t" },
          { id: "1", nombre: "Ventas", href: "/external/escala/t?area=1" },
          { id: "3", nombre: "Servicio", href: "/external/escala/t?area=3" },
        ],
      }),
    );
    expect(html).toContain("14 de 25");
    expect(html).toContain("Lo que hoy se te escapa");
    expect(html).toContain('href="/external/escala/t?area=3"');
    expect(html).toContain("1 · Lo que hicimos");
    expect(html).toContain("¿Entendimos bien?");
    expect(html).not.toContain("Marco Salas");
    expect(html).not.toContain("Solo lo ves tú");
    // El dato de Marketing no sale: Marketing no está en la página.
    expect(html).not.toContain("3 de 4");
  });
});

describe("3 · el armado", () => {
  it("lo que hicimos: suma la duración real, dice «más de» si una reunión no la tiene, y cuenta equipos y personas", () => {
    const h = loQueHicimos(guardado().hicimos)!;
    expect(h).toMatchObject({ sesiones: 3, minutos: 174, sinDuracion: 1, equipos: ["Ventas", "Servicio al cliente"], personas: 4, mano: false });
    expect(h.texto).toBe(
      "Nos dedicaste más de 2 h 54 min en 3 sesiones con Ventas y Servicio al cliente, con 4 personas de tu equipo. Todo lo que ves en esta página sale de lo que nos contaste ahí.",
    );
    expect(enHoras(45)).toBe("45 min");
    expect(enHoras(120)).toBe("2 h");
    expect(loQueHicimos({ sesiones: [], personas: 0, texto: null })).toBeNull();
  });

  it("la duración de una reunión es la de la conferencia; si no es creíble o no está, la del evento", () => {
    const d = (a: string, b: string) => ({ duration: 60, conferenciaInicio: new Date(a), conferenciaFin: new Date(b) });
    expect(minutosDeLaReunion(d("2026-11-06T19:56:09Z", "2026-11-06T21:34:40Z"))).toBe(99);
    expect(minutosDeLaReunion(d("2026-11-06T19:00:00Z", "2026-11-07T19:00:00Z"))).toBe(60);
    expect(minutosDeLaReunion({ duration: 0, conferenciaInicio: null, conferenciaFin: null })).toBeNull();
  });

  it("dónde queda: el «por qué» vigente sale; si los niveles cambiaron, sale el de los datos y adentro se avisa", () => {
    const hoy = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(hoy.areas[0]).toMatchObject({ porque: "Lo frena el aprendizaje.", origenDelPorque: "agente", porqueViejo: false });
    expect(hoy.areas[1]).toMatchObject({ nivel: null, porque: null, origenDelPorque: null });
    const otroChequeo = { ...CHEQUEO, "1.8": { nivel: "I", fuente: "reunion" } } as unknown as typeof CHEQUEO;
    const despues = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], otroChequeo, ENTORNO, { conCitas: false });
    expect(despues.areas[0]).toMatchObject({ origenDelPorque: "respaldo", porqueViejo: true });
    expect(despues.areas[0].porque).toBe(porqueDeRespaldo(VENTAS));
  });

  it("el «por qué» de los datos: qué lo frena para subir y qué lo sostiene", () => {
    // Deficiente es el piso: solo dice qué lo frena para subir.
    expect(porqueDeRespaldo(VENTAS)).toBe("No llega a Inicial porque «Aprendizaje de Ganadas y Perdidas» sigue en Deficiente.");
    const inicial = resultado("1", "Ventas", "I", [
      ["1.2", "Comunicación", "F"],
      ["1.8", "Aprendizaje", "I"],
    ]);
    expect(porqueDeRespaldo(inicial)).toBe("No llega a Funcional porque «Aprendizaje» sigue en Inicial. No está más abajo porque «Comunicación» ya opera en Funcional.");
    expect(porqueDeRespaldo(SERVICIO)).toBeNull();
  });

  it("sin Resumen armado, la página tiene «Dónde quedan» y nada más", () => {
    const vacio = resumenParaLaPagina(null, [VENTAS], CHEQUEO, ENTORNO, { conCitas: false });
    expect(vacio).toMatchObject({ at: null, hicimos: null, datosRojos: [], entendimos: [], falta: [] });
    expect(vacio.areas[0].porque).toBe(porqueDeRespaldo(VENTAS));
  });
});

describe("4 · se edita en su lugar y «Rehacer con IA» no pisa lo escrito", () => {
  const o = { firmaDe: () => "firma-nueva", areas: new Set(["1", "2", "3"]), en: "2026-11-10T10:00:00.000Z" };

  it("cada texto se cambia, se quita o se agrega; lo editado queda a mano", () => {
    const g = guardado();
    const r1 = editarElResumen(g, "hallazgo:1:h1-1", "Cada asesor llama desde su propio celular.", o);
    expect(r1.ok && r1.resumen.areas["1"].hallazgos[0]).toMatchObject({ texto: "Cada asesor llama desde su propio celular.", mano: true });
    const r2 = editarElResumen(g, "hallazgo:1:h1-1", null, o);
    expect(r2.ok && r2.resumen.areas["1"].hallazgos).toEqual([]);
    const r3 = editarElResumen(g, "hallazgo:3:nuevo", "Un solo agente atiende 500 clientes.", o);
    expect(r3.ok && r3.resumen.areas["3"].hallazgos[0]).toMatchObject({ texto: "Un solo agente atiende 500 clientes.", citas: [], mano: true });
    const r4 = editarElResumen(g, "porque:1", "Porque nadie mira lo perdido.", o);
    expect(r4.ok && r4.resumen.areas["1"].porque).toEqual({ texto: "Porque nadie mira lo perdido.", firma: "firma-nueva", mano: true });
    const r5 = editarElResumen(g, "rojo:r1:cifra", "14 de cada 25", o);
    expect(r5.ok && r5.resumen.datosRojos[0]).toMatchObject({ cifra: "14 de cada 25", mano: true });
    const r6 = editarElResumen(g, "rojo:r1", null, o);
    expect(r6.ok && r6.resumen.datosRojos.map((d) => d.id)).toEqual(["r2"]);
    const r7 = editarElResumen(g, "hicimos", "Gracias por las tres sesiones.", o);
    expect(r7.ok && loQueHicimos(r7.resumen.hicimos)).toMatchObject({ texto: "Gracias por las tres sesiones.", mano: true });
    const r8 = editarElResumen(g, "falta:nuevo", "¿Quién decide?", o);
    expect(r8.ok && r8.resumen.falta.map((p) => p.texto)).toEqual(["¿Qué pasa en Marketing?", "¿Quién decide?"]);
  });

  it("no deja una cifra vacía, un texto de más ni una clave que no existe", () => {
    const g = guardado();
    expect(editarElResumen(g, "rojo:r1:cifra", "", o).ok).toBe(false);
    expect(editarElResumen(g, "rojo:r1:cifra", "x".repeat(40), o).ok).toBe(false);
    expect(editarElResumen(g, "hallazgo:9:nuevo", "x", o).ok).toBe(false);
    expect(editarElResumen(g, "hallazgo:1:h-que-no-esta", "x", o).ok).toBe(false);
    expect(editarElResumen(g, "nivel:1", "Óptimo", o).ok).toBe(false);
  });

  it("al rehacer, lo de la persona se queda (también si choca de id o repite la cifra) y lo demás es lo nuevo", () => {
    const antes = guardado();
    antes.datosRojos[0] = { ...antes.datosRojos[0], texto: "Lo escribió Marco.", mano: true };
    antes.areas["1"] = { hallazgos: [{ ...antes.areas["1"].hallazgos[0], texto: "Hallazgo de Marco", mano: true }], porque: { texto: "Su porqué", firma: "x", mano: true } };
    antes.hicimos.texto = "Gracias.";
    antes.entendimos = [{ id: "e1", texto: "La de Marco", mano: true }];
    const nuevo = guardado();
    nuevo.datosRojos = [
      { ...nuevo.datosRojos[0], id: "r1", cifra: "14 de 25" },
      { id: "r2", cifra: "25 de 50", texto: "Nuevo", areaId: "1", dimensionId: null, citas: [{ ...CITA, turno: 236 }] },
      { id: "r1", cifra: "3 días", texto: "Choca de id", areaId: "3", dimensionId: null, citas: [{ ...CITA, turno: 400 }] },
    ];
    nuevo.areas["1"] = { hallazgos: [{ id: "h1-1", texto: "Nuevo hallazgo", dimensionId: null, citas: [{ ...CITA, turno: 500 }] }], porque: { texto: "Porqué nuevo", firma: "y" } };
    nuevo.entendimos = [{ id: "e1", texto: "Nueva" }];
    const j = juntarConLoEditado(nuevo, antes);
    expect(j.datosRojos.map((d) => [d.id, d.cifra, d.texto])).toEqual([
      ["r1", "14 de 25", "Lo escribió Marco."],
      ["r2", "25 de 50", "Nuevo"],
      ["r1-2", "3 días", "Choca de id"],
    ]);
    expect(j.areas["1"].hallazgos.map((h) => [h.id, h.texto])).toEqual([
      ["h1-1", "Hallazgo de Marco"],
      ["h1-1-2", "Nuevo hallazgo"],
    ]);
    expect(j.areas["1"].porque?.texto).toBe("Su porqué");
    expect(j.hicimos.texto).toBe("Gracias.");
    expect(j.entendimos.map((p) => p.id)).toEqual(["e1", "e1-2"]);
  });

  it("la operación vive en la exploración: no sube la versión, el esquema la acepta y la lectura del Json la conserva", () => {
    const VALIDEZ: Validez = { dimensiones: new Set(["1.2"]), criterios: new Set(), areas: new Set(["1", "2", "3"]), ediciones: new Set(), escalaVersion: "9.0.0" };
    const base: EstadoDeExploracion = { contenido: { ...contenidoVacio(), resumenDeLaEscala: guardado() }, propuesta: propuestaVacia(), areas: ["1"], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false };
    const r = aplicarOperaciones(base, [{ op: "resumenDeLaEscala", clave: "entendimos:e1", texto: "Que el seguimiento depende de cada asesor." }], VALIDEZ, VALIDADOR_ESTRICTO);
    expect(r.ok && r.estado.contenido.resumenDeLaEscala?.entendimos[0]).toMatchObject({ texto: "Que el seguimiento depende de cada asesor.", mano: true });
    expect(r.ok && cambioLoConfirmado(base, r.estado)).toBe(false);
    const sin = aplicarOperaciones({ ...base, contenido: contenidoVacio() }, [{ op: "resumenDeLaEscala", clave: "hicimos", texto: "x" }], VALIDEZ, VALIDADOR_ESTRICTO);
    expect(sin.ok).toBe(false);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "resumenDeLaEscala", clave: "rojo:r1:cifra", texto: "14 de 25" }] }).success).toBe(true);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "resumenDeLaEscala", clave: "nivel:1", texto: "x" }] }).success).toBe(false);
    expect(leerContenido({ resumenDeLaEscala: guardado() }).resumenDeLaEscala).toEqual(guardado());
    // Un Json roto no tumba la lectura: se ignora.
    expect(leerContenido({ resumenDeLaEscala: { v: 1, datosRojos: "x" } }).resumenDeLaEscala).toBeUndefined();
  });
});

describe("5 · el cuadro de texto ocupa el lugar del texto (9 nov)", () => {
  it("crece hasta el alto de lo escrito, sin barra, y nunca queda más chico que el texto que reemplazó", () => {
    const el = { style: { height: "" }, offsetHeight: 30, clientHeight: 28, scrollHeight: 120 } as unknown as HTMLTextAreaElement;
    ajustarAlto(el, 50);
    expect(el.style.height).toBe("122px");
    const corto = { style: { height: "" }, offsetHeight: 30, clientHeight: 28, scrollHeight: 20 } as unknown as HTMLTextAreaElement;
    ajustarAlto(corto, 50);
    expect(corto.style.height).toBe("50px");
  });

  it("el CSS ya no le pone un alto fijo ni una barra al cuadro", () => {
    const css = fs.readFileSync(path.join(RAIZ, "components/external/test/resultado.css"), "utf8");
    const regla = css.split(/\r?\n/).find((l) => l.startsWith(".dr .rd-editor textarea"))!;
    expect(regla).toMatch(/overflow: hidden/);
    expect(regla).toMatch(/resize: none/);
    expect(regla).not.toMatch(/min-height: (?!0)/);
    expect(css).not.toMatch(/rd-tip\[data-fijada\] \.rd-editor textarea/);
  });
});

describe("7 · lo que encontró la revisión del 9 nov", () => {
  const T = (n: number, hablante: string, texto: string) => ({ n, hablante, texto });
  const reunion = (turnos: ReturnType<typeof T>[], delCliente = ["Ana Mora"]): ReunionParaElResumen => ({ id: "r", clave: "R1", fecha: "2026-11-09T15:00:00.000Z", equipo: "Ventas", delCliente, turnos });

  it("una cifra partida: el «Sí, correcto» del medio no confirma si la empresa después dice que no", () => {
    const r = reunion([
      T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"),
      T(11, "Ana Mora", "Sí, correcto."),
      T(12, "Marco Salas", "y de esos pierden como 14 cada mes"),
      T(13, "Ana Mora", "No, no tanto, unos cinco."),
    ]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [r])).toBeNull();
    // La misma cifra entera, confirmada después de su última parte, sí vale.
    const ok = reunion([T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"), T(11, "Ana Mora", "Mhm."), T(12, "Marco Salas", "y de esos pierden como 14 cada mes"), T(13, "Ana Mora", "Sí, exacto.")]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [ok])?.confirmo?.texto).toBe("Sí, exacto.");
  });

  it("un «Okay» o un «Ajá» solos no confirman, y alguien de Smarteam no confirma a otro de Smarteam", () => {
    const dicho = T(10, "Marco Salas", "Entonces son unos 1800 tickets al mes");
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Okay.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Ajá.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Andrés Pérez", "Sí, exacto.")]), 10)).toBeNull();
    // La primera respuesta de la empresa manda: si no confirma, no se busca más abajo.
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Bueno, depende del mes."), T(12, "Ana Mora", "Sí.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Sí, exacto.")]), 10)?.texto).toBe("Sí, exacto.");
  });

  it("sin saber quién habló (notas de Gemini, o la reunión sin hablantes), nadie cuenta como de la empresa", () => {
    const notas = reunion([T(1, "Pérdida de clientes", "Marco calculó que se van 1800 tickets al mes por soporte")], []);
    expect(citaVerificada({ reunion: "R1", turno: 1, texto: "se van 1800 tickets al mes por soporte" }, [notas])).toBeNull();
  });

  it("los números en palabras también se comparan con la cita: «trece», «la mitad»", () => {
    expect(cifrasDeMas("pierdes trece clientes", "se nos van 14 clientes")).toEqual(["trece"]);
    expect(cifrasDeMas("pierdes la mitad", "se van 14 de 25")).toEqual(["mitad"]);
    expect(cifrasDeMas("la mitad de las reuniones", "Digamos que 25 25 la mitad.")).toEqual([]);
    expect(cifrasDeMas("dieciséis por semana", "son 16 a la semana")).toEqual([]);
  });

  it("un dato rojo sin número no sale", () => {
    const e = leerElResumen(
      responde({ datosRojos: [{ cifra: "Muchos clientes", texto: "Pierdes muchos clientes.", seEscapa: "clientes", area: "1", dimension: null, citas: [{ reunion: "R1", turno: 236, texto: "Digamos que 25 25 la mitad." }] }] }),
      CTX,
      REGLAS,
    );
    expect(e.datosRojos).toEqual([]);
    expect(e.descartados.join(" ")).toMatch(/sin número/);
  });

  it("ningún texto habla de un equipo que el cliente no ve", () => {
    const e = leerElResumen(responde({ areas: [], falta: ["¿Qué mide hoy Marketing?", "¿Quién decide en Ventas?"] }), CTX, { ...REGLAS, areasFuera: ["Marketing"] });
    expect(e.falta.map((p) => p.texto)).toEqual(["¿Quién decide en Ventas?"]);
  });

  const o = { firmaDe: () => "f", areas: new Set(["1", "2", "3"]), en: "2026-11-10T10:00:00.000Z" };

  it("una cifra editada a mano que la cita ya no sostiene pierde la cita (y la fecha que ve el cliente)", () => {
    const g = guardado();
    const r = editarElResumen(g, "rojo:r1:cifra", "20 de 25", o);
    expect(r.ok && r.resumen.datosRojos[0]).toMatchObject({ cifra: "20 de 25", citas: [], mano: true });
    const afuera = r.ok ? resumenParaLaPagina(r.resumen, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false }) : null;
    expect(afuera?.datosRojos[0].fecha).toBeNull();
    // Con los mismos números, la cita sigue.
    const igual = editarElResumen(g, "rojo:r1:texto", "Ganas 25 clientes y se van 14.", o);
    expect(igual.ok && igual.resumen.datosRojos[0].citas).toHaveLength(1);
  });

  it("lo que una persona quitó no vuelve al rehacer con IA", () => {
    let g = guardado();
    for (const clave of ["rojo:r1", "hallazgo:1:h1-1", "falta:f1"]) {
      const r = editarElResumen(g, clave, null, o);
      if (!r.ok) throw new Error(r.error);
      g = r.resumen;
    }
    const nuevo = guardado();
    nuevo.areas["1"].hallazgos[0] = { ...nuevo.areas["1"].hallazgos[0], texto: "Dicho con otras palabras" };
    const j = juntarConLoEditado(nuevo, g);
    expect(j.datosRojos.map((d) => d.cifra)).toEqual(["3 de 4"]);
    expect(j.areas["1"].hallazgos).toEqual([]);
    expect(j.falta).toEqual([]);
    expect(j.quitados).toHaveLength(3);
  });

  it("agregar tiene tope, y un Json que se pasa de los topes viejos no se pierde entero", () => {
    let g = guardado();
    for (let i = 0; i < 7; i++) {
      const r = editarElResumen(g, "falta:nuevo", `Pregunta ${i}`, { ...o, en: new Date(Date.parse(o.en) + i * 1000).toISOString() });
      if (!r.ok) throw new Error(r.error);
      g = r.resumen;
    }
    expect(g.falta).toHaveLength(8);
    expect(editarElResumen(g, "falta:nuevo", "Una más", o).ok).toBe(false);
    const muchas = { ...guardado(), entendimos: Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, texto: `x${i}` })) };
    expect(leerContenido({ resumenDeLaEscala: muchas }).resumenDeLaEscala?.entendimos).toHaveLength(13);
  });

  it("«Lo que hicimos» no cuenta las sesiones de un equipo que el cliente no ve, ni su gente", () => {
    const g = guardado();
    g.hicimos.sesiones = [
      { fecha: "2026-11-06T20:00:00.000Z", equipo: "Ventas", minutos: 99, areaId: "1", quienes: ["ana", "luis"] },
      { fecha: "2026-11-07T20:00:00.000Z", equipo: "Marketing", minutos: 60, areaId: "2", quienes: ["carla"] },
      { fecha: "2026-11-09T15:00:00.000Z", equipo: null, minutos: null, areaId: null, quienes: [] },
    ];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(p.hicimos).toMatchObject({ sesiones: 2, minutos: 99, equipos: ["Ventas"], personas: 2 });
    expect(p.hicimos?.texto).not.toMatch(/Marketing/);
  });

  it("afuera no sale una columna de la validación sin preguntas", () => {
    const g = { ...guardado(), falta: [] };
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, { resumen: resumenParaLaPagina(g, [VENTAS], CHEQUEO, ENTORNO, { conCitas: false }), empresa: "X", pestanas: [{ id: "resumen", nombre: "Resumen", href: "#" }] }),
    );
    expect(html).toContain("¿Entendimos bien?");
    expect(html).not.toContain("¿Falta algo?");
  });

  describe("la corrida: reintento, arreglo y lo que no se guarda", () => {
    const LE = { ctx: CTX, personas: REGLAS.personas, firmas: REGLAS.firmas };
    const usage = { input_tokens: 10, output_tokens: 5 } as never;
    const resp = (x: unknown, stop: "end_turn" | "max_tokens" = "end_turn") => ({ ...responde(x), usage, stop_reason: stop });
    const bueno = {
      areas: [{ area: "1", hallazgos: [], porque: "" }],
      datosRojos: [{ cifra: "11 netos", texto: "Te quedan 11.", seEscapa: "clientes", area: "3", dimension: null, citas: [{ reunion: "R2", turno: 170, texto: "eran 25 clientes y se nos van 14" }] }],
    };

    it("si se corta, se pide otra vez; la cifra caída por un número de más se arregla en una llamada chica", async () => {
      const pedidos: string[] = [];
      const respuestas = [resp({}, "max_tokens"), resp(bueno), resp({ datosRojos: [{ i: 0, cifra: "14 de 25", texto: "De 25 que ganas, se van 14." }] })];
      const e = await escribirElResumen(LE, async (p) => {
        pedidos.push(p.max_tokens === 800 ? "arreglo" : "resumen");
        return respuestas.shift()!;
      });
      expect(pedidos).toEqual(["resumen", "resumen", "arreglo"]);
      expect(e.cortado).toBe(false);
      expect(e.datosRojos.map((d) => d.cifra)).toEqual(["14 de 25"]);
      expect(e.usos).toHaveLength(3);
    });

    it("cortado dos veces: no se guarda nada (cortado) y no se gasta en el arreglo", async () => {
      let llamadas = 0;
      const e = await escribirElResumen(LE, async () => {
        llamadas++;
        return resp(bueno, "max_tokens");
      });
      expect(e.cortado).toBe(true);
      expect(llamadas).toBe(2);
    });
  });
});

describe("8 · la segunda revisión del 9 nov", () => {
  const T = (n: number, hablante: string, texto: string) => ({ n, hablante, texto });
  const reunion = (turnos: ReturnType<typeof T>[]): ReunionParaElResumen => ({ id: "r", clave: "R1", fecha: "2026-11-09T15:00:00.000Z", equipo: "Ventas", delCliente: ["Ana Mora"], turnos });
  const o = { firmaDe: () => "f", areas: new Set(["1", "2", "3"]), en: "2026-11-10T10:00:00.000Z" };

  it("quitar un texto largo escrito a mano no tumba el Resumen: se lee pieza por pieza", () => {
    let g = guardado();
    const largo = "¿".concat("Cuánto tiempo pasa ".repeat(28), "?").slice(0, 590);
    let r = editarElResumen(g, "falta:nuevo", largo, o);
    if (!r.ok) throw new Error(r.error);
    g = r.resumen;
    r = editarElResumen(g, `falta:${g.falta[1].id}`, null, o);
    if (!r.ok) throw new Error(r.error);
    const leido = leerContenido({ resumenDeLaEscala: r.resumen }).resumenDeLaEscala;
    expect(leido?.datosRojos).toHaveLength(2);
    expect(leido?.quitados).toHaveLength(1);
    // Una pieza rota se cae sola; lo demás queda.
    const roto = { ...guardado(), datosRojos: [{ id: "malo" }, ...guardado().datosRojos], quitados: ["x".repeat(900), "falta:bien"] };
    const l2 = leerContenido({ resumenDeLaEscala: roto }).resumenDeLaEscala;
    expect(l2?.datosRojos.map((d) => d.id)).toEqual(["r1", "r2"]);
    expect(l2?.quitados).toEqual(["falta:bien"]);
  });

  it("una cifra o un hallazgo corregidos a mano no vuelven con el valor del agente al rehacer (misma cita de origen)", () => {
    const g = guardado();
    const r = editarElResumen(g, "rojo:r1:cifra", "12 de 25", o);
    if (!r.ok) throw new Error(r.error);
    expect(r.resumen.datosRojos[0]).toMatchObject({ citas: [], origen: "gmeet_servicio:170" });
    const j = juntarConLoEditado(guardado(), r.resumen);
    expect(j.datosRojos.map((d) => d.cifra)).toEqual(["12 de 25", "3 de 4"]);
  });

  it("lo quitado no vuelve aunque el agente lo escriba con otras palabras", () => {
    let g = guardado();
    for (const clave of ["rojo:r1", "entendimos:e1"]) {
      const r = editarElResumen(g, clave, null, o);
      if (!r.ok) throw new Error(r.error);
      g = r.resumen;
    }
    const nuevo = guardado();
    nuevo.datosRojos[0] = { ...nuevo.datosRojos[0], id: "r7", cifra: "14 de cada 25" };
    nuevo.entendimos = [{ id: "e9", texto: "Que cada asesor usa su propio celular." }, { id: "e8", texto: "Que el soporte tarda un mes en Vietnam." }];
    const j = juntarConLoEditado(nuevo, g);
    expect(j.datosRojos.map((d) => d.cifra)).toEqual(["3 de 4"]);
    expect(j.entendimos.map((p) => p.id)).toEqual(["e8"]);
  });

  it("entre las partes de una cifra la empresa solo pudo confirmar: «Menos.» la niega aunque no diga «no»", () => {
    const r = reunion([T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"), T(11, "Ana Mora", "Menos."), T(12, "Marco Salas", "y de esos pierden como 14 cada mes"), T(13, "Ana Mora", "Sí, exacto.")]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [r])).toBeNull();
  });

  it("«¿Sí?» es duda, no confirma", () => {
    expect(confirmacion(reunion([T(10, "Marco Salas", "Entonces son unos 1800 tickets al mes"), T(11, "Ana Mora", "¿Sí?")]), 10)).toBeNull();
  });

  it("más cantidades en palabras: «un millón», «mil clientes», «una cuarta parte»; «25 mil» se mira una sola vez", () => {
    expect(cifrasDeMas("casi un millón al año", "perdemos bastante")).toEqual(["millon"]);
    expect(cifrasDeMas("mil clientes", "tenemos 500 clientes")).toEqual(["mil"]);
    expect(cifrasDeMas("una cuarta parte", "se van 14")).toEqual(["cuarta"]);
    expect(cifrasDeMas("25 mil al mes", "facturamos 25 mil al mes")).toEqual([]);
  });

  it("una pregunta que nombra un equipo que el cliente ya no ve no sale (se armó cuando sí lo veía)", () => {
    const g = { ...guardado(), falta: [{ id: "f1", texto: "¿Qué mide hoy Marketing?" }, { id: "f2", texto: "¿Quién decide en Ventas?" }] };
    const p = resumenParaLaPagina(g, [VENTAS], CHEQUEO, ENTORNO, { conCitas: false, areasFuera: ["Marketing", "Servicio"] });
    expect(p.falta.map((x) => x.id)).toEqual(["f2"]);
  });

  it("cada corrida marca sus ids: desde una pantalla vieja, «quitar r1» no quita otra pieza", () => {
    const g = guardado();
    const marcado = conIdsDeLaCorrida(g, "k3x9");
    expect(marcado.datosRojos.map((d) => d.id)).toEqual(["r1-k3x9", "r2-k3x9"]);
    expect(marcado.areas["1"].hallazgos[0].id).toBe("h1-1-k3x9");
    expect(editarElResumen({ ...g, ...marcado }, "rojo:r1", null, o)).toMatchObject({ ok: false, error: "Ese dato ya no está." });
  });

  it("qué reuniones lee: solo con transcripción y de equipos que ve el cliente; y quién es de la empresa", () => {
    const fuentes = [
      { id: "nueva", areaId: "1" },
      { id: "de-marketing", areaId: "2" },
      { id: "solo-notas", areaId: "1" },
      { id: "sin-equipo", areaId: null },
      { id: "vieja", areaId: "3" },
    ];
    const leidas = reunionesQueLee(fuentes, new Set(["nueva", "de-marketing", "sin-equipo", "vieja"]), new Set(["1", "3"]));
    expect(leidas.map((r) => r.id)).toEqual(["vieja", "sin-equipo", "nueva"]);
    expect(delClienteDe([{ nombre: "Ana Mora", lado: "cliente" }, { nombre: "Smarteam's Notetaker", lado: "cliente" }, { nombre: "Marco Salas", lado: "smarteam" }])).toEqual(["Ana Mora"]);
  });

  it("si el arreglo de las cifras falla, se guarda lo que ya se pagó", async () => {
    const usage = { input_tokens: 10, output_tokens: 5 } as never;
    const bueno = {
      areas: [{ area: "1", hallazgos: [], porque: "" }],
      datosRojos: [{ cifra: "11 netos", texto: "Te quedan 11.", seEscapa: "clientes", area: "3", dimension: null, citas: [{ reunion: "R2", turno: 170, texto: "eran 25 clientes y se nos van 14" }] }],
    };
    let n = 0;
    const e = await escribirElResumen({ ctx: CTX, personas: REGLAS.personas, firmas: REGLAS.firmas }, async () => {
      n++;
      if (n === 2) throw new Error("overloaded");
      return { ...responde(bueno), usage, stop_reason: "end_turn" as const };
    });
    expect(e.cortado).toBe(false);
    expect(e.areas["1"]).toBeDefined();
    expect(e.descartados.join(" ")).toMatch(/arreglo/);
  });

  it("un hallazgo editado con un número que su cita no dice pierde la cita", () => {
    const g = guardado();
    g.areas["1"].hallazgos[0] = { ...g.areas["1"].hallazgos[0], texto: "Cierra 14 de 25.", citas: [{ ...CITA, texto: "eran 25 clientes y se nos van 14" }] };
    const r = editarElResumen(g, "hallazgo:1:h1-1", "Cierra 20 de 25.", o);
    expect(r.ok && r.resumen.areas["1"].hallazgos[0]).toMatchObject({ citas: [], origen: "gmeet_servicio:170" });
    const igual = editarElResumen(g, "hallazgo:1:h1-1", "De 25 clientes, se van 14.", o);
    expect(igual.ok && igual.resumen.areas["1"].hallazgos[0].citas).toHaveLength(1);
  });
});

describe("6 · lo que se quitó el 9 nov", () => {
  it("no queda el botón «Qué ve el cliente» ni la vista «Mapa» de La escala", () => {
    const paso = fs.readFileSync(path.join(RAIZ, "components/exploraciones/PasoEscala.tsx"), "utf8");
    const acceso = fs.readFileSync(path.join(RAIZ, "components/exploraciones/AccesoALaEscala.tsx"), "utf8");
    expect(paso).not.toMatch(/QueVeElCliente|RuedaDelEquipo|"mapa"/);
    expect(acceso).not.toMatch(/export function QueVeElCliente/);
    expect(fs.existsSync(path.join(RAIZ, "components/exploraciones/RuedaDelEquipo.tsx"))).toBe(false);
  });
});
