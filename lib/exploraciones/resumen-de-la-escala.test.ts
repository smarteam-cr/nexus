/**
 * lib/exploraciones/resumen-de-la-escala.test.ts — el Resumen de la escala que ve el cliente (9 nov; resumen ejecutivo
 * desde el 10 nov). Correr: `npx vitest run lib/exploraciones/resumen-de-la-escala.test.ts --project unit`.
 *
 * Lo que cuida, en orden de lo que más duele si se rompe:
 *   1. NINGUNA AFIRMACIÓN SIN SU CITA: un número que nadie dijo, que dijo solo Smarteam (sin que la empresa lo confirme),
 *      que el modelo calculó, o una herramienta que la empresa no nombró, no sale. Una cifra que resumió Smarteam y la
 *      empresa confirmó es «estimada», nunca «declarada». Las citas de Centauro (9 nov) son las del caso real.
 *   2. El cliente nunca ve las citas ni quién habló.
 *   3. El armado: las cinco partes, el nivel provisional, los equipos sin explorar (nunca como mal resultado) y que un
 *      Resumen del formato 1 (9 nov) se siga pintando y editando.
 *   4. Las ediciones en su lugar, que «Rehacer con IA» no pisa.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArribaDeLaEscala, enSuOrden } from "@/components/external/test/ArribaDeLaEscala";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { ajustarAlto } from "@/components/external/test/TextoEditableDeLaPagina";
import { parseObject } from "@/lib/ai/section-schema";
import { nivelProvisional } from "@/lib/external/pagina-del-resumen";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { aplicarOperaciones, cambioLoConfirmado, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { firmaDelArea } from "./descripcion-de-la-escala";
import { logoQueSeSirve } from "./escala-para-el-cliente";
import { CambiosSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import {
  cifrasDeMas,
  auditarElResumen,
  avisosDelRecorrido,
  citaVerificada,
  concluyeDeMas,
  sinLaConclusion,
  conIdsDeLaCorrida,
  conLoArreglado,
  confirmacion,
  delClienteDe,
  editarElResumen,
  enHoras,
  esDeOtraEmpresa,
  escribirElResumen,
  estadoDeLaCifra,
  guiaDelEquipo,
  herramientasDeMas,
  juntarConLoEditado,
  lecturaNuestra,
  leerElArreglo,
  leerElResumen,
  loQueHicimos,
  minutosDeLaReunion,
  NOTA_DE_LO_RESUMIDO,
  NOTA_DE_MEMORIA,
  NOTA_DE_VARIOS_NUMEROS,
  numerosDistintos,
  numerosDeOtroDicho,
  pedidoDelArreglo,
  pedidoDelResumen,
  porqueDeRespaldo,
  resumenParaLaPagina,
  reunionesQueLee,
  textoValido,
  type AreaOperativa,
  type LoQueEscribioElAgente,
  type ContextoDelResumen,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";
import {
  loDeSusReuniones,
  citasVerificadas,
  conLasPiezas,
  equiposSinEtapa,
  problemasDeLaCifra,
  quitarLoQueNoPasa,
  voseoDelResumen,
} from "./resumen-de-la-escala";

const RAIZ = process.cwd();

// ── Las reuniones de Centauro (turnos reales, recortados) ───────────────────────────────────────────────────

const R2: ReunionParaElResumen = {
  id: "gmeet_servicio",
  clave: "R2",
  fecha: "2026-11-09T15:00:00.000Z",
  equipo: "Servicio al cliente",
  delCliente: ["Emiley Calvo Jiménez", "Luis Humberto Rodríguez Acevedo"],
  turnos: [
    { n: 59, hablante: "Emiley Calvo Jiménez", texto: "tengo otro en soporte. Estamos viendo si ampliamos un poco más soporte, porque, o sea, si son 500 clientes y solo uno atendiendo tickets es bastante complicado." },
    { n: 160, hablante: "Marco Salas", texto: "¿Y qué tanto qué tanto ch hay ahorita?" },
    { n: 161, hablante: "Emiley Calvo Jiménez", texto: "Mm, si tenemos algo como un 2,8% si no me equivoco, por ahí." },
    { n: 162, hablante: "Marco Salas", texto: "mensual." },
    { n: 163, hablante: "Emiley Calvo Jiménez", texto: "Sí." },
    { n: 164, hablante: "Marco Salas", texto: "Okay. Que digamos de 500 es un buen número, ¿verdad?" },
    { n: 165, hablante: "Emiley Calvo Jiménez", texto: "Sí, no," },
    { n: 170, hablante: "Marco Salas", texto: "Sí, porque es que digamos si estamos captando como cuántos clientes eran 25 clientes y se nos van 14, ¿verdad?" },
    { n: 171, hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." },
    { n: 300, hablante: "Luis Humberto Rodríguez Acevedo", texto: "en los primeros tres meses yo reviso uno por uno los accesos y las reservas de cada hospedaje en la extranet, a mano." },
    { n: 310, hablante: "Emiley Calvo Jiménez", texto: "tenemos videos, transcripciones y manuales para que el cliente se capacite solo." },
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
    { n: 20, hablante: "Fernando Segura", texto: "vendemos productos para hospedajes, hoteles pequeños y medianos, con una suscripción mensual por propiedad." },
    { n: 21, hablante: "Fernando Segura", texto: "la parte de desarrollo de software es otra división, eso no entra aquí." },
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
  guia: "Retos anotados:\n- CRM lead-driven",
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

const REGLAS = { personas: ["Marco Salas", "Emiley Calvo Jiménez", "Fernando Segura", "Luis Humberto Rodríguez Acevedo"], parse: parseObject, firmas: { "1": "firma-de-ventas" } };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });
const C = (reunion: string, turno: number, texto: string) => ({ reunion, turno, texto });

/** Un área operativa del agente, con lo mínimo. */
const area = (x: Record<string, unknown>) => ({ nombre: "Customer Success", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null, ...x });

describe("1 · ninguna afirmación sin su cita", () => {
  it("una cita dicha por alguien de la empresa vale; la que no está en la reunión, o es de tres palabras, no", () => {
    expect(citaVerificada(C("R1", 236, "Digamos que 25 25 la mitad."), CTX.reuniones)?.hablante).toBe("Emiley Calvo Jiménez");
    // El número de turno equivocado no importa: se busca en la conversación entera.
    expect(citaVerificada(C("R1", 1, "son 50 a la semana en grupal"), CTX.reuniones)?.turno).toBe(198);
    expect(citaVerificada(C("R1", 236, "Digamos que 40 son la mitad de todo"), CTX.reuniones)).toBeNull();
    expect(citaVerificada(C("R1", 369, "desde celular WhatsApp"), CTX.reuniones)).toBeNull();
    expect(citaVerificada(C("R9", 236, "Digamos que 25 25 la mitad."), CTX.reuniones)).toBeNull();
  });

  it("lo que dijo Smarteam solo vale si la empresa lo confirma justo después («Ajá. Exacto.»), no con «Sí, no,» ni con «Okay»", () => {
    const c = citaVerificada(C("R2", 170, "si estamos captando como cuántos clientes eran 25 clientes y se nos van 14"), CTX.reuniones);
    expect(c?.hablante).toBe("Marco Salas");
    expect(c?.confirmo).toEqual({ hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." });
    expect(confirmacion(R2, 164)).toBeNull();
    // «1800 al mes» lo dijo Marco y nadie lo confirmó: no sale (Centauro, 6 nov).
    expect(citaVerificada(C("R2", 981, "Okay. 1800 al mes."), CTX.reuniones)).toBeNull();
  });

  it("todos los números del texto tienen que estar en lo citado, con lo que los multiplica", () => {
    expect(cifrasDeMas("14 de 25", "25 clientes y se nos van 14")).toEqual([]);
    expect(cifrasDeMas("56 % se va", "25 clientes y se nos van 14")).toEqual(["56·"]);
    expect(cifrasDeMas("25 mil al mes", "facturamos 25 al mes")).toEqual(["25000·"]);
    expect(cifrasDeMas("dos de cada tres", "son 2 de cada 3")).toEqual([]);
    expect(cifrasDeMas("1 800 tickets al mes", "Okay. 1800 al mes.")).toEqual([]);
  });

  it("una herramienta solo se nombra si la empresa la nombró en lo citado (regla 6: no asumir herramientas)", () => {
    expect(herramientasDeMas("Reactiva tu HubSpot.", "tenemos un CRM que nadie usa")).toEqual(["hubspot"]);
    expect(herramientasDeMas("Cada asesor usa WhatsApp desde su celular.", "WhatsApp desde celular")).toEqual([]);
    expect(herramientasDeMas("Tu equipo no registra las llamadas.", "")).toEqual([]);
  });

  it("cómo se sabe una cifra: la que resumió Smarteam es estimada; la dicha con dudas dice qué falta validar", () => {
    const deMarco = citaVerificada(C("R2", 170, "eran 25 clientes y se nos van 14"), CTX.reuniones)!;
    const deEmiley = citaVerificada(C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco"), CTX.reuniones)!;
    // «25 clientes y se nos van 14» la dijo Marco y Emiley confirmó: ESTIMADA, aunque el agente diga «declarado».
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "14 de 25", nota: null, citas: [deMarco] })).toEqual({ estado: "estimado", nota: NOTA_DE_LO_RESUMIDO });
    // Con la cita de Emiley al lado, los números grandes siguen sin ser de ella: estimada.
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "14 de 25", nota: null, citas: [deMarco, deEmiley] }).estado).toBe("estimado");
    // El 2,8 % lo dijo Emiley «si no me equivoco»: declarada, con lo que falta validar.
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "2,8 % mensual", nota: null, citas: [deEmiley] })).toEqual({ estado: "declarado", nota: NOTA_DE_MEMORIA });
    expect(estadoDeLaCifra({ estado: "otro", cifra: "2,8 %", nota: null, citas: [deEmiley] }).estado).toBe("pendiente");
  });

  it("el agente: cada parte pasa con su cita; lo que no la tiene, lo que trae un número o una herramienta de más, o un equipo que no sale, no", () => {
    const e = leerElResumen(
      responde({
        negocio: {
          vende: [{ texto: "Vendes productos para hospedajes pequeños y medianos.", citas: [C("R1", 20, "vendemos productos para hospedajes, hoteles pequeños y medianos")] }],
          ingresos: [{ texto: "Cobras una suscripción mensual por propiedad.", citas: [C("R1", 20, "con una suscripción mensual por propiedad")] }],
          fuera: [{ texto: "La división de desarrollo de software queda fuera.", citas: [C("R1", 21, "la parte de desarrollo de software es otra división, eso no entra aquí")] }],
          busca: [{ texto: "Buscas crecer un 40 % este año.", citas: [C("R1", 20, "vendemos productos para hospedajes")] }],
          motivo: [{ texto: "Una empresa líder del sector.", citas: [] }],
        },
        recorrido: [
          { etapa: "Captación y venta", quien: "Ventas", texto: "Cada asesor llama desde su propio celular.", friccion: "Las llamadas no quedan registradas.", citas: [C("R1", 369, "Cada asesor tiene su propio celular, cada uno con un número distinto.")] },
          { etapa: "Retención", quien: "Customer Success", texto: "Los primeros tres meses se revisa cada hospedaje.", friccion: null, citas: [C("R2", 300, "en los primeros tres meses yo reviso uno por uno los accesos y las reservas")] },
          { etapa: "Soporte", quien: "Soporte", texto: "Atiende 1800 casos al mes.", friccion: null, citas: [C("R2", 981, "Okay. 1800 al mes.")] },
        ],
        areas: [
          area({
            bien: [
              { texto: "En los primeros tres meses revisas a mano los accesos y las reservas de cada hospedaje.", citas: [C("R2", 300, "en los primeros tres meses yo reviso uno por uno los accesos y las reservas de cada hospedaje en la extranet, a mano.")] },
              { texto: "Tienes videos, transcripciones y manuales para que el cliente se capacite solo.", citas: [C("R2", 310, "tenemos videos, transcripciones y manuales para que el cliente se capacite solo.")] },
            ],
            retos: [
              { texto: "El seguimiento de cada hospedaje se hace a mano, uno por uno.", dimension: "3.8", citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje en la extranet, a mano.")] },
              { texto: "No reactivas el HubSpot que ya pagas.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] },
            ],
            cifras: [
              { cifra: "2,8 % mensual", texto: "De tus clientes se van cada mes.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco, por ahí.")] },
              { cifra: "14 de 25", texto: "De 25 clientes que captas, se van 14.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] },
              { cifra: "56 %", texto: "Pierdes el 56 % de lo que captas.", estado: "estimado", nota: null, dimension: null, citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] },
              { cifra: "1800 al mes", texto: "Casos de soporte al mes.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 981, "Okay. 1800 al mes.")] },
            ],
          }),
          area({ nombre: "Marketing", area: "2", retos: [{ texto: "x", citas: [] }] }),
        ],
        porque: [
          { area: "1", texto: "Ventas está en Deficiente porque «Aprendizaje de Ganadas y Perdidas» no existe; el 90 % de lo demás está en Inicial." },
          { area: "3", texto: "Está en Inicial." },
        ],
        pendientes: [
          { tipo: "sin-dato", area: "3", texto: "¿Cuántos tickets recibe soporte al mes?", citas: [] },
          { tipo: "contradiccion", area: "3", texto: "La base de clientes no cuadra.", citas: [C("R2", 59, "si son 500 clientes y solo uno atendiendo tickets")] },
          { tipo: "raro", area: null, texto: "x" },
        ],
        entendimos: ["Que cada asesor usa su propio celular.", "Que pierdes 30 clientes al mes.", "Que usan HubSpot."],
      }),
      CTX,
      REGLAS,
    );
    expect(e.negocio.vende?.[0].citas[0].turno).toBe(20);
    expect(e.negocio.ingresos?.[0].texto).toMatch(/suscripción mensual/);
    expect(e.negocio.fuera?.[0].texto).toMatch(/desarrollo de software/);
    // Un número que la cita no dice, o una frase hecha sin cita: fuera.
    expect(e.negocio.busca).toBeUndefined();
    expect(e.negocio.motivo).toBeUndefined();
    expect(e.recorrido.map((x) => [x.nombre, x.friccion])).toEqual([
      ["Captación y venta", "Las llamadas no quedan registradas."],
      ["Retención", null],
    ]);
    expect(e.operativas).toHaveLength(1);
    const cs = e.operativas[0];
    expect(cs).toMatchObject({ nombre: "Customer Success", areaId: "3" });
    expect(cs.bien.map((b) => b.texto)).toHaveLength(2);
    expect(cs.retos.map((r) => r.texto)).toEqual(["El seguimiento de cada hospedaje se hace a mano, uno por uno."]);
    expect(cs.cifras.map((c) => [c.cifra, c.estado, c.nota])).toEqual([
      ["2,8 % mensual", "declarado", NOTA_DE_MEMORIA],
      ["14 de 25", "estimado", NOTA_DE_LO_RESUMIDO],
    ]);
    // El 56 % se cayó solo por un número de más: se pide corregido.
    expect(e.porArreglar.map((x) => x.cifra)).toEqual(["56 %"]);
    // El «por qué» con un 90 que nadie dijo no sale; Servicio no tiene nivel, así que no lleva «por qué».
    expect(e.areas["1"].porque).toBeNull();
    expect(e.areas["3"].porque).toBeNull();
    expect(e.pendientes.map((p) => p.tipo)).toEqual(["sin-dato"]);
    // «¿Entendimos bien?» ya no se pide ni se lee (Elías, 11 nov).
    expect(e.entendimos).toEqual([]);
    const descartes = e.descartados.join(" | ");
    for (const motivo of [/1800/, /no sale \(2\)/, /hubspot/, /contradicción sin sus dos citas/, /40/]) expect(descartes).toMatch(motivo);
  });

  it("la cifra que se cayó por un número de más se pide corregida con sus citas, y lo corregido se vuelve a verificar", () => {
    const e = leerElResumen(
      responde({ areas: [area({ cifras: [{ cifra: "11 netos", texto: "Captas 25 y pierdes 14: te quedan 11.", estado: "declarado", nota: null, dimension: "3.8", citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] }] })] }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras).toEqual([]);
    expect(e.porArreglar).toHaveLength(1);
    expect(e.porArreglar[0].sobran).toEqual(["11·", "11·"]);
    const pedido = pedidoDelArreglo(e.porArreglar);
    expect(JSON.stringify(pedido.messages)).toContain("eran 25 clientes y se nos van 14");
    // Sin las transcripciones: solo las cifras caídas y sus citas.
    expect(JSON.stringify(pedido.messages)).not.toContain("Digamos que 25 25");
    const arreglado = leerElArreglo(
      responde({ cifras: [{ i: 0, cifra: "14 de 25", texto: "De 25 clientes que captas, se van 14.", nota: null }, { i: 0, cifra: "otra", texto: "repetida" }, { i: 5, cifra: "9", texto: "x" }] }),
      e.porArreglar,
      REGLAS,
    );
    expect(arreglado.cifras).toMatchObject([{ cifra: "14 de 25", operativa: "o1", dimensionId: "3.8", estado: "estimado" }]);
    const sigueMal = leerElArreglo(responde({ cifras: [{ i: 0, cifra: "11 de 25", texto: "Te quedan 11." }] }), e.porArreglar, REGLAS);
    expect(sigueMal.cifras).toEqual([]);
    expect(sigueMal.descartados[0]).toMatch(/11/);
    const juntas = conLoArreglado(e.operativas, [...arreglado.cifras, { ...arreglado.cifras[0] }]);
    expect(juntas[0].cifras.map((c) => [c.id, c.cifra])).toEqual([["c1", "14 de 25"]]);
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

  it("el pedido lleva las reuniones numeradas por turno, la guía del equipo como guía y las reglas del 10 nov", () => {
    const p = pedidoDelResumen(CTX);
    const texto = JSON.stringify(p.messages);
    expect(texto).toContain("[236] Emiley Calvo Jiménez: Digamos que 25 25 la mitad.");
    expect(texto).toContain("no es evidencia");
    const reglas = String(p.system);
    for (const regla of [/palabra por palabra/, /no significa que no lo tengan/, /Una meta/, /UNA CIFRA ES UN SOLO DATO/, /riesgo típico de la escala/, /No asumas herramientas/, /Nunca escribas «provisional»/, /CADA traspaso/, /no cuadran entre sí/, /LA VERACIDAD ES LO MÁS IMPORTANTE/])
      expect(reglas).toMatch(regla);
    expect(p.model).toBe("claude-sonnet-4-6");
    expect(guiaDelEquipo({ retos: [{ texto: "CRM lead-driven" }], metas: [{ que: "Bajar el churn", actual: "2,8 %" }], hubspotActual: "Usan un CRM sin nombre" })).toBe(
      "Retos anotados:\n- CRM lead-driven\nMetas anotadas:\n- Bajar el churn (hoy: 2,8 %)\nSu CRM y sus herramientas, según el equipo:\n- Usan un CRM sin nombre",
    );
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
const MARKETING = resultado("2", "Marketing", null, [["2.1", "Procesos", null]]);
const CHEQUEO = { "1.2": { nivel: "I", fuente: "reunion" }, "1.8": { nivel: "D", fuente: "hipotesis" } } as unknown as EstadoDeExploracion["contenido"]["chequeo"];
const ENTORNO = { escalaVersion: "9.0.0" };
const POR_EXPLORAR = { "1": ["1.8"] };

const CITA = { reunion: "gmeet_servicio", fecha: "2026-11-09T15:00:00.000Z", turno: 170, hablante: "Marco Salas", texto: "eran 25 clientes y se nos van 14", confirmo: { hablante: "Emiley Calvo Jiménez", texto: "Ajá. Exacto." } };
const CITA_EMILEY = { reunion: "gmeet_servicio", fecha: "2026-11-09T15:00:00.000Z", turno: 161, hablante: "Emiley Calvo Jiménez", texto: "si tenemos algo como un 2,8% si no me equivoco, por ahí." };
const CITA_LUIS = { reunion: "gmeet_servicio", fecha: "2026-11-09T15:00:00.000Z", turno: 300, hablante: "Luis Humberto Rodríguez Acevedo", texto: "en los primeros tres meses yo reviso uno por uno los accesos y las reservas" };

const HICIMOS: ResumenGuardado["hicimos"] = {
  sesiones: [
    { fecha: "2026-11-05T21:30:00.000Z", equipo: null, minutos: null, areaId: null, quienes: [] },
    { fecha: "2026-11-06T20:00:00.000Z", equipo: "Ventas", minutos: 99, areaId: "1", quienes: ["fernando", "emiley", "luis"] },
    { fecha: "2026-11-09T15:00:00.000Z", equipo: "Servicio al cliente", minutos: 75, areaId: "3", quienes: ["luis", "emiley"] },
  ],
  personas: 3,
  texto: null,
};

/** Un Resumen del formato 1, como el de Centauro del 9 nov. */
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

const CS: AreaOperativa = {
  id: "o2",
  nombre: "Customer Success",
  areaId: "3",
  organizacion: [{ id: "g1", texto: "Una persona lleva Customer Success y atiende las bajas.", citas: [CITA_LUIS] }],
  bien: [{ id: "b1", texto: "En los primeros tres meses revisas los accesos y las reservas de cada hospedaje.", citas: [CITA_LUIS] }],
  frena: [],
  retos: [{ id: "t1", texto: "El seguimiento se hace a mano, uno por uno.", dimensionId: "3.8", citas: [CITA_LUIS] }],
  cifras: [
    { id: "c1", cifra: "2,8 % mensual", texto: "De tus clientes se van cada mes.", estado: "declarado", nota: NOTA_DE_MEMORIA, dimensionId: null, citas: [CITA_EMILEY] },
    { id: "c2", cifra: "14 de 25", texto: "De 25 clientes que captas, se van 14.", estado: "estimado", nota: NOTA_DE_LO_RESUMIDO, dimensionId: null, citas: [CITA] },
  ],
  falta: null,
};
const SOPORTE: AreaOperativa = { id: "o1", nombre: "Soporte", areaId: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: "Cuántos casos recibe al mes y cuántos se resuelven al primer contacto." };

/** Un Resumen del formato 2 (10 nov). */
function guardado2(): ResumenGuardado {
  return {
    v: 2,
    at: "2026-11-10T18:00:00.000Z",
    por: "marco@smarteamcr.com",
    modelo: "claude-sonnet-4-6",
    agentRunId: "run2",
    hicimos: HICIMOS,
    datosRojos: [],
    areas: { "1": { hallazgos: [], porque: { texto: "Es provisional: depende de confirmar el aprendizaje.", firma: firmaDelArea(CHEQUEO, "1", ENTORNO) } }, "3": { hallazgos: [], porque: null } },
    entendimos: [{ id: "e1", texto: "Que cada asesor usa su propio celular." }],
    falta: [],
    negocio: {
      vende: [{ id: "n1", texto: "Vendes productos para hospedajes pequeños y medianos.", citas: [{ ...CITA_LUIS, hablante: "Fernando Segura", texto: "vendemos productos para hospedajes" }] }],
      fuera: [{ id: "n2", texto: "La división de desarrollo de software queda fuera.", citas: [{ ...CITA_LUIS, hablante: "Fernando Segura", texto: "desarrollo de software es otra división" }] }],
    },
    recorrido: [
      { id: "s1", nombre: "Captación y venta", quien: "Ventas", texto: "Cada asesor llama desde su celular.", friccion: "Las llamadas no quedan registradas.", citas: [CITA_LUIS] },
      { id: "s2", nombre: "Acompañamiento", quien: "Customer Success", texto: "Se revisa cada hospedaje los primeros tres meses.", friccion: null, citas: [CITA_LUIS] },
    ],
    operativas: [SOPORTE, CS],
    pendientes: [{ id: "p1", tipo: "sin-dato", texto: "¿Cuántos casos recibe soporte al mes?", areaId: "3", citas: [] }],
  };
}

describe("2 · el cliente nunca ve las citas", () => {
  it("la página del cliente lleva las cifras, su estado y la fecha, sin lo dicho ni quién lo dijo; la interna sí lo lleva", () => {
    const afuera = resumenParaLaPagina(guardado2(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    const json = JSON.stringify(afuera);
    expect(json).toContain("14 de 25");
    for (const prohibido of ["Marco Salas", "Emiley", "Fernando", "Luis", "se nos van", "Exacto", "gmeet_servicio", "citas", "si no me equivoco"]) expect(json).not.toContain(prohibido);
    const adentro = resumenParaLaPagina(guardado2(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: true, porExplorar: POR_EXPLORAR });
    const cs = adentro.tarjetas.find((t) => t.areaId === "3")!.subequipos.find((x) => x.nombre === "Customer Success")!;
    expect(cs.cifras[1].citas?.[0].confirmo?.texto).toBe("Ajá. Exacto.");
    expect(adentro.negocio?.[0].lista.piezas[0].citas?.[0].hablante).toBe("Fernando Segura");
    // El formato 1, igual: afuera sin citas.
    const v1 = JSON.stringify(resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false }));
    for (const prohibido of ["Marco Salas", "Fernando", "se nos van", "citas"]) expect(v1).not.toContain(prohibido);
  });

  it("la página pública pide el Resumen sin citas y la interna con ellas (escala-para-el-cliente-server.ts)", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "lib/exploraciones/escala-para-el-cliente-server.ts"), "utf8");
    expect(codigo).toMatch(/resumen: resumenParaLaPagina\(estado\.contenido\.resumenDeLaEscala,[\s\S]{0,200}conCitas: !o\.publica,/);
  });

  it("la portada pintada para el cliente: las cinco partes, sin citas, con el estado de cada cifra en palabras y su CTA", () => {
    const afuera = resumenParaLaPagina(guardado2(), [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, {
        resumen: afuera,
        empresa: "Centauro Solutions",
        pestanas: [
          { id: "resumen", nombre: "Resumen", href: "/external/escala/t" },
          { id: "1", nombre: "Ventas", href: "/external/escala/t?area=1" },
          { id: "3", nombre: "Servicio", href: "/external/escala/t?area=3" },
          { id: "2", nombre: "Marketing", href: "/external/escala/t?area=2" },
        ],
      }),
    );
    for (const parte of ["1 · Tu negocio", "2 · Cómo funciona tu operación hoy", "3 · Qué encontramos por área", "4 · Qué falta validar", "sesiones contigo", "personas de tu equipo"])
      expect(html).toContain(parte);
    // «¿Entendimos bien?» y «provisional» ya no salen; la sección «Qué hicimos» tampoco (sus cifras van arriba).
    for (const fuera of ["¿Entendimos bien?", "provisional", "· Qué hicimos"]) expect(html).not.toContain(fuera);
    expect(html).toContain("Qué queda fuera");
    // Lo que no se habló dice que está por confirmar, no se completa (12 nov: sin «?» y sin «Lo vemos contigo.»).
    expect(html).toContain("Por confirmar");
    expect(html).not.toContain("Lo vemos contigo");
    expect(html).toContain("Lo dijiste tú");
    expect(html).toContain("Estimado");
    expect(html).toContain("Ver diagnóstico de Servicio");
    expect(html).toContain('href="/external/escala/t?area=3"');
    // Soporte y Customer Success van separadas, las dos de Servicio en la escala.
    expect(html).toContain("Soporte");
    expect(html).toContain("Customer Success");
    expect(html).toContain("Lo que ya hace bien");
    expect(html).toContain("Se traba:");
    // Marketing no tuvo sesiones: su pestaña y su tarjeta dicen «Por explorar», y no se abre.
    expect(html).toContain("Por explorar");
    expect(html).not.toContain('href="/external/escala/t?area=2"');
    expect(html).toContain("Conversar con tu equipo de Marketing");
    // Sin etiquetas técnicas en «Qué falta validar».
    for (const etiqueta of ["Área sin explorar", "Hipótesis por validar", "Lo preguntamos, falta el dato"]) expect(html).not.toContain(etiqueta);
    for (const prohibido of ["Marco Salas", "Solo lo ves tú", "Lo que hoy se te escapa", "rs-rojo-icono"]) expect(html).not.toContain(prohibido);
  });
});

describe("3 · el armado", () => {
  it("qué hicimos: suma la duración real, dice «más de» si una reunión no la tiene, y separa los equipos explorados de los pendientes", () => {
    const h = loQueHicimos(HICIMOS, [
      { areaId: "1", nombre: "Ventas" },
      { areaId: "3", nombre: "Servicio" },
      { areaId: "2", nombre: "Marketing" },
    ])!;
    expect(h).toMatchObject({ sesiones: 3, minutos: 174, sinDuracion: 1, equipos: ["Ventas", "Servicio al cliente"], personas: 3, mano: false });
    expect(h.texto).toBe("Nos dedicaste más de 2 h 54 min en 3 sesiones con Ventas y Servicio al cliente, con 3 personas de tu equipo. Todo lo que ves en esta página sale de lo que nos contaste ahí.");
    expect(h.areas).toEqual([
      { areaId: "1", nombre: "Ventas", sesiones: 1, minutos: 99 },
      { areaId: "3", nombre: "Servicio", sesiones: 1, minutos: 75 },
      { areaId: "2", nombre: "Marketing", sesiones: 0, minutos: 0 },
    ]);
    expect(enHoras(45)).toBe("45 min");
    expect(enHoras(120)).toBe("2 h");
    expect(loQueHicimos({ sesiones: [], personas: 0, texto: null })).toBeNull();
  });

  it("la gente de otra empresa no es «persona de tu equipo» (Michael, de HubSpot, en Centauro)", () => {
    const correos = ["emiley@centaurosolutions.com", "luis.rodriguez@centaurosolutions.com", "mipena@hubspot.com", "msalas@smarteamcr.com"];
    expect(esDeOtraEmpresa("Michael Pena", correos, ["centaurosolutions.com"])).toBe(true);
    expect(esDeOtraEmpresa("Luis Humberto Rodríguez Acevedo", correos, ["centaurosolutions.com"])).toBe(false);
    expect(esDeOtraEmpresa("Emiley Calvo Jiménez", correos, ["centaurosolutions.com"])).toBe(false);
    // Sin dominios del cliente, no se sabe: nadie se excluye.
    expect(esDeOtraEmpresa("Michael Pena", correos, [])).toBe(false);
    const deOtra = (n: string) => esDeOtraEmpresa(n, correos, ["centaurosolutions.com"]);
    expect(delClienteDe([{ nombre: "Emiley Calvo Jiménez", lado: "cliente" }, { nombre: "Michael Pena", lado: "cliente" }, { nombre: "Smarteam's Notetaker", lado: "cliente" }], deOtra)).toEqual(["Emiley Calvo Jiménez"]);
  });

  it("la duración de una reunión es la de la conferencia; si no es creíble o no está, la del evento", () => {
    const d = (a: string, b: string) => ({ duration: 60, conferenciaInicio: new Date(a), conferenciaFin: new Date(b) });
    expect(minutosDeLaReunion(d("2026-11-06T19:56:09Z", "2026-11-06T21:34:40Z"))).toBe(99);
    expect(minutosDeLaReunion(d("2026-11-06T19:00:00Z", "2026-11-07T19:00:00Z"))).toBe(60);
    expect(minutosDeLaReunion({ duration: 0, conferenciaInicio: null, conferenciaFin: null })).toBeNull();
  });

  it("un nivel que determina una parte por explorar es provisional (solo cambia cómo se presenta, no el cálculo)", () => {
    expect(nivelProvisional(VENTAS, ["1.8"])).toEqual(["Aprendizaje de Ganadas y Perdidas"]);
    expect(nivelProvisional(VENTAS, [])).toBeNull();
    // Si otra parte con evidencia también está en ese nivel, el nivel se sostiene solo.
    const dos = resultado("1", "Ventas", "D", [
      ["1.2", "Comunicación", "D"],
      ["1.8", "Aprendizaje", "D"],
    ]);
    expect(nivelProvisional(dos, ["1.8"])).toBeNull();
    expect(nivelProvisional(SERVICIO, ["3.8"])).toBeNull();
    const p = resumenParaLaPagina(guardado2(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.areas[0].provisional).toEqual(["Aprendizaje de Ganadas y Perdidas"]);
    // Nunca «provisional» (Elías, 11 nov): lo que falta confirmar va como una línea de «Qué falta validar».
    expect(p.pendientes.find((x) => x.tipo === "hipotesis")?.texto).toBe("Confirmar cómo trabaja hoy tu equipo en «Aprendizaje de Ganadas y Perdidas»; con eso terminamos de ubicar Ventas.");
    expect(JSON.stringify(p)).not.toMatch(/es provisional|provisional:/);
    // Con lo que escribió el agente para esa parte, sale eso.
    const conTexto = { ...guardado2(), confirmar: { "1.8": "Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas." } };
    expect(resumenParaLaPagina(conTexto, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR }).pendientes.find((x) => x.tipo === "hipotesis")?.texto).toMatch(/^Confirmar cómo registran/);
    expect(porqueDeRespaldo(VENTAS, ["Aprendizaje de Ganadas y Perdidas"])).toBe("No llega a Inicial porque «Aprendizaje de Ganadas y Perdidas» sigue en Deficiente.");
  });

  it("las tarjetas: una por equipo de la escala, en su orden, con sus subequipos adentro; el que no tuvo sesiones, «Por explorar»", () => {
    const p = resumenParaLaPagina(guardado2(), [VENTAS, MARKETING, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    // Ventas tuvo sesión pero el agente no le escribió nada: sale igual, con su nivel. Marketing no tuvo sesión.
    expect(p.tarjetas.map((t) => [t.nombre, t.porExplorar, t.subequipos.map((x) => x.nombre)])).toEqual([
      ["Ventas", false, []],
      ["Marketing", true, []],
      ["Servicio", false, ["Soporte", "Customer Success"]],
    ]);
    const servicio = p.tarjetas[2];
    expect(servicio.subequipos[0].falta).toMatch(/Cuántos casos/);
    expect(servicio.subequipos[1].cifras.map((c) => [c.cifra, c.estado])).toEqual([
      ["2,8 % mensual", "declarado"],
      ["14 de 25", "estimado"],
    ]);
    expect(p.sinExplorar).toEqual(["2"]);
    // Tres líneas como mucho: el equipo sin explorar, lo que falta confirmar de Ventas y un pendiente escrito.
    expect(p.pendientes.map((x) => x.tipo)).toEqual(["no-explorada", "hipotesis", "sin-dato"]);
    expect(p.formato).toBe(2);
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
    expect(porqueDeRespaldo(VENTAS)).toBe("No llega a Inicial porque «Aprendizaje de Ganadas y Perdidas» sigue en Deficiente.");
    const inicial = resultado("1", "Ventas", "I", [
      ["1.2", "Comunicación", "F"],
      ["1.8", "Aprendizaje", "I"],
    ]);
    expect(porqueDeRespaldo(inicial)).toBe("No llega a Funcional porque «Aprendizaje» sigue en Inicial. No está más abajo porque «Comunicación» ya opera en Funcional.");
    expect(porqueDeRespaldo(SERVICIO)).toBeNull();
  });

  it("sin Resumen armado, la página tiene cada equipo con nivel y nada más", () => {
    const vacio = resumenParaLaPagina(null, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(vacio).toMatchObject({ at: null, hicimos: null, negocio: null, recorrido: null, datosRojos: [], entendimos: [], pendientes: [] });
    expect(vacio.tarjetas.map((t) => [t.nombre, t.subequipos.length])).toEqual([["Ventas", 0]]);
    expect(vacio.areas[0].porque).toBe(porqueDeRespaldo(VENTAS));
  });

  it("un Resumen del formato 1 (el de Centauro del 9 nov) se sigue pintando: una tarjeta por equipo con sus hallazgos y sus cifras", () => {
    const p = resumenParaLaPagina(guardado(), [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(p.formato).toBe(1);
    expect(p.negocio).toBeNull();
    expect(p.recorrido).toBeNull();
    expect(p.tarjetas.map((t) => t.nombre)).toEqual(["Ventas", "Servicio"]);
    expect(p.tarjetas[0].subequipos[0].retos.piezas.map((x) => [x.texto, x.clave])).toEqual([["Cada asesor llama desde su celular.", "hallazgo:1:h1-1"]]);
    // «14 de 25» lo resumió Marco: en el formato 1 también sale como estimada.
    expect(p.tarjetas[1].subequipos[0].cifras.map((c) => [c.cifra, c.estado, c.clave])).toEqual([["14 de 25", "estimado", "rojo:r1"]]);
    expect(p.datosRojos.map((d) => d.cifra)).toEqual(["14 de 25"]);
    expect(p.pendientes.map((x) => [x.tipo, x.clave])).toEqual([["por-confirmar", "falta:f1"]]);
    const html = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: p, empresa: "Centauro Solutions", pestanas: [{ id: "resumen", nombre: "Resumen", href: "#" }] }));
    expect(html).toContain("14 de 25");
    expect(html).not.toContain("· Tu negocio");
    expect(html).not.toContain("Cómo funciona tu operación");
    expect(html).toContain("Qué encontramos por área");
  });
});

describe("4 · se edita en su lugar y «Rehacer con IA» no pisa lo escrito", () => {
  const o = { firmaDe: () => "firma-nueva", areas: new Set(["1", "2", "3"]), en: "2026-11-10T10:00:00.000Z" };
  const ok = (r: ReturnType<typeof editarElResumen>) => {
    if (!r.ok) throw new Error(r.error);
    return r.resumen;
  };

  it("formato 2: cada pieza se cambia, se quita o se agrega; lo editado queda a mano", () => {
    const g = guardado2();
    expect(ok(editarElResumen(g, "negocio:vende:n1", "Vendes software para hoteles pequeños.", o)).negocio?.vende?.[0]).toMatchObject({ texto: "Vendes software para hoteles pequeños.", mano: true });
    expect(ok(editarElResumen(g, "negocio:ingresos:nuevo", "Cobras por suscripción.", o)).negocio?.ingresos?.[0]).toMatchObject({ citas: [], mano: true });
    expect(ok(editarElResumen(g, "etapa:s1:friccion", "", o)).recorrido?.[0].friccion).toBeNull();
    expect(ok(editarElResumen(g, "etapa:s1", null, o)).recorrido?.map((e) => e.id)).toEqual(["s2"]);
    expect(ok(editarElResumen(g, "etapa:nuevo", "Renovación", o)).recorrido?.[2]).toMatchObject({ nombre: "Renovación", mano: true });
    expect(ok(editarElResumen(g, "op:o2:nombre", "Éxito del cliente", o)).operativas?.[1]).toMatchObject({ nombre: "Éxito del cliente", nombreMano: true });
    expect(ok(editarElResumen(g, "op:o2:bien:nuevo", "Tienes videos y manuales.", o)).operativas?.[1].bien).toHaveLength(2);
    expect(ok(editarElResumen(g, "op:o2:reto:t1", null, o)).operativas?.[1].retos).toEqual([]);
    expect(ok(editarElResumen(g, "op:o2:cifra:c1:nota", "", o)).operativas?.[1].cifras[0].nota).toBeNull();
    expect(ok(editarElResumen(g, "op:o2:cifra:c2", null, o)).operativas?.[1].cifras.map((c) => c.id)).toEqual(["c1"]);
    expect(ok(editarElResumen(g, "op:o1:falta", "Cuántos casos al mes.", o)).operativas?.[0]).toMatchObject({ falta: "Cuántos casos al mes.", faltaMano: true });
    expect(ok(editarElResumen(g, "op:o1", null, o)).operativas?.map((x) => x.id)).toEqual(["o2"]);
    expect(ok(editarElResumen(g, "pendiente:nuevo", "¿Quién decide la compra?", o)).pendientes?.[1]).toMatchObject({ tipo: "sin-dato", mano: true });
    expect(ok(editarElResumen(g, "porque:1", "Porque nadie mira lo perdido.", o)).areas["1"].porque).toEqual({ texto: "Porque nadie mira lo perdido.", firma: "firma-nueva", mano: true });
  });

  it("no deja vacío lo que no puede quedar vacío, ni un texto de más, ni una clave que no existe", () => {
    const g = guardado2();
    expect(editarElResumen(g, "op:o2:cifra:c1:cifra", "", o).ok).toBe(false);
    expect(editarElResumen(g, "op:o2:cifra:c1:cifra", "x".repeat(40), o).ok).toBe(false);
    expect(editarElResumen(g, "op:o2:nombre", "", o).ok).toBe(false);
    expect(editarElResumen(g, "etapa:s1:nombre", "", o).ok).toBe(false);
    expect(editarElResumen(g, "op:o9:nombre", "x", o).ok).toBe(false);
    expect(editarElResumen(g, "negocio:otra:nuevo", "x", o).ok).toBe(false);
    expect(editarElResumen(g, "nivel:1", "Óptimo", o).ok).toBe(false);
    // El formato 1, igual que antes.
    const v1 = guardado();
    expect(editarElResumen(v1, "rojo:r1:cifra", "", o).ok).toBe(false);
    expect(editarElResumen(v1, "hallazgo:9:nuevo", "x", o).ok).toBe(false);
    expect(ok(editarElResumen(v1, "rojo:r1", null, o)).datosRojos.map((d) => d.id)).toEqual(["r2"]);
    expect(ok(editarElResumen(v1, "falta:nuevo", "¿Quién decide?", o)).falta.map((p) => p.texto)).toEqual(["¿Qué pasa en Marketing?", "¿Quién decide?"]);
  });

  it("una cifra editada a mano que la cita ya no sostiene no sale al cliente; adentro sale marcada, con la cita que tenía", () => {
    const r = ok(editarElResumen(guardado2(), "op:o2:cifra:c2:cifra", "20 de 25", o));
    const afuera = resumenParaLaPagina(r, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(JSON.stringify(afuera)).not.toContain("20 de 25");
    expect(JSON.stringify(afuera)).not.toContain("noSale");
    const adentro = resumenParaLaPagina(r, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: true });
    const c = adentro.tarjetas.find((t) => t.areaId === "3")!.subequipos[1].cifras[1];
    expect(c).toMatchObject({ cifra: "20 de 25", fecha: null });
    expect(c.noSale).toMatch(/No sale al cliente: «20» no está/);
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, {
        resumen: adentro,
        empresa: "Centauro Solutions",
        pestanas: [{ id: "resumen", nombre: "Resumen", href: "#" }],
        edicion: { alElegir: () => {}, texto: (x) => x.valor, deDonde: (citas, d) => (d?.noSostiene ? `TENIA:${citas.length}` : `SALE:${citas.length}`) },
      }),
    );
    expect(html).toContain("rs-cifra-fuera");
    expect(html).toContain("TENIA:1");
    // Una nota con un número que la cita no dice también la saca.
    const conNota = ok(editarElResumen(guardado2(), "op:o2:cifra:c1:nota", "Sobre 900 clientes.", o));
    expect(resumenParaLaPagina(conNota, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false }).tarjetas.find((t) => t.areaId === "3")!.subequipos[1].cifras.map((x) => x.cifra)).toEqual(["14 de 25"]);
    // Corregida con lo que dijo la empresa, vuelve a salir.
    const corregida = ok(editarElResumen(r, "op:o2:cifra:c2:cifra", "14 de 25", o));
    expect(resumenParaLaPagina(corregida, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false }).tarjetas.find((t) => t.areaId === "3")!.subequipos[1].cifras).toHaveLength(2);
  });

  it("al rehacer: lo de la persona se queda en su lugar, lo quitado no vuelve, y lo demás es lo nuevo", () => {
    let antes = guardado2();
    antes = ok(editarElResumen(antes, "op:o2:reto:t1", "El seguimiento de cada hospedaje es manual.", o));
    antes = ok(editarElResumen(antes, "op:o2:bien:b1", null, o));
    antes = ok(editarElResumen(antes, "etapa:s2:texto", "Customer Success acompaña tres meses.", o));
    antes = ok(editarElResumen(antes, "negocio:fuera:n2", null, o));
    antes = ok(editarElResumen(antes, "hicimos", "Gracias por las tres sesiones.", o));
    antes = ok(editarElResumen(antes, "op:o1:nombre", "Mesa de ayuda", o));
    const nuevo = guardado2();
    nuevo.operativas = [
      { ...SOPORTE, id: "o1-zz", retos: [{ id: "t1", texto: "Recibe casos por WhatsApp fuera del sistema.", dimensionId: null, citas: [{ ...CITA_EMILEY, turno: 59 }] }] },
      { ...CS, id: "o2-zz", retos: [{ ...CS.retos[0], texto: "Valor nuevo del agente para el mismo reto." }] },
    ];
    const j = juntarConLoEditado(nuevo, antes);
    const cs = j.operativas!.find((x) => x.nombre === "Customer Success")!;
    // El reto corregido a mano se queda; el del agente de la misma cita no vuelve.
    expect(cs.retos.map((r) => r.texto)).toEqual(["El seguimiento de cada hospedaje es manual."]);
    // Lo quitado (lo que ya hace bien, de la misma cita) no vuelve.
    expect(cs.bien).toEqual([]);
    // La tarjeta renombrada a mano conserva su nombre y suma lo nuevo.
    expect(j.operativas!.find((x) => x.nombre === "Mesa de ayuda")?.retos.map((r) => r.texto)).toEqual(["Recibe casos por WhatsApp fuera del sistema."]);
    expect(j.recorrido?.[1].texto).toBe("Customer Success acompaña tres meses.");
    expect(j.negocio?.fuera).toBeUndefined();
    expect(j.hicimos.texto).toBe("Gracias por las tres sesiones.");
  });

  it("rehacer un Resumen del formato 1 lo pasa al 2 sin perder lo escrito a mano", () => {
    let antes = guardado();
    antes = ok(editarElResumen(antes, "hallazgo:1:h1-1", "Cada asesor llama desde su propio celular.", o));
    antes = ok(editarElResumen(antes, "porque:1", "Su porqué.", o));
    antes = ok(editarElResumen(antes, "entendimos:nuevo", "Que Marco lo escribió.", o));
    const j = juntarConLoEditado(guardado2(), antes);
    expect(j.v).toBe(2);
    expect(j.areas["1"].porque?.texto).toBe("Su porqué.");
    expect(j.entendimos.map((p) => p.texto)).toContain("Que Marco lo escribió.");
    const p = resumenParaLaPagina(j, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(p.tarjetas.find((t) => t.areaId === "1")?.subequipos[0].retos.piezas.map((x) => x.texto)).toEqual(["Cada asesor llama desde su propio celular."]);
    expect(p.tarjetas.find((t) => t.areaId === "1")?.subequipos[0].nombre).toBe("Ventas");
  });

  it("formato 1: al rehacer, lo de la persona se queda (también si choca de id o repite la cifra)", () => {
    const antes = guardado();
    antes.datosRojos[0] = { ...antes.datosRojos[0], texto: "Lo escribió Marco.", mano: true };
    antes.entendimos = [{ id: "e1", texto: "La de Marco", mano: true }];
    const nuevo = guardado();
    nuevo.datosRojos = [
      { ...nuevo.datosRojos[0], id: "r1", cifra: "14 de 25" },
      { id: "r1", cifra: "3 días", texto: "Choca de id", areaId: "3", dimensionId: null, citas: [{ ...CITA, turno: 400 }] },
    ];
    nuevo.entendimos = [{ id: "e1", texto: "Nueva" }];
    const j = juntarConLoEditado(nuevo, antes);
    expect(j.datosRojos.map((d) => [d.id, d.cifra, d.texto])).toEqual([
      ["r1", "14 de 25", "Lo escribió Marco."],
      ["r1-2", "3 días", "Choca de id"],
    ]);
    expect(j.entendimos.map((p) => p.id)).toEqual(["e1", "e1-2"]);
  });

  it("la operación vive en la exploración: no sube la versión, el esquema la acepta y la lectura del Json la conserva pieza por pieza", () => {
    const VALIDEZ: Validez = { dimensiones: new Set(["1.2"]), criterios: new Set(), areas: new Set(["1", "2", "3"]), ediciones: new Set(), escalaVersion: "9.0.0" };
    const base: EstadoDeExploracion = { contenido: { ...contenidoVacio(), resumenDeLaEscala: guardado2() }, propuesta: propuestaVacia(), areas: ["1"], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false };
    const r = aplicarOperaciones(base, [{ op: "resumenDeLaEscala", clave: "op:o2:reto:t1", texto: "El seguimiento es manual." }], VALIDEZ, VALIDADOR_ESTRICTO);
    expect(r.ok && r.estado.contenido.resumenDeLaEscala?.operativas?.[1].retos[0]).toMatchObject({ texto: "El seguimiento es manual.", mano: true });
    expect(r.ok && cambioLoConfirmado(base, r.estado)).toBe(false);
    for (const clave of ["op:o2:cifra:c1:nota", "negocio:vende:n1", "etapa:s1:friccion", "pendiente:nuevo", "rojo:r1:cifra"])
      expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "resumenDeLaEscala", clave, texto: "x" }] }).success, clave).toBe(true);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "resumenDeLaEscala", clave: "nivel:1", texto: "x" }] }).success).toBe(false);
    // La lectura del Json conserva los dos formatos enteros.
    expect(leerContenido({ resumenDeLaEscala: guardado2() }).resumenDeLaEscala).toEqual(guardado2());
    expect(leerContenido({ resumenDeLaEscala: guardado() }).resumenDeLaEscala).toEqual(guardado());
    // Una pieza rota se cae sola: una cifra sin estado, un área sin nombre.
    const roto = { ...guardado2(), operativas: [{ id: "malo" }, { ...CS, cifras: [{ id: "c9" }, ...CS.cifras] }] };
    const leido = leerContenido({ resumenDeLaEscala: roto }).resumenDeLaEscala;
    expect(leido?.operativas?.map((x) => [x.id, x.cifras.length])).toEqual([["o2", 2]]);
    expect(leerContenido({ resumenDeLaEscala: { v: 1, datosRojos: "x" } }).resumenDeLaEscala).toBeUndefined();
  });

  it("cada corrida marca sus ids: desde una pantalla vieja, quitar «o1» no quita otra área", () => {
    const g = guardado2();
    const marcado = conIdsDeLaCorrida({ negocio: g.negocio!, recorrido: g.recorrido!, operativas: g.operativas!, pendientes: g.pendientes!, entendimos: g.entendimos }, "k3x9");
    expect(marcado.operativas.map((x) => x.id)).toEqual(["o1-k3x9", "o2-k3x9"]);
    expect(marcado.negocio.vende?.[0].id).toBe("n1-k3x9");
    expect(editarElResumen({ ...g, ...marcado }, "op:o1", null, o)).toMatchObject({ ok: false, error: "Esa área ya no está." });
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
  });
});

describe("7 · lo que encontraron las revisiones del 9 nov (la verificación de las citas sigue igual)", () => {
  const T = (n: number, hablante: string, texto: string) => ({ n, hablante, texto });
  const reunion = (turnos: ReturnType<typeof T>[], delCliente = ["Ana Mora"]): ReunionParaElResumen => ({ id: "r", clave: "R1", fecha: "2026-11-09T15:00:00.000Z", equipo: "Ventas", delCliente, turnos });

  it("una cifra partida: el «Sí, correcto» del medio no confirma si la empresa después dice que no; «Menos.» también niega", () => {
    const r = reunion([T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"), T(11, "Ana Mora", "Sí, correcto."), T(12, "Marco Salas", "y de esos pierden como 14 cada mes"), T(13, "Ana Mora", "No, no tanto, unos cinco.")]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [r])).toBeNull();
    const ok = reunion([T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"), T(11, "Ana Mora", "Mhm."), T(12, "Marco Salas", "y de esos pierden como 14 cada mes"), T(13, "Ana Mora", "Sí, exacto.")]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [ok])?.confirmo?.texto).toBe("Sí, exacto.");
    const menos = reunion([T(10, "Marco Salas", "Ustedes cierran unos 25 clientes al mes"), T(11, "Ana Mora", "Menos."), T(12, "Marco Salas", "y de esos pierden como 14 cada mes"), T(13, "Ana Mora", "Sí, exacto.")]);
    expect(citaVerificada({ reunion: "R1", turno: 10, texto: "cierran unos 25 clientes al mes y de esos pierden como 14" }, [menos])).toBeNull();
  });

  it("un «Okay», un «Ajá» o un «¿Sí?» solos no confirman, y alguien de Smarteam no confirma a otro de Smarteam", () => {
    const dicho = T(10, "Marco Salas", "Entonces son unos 1800 tickets al mes");
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Okay.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Ajá.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "¿Sí?")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Andrés Pérez", "Sí, exacto.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Bueno, depende del mes."), T(12, "Ana Mora", "Sí.")]), 10)).toBeNull();
    expect(confirmacion(reunion([dicho, T(11, "Ana Mora", "Sí, exacto.")]), 10)?.texto).toBe("Sí, exacto.");
  });

  it("sin saber quién habló (notas de Gemini, o la reunión sin hablantes), nadie cuenta como de la empresa", () => {
    const notas = reunion([T(1, "Pérdida de clientes", "Marco calculó que se van 1800 tickets al mes por soporte")], []);
    expect(citaVerificada({ reunion: "R1", turno: 1, texto: "se van 1800 tickets al mes por soporte" }, [notas])).toBeNull();
  });

  it("los números en palabras también se comparan con la cita", () => {
    expect(cifrasDeMas("pierdes trece clientes", "se nos van 14 clientes")).toEqual(["trece"]);
    expect(cifrasDeMas("pierdes la mitad", "se van 14 de 25")).toEqual(["mitad"]);
    expect(cifrasDeMas("la mitad de las reuniones", "Digamos que 25 25 la mitad.")).toEqual([]);
    expect(cifrasDeMas("dieciséis por semana", "son 16 a la semana")).toEqual([]);
    expect(cifrasDeMas("casi un millón al año", "perdemos bastante")).toEqual(["millon"]);
    expect(cifrasDeMas("mil clientes", "tenemos 500 clientes")).toEqual(["mil"]);
    expect(cifrasDeMas("25 mil al mes", "facturamos 25 mil al mes")).toEqual([]);
  });

  it("ningún texto habla de un equipo que el cliente no ve, al armarlo ni al pintarlo", () => {
    const e = leerElResumen(responde({ areas: [], pendientes: [{ tipo: "sin-dato", area: null, texto: "¿Qué mide hoy Marketing?" }, { tipo: "sin-dato", area: null, texto: "¿Quién decide en Ventas?" }] }), CTX, { ...REGLAS, areasFuera: ["Marketing"] });
    expect(e.pendientes.map((p) => p.texto)).toEqual(["¿Quién decide en Ventas?"]);
    const g = { ...guardado(), falta: [{ id: "f1", texto: "¿Qué mide hoy Marketing?" }, { id: "f2", texto: "¿Quién decide en Ventas?" }] };
    expect(resumenParaLaPagina(g, [VENTAS], CHEQUEO, ENTORNO, { conCitas: false, areasFuera: ["Marketing", "Servicio"] }).falta.map((x) => x.id)).toEqual(["f2"]);
    const g2 = { ...guardado2(), pendientes: [{ id: "p1", tipo: "sin-dato" as const, texto: "¿Qué mide hoy Marketing?", areaId: null, citas: [] }] };
    expect(resumenParaLaPagina(g2, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, areasFuera: ["Marketing"] }).pendientes.every((p) => !p.texto.includes("Marketing"))).toBe(true);
  });

  it("qué hicimos no cuenta las sesiones de un equipo que el cliente no ve, ni su gente", () => {
    const g = guardado2();
    g.hicimos = { ...g.hicimos, sesiones: [...g.hicimos.sesiones, { fecha: "2026-11-07T20:00:00.000Z", equipo: "Marketing", minutos: 60, areaId: "2", quienes: ["carla"] }] };
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(p.hicimos).toMatchObject({ sesiones: 3, minutos: 174, personas: 3 });
    expect(p.hicimos?.texto).not.toMatch(/Marketing/);
  });

  it("qué reuniones lee: solo con transcripción y de equipos que ve el cliente", () => {
    const fuentes = [
      { id: "nueva", areaId: "1" },
      { id: "de-marketing", areaId: "2" },
      { id: "solo-notas", areaId: "1" },
      { id: "sin-equipo", areaId: null },
      { id: "vieja", areaId: "3" },
    ];
    expect(reunionesQueLee(fuentes, new Set(["nueva", "de-marketing", "sin-equipo", "vieja"]), new Set(["1", "3"])).map((r) => r.id)).toEqual(["vieja", "sin-equipo", "nueva"]);
  });

  describe("la corrida: reintento, arreglo y lo que no se guarda", () => {
    const LE = { ctx: CTX, personas: REGLAS.personas, firmas: REGLAS.firmas };
    const usage = { input_tokens: 10, output_tokens: 5 } as never;
    const resp = (x: unknown, stop: "end_turn" | "max_tokens" = "end_turn") => ({ ...responde(x), usage, stop_reason: stop });
    const bueno = {
      areas: [
        area({
          retos: [{ texto: "El seguimiento se hace a mano, uno por uno.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] }],
          cifras: [{ cifra: "11 netos", texto: "Te quedan 11.", estado: "estimado", nota: null, dimension: null, citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] }],
        }),
      ],
    };

    it("si se corta, se pide otra vez; la cifra caída por un número de más se arregla en una llamada chica", async () => {
      const pedidos: string[] = [];
      const respuestas = [resp({}, "max_tokens"), resp(bueno), resp({ cifras: [{ i: 0, cifra: "14 de 25", texto: "De 25 que captas, se van 14.", nota: null }] })];
      const e = await escribirElResumen(LE, async (p) => {
        pedidos.push(p.max_tokens === 800 ? "arreglo" : "resumen");
        return respuestas.shift()!;
      });
      expect(pedidos).toEqual(["resumen", "resumen", "arreglo"]);
      expect(e.cortado).toBe(false);
      expect(e.operativas[0].cifras.map((c) => c.cifra)).toEqual(["14 de 25"]);
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

    it("si el arreglo falla, se guarda lo que ya se pagó", async () => {
      let n = 0;
      const e = await escribirElResumen(LE, async () => {
        n++;
        if (n === 2) throw new Error("overloaded");
        return resp(bueno);
      });
      expect(e.cortado).toBe(false);
      expect(e.operativas).toHaveLength(1);
      expect(e.descartados.join(" ")).toMatch(/arreglo/);
    });
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

describe("9 · lo que pidió Elías al probarla (9 nov)", () => {
  const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("«Armar / Rehacer con IA» y su aviso van en la franja interna, fuera del marco que imita la página del cliente", () => {
    const vista = sinComentarios(fs.readFileSync(path.join(RAIZ, "components/external/test/ResumenDeLaEscalaVista.tsx"), "utf8"));
    expect(vista).not.toMatch(/barra|Armar el Resumen|Rehacer con IA|Todavía no hay Resumen|está leyendo/);
    const pagina = fs.readFileSync(path.join(RAIZ, "components/exploraciones/PaginaDeLaEscala.tsx"), "utf8");
    const resumen = pagina.slice(pagina.indexOf("if (enElResumen) {"), pagina.indexOf("const nivelesEnVivo"));
    const marco = resumen.indexOf("<ResumenDeLaEscalaVista");
    for (const control of ["Armar el Resumen con IA", "Todavía no hay Resumen", "Nexus está leyendo las reuniones", "no pasó la verificación ("]) {
      const donde = resumen.indexOf(control);
      expect(donde, control).toBeGreaterThan(-1);
      expect(donde, control).toBeLessThan(marco);
    }
    expect(resumen).not.toMatch(/rs-barra|rd-btn/);
  });

  it("la portada no define componentes dentro del render (el cuadro de edición se perdería al volver a pintar)", () => {
    const vista = sinComentarios(fs.readFileSync(path.join(RAIZ, "components/external/test/ResumenDeLaEscalaVista.tsx"), "utf8"));
    const cuerpo = vista.slice(vista.indexOf("export default function ResumenDeLaEscalaVista"));
    expect(cuerpo).not.toMatch(/const [A-Z]\w* = \(/);
  });
});

describe("10 · lo que mostró el simulacro de Centauro (10 nov)", () => {
  it("una meta sola no es una cifra de hoy; el resultado frente a la meta sí", () => {
    const e = leerElResumen(
      responde({
        areas: [
          area({
            nombre: "Ventas",
            area: "1",
            cifras: [
              { cifra: "50 por semana", texto: "La meta del equipo es de 50 reuniones por semana.", estado: "declarado", nota: null, dimension: null, citas: [C("R1", 198, "por asesor, pero son 50 a la semana en grupal.")] },
              { cifra: "25 de 50", texto: "Hoy haces 25 de las 50 reuniones semanales de la meta.", estado: "declarado", nota: null, dimension: "1.7", citas: [C("R1", 236, "Digamos que 25 25 la mitad."), C("R1", 198, "son 50 a la semana en grupal.")] },
            ],
          }),
        ],
      }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras.map((c) => c.cifra)).toEqual(["25 de 50"]);
    expect(e.descartados.join(" ")).toMatch(/meta sola/);
  });

  it("una nota que cita lo dicho o dice quién lo dijo se va; la cifra queda con la nota del código", () => {
    const e = leerElResumen(
      responde({
        areas: [
          area({
            cifras: [{ cifra: "2,8 % al mes", texto: "De tus clientes se van cada mes.", estado: "declarado", nota: "La supervisora lo aporta con reserva ('si no me equivoco').", dimension: null, citas: [C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco, por ahí.")] }],
            retos: [{ texto: "El seguimiento de cada hospedaje se hace a mano, uno por uno.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] }],
          }),
        ],
      }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras[0]).toMatchObject({ cifra: "2,8 % al mes", estado: "declarado", nota: NOTA_DE_MEMORIA });
  });

  it("«tarifa» o «precio» valen cuando la empresa los dijo (las tarifas de sus hoteles), no si los pone el agente", () => {
    const o = { personas: [] };
    expect(textoValido("Configuras la tarifa de cada hotel.", 100, o, "subimos la tarifa de cada hotel a la extranet").ok).toBe(true);
    expect(textoValido("Configuras la tarifa de cada hotel.", 100, o).ok).toBe(false);
    expect(textoValido("El presupuesto no alcanza.", 100, o, "no tenemos presupuesto").ok).toBe(false);
  });

  it("un equipo sin sesiones no lleva contenido aunque el agente le haya escrito algo: sale «Por explorar» (Marketing en Centauro)", () => {
    const g = guardado2();
    g.operativas = [...g.operativas!, { id: "o3", nombre: "Marketing", areaId: "2", organizacion: [{ id: "g1", texto: "No se hizo el diagnóstico.", citas: [CITA_LUIS] }], bien: [], frena: [], retos: [], cifras: [], falta: null }];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.tarjetas.find((t) => t.nombre === "Marketing")).toMatchObject({ porExplorar: true, subequipos: [], nivel: null });
    expect(p.pendientes[0]).toMatchObject({ tipo: "no-explorada", areaNombre: "Marketing" });
    // Lo que escribió el agente de Marketing en «Qué falta validar» no se repite (salía dos veces).
    const dos = { ...g, pendientes: [{ id: "p3", tipo: "sin-dato" as const, texto: "No hubo reunión con el equipo de Marketing.", areaId: null, citas: [] }] };
    expect(resumenParaLaPagina(dos, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false }).pendientes.filter((x) => /Marketing/.test(x.texto))).toHaveLength(1);
  });

  it("si NINGUNA sesión tiene equipo no hay equipos «Por explorar»: todos salen con lo suyo (Tecnosagot, 13 nov)", () => {
    const g = guardado2();
    g.hicimos = { ...g.hicimos, sesiones: g.hicimos.sesiones.map((x) => ({ ...x, equipo: null, areaId: null })) };
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.sinExplorar).toEqual([]);
    expect(p.tarjetas.every((t) => !t.porExplorar)).toBe(true);
    expect(p.pendientes.some((x) => x.tipo === "no-explorada")).toBe(false);
  });

  it("un equipo cuyo contenido cita una sesión SIN equipo sí se exploró: sale con lo suyo (Televentas en Polaris, 13 nov)", () => {
    const g = guardado2();
    const deLaSinEquipo = { ...CITA_LUIS, reunion: "gmeet_sin_equipo", fecha: "2026-11-05T21:30:00.000Z" };
    g.operativas = [...g.operativas!, { id: "o3", nombre: "Marketing", areaId: "2", organizacion: [], bien: [], frena: [], retos: [{ id: "t9", texto: "No se sabe qué campaña trajo cada venta.", dimensionId: null, citas: [deLaSinEquipo] }], cifras: [], falta: null }];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.sinExplorar).toEqual([]);
    expect(p.tarjetas.find((t) => t.nombre === "Marketing")).toMatchObject({ porExplorar: false });
    expect(p.tarjetas.find((t) => t.nombre === "Marketing")!.subequipos[0].retos.piezas.map((x) => x.texto)).toEqual(["No se sabe qué campaña trajo cada venta."]);
    expect(p.pendientes.some((x) => x.tipo === "no-explorada")).toBe(false);
  });
});

describe("11 · el cuarto simulacro de Centauro (10 nov)", () => {
  it("una cifra que el agente marcó estimada sin base, pero que la empresa dijo tal cual, es declarada (el 2,8 % de Emiley)", () => {
    const deEmiley = citaVerificada(C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco"), CTX.reuniones)!;
    expect(estadoDeLaCifra({ estado: "estimado", cifra: "2,8 % al mes", nota: null, citas: [deEmiley] })).toEqual({ estado: "declarado", nota: NOTA_DE_MEMORIA });
    // Con su base escrita, sigue estimada.
    expect(estadoDeLaCifra({ estado: "estimado", cifra: "2,8 % al mes", nota: "Sobre la base de clientes activos.", citas: [deEmiley] }).estado).toBe("estimado");
  });

  it("un resultado de hoy que nombra la meta no es «una meta sola»", () => {
    const e = leerElResumen(
      responde({ areas: [area({ nombre: "Ventas", area: "1", cifras: [{ cifra: "25 por semana", texto: "Hoy haces 25 reuniones por semana, la mitad de la meta.", estado: "declarado", nota: null, dimension: null, citas: [C("R1", 236, "Digamos que 25 25 la mitad.")] }] })] }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras.map((c) => c.cifra)).toEqual(["25 por semana"]);
  });
});

describe("12 · el quinto simulacro de Centauro (10 nov)", () => {
  it("«porcentaje» no es un número de más si la cita trae el «%»", () => {
    expect(cifrasDeMas("El porcentaje de clientes que se van al mes.", "si tenemos algo como un 2,8% si no me equivoco")).toEqual([]);
    expect(cifrasDeMas("El porcentaje de clientes que se van.", "se van algunos clientes")).toEqual(["porcentaje"]);
  });

  it("«14 de 25» es una comparación por validar, no una conclusión sobre el crecimiento: se pide corregida", () => {
    const e = leerElResumen(
      responde({
        areas: [area({ cifras: [{ cifra: "14 de 25", texto: "De 25 clientes que captas, se van 14, lo que limita el crecimiento de tu cartera.", estado: "estimado", nota: null, dimension: null, citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] }] })],
        entendimos: ["Que tu cartera crece poco porque captas y pierdes casi al mismo ritmo.", "Que cada asesor usa su propio celular."],
      }),
      CTX,
      REGLAS,
    );
    // La cola que concluye se corta: queda el dato, estimado y por validar.
    expect(e.operativas[0].cifras.map((c) => [c.cifra, c.texto, c.estado])).toEqual([["14 de 25", "De 25 clientes que captas, se van 14.", "estimado"]]);
    // Si la conclusión no está en una cola que se pueda cortar, se pide corregida.
    const otra = leerElResumen(
      responde({ areas: [area({ cifras: [{ cifra: "14 de 25", texto: "Tu cartera crece poco: captas 25 y se van 14.", estado: "estimado", nota: null, dimension: null, citas: [C("R2", 170, "eran 25 clientes y se nos van 14")] }] })] }),
      CTX,
      REGLAS,
    );
    expect(otra.porArreglar[0].problemas?.join(" ")).toMatch(/conclusión/);
  });
});

describe("13 · el sexto simulacro de Centauro (10 nov)", () => {
  it("una palabra interna de Nexus nunca sale, y «el saldo neto muy ajustado» también es una conclusión", () => {
    expect(textoValido("Aprendizaje de Ganadas y Perdidas sigue con porExplorar.", 200, { personas: [] })).toMatchObject({ ok: false });
    expect(textoValido("Tu equipo usa WhatsApp desde el celular.", 200, { personas: [] }).ok).toBe(true);
    expect(concluyeDeMas("Captas 25 y se van 14, lo que deja el saldo neto muy ajustado.", "eran 25 clientes y se nos van 14")).toBe("neto");
    expect(concluyeDeMas("Captas 25 y se van 14.", "eran 25 clientes y se nos van 14")).toBeNull();
  });
});

describe("14 · la conclusión que nadie dijo se corta, no tumba el dato", () => {
  it("se corta en la cola («, lo que…»); si no hay cola, no se puede", () => {
    const citado = "eran 25 clientes y se nos van 14";
    expect(sinLaConclusion("Cada mes captas 25 hospedajes mientras se van 14, lo que deja el saldo neto muy ajustado.", citado)).toBe("Cada mes captas 25 hospedajes mientras se van 14.");
    expect(sinLaConclusion("Tu cartera crece poco: captas 25 y se van 14.", citado)).toBeNull();
    expect(sinLaConclusion("Captas 25 y se van 14.", citado)).toBe("Captas 25 y se van 14.");
  });
});

describe("15 · lo que encontró la revisión del 10 nov", () => {
  const o = { firmaDe: () => "f", areas: new Set(["1", "2", "3"]), en: "2026-11-10T10:00:00.000Z" };
  const ok = (r: ReturnType<typeof editarElResumen>) => {
    if (!r.ok) throw new Error(r.error);
    return r.resumen;
  };

  it("«Quitar esta cifra / área / etapa» manda null con la clave de su campo, como el botón: quita la pieza entera", () => {
    const g = guardado2();
    expect(ok(editarElResumen(g, "op:o2:cifra:c2:texto", null, o)).operativas?.[1].cifras.map((c) => c.id)).toEqual(["c1"]);
    expect(ok(editarElResumen(g, "op:o1:nombre", null, o)).operativas?.map((x) => x.id)).toEqual(["o2"]);
    expect(ok(editarElResumen(g, "etapa:s1:texto", null, o)).recorrido?.map((e) => e.id)).toEqual(["s2"]);
    // Vaciar el texto a mano no es quitar: la cifra no puede quedar vacía.
    expect(editarElResumen(g, "op:o2:cifra:c2:cifra", "", o).ok).toBe(false);
    // Lo quitado así tampoco vuelve al rehacer.
    const sinArea = ok(editarElResumen(g, "op:o1:nombre", null, o));
    expect(juntarConLoEditado(guardado2(), sinArea).operativas?.map((x) => x.nombre)).toEqual(["Customer Success"]);
  });

  it("al pasar del formato 1 al 2, un hallazgo que alguien quitó no vuelve como reto", () => {
    const antes = ok(editarElResumen(guardado(), "hallazgo:1:h1-1", null, o));
    const nuevo = guardado2();
    nuevo.operativas = [{ ...CS, id: "o9", nombre: "Ventas", areaId: "1", retos: [{ id: "t1", texto: "Cada asesor llama desde su propio celular.", dimensionId: null, citas: [{ ...CITA, hablante: "Fernando Segura", texto: "Cada asesor tiene su propio celular" }] }] }];
    expect(juntarConLoEditado(nuevo, antes).operativas?.[0].retos).toEqual([]);
  });

  it("lo de la persona no entra en lo que la corrida guarda como escrito por la IA", () => {
    const antes = ok(editarElResumen(guardado(), "hallazgo:3:nuevo", "Lo escribió Marco.", o));
    const nuevo = guardado2();
    const copia = JSON.stringify(nuevo);
    juntarConLoEditado(nuevo, antes);
    expect(JSON.stringify(nuevo)).toBe(copia);
  });

  it("dentro de las tarjetas tampoco sale un equipo que el cliente dejó de ver", () => {
    const g = guardado2();
    g.operativas = [{ ...CS, retos: [{ id: "t1", texto: "Marketing no te pasa los leads calificados.", dimensionId: null, citas: [CITA_LUIS] }, ...CS.retos] }];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false, areasFuera: ["Marketing"] });
    expect(JSON.stringify(p)).not.toContain("Marketing");
  });

  it("un correo de la casa o personal no dice que alguien sea de otra empresa", () => {
    const correos = ["msalas@smarteamcr.com", "mario.salas@gmail.com", "mipena@hubspot.com"];
    const casa = new Set(["smarteamcr.com", "gmail.com"]);
    expect(esDeOtraEmpresa("Mario Salas", correos, ["centaurosolutions.com"], casa)).toBe(false);
    expect(esDeOtraEmpresa("Michael Pena", correos, ["centaurosolutions.com"], casa)).toBe(true);
  });

  it("la guía del agente no lleva las casillas internas (Particularidades)", () => {
    expect(guiaDelEquipo({ particularidades: ["La compra la aprueba la casa matriz"], retos: [{ texto: "CRM lead-driven" }] })).not.toContain("casa matriz");
  });
});

describe("16 · la segunda vuelta: lo que vio Elías en lo guardado de Centauro (11 nov)", () => {
  const CITA_TICKETS = { ...CITA_EMILEY, turno: 229, texto: "en WhatsApp son como de de 400 a 500 porque correo son 13. Entonces le para llegar a los 1008 sí son como 500" };

  it("una cifra es un solo dato: el 2,8 % y «14 de 25» no se funden; «25 de 50» con su meta sí vale", () => {
    expect(numerosDeOtroDicho("~2,8 % al mes", "Tu deserción ronda el 2,8 %: se van 14 frente a 25 que captas.", [CITA_EMILEY, CITA])).toEqual(["14·", "25·"]);
    expect(numerosDeOtroDicho("25 de 50", "Hoy haces 25 de las 50 reuniones semanales.", [{ texto: "Digamos que 25 25 la mitad." }, { texto: "son 50 a la semana en grupal." }])).toEqual([]);
    const e = leerElResumen(
      responde({ areas: [area({ cifras: [{ cifra: "2,8 % al mes", texto: "Se van 14 clientes frente a 25 que captas.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco, por ahí."), C("R2", 170, "eran 25 clientes y se nos van 14")] }] })] }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras).toEqual([]);
    expect(e.porArreglar[0].problemas?.join(" ")).toMatch(/un solo dato/);
  });

  it("una lectura nuestra («evitables») no se presenta como dicha por ellos", () => {
    expect(lecturaNuestra("200 tickets evitables al mes", "Unas 200 por ahí.")).toBe("evitables");
    expect(lecturaNuestra("200 consultas de uso al mes", "Unas 200 por ahí.")).toBeNull();
    expect(lecturaNuestra("Son casos evitables", "esos casos son evitables con un manual")).toBeNull();
  });

  it("un total que se cuela en el texto de una cifra se pide corregido («400 a 500… un total de 1.008»)", () => {
    const e = leerElResumen(
      responde({ areas: [area({ nombre: "Soporte", cifras: [{ cifra: "400 a 500 al mes", texto: "Llegan entre 400 y 500 por WhatsApp, un total de 1008 al mes.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 229, "en WhatsApp son como de de 400 a 500 porque correo son 13. Entonces le para llegar a los 1008 sí son como 500")] }] })] }),
      { ...CTX, reuniones: [R1, { ...R2, turnos: [...R2.turnos, { n: 229, hablante: "Emiley Calvo Jiménez", texto: CITA_TICKETS.texto }] }] },
      REGLAS,
    );
    expect(e.operativas[0].cifras).toEqual([]);
    expect(e.porArreglar[0].problemas?.join(" ")).toMatch(/total/);
  });

  it("si un equipo que tuvo reunión no está en ninguna etapa del recorrido, se avisa adentro", () => {
    const ctx = { areas: [{ id: "1", nombre: "Ventas" }, { id: "3", nombre: "Servicio" }], reuniones: [{ areaId: "1" }, { areaId: "3" }] };
    const soloVentas = [{ nombre: "Captación", quien: "Ventas" }, { nombre: "Cierre", quien: "Ventas" }];
    expect(avisosDelRecorrido(soloVentas, [], ctx)).toEqual(["El recorrido no tiene ninguna etapa de Servicio, y hubo una reunión con ese equipo: revísalo o rehaz el Resumen."]);
    // Se reconoce por un subequipo («Soporte» es de Servicio).
    expect(avisosDelRecorrido([...soloVentas, { nombre: "Atención", quien: "Soporte" }], [{ nombre: "Soporte", areaId: "3" }], ctx)).toEqual([]);
  });

  it("la auditoría relee lo guardado y encuentra lo que vio Elías", () => {
    const g = guardado2();
    g.operativas = [
      { ...CS, cifras: [{ id: "c1", cifra: "~2,8 % al mes", texto: "Tu deserción ronda el 2,8 %: se van 14 frente a 25 que captas.", estado: "declarado", nota: null, dimensionId: null, citas: [CITA_EMILEY, CITA] }] },
      { ...SOPORTE, cifras: [{ id: "c2", cifra: "~200 tickets evitables", texto: "Unas 200 consultas evitables.", estado: "declarado", nota: null, dimensionId: null, citas: [{ ...CITA_EMILEY, turno: 1009, texto: "Unas 200 por ahí." }] }] },
    ];
    const reuniones = [{ ...R2, turnos: [...R2.turnos, { n: 1009, hablante: "Emiley Calvo Jiménez", texto: "Esas pueden ser también aproximadamente, ¿qué? Unas 200 por ahí." }] }];
    const problemas = auditarElResumen(g, reuniones, [{ id: "1", nombre: "Ventas" }, { id: "3", nombre: "Servicio" }]).map((x) => `${x.donde}: ${x.problema}`).join(" | ");
    expect(problemas).toMatch(/2,8 %.*un solo dato/);
    expect(problemas).toMatch(/evitables/);
  });

  it("un «por qué» guardado que dice «provisional» no sale: va el de los datos", () => {
    const g = guardado2();
    g.areas["1"] = { hallazgos: [], porque: { texto: "Ventas está en Deficiente. Ese nivel es provisional porque no se exploró.", firma: firmaDelArea(CHEQUEO, "1", ENTORNO) } };
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: false });
    expect(p.areas[0]).toMatchObject({ porque: porqueDeRespaldo(VENTAS), origenDelPorque: "respaldo" });
  });

  it("la escala cambió desde el Resumen: adentro se avisa (compara la firma de los niveles); afuera, nada", () => {
    const g = { ...guardado2(), firmas: { "1": firmaDelArea(CHEQUEO, "1", ENTORNO) } };
    expect(resumenParaLaPagina(g, [VENTAS], CHEQUEO, ENTORNO, { conCitas: true }).escalaCambio).toBe(false);
    const otro = { ...CHEQUEO, "1.8": { nivel: "I", fuente: "reunion" } } as unknown as typeof CHEQUEO;
    expect(resumenParaLaPagina(g, [VENTAS], otro, ENTORNO, { conCitas: true }).escalaCambio).toBe(true);
    expect(resumenParaLaPagina(g, [VENTAS], otro, ENTORNO, { conCitas: false }).escalaCambio).toBeUndefined();
  });

  it("«Qué falta validar» tiene tres líneas como mucho, sin repetir el equipo sin explorar; lo escrito a mano va siempre", () => {
    const g = guardado2();
    g.pendientes = [
      { id: "p1", tipo: "sin-dato", texto: "Confirmar cuántos casos recibe Soporte al mes en total.", areaId: "3", citas: [] },
      { id: "p2", tipo: "hipotesis", texto: "Confirmar si la extranet puede enviar datos al CRM.", areaId: "3", citas: [] },
      { id: "p3", tipo: "sin-dato", texto: "Lo escribió Marco.", areaId: null, citas: [], mano: true },
    ];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.pendientes.map((x) => x.id)).toEqual(["x2", "h1", "p1", "p3"]);
  });

  it("la pestaña de un equipo sin sesiones solo se ve deshabilitada (sin «Por explorar») y afuera no es un enlace", () => {
    const html = renderToStaticMarkup(
      createElement(ArribaDeLaEscala, {
        actual: "resumen",
        pestanas: [
          { id: "resumen", nombre: "Resumen", href: "/r" },
          { id: "2", nombre: "Marketing", href: "/r?area=2", porExplorar: true },
        ],
      }),
    );
    expect(html).not.toContain("Por explorar");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('href="/r?area=2"');
  });

  it("el agente escribe qué falta confirmar de cada parte por explorar, sin «provisional»", () => {
    const e = leerElResumen(
      responde({
        areas: [area({ retos: [{ texto: "El seguimiento de cada hospedaje se hace a mano, uno por uno.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] }] })],
        confirmar: [
          { dimension: "1.8", texto: "Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas." },
          { dimension: "1.2", texto: "Esta parte no está por explorar." },
        ],
        pendientes: [{ tipo: "hipotesis", area: "1", texto: "El nivel de Ventas es provisional.", citas: [] }],
      }),
      CTX,
      REGLAS,
    );
    expect(e.confirmar).toEqual({ "1.8": "Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas." });
    expect(e.pendientes).toEqual([]);
  });
});

describe("17 · el recorrido no pierde etapas por algo de forma, y una cita con varios números no es «declarada»", () => {
  const LE = { ctx: CTX, personas: REGLAS.personas, firmas: REGLAS.firmas };
  const usage = { input_tokens: 10, output_tokens: 5 } as never;
  const resp = (x: unknown) => ({ ...responde(x), usage, stop_reason: "end_turn" as const });

  it("una etapa con su cita que dice «tarifa» sin que la cita lo diga se pide corregida y vuelve a su lugar", async () => {
    const principal = {
      areas: [area({ retos: [{ texto: "El seguimiento de cada hospedaje se hace a mano, uno por uno.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] }] })],
      recorrido: [
        { etapa: "Venta", quien: "Ventas", texto: "Cada asesor fija la tarifa y llama desde su celular.", friccion: null, citas: [C("R1", 369, "Cada asesor tiene su propio celular, cada uno con un número distinto.")] },
        { etapa: "Acompañamiento", quien: "Customer Success", texto: "Se revisa cada hospedaje en los primeros tres meses.", friccion: null, citas: [C("R2", 300, "en los primeros tres meses yo reviso uno por uno los accesos y las reservas")] },
      ],
    };
    const pedidos: string[] = [];
    const respuestas = [resp(principal), resp({ etapas: [{ i: 0, etapa: "Venta", texto: "Cada asesor llama desde su propio celular.", friccion: null }] })];
    const e = await escribirElResumen(LE, async (p) => {
      pedidos.push(String(p.system).slice(0, 30));
      return respuestas.shift()!;
    });
    expect(pedidos[1]).toMatch(/Corriges etapas/);
    expect(e.recorrido.map((x) => [x.id, x.nombre])).toEqual([
      ["s1", "Venta"],
      ["s2", "Acompañamiento"],
    ]);
    expect(e.recorrido[0].texto).toBe("Cada asesor llama desde su propio celular.");
  });

  it("una cita que dice tres números o más juntos no sostiene una cifra «declarada»: va «por confirmar»", () => {
    const rota = { ...CITA_EMILEY, turno: 229, texto: "en WhatsApp son como de de 400 a 500 porque correo son 13. Entonces le para llegar a los 1008 sí son como 500" };
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "~1.008 al mes", nota: null, citas: [rota] })).toEqual({ estado: "pendiente", nota: NOTA_DE_VARIOS_NUMEROS });
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "180 a 200 al mes", nota: null, citas: [{ ...CITA_EMILEY, texto: "mes a mes entre 180 y 200 leads al mes" }] }).estado).toBe("declarado");
  });
});

describe("18 · quién lo dijo no le llega al cliente (11 nov)", () => {
  it("un texto que cuenta quién dijo algo no pasa; uno que dice lo que pasa, sí", () => {
    const o = { personas: [] };
    expect(textoValido("La supervisora identificó que soporte pasó de 1500 tickets a 10000.", 200, o)).toMatchObject({ ok: false });
    expect(textoValido("El responsable mencionó que no hay tickets.", 200, o)).toMatchObject({ ok: false });
    expect(textoValido("Soporte pasó de 1500 tickets a 10000 en la bandeja.", 200, o).ok).toBe(true);
  });
});

describe("19 · lo que encontró la revisión del 11 nov", () => {
  const o = { firmaDe: () => "f", areas: new Set(["1", "2", "3"]), en: "2026-11-11T10:00:00.000Z" };
  const ok = (r: ReturnType<typeof editarElResumen>) => {
    if (!r.ok) throw new Error(r.error);
    return r.resumen;
  };

  it("una lectura nuestra no pasa porque la cita diga «podría»: tiene que decir la misma palabra", () => {
    expect(lecturaNuestra("Se podrían evitar unos 200 tickets al mes.", "no podría decirte el dato exacto, pero entran 200")).toBe("podrian evitar");
    expect(lecturaNuestra("200 tickets recuperables", "eso se puede recuperar")).toBe("recuperables");
    expect(lecturaNuestra("Son casos evitables", "esos son evitables")).toBeNull();
  });

  it("«quién lo dijo» es un rol que dice algo; una frase con «reportó» sin nadie que hable pasa", () => {
    const o2 = { personas: [] };
    expect(textoValido("El cliente reportó la falla y Soporte la atiende por WhatsApp.", 200, o2).ok).toBe(true);
    expect(textoValido("En una reunión se dijo que son 25 y en otra que son 20.", 200, o2).ok).toBe(true);
    expect(textoValido("La supervisora identificó que soporte pasó de 1500 tickets a 10000.", 200, o2).ok).toBe(false);
  });

  it("los tres números juntos no cuentan un año ni parten un decimal, y una cifra corregida a mano queda como la dejó", () => {
    expect(numerosDistintos("en 2025 captamos 25 clientes y se nos fueron 14")).toBe(2);
    expect(numerosDistintos("algo como un 2,8% si no me equivoco")).toBe(1);
    const cita = { ...CITA_EMILEY, texto: "en 2025 captamos 25 clientes y se nos fueron 14" };
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "14 de 25", nota: null, citas: [cita] }).estado).toBe("declarado");
    const rota = { ...CITA_EMILEY, texto: "en WhatsApp son como de de 400 a 500 porque correo son 13. Entonces le para llegar a los 1008" };
    expect(estadoDeLaCifra({ estado: "declarado", cifra: "~1008 al mes", nota: "Lo confirmó el equipo.", citas: [rota], mano: true })).toEqual({ estado: "declarado", nota: "Lo confirmó el equipo." });
  });

  it("una nota que cuenta quién lo dijo se va sola: la cifra queda", () => {
    const e = leerElResumen(
      responde({ areas: [area({ cifras: [{ cifra: "2,8 % al mes", texto: "De tus clientes se van cada mes.", estado: "declarado", nota: "La supervisora lo aporta como aproximado", dimension: null, citas: [C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco, por ahí.")] }], retos: [{ texto: "El seguimiento de cada hospedaje se hace a mano, uno por uno.", dimension: null, citas: [C("R2", 300, "yo reviso uno por uno los accesos y las reservas de cada hospedaje")] }] })] }),
      CTX,
      REGLAS,
    );
    expect(e.operativas[0].cifras[0]).toMatchObject({ cifra: "2,8 % al mes", nota: NOTA_DE_MEMORIA });
  });

  it("la línea de «confirmar» se edita y se quita, y «Rehacer con IA» no la pisa", () => {
    const g = { ...guardado2(), confirmar: { "1.8": "Confirmar cómo registran por qué ganan o pierden una venta; con eso terminamos de ubicar Ventas." } };
    const pagina = (x: ResumenGuardado) => resumenParaLaPagina(x, [VENTAS, SERVICIO], CHEQUEO, ENTORNO, { conCitas: true, porExplorar: POR_EXPLORAR });
    expect(pagina(g).pendientes.find((p) => p.tipo === "hipotesis")?.clave).toBe("confirmar:1.8");
    const cambiada = ok(editarElResumen(g, "confirmar:1.8", "Confirmar dónde anotan las ventas perdidas.", o));
    expect(pagina(cambiada).pendientes.find((p) => p.tipo === "hipotesis")?.texto).toBe("Confirmar dónde anotan las ventas perdidas.");
    const quitada = ok(editarElResumen(g, "confirmar:1.8", null, o));
    expect(pagina(quitada).pendientes.find((p) => p.tipo === "hipotesis")).toBeUndefined();
    const rehecho = juntarConLoEditado({ ...guardado2(), confirmar: { "1.8": "Otra cosa del agente." } }, quitada);
    expect(pagina(rehecho).pendientes.find((p) => p.tipo === "hipotesis")).toBeUndefined();
    expect(leerContenido({ resumenDeLaEscala: quitada }).resumenDeLaEscala).toMatchObject({ confirmar: { "1.8": "" }, confirmarMano: ["1.8"] });
  });

  it("un pendiente escrito a mano que nombra a un equipo sin sesiones sale igual; lo viejo con «provisional», no", () => {
    const g = guardado2();
    g.pendientes = [
      { id: "p1", tipo: "sin-dato", texto: "Agendar la sesión con Marketing.", areaId: null, citas: [], mano: true },
      { id: "p2", tipo: "hipotesis", texto: "El nivel de Ventas es provisional hasta confirmar.", areaId: "1", citas: [] },
    ];
    const p = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    expect(p.pendientes.map((x) => x.id)).toContain("p1");
    expect(p.pendientes.map((x) => x.id)).not.toContain("p2");
  });

  it("afuera, tres líneas como mucho (más lo escrito a mano); adentro se ve todo para poder quitarlo", () => {
    const g = guardado2();
    g.pendientes = [1, 2, 3].map((i) => ({ id: `p${i}`, tipo: "sin-dato" as const, texto: `Confirmar el dato número ${i}.`, areaId: null, citas: [] }));
    const afuera = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });
    const adentro = resumenParaLaPagina(g, [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: true, porExplorar: POR_EXPLORAR });
    expect(afuera.pendientes).toHaveLength(3);
    expect(adentro.pendientes).toHaveLength(5);
  });

  it("descartar un «por qué» por decir «provisional» no avisa que los niveles cambiaron", () => {
    const g = guardado2();
    g.areas["1"] = { hallazgos: [], porque: { texto: "Ese nivel es provisional.", firma: firmaDelArea(CHEQUEO, "1", ENTORNO) } };
    expect(resumenParaLaPagina(g, [VENTAS], CHEQUEO, ENTORNO, { conCitas: true }).areas[0]).toMatchObject({ origenDelPorque: "respaldo", porqueViejo: false });
  });

  it("la página pública no abre la pestaña de un equipo sin sesiones, tampoco con ?area=", () => {
    const pagina = fs.readFileSync(path.join(RAIZ, "app/external/escala/[token]/page.tsx"), "utf8");
    expect(pagina).toMatch(/area !== PESTANA_DEL_RESUMEN && !sinExplorar\.has\(area\)/);
  });

  it("la firma de los niveles sobrevive a guardar y volver a leer", () => {
    const g = { ...guardado2(), firmas: { "1": "firma" }, avisos: ["El recorrido no tiene ninguna etapa de Servicio."] };
    expect(leerContenido({ resumenDeLaEscala: g }).resumenDeLaEscala).toMatchObject({ firmas: { "1": "firma" }, avisos: g.avisos });
  });
});

describe("20 · el Sistema 2 de la escala (12 nov)", () => {
  const pestanas = [
    { id: "resumen", nombre: "Resumen", href: "/r" },
    { id: "1", nombre: "Ventas", href: "/r?area=1" },
    { id: "2", nombre: "Marketing", href: "/r?area=2", porExplorar: true },
    { id: "3", nombre: "Servicio", href: "/r?area=3" },
  ];
  const resumen = () => resumenParaLaPagina(guardado2(), [VENTAS, SERVICIO, MARKETING], CHEQUEO, ENTORNO, { conCitas: false, porExplorar: POR_EXPLORAR });

  it("la pestaña de un equipo sin sesiones va al final, después de las que se abren", () => {
    expect(enSuOrden(pestanas).map((p) => p.nombre)).toEqual(["Resumen", "Ventas", "Servicio", "Marketing"]);
    const html = renderToStaticMarkup(createElement(ArribaDeLaEscala, { actual: "resumen", pestanas }));
    expect(html.indexOf(">Servicio<")).toBeLessThan(html.indexOf(">Marketing<"));
    expect(html).toContain("rd-btn-por-explorar");
  });

  it("el título es «Qué entendimos del negocio», los atajos van debajo y antes de las cifras", () => {
    const html = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumen(), empresa: "Centauro Solutions", pestanas }));
    expect(html).toContain("Qué entendimos del negocio");
    expect(html).not.toContain("Lo que vimos de tu empresa");
    const titulo = html.indexOf("Qué entendimos del negocio");
    const atajos = html.indexOf("rs-ruta");
    const cifras = html.indexOf("rs-numeros");
    expect(titulo).toBeLessThan(atajos);
    expect(atajos).toBeLessThan(cifras);
    expect(html).toContain('href="#rs-negocio"');
    expect(html).toContain('class="dr rd-v3 rd-s2"');
  });

  it("«Por confirmar» va sin el signo de pregunta, en todos sus chips", () => {
    const html = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumen(), empresa: "Centauro Solutions", pestanas }));
    expect(html).toContain("Por confirmar");
    expect(html).not.toMatch(/rs-estado-pendiente"><span aria-hidden="true">\?/);
  });

  it("«Lo que le impide rendir más» lleva su clase, para alinearse con las otras listas", () => {
    const css = fs.readFileSync(path.join(RAIZ, "components/external/test/resultado.css"), "utf8");
    expect(css).toMatch(/\.rd-s2 \.rs-bloque-frena \.rs-lista li::before \{ content: "○"/);
    expect(fs.readFileSync(path.join(RAIZ, "components/external/test/ResumenDeLaEscalaVista.tsx"), "utf8")).toContain('className="rs-bloque rs-bloque-frena"');
  });

  it("el logo de la ficha sale en lugar de la inicial; sin logo, el círculo", () => {
    const con = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumen(), empresa: "Centauro Solutions", logo: "https://cdn.test/logo.png", pestanas }));
    expect(con).toContain('src="https://cdn.test/logo.png"');
    expect(con).not.toContain("rd-empresa-logo");
    const sin = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumen(), empresa: "Centauro Solutions", pestanas }));
    expect(sin).toContain("rd-empresa-logo");
    expect(logoQueSeSirve("https://x.supabase.co/storage/v1/object/public/public-assets/logo.png")).toBe("https://x.supabase.co/storage/v1/object/public/public-assets/logo.png");
    for (const malo of ["http://x.test/logo.png", "javascript:alert(1)", "data:image/png;base64,AAA", "logo.png", "", null]) expect(logoQueSeSirve(malo)).toBeNull();
  });

  it("la página de un área de la escala lleva el Sistema 2 y el logo; el resultado del test público, no", () => {
    const escala = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "Centauro Solutions", agenda: "", logo: "https://cdn.test/logo.png", deLaEscala: { areas: pestanas.slice(1), porExplorar: [] } }),
    );
    expect(escala).toContain("rd-s2");
    expect(escala).toContain('src="https://cdn.test/logo.png"');
    expect(escala).toContain(`Las ${VENTAS.total} partes de Ventas`);
    const test = renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "Centauro Solutions", agenda: "", logo: "https://cdn.test/logo.png" }));
    expect(test).not.toContain("rd-s2");
    expect(test).not.toContain("cdn.test");
    expect(test).not.toContain("partes de Ventas");
  });
});

describe("21 · la verificación justa y lo que se repara (12 nov, Centauro en producción)", () => {
  it("«23 mil» es «23 000», y «un mes» sostiene «1 mes»", () => {
    expect(cifrasDeMas("~23 000 contactos", "tenemos como 23 mil contactos en la base")).toEqual([]);
    expect(cifrasDeMas("8 días a 1 mes", "puede tardar de 8 días a un mes")).toEqual([]);
    expect(cifrasDeMas("8 días a 2 meses", "puede tardar de 8 días a un mes")).toEqual(["2·"]);
  });

  it("un número chico o un año valen si la empresa los dijo en la reunión; una magnitud, solo si está en la cita", () => {
    expect(cifrasDeMas("Tus dos marcas captan leads.", "captamos leads con las marcas", { chicos: "tenemos dos marcas de captación" })).toEqual([]);
    expect(cifrasDeMas("Entran 150 leads al mes.", "entran leads al mes", { chicos: "a veces entran 150" })).toEqual(["150·"]);
    expect(cifrasDeMas("Desde 2026 se mide.", "ahora sí se mide", { anios: "2026" })).toEqual([]);
    expect(cifrasDeMas("Tus dos marcas captan leads.", "captamos leads con las marcas")).toEqual(["2·"]);
  });

  it("lo que encontró la revisión: ni «2000 clientes» es un año, ni «un» cualquiera sostiene un 1, y «2,5 mil» es 2500", () => {
    const r: ReunionParaElResumen = { ...R1, turnos: [...R1.turnos, { n: 400, hablante: "Fernando Segura", texto: "tenemos 2000 clientes activos en toda la región, desde 2024 crecimos" }] };
    const anios = loDeSusReuniones([], [r]).anios;
    expect(cifrasDeMas("2000 tickets al mes", "llegan tickets", { anios })).toEqual(["2000·"]);
    expect(cifrasDeMas("Desde 2024 se mide.", "ahora se mide", { anios })).toEqual([]);
    expect(cifrasDeMas("1 % al mes", "algo como un 2,8% si no me equivoco")).toEqual(["1·"]);
    expect(cifrasDeMas("2500 contactos", "tenemos 2,5 mil contactos")).toEqual([]);
    expect(cifrasDeMas("5000 contactos", "tenemos 2,5 mil contactos")).toEqual(["5000·"]);
    expect(herramientasDeMas("Llevan todo en Excel.", "lo llevan a mano", "el servicio es excelente")).toEqual(["excel"]);
    // Un número chico de un turno lejano no sostiene nada: solo los vecinos de la cita.
    const cita = { reunion: R1.id, turno: 20 };
    expect(loDeSusReuniones([cita], [R1]).chicos).toContain("vendemos productos");
    expect(loDeSusReuniones([cita], [R1]).chicos).not.toContain("Cada asesor tiene su propio celular");
  });

  it("una herramienta vale si la empresa la nombró en sus reuniones, aunque no en la cita corta; una que nunca nombró, no", () => {
    expect(herramientasDeMas("Los casos llegan por WhatsApp.", "los casos llegan a la bandeja", "nos escriben por WhatsApp")).toEqual([]);
    expect(herramientasDeMas("Llevan todo en Excel.", "llevan todo a mano", "nos escriben por WhatsApp")).toEqual(["excel"]);
  });

  it("el voseo con mayúscula al empezar una frase también se caza; «Además» o un nombre, no", () => {
    expect(voseoDelResumen("Considerás activo a quien abrió un correo en los últimos 6 meses.")).toEqual(["Considerás"]);
    expect(voseoDelResumen("Tenés 500 clientes.")).toEqual(["Tenés"]);
    expect(voseoDelResumen("Además, tu equipo revisa cada caso. Después lo cierra.")).toEqual([]);
    expect(voseoDelResumen("El estrés del equipo sube. Envío exprés.")).toEqual([]);
    expect(textoValido("Considerás activo a quien abrió un correo.", 200, { personas: [] })).toMatchObject({ ok: false });
  });

  it("una cita pegada con «;» vale si cada pedazo está en la reunión, y queda partida; si un pedazo no está, no vale", () => {
    const pegada = C("R1", 20, "vendemos productos para hospedajes, hoteles pequeños y medianos; la parte de desarrollo de software es otra división");
    const citas = citasVerificadas([pegada], CTX.reuniones);
    expect(citas.map((c) => c.texto).join(" ")).toMatch(/hospedajes[\s\S]*otra división/);
    const conInventado = C("R1", 20, "vendemos productos para hospedajes, hoteles pequeños y medianos; también vendemos seguros de viaje a los turistas");
    expect(citasVerificadas([conInventado], CTX.reuniones)).toEqual([]);
  });

  it("un turno que es solo un número vale como cita de una cifra si corrige una cantidad dicha justo antes", () => {
    const r: ReunionParaElResumen = { ...R1, turnos: [...R1.turnos, { n: 264, hablante: "Fernando Segura", texto: "En este momento cerramos unos 30 al mes." }, { n: 265, hablante: "Emiley Calvo Jiménez", texto: "25." }] };
    expect(citasVerificadas([C("R1", 265, "25")], [r], { cifra: true })).toHaveLength(1);
    expect(citasVerificadas([C("R1", 265, "25")], [r])).toEqual([]);
    const sinCantidad: ReunionParaElResumen = { ...R1, turnos: [...R1.turnos, { n: 264, hablante: "Marco Salas", texto: "¿Cuántos años llevan en el mercado?" }, { n: 265, hablante: "Emiley Calvo Jiménez", texto: "25." }] };
    expect(citasVerificadas([C("R1", 265, "25")], [sinCantidad], { cifra: true })).toEqual([]);
  });

  it("el motivo de una cifra corregida que no pasa se dice (antes salía «()» vacío)", () => {
    const cita = { reunion: R2.id, fecha: R2.fecha, turno: 161, hablante: "Emiley Calvo Jiménez", texto: "si tenemos algo como un 2,8% si no me equivoco, por ahí." };
    const problemas = problemasDeLaCifra({ cifra: "2,8 % al mes", texto: "Se van 2,8 % de tus clientes; con 500 son 14 bajas.", nota: null, citas: [cita, { ...cita, turno: 59, texto: "si son 500 clientes y solo uno atendiendo tickets" }] }, "", [R2]);
    expect(problemas.join(" ")).toMatch(/otro dicho \(14\)|lo citado \(14\)/);
    expect(problemasDeLaCifra({ cifra: "2,8 % al mes", texto: "De tus clientes se dan de baja cada mes.", nota: null, citas: [cita] }, "", [R2])).toEqual([]);
  });

  it("una cifra que es una definición no sale; un pendiente que cuenta cómo se armó una cifra, tampoco", () => {
    const e = leerElResumen(
      responde({
        areas: [area({ cifras: [{ cifra: "~6 meses", texto: "Consideras activo a quien abrió o interactuó en los últimos 6 meses.", estado: "declarado", nota: null, dimension: null, citas: [C("R2", 161, "si tenemos algo como un 2,8% si no me equivoco, por ahí.")] }] })],
        pendientes: [{ tipo: "sin-dato", area: "3", texto: "Confirmar el total de casos: la cifra de 1.800 se construyó combinando estimaciones dadas con dudas.", citas: [] }],
      }),
      CTX,
      REGLAS,
    );
    expect(e.descartados.join(" ")).toMatch(/definición/);
    expect(e.pendientes).toEqual([]);
    // Un pendiente que solo dice que algo no se recordó en la reunión no es cocina: sale.
    const otro = leerElResumen(
      responde({ areas: [area({})], pendientes: [{ tipo: "sin-dato", area: "1", texto: "Confirmar qué herramienta usan para las listas de prospectos; en la reunión no se recordó el nombre.", citas: [] }] }),
      CTX,
      REGLAS,
    );
    expect(otro.pendientes).toHaveLength(1);
  });

  it("lo que la revisión marcaría se quita antes de guardar (y lo escrito a mano no se toca)", () => {
    const cita = { reunion: R1.id, fecha: R1.fecha, turno: 20, hablante: "Fernando Segura", texto: "vendemos productos para hospedajes, hoteles pequeños y medianos" };
    const g = {
      negocio: {
        vende: [{ id: "n1", texto: "Vendes productos para hospedajes pequeños y medianos.", citas: [cita] }],
        busca: [{ id: "n2", texto: "Quieres crecer tu cartera de hospedajes.", citas: [cita] }, { id: "n3", texto: "Quieres crecer, lo escribió Marco.", citas: [cita], mano: true }],
      },
      recorrido: [],
      operativas: [],
      pendientes: [{ id: "p1", tipo: "sin-dato" as const, texto: "La cifra de 1.800 se construyó combinando estimaciones.", areaId: null, citas: [] }],
    };
    const r = quitarLoQueNoPasa(g, [R1, R2]);
    expect(r.resumen.negocio.vende?.map((p) => p.id)).toEqual(["n1"]);
    expect(r.resumen.negocio.busca?.map((p) => p.id)).toEqual(["n3"]);
    expect(r.resumen.pendientes).toEqual([]);
    expect(r.quitados.length).toBe(2);
  });

  it("una pieza corregida vuelve a su lugar, sin pasar el tope ni repetirse", () => {
    const cita = { reunion: R1.id, fecha: R1.fecha, turno: 369, hablante: "Fernando Segura", texto: "WhatsApp desde celular" };
    const op: AreaOperativa = { id: "o1", nombre: "Ventas", areaId: "1", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null };
    const vacio: Pick<LoQueEscribioElAgente, "negocio" | "operativas"> = { negocio: {}, operativas: [op] };
    const e = conLasPiezas(vacio, [
      { lugar: "o1:organizacion", texto: "Cada asesor escribe por WhatsApp desde su celular.", citas: [cita], problema: "x" },
      { lugar: "o1:organizacion", texto: "Cada asesor escribe por WhatsApp desde su celular.", citas: [cita], problema: "x" },
      { lugar: "negocio:vende", texto: "Vendes productos para hospedajes.", citas: [cita], problema: "x" },
    ]);
    expect(e.operativas[0].organizacion.map((p) => p.texto)).toEqual(["Cada asesor escribe por WhatsApp desde su celular."]);
    expect(e.negocio.vende).toHaveLength(1);
  });

  it("un equipo con reunión y sin etapa se reconoce (para pedirle su etapa)", () => {
    const ctx = { areas: [{ id: "1", nombre: "Ventas" }, { id: "2", nombre: "Marketing" }], reuniones: [{ areaId: "1" }, { areaId: "2" }] };
    expect(equiposSinEtapa([{ nombre: "Demo y cierre", quien: "Ventas" }], [], ctx)).toEqual(["2"]);
    expect(equiposSinEtapa([{ nombre: "Captación", quien: "Marketing" }, { nombre: "Demo", quien: "Ventas" }], [], ctx)).toEqual([]);
  });
});
