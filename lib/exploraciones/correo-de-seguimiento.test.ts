/**
 * lib/exploraciones/correo-de-seguimiento.test.ts — el correo de seguimiento de una reunión: qué le
 * llega al agente (nada interno), cómo se arma el texto y qué se avisa antes de mandarlo.
 * Correr: `npx vitest run lib/exploraciones/correo-de-seguimiento.test.ts --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { fichaVacia, valoresVacios } from "@/lib/clients/ficha";
import { armarMemoriaDeLaCuenta } from "@/lib/memoria/armar";
import { CONSUMIDORES_DE_LA_MEMORIA } from "@/lib/memoria/consumidores";
import {
  aplicarOperaciones,
  cambioLoConfirmado,
  contenidoVacio,
  propuestaVacia,
  VALIDADOR_LIBRE,
  type ContenidoDeExploracion,
  type CorreoDeSeguimiento,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type LecturaDeReunion,
  type Validez,
} from "./contenido";
import {
  avisosDelCorreo,
  componerElCorreo,
  compromisosDeLaLectura,
  enlaceDeCorreo,
  insumosDelCorreo,
  minutaParaElCorreo,
  paraDeLaReunion,
  recortarLaReunion,
  textoDeLaPreguntaAbierta,
  voseoEnElCorreo,
  type PartesDelCorreo,
} from "./correo-de-seguimiento";
import { leerElCorreo, mensajeDelCorreo, NOMBRE_DE_LA_HERRAMIENTA_DEL_CORREO, type ContextoDelCorreo } from "./correo-de-seguimiento-pedido";
import { leerPropuesta } from "./esquemas";
import { sePuedeReintentar } from "./reintento";

const HOY = "2026-10-07";

const LECTURA: LecturaDeReunion = {
  etiqueta: "Reunión del 6 oct: Exploración",
  resumen: "Mariana contó que llevan los leads en Excel y que pierden el seguimiento después de la feria.",
  cobertura: [
    { para: "metas", pregunta: "¿Qué quieres lograr este año?", respondida: true, detalle: "Pasar de 40 a 80 cierres al mes" },
    { para: "presupuesto", pregunta: "¿Tienen un rango de inversión pensado?", respondida: true, detalle: "SECRETO-MONTO-DEL-PRESUPUESTO" },
    { para: "tiempos", pregunta: "¿Para cuándo lo necesitan?", respondida: false },
    { para: "autoridad", pregunta: "¿Quién da el visto bueno final?", respondida: false },
    { para: "1.3", pregunta: "¿Cómo deciden a qué lead llamar primero?", respondida: false },
  ],
  en: "2026-10-06T20:00:00.000Z",
  corridaId: "run-lectura",
};

function estado(
  parcial: { contenido?: Partial<ContenidoDeExploracion>; correos?: Record<string, CorreoDeSeguimiento>; items?: ItemPropuesto[] } = {},
): EstadoDeExploracion {
  return {
    contenido: { ...contenidoVacio(), ...parcial.contenido },
    propuesta: { ...propuestaVacia(), lecturas: { "meet:m1": LECTURA }, correos: parcial.correos ?? {}, items: parcial.items ?? [] },
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
  };
}

/** Una exploración con todo lo interno lleno: nada de esto puede llegarle al agente del correo. */
const INTERNO = {
  casillas: {
    hipotesis: ["SECRETO-HIPOTESIS"],
    presupuesto: "SECRETO-PRESUPUESTO",
    autoridad: [{ nombre: "SECRETO-QUIEN-FIRMA", rol: "firma" }],
    objeciones: [{ clase: "precio", texto: "SECRETO-OBJECION" }],
    particularidades: ["SECRETO-PARTICULARIDAD"],
    apertura: "SECRETO-APERTURA",
    siguientePaso: { que: "Revisar el portal juntos", fecha: "2026-10-10", conQuien: "Mariana" },
  } as unknown as ContenidoDeExploracion["casillas"],
  notas: {
    "sesion:s-1": "SECRETO-NOTA-LIBRE: no confía en consultoras",
    "sesion:s-1:metas": "Quieren duplicar los cierres antes de marzo",
    "sesion:s-1:presupuesto": "SECRETO-NOTA-DEL-PRESUPUESTO",
    "instrucciones:exploracion": "SECRETO-INSTRUCCIONES",
  },
  sesiones: [
    { id: "s-1", fecha: "2026-10-06", hecha: true },
    {
      id: "s-2",
      fecha: "2026-10-14",
      titulo: "Revisión del proceso",
      explorar: [
        "No se preguntó. Qué preguntar: ¿Para cuándo lo necesitan?",
        "Mencionó la feria de marzo — qué preguntar: ¿Cuántos leads llegan de la feria?",
        "De otra sesión — qué preguntar: ¿Algo de antes?",
        "Lo del presupuesto — qué preguntar: SECRETO-PREGUNTA-INTERNA",
      ],
      explorarDe: {
        "No se preguntó. Qué preguntar: ¿Para cuándo lo necesitan?": "s-1",
        "Mencionó la feria de marzo — qué preguntar: ¿Cuántos leads llegan de la feria?": "s-1",
        "De otra sesión — qué preguntar: ¿Algo de antes?": "s-0",
        "Lo del presupuesto — qué preguntar: SECRETO-PREGUNTA-INTERNA": "s-1",
      },
      explorarPara: { "Lo del presupuesto — qué preguntar: SECRETO-PREGUNTA-INTERNA": "presupuesto" },
    },
  ],
} satisfies Partial<ContenidoDeExploracion>;

const INSUMOS = () => insumosDelCorreo(estado({ contenido: INTERNO }), { lectura: LECTURA, sesionId: "s-1", hoy: HOY, agenda: [] });

function contexto(parcial: Partial<ContextoDelCorreo> = {}): ContextoDelCorreo {
  return {
    marco: "venta",
    empresa: "Acme",
    reunion: { titulo: "Exploración", fecha: "2026-10-06T15:00:00.000Z" },
    firma: "Andrés Pinzón",
    equipo: ["Andrés Pinzón"],
    para: ["mariana@acme.com"],
    hoy: HOY,
    insumos: INSUMOS(),
    reunionTexto: "--- Transcripción ---\nMariana: llevamos todo en Excel.",
    ...parcial,
  };
}

describe("a quién va", () => {
  it("solo las personas del cliente: sin Smarteam, sin salas ni grabadores, sin repetir", () => {
    expect(
      paraDeLaReunion([
        "Mariana@Acme.com",
        "mariana@acme.com",
        "apinzon@smarteamcr.com",
        "c_123@group.calendar.google.com",
        "notetaker@fireflies.ai",
        "no es un correo",
        "luis@acme.com",
      ]),
    ).toEqual(["mariana@acme.com", "luis@acme.com"]);
  });
});

describe("⛔ al agente del correo no le llega nada interno", () => {
  it("ni el presupuesto, ni quién firma, ni hipótesis, objeciones, notas libres o instrucciones", () => {
    const texto = mensajeDelCorreo(contexto());
    expect(texto).not.toMatch(/SECRETO/);
  });

  it("lo que respondió el cliente: de la lectura y de lo anotado en «En vivo», sin lo del presupuesto", () => {
    const i = INSUMOS();
    expect(i.respuestas).toEqual([
      { pregunta: "¿Qué quieres lograr este año?", respuesta: "Pasar de 40 a 80 cierres al mes" },
      { pregunta: "¿Qué quieres lograr este año?", respuesta: "Quieren duplicar los cierres antes de marzo" },
    ]);
  });

  it("lo que quedó abierto: lo que no se preguntó y lo llevado desde ESTA sesión, una vez cada cosa", () => {
    expect(INSUMOS().preguntasAbiertas).toEqual(["¿Para cuándo lo necesitan?", "¿Cómo deciden a qué lead llamar primero?", "¿Cuántos leads llegan de la feria?"]);
  });

  it("también lo que el agente vio que se dijo en ESTA reunión sin explorar, si nadie lo descartó", () => {
    const item = (id: string, valor: string, etiqueta: string): ItemPropuesto => ({
      id,
      destino: { tipo: "casilla", clave: "noExplorado" },
      valor,
      fuentes: [{ id: "S1", etiqueta, cita: "llegan muchos de la feria" }],
      corridaId: "run-lectura",
      en: "2026-10-06T20:00:00.000Z",
    });
    const e = estado({
      contenido: { descartadas: ["descartado"] },
      items: [
        item("de-esta", "Mencionó la feria — qué preguntar: ¿Cuántos llegan de la feria?", LECTURA.etiqueta),
        item("de-otra", "Otra cosa — qué preguntar: ¿De otra reunión?", "Reunión del 1 oct: otra"),
        item("descartado", "Descartado — qué preguntar: ¿Ya no va?", LECTURA.etiqueta),
      ],
    });
    const i = insumosDelCorreo(e, { lectura: LECTURA, sesionId: null, hoy: HOY, agenda: [] });
    expect(i.preguntasAbiertas).toEqual(["¿Para cuándo lo necesitan?", "¿Cómo deciden a qué lead llamar primero?", "¿Cuántos llegan de la feria?"]);
  });

  it("una pregunta llevada se limpia: sin «No se preguntó.» y solo la pregunta", () => {
    expect(textoDeLaPreguntaAbierta("No se preguntó. Qué preguntar: ¿Para cuándo?")).toBe("¿Para cuándo?");
    expect(textoDeLaPreguntaAbierta("Habló de la feria")).toBe("Habló de la feria");
  });
});

describe("la próxima reunión y el siguiente paso", () => {
  it("con una sesión planeada con fecha, esa es la próxima; el siguiente paso vigente va", () => {
    const i = INSUMOS();
    expect(i.proxima).toEqual({ titulo: "Revisión del proceso", fecha: "2026-10-14" });
    expect(i.siguientePaso).toEqual({ que: "Revisar el portal juntos", fecha: "2026-10-10", conQuien: "Mariana" });
  });

  it("sin otra reunión, pide horarios para una sesión extra en vez de inventar una fecha", () => {
    const i = insumosDelCorreo(estado(), { lectura: LECTURA, sesionId: null, hoy: HOY, agenda: [] });
    expect(i.proxima).toBeNull();
    expect(mensajeDelCorreo(contexto({ insumos: i }))).toMatch(/NO HAY OTRA REUNIÓN AGENDADA[^\n]*sesión extra/);
  });

  it("sin sesión planeada, la agenda de HubSpot; un siguiente paso vencido no va", () => {
    const e = estado({ contenido: { casillas: { siguientePaso: { que: "Llamar", fecha: "2026-10-01" } } as ContenidoDeExploracion["casillas"] } });
    const i = insumosDelCorreo(e, { lectura: null, sesionId: null, hoy: HOY, agenda: [{ titulo: "Demo", inicio: "2026-10-09T16:00:00.000Z" }] });
    expect(i.proxima).toEqual({ titulo: "Demo", fecha: "2026-10-09T16:00:00.000Z" });
    expect(i.siguientePaso).toBeNull();
  });

  it("⛔ el título de un evento del calendario no llega al correo: solo la fecha (o el título que escribió la persona)", () => {
    const evento = { id: "e9", calendario: "eli@smarteamcr.com", inicio: "2026-10-14T15:00:00.000Z", titulo: "Revisión con OTRO-CLIENTE" };
    const sinTitulo = insumosDelCorreo(estado({ contenido: { sesiones: [{ id: "s-2", fecha: "2026-10-14", evento }] } }), { lectura: null, sesionId: null, hoy: HOY, agenda: [] });
    expect(sinTitulo.proxima).toEqual({ titulo: null, fecha: "2026-10-14" });
    const conTitulo = insumosDelCorreo(estado({ contenido: { sesiones: [{ id: "s-2", fecha: "2026-10-14", evento, titulo: "Revisión del proceso" }] } }), { lectura: null, sesionId: null, hoy: HOY, agenda: [] });
    expect(conTitulo.proxima?.titulo).toBe("Revisión del proceso");
  });
});

const PARTES: PartesDelCorreo = {
  asunto: "Seguimiento de la exploración",
  saludo: "Hola Mariana,",
  apertura: "Gracias por tu tiempo ayer. Te comparto lo que entendimos y lo que quedó abierto.",
  entendimos: ["Hoy llevan los leads en Excel.", "Quieren pasar de 40 a 80 cierres al mes."],
  acuerdos: [],
  proximosPasos: [{ que: "Enviar el acceso al portal", quien: "tu equipo", cuando: "el viernes" }],
  preguntas: ["¿Para cuándo lo necesitan?"],
  agenda: "Nos vemos el martes 14 de octubre para revisar el proceso.",
  cierre: "Cualquier cosa, me escribes.",
};

describe("el texto", () => {
  it("arma las partes en orden, sin las secciones vacías y con la firma", () => {
    const { asunto, cuerpo } = componerElCorreo(PARTES, "Andrés Pinzón");
    expect(asunto).toBe("Seguimiento de la exploración");
    expect(cuerpo).toBe(
      [
        "Hola Mariana,",
        "Gracias por tu tiempo ayer. Te comparto lo que entendimos y lo que quedó abierto.",
        "Lo que entendimos\n• Hoy llevan los leads en Excel.\n• Quieren pasar de 40 a 80 cierres al mes.",
        "Próximos pasos\n• Enviar el acceso al portal — tu equipo, el viernes",
        "Preguntas que quedaron abiertas\n1. ¿Para cuándo lo necesitan?",
        "Nos vemos el martes 14 de octubre para revisar el proceso.",
        "Cualquier cosa, me escribes.",
        "Andrés Pinzón\nSmarteam",
      ].join("\n\n"),
    );
  });

  it("sin quien firma, firma el equipo", () => {
    expect(componerElCorreo(PARTES, null).cuerpo.endsWith("El equipo de Smarteam")).toBe(true);
  });

  it("si la reunión no entra, se queda el principio y el final (ahí se acuerda qué sigue)", () => {
    const t = `INICIO${"x".repeat(50_000)}FINAL`;
    const r = recortarLaReunion("notas", t, 10_000);
    expect(r.length).toBeLessThan(10_200);
    expect(r).toMatch(/INICIO/);
    expect(r).toMatch(/FINAL$/);
    expect(r).toMatch(/\[…\]/);
  });
});

function respuesta(input: unknown, stop: Anthropic.Messages.Message["stop_reason"] = "tool_use"): Anthropic.Messages.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "x",
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 } as Anthropic.Messages.Usage,
    content: [{ type: "tool_use", id: "t", name: NOMBRE_DE_LA_HERRAMIENTA_DEL_CORREO, input } as Anthropic.Messages.ToolUseBlock],
  } as Anthropic.Messages.Message;
}

describe("lo que devuelve el agente", () => {
  it("⛔ sin la conversación (solo la invitación) no hay correo: no se le escribe al cliente que no teníamos notas", () => {
    expect(leerElCorreo(respuesta({ ...PARTES, sinConversacion: true }), contexto())).toBe("sin-conversacion");
    expect(leerElCorreo(respuesta({ ...PARTES, sinConversacion: false }), contexto())).not.toBe("sin-conversacion");
  });

  it("cortado por el largo no se guarda: un correo a medias no sirve", () => {
    expect(leerElCorreo(respuesta(PARTES, "max_tokens"), contexto())).toBeNull();
  });

  it("sin preguntas abiertas, el correo no lleva preguntas aunque el agente haya escrito alguna", () => {
    const i = insumosDelCorreo(estado(), { lectura: null, sesionId: null, hoy: HOY, agenda: [] });
    const p = leerElCorreo(respuesta({ ...PARTES, asunto: "" }), contexto({ insumos: i }));
    if (!p || p === "sin-conversacion") throw new Error("tenía que leer el correo");
    expect(p.preguntas).toEqual([]);
    expect(p.asunto).toBe("Seguimiento: Exploración");
  });
});

describe("antes de mandarlo", () => {
  it("avisa de un monto, de un espacio por completar y del voseo", () => {
    const avisos = avisosDelCorreo("Seguimiento", "La implementación queda en US$ 12.000. Te escribo el [día]. Si podés, contame.");
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toMatch(/monto/);
    expect(avisos[1]).toMatch(/\[día\]/);
    expect(avisos[2]).toMatch(/voseo/);
  });

  it("un correo limpio no tiene avisos: ni el futuro, ni los nombres propios, ni los plurales son voseo", () => {
    const { asunto, cuerpo } = componerElCorreo(PARTES, "Andrés");
    const prosa = `${cuerpo}\nPodrás revisarlo cuando quieras. Inés y Tomás viajan a Bogotá. Los hoteles de Alajuela y el wireframe del rescate.`;
    expect(avisosDelCorreo(asunto, prosa)).toEqual([]);
  });

  it("el voseo que sí cuenta: el presente, «vos» y los imperativos de un correo", () => {
    expect(voseoEnElCorreo("Si podés, contame. Fijate el adjunto. Vos sabés.")).toEqual(["Vos", "podés", "sabés", "contame", "Fijate"]);
  });

  it("el enlace al correo lleva el texto si entra, y si no, solo el asunto", () => {
    const corto = enlaceDeCorreo(["mariana@acme.com"], "Hola", "Texto corto");
    expect(corto.conCuerpo).toBe(true);
    expect(corto.href).toBe("mailto:mariana@acme.com?subject=Hola&body=Texto%20corto");
    const largo = enlaceDeCorreo(["mariana@acme.com"], "Hola", "x".repeat(3000));
    expect(largo).toEqual({ href: "mailto:mariana@acme.com?subject=Hola", conCuerpo: false });
  });
});

describe("lo guardado", () => {
  const CORREO: CorreoDeSeguimiento = { asunto: "A", cuerpo: "B", para: ["mariana@acme.com"], en: "2026-10-07T12:00:00.000Z", corridaId: "run-1" };
  const VALIDEZ = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), escalaVersion: null } as unknown as Validez;

  it("cambiarlo a mano lo marca editado y no sube la versión (es de lo que escribe el agente)", () => {
    const antes = estado({ correos: { "meet:m1": CORREO } });
    const r = aplicarOperaciones(antes, [{ op: "correo", clave: "meet:m1", cuerpo: "B con cambios" }], VALIDEZ, VALIDADOR_LIBRE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.propuesta.correos["meet:m1"]).toEqual({ ...CORREO, cuerpo: "B con cambios", editado: true });
    expect(cambioLoConfirmado(antes, r.estado)).toBe(false);
  });

  it("un correo que ya no está no se cambia, y no se reintenta sobre uno que se volvió a armar", () => {
    const r = aplicarOperaciones(estado(), [{ op: "correo", clave: "meet:m1", asunto: "X" }], VALIDEZ, VALIDADOR_LIBRE);
    expect(r.ok).toBe(false);
    const antes = estado({ correos: { "meet:m1": CORREO } });
    const otro = estado({ correos: { "meet:m1": { ...CORREO, corridaId: "run-2" } } });
    expect(sePuedeReintentar([{ op: "correo", clave: "meet:m1", asunto: "X" }], antes, otro)).toBe(false);
    expect(sePuedeReintentar([{ op: "correo", clave: "meet:m1", asunto: "X" }], antes, antes)).toBe(true);
  });

  it("se lee de vuelta, sin lo que no tiene forma de correo, y solo los últimos 24", () => {
    const correos: Record<string, unknown> = { "meet:x": { nada: true }, "otra:cosa": CORREO };
    for (let i = 0; i < 30; i++) correos[`meet:m${i}`] = { ...CORREO, corridaId: `run-${i}` };
    const p = leerPropuesta({ correos });
    expect(Object.keys(p.correos)).toHaveLength(24);
    expect(p.correos["meet:m29"]?.corridaId).toBe("run-29");
    expect(p.correos["meet:x"]).toBeUndefined();
    expect(p.correos["otra:cosa"]).toBeUndefined();
  });
});

/**
 * ⭐ LO QUE DEJÓ LA REUNIÓN Y LO QUE YA SE SABE DE LA CUENTA (memoria de la cuenta, etapa 3, 2026-10-10).
 * El correo lo lee el cliente: de la minuta van los acuerdos y las decisiones (nunca los riesgos ni los montos), de la
 * lectura de seguimiento los compromisos sin la cita, y de la cuenta, la memoria con el alcance del cliente. Nunca Tareas.
 */
describe("⭐ la minuta, los compromisos y la cuenta", () => {
  it("de la minuta, solo los acuerdos y las decisiones, sin los que traen un monto", () => {
    expect(
      minutaParaElCorreo({
        agreements: [{ text: "Mariana envía la base de contactos" }, { text: "La implementación queda en US$ 12.000" }],
        decisions: ["Arrancar por ventas"],
      }),
    ).toEqual({ acuerdos: ["Mariana envía la base de contactos"], decisiones: ["Arrancar por ventas"] });
    expect(minutaParaElCorreo({ agreements: [], decisions: [] })).toBeNull();
    expect(minutaParaElCorreo(null)).toBeNull();
  });

  it("los compromisos de la lectura, sin la cita, sin el correo de quien se comprometió y sin montos; una salida rota no va", () => {
    const output = JSON.stringify({
      salida: {
        compromisos: [
          { quien: "CLIENTE", responsable: "Mariana", que: "Enviar la base de contactos", fecha: "2026-10-10", cita: "SECRETO-CITA te la mando el viernes", ownerEmail: null },
          { quien: "SMARTEAM", responsable: "Andrés", ownerEmail: "SECRETO@smarteamcr.com", que: "Compartir el plan", fecha: null, cita: "SECRETO-CITA" },
          { quien: "SMARTEAM", que: "Mandar la cotización de US$ 3.000", cita: "x" },
          { quien: "OTRO", que: "No sé de quién es" },
        ],
      },
    });
    const c = compromisosDeLaLectura(output);
    expect(c).toEqual([
      { texto: "Enviar la base de contactos", lado: "cliente", quien: "Mariana", fecha: "2026-10-10" },
      { texto: "Compartir el plan", lado: "smarteam", quien: "Andrés", fecha: null },
    ]);
    expect(JSON.stringify(c)).not.toMatch(/SECRETO/);
    expect(compromisosDeLaLectura("{ roto")).toEqual([]);
    expect(compromisosDeLaLectura(null)).toEqual([]);
  });

  it("⛔ la cuenta va con el alcance del cliente: al agente no le llega nada interno de la ficha ni de la preventa", () => {
    const cuenta = armarMemoriaDeLaCuenta(
      {
        cliente: { nombre: "Acme" },
        ficha: {
          ...fichaVacia(),
          valores: {
            ...valoresVacios(),
            aQueSeDedica: "Distribuidora de repuestos",
            stakeholders: "- Mariana — gerente — sponsor — SECRETO-POSTURA",
            motivacionCompra: "SECRETO-MOTIVACION",
            oportunidadesFuturas: "SECRETO-OPORTUNIDAD",
          },
          confirmadaAt: "2026-10-01T12:00:00.000Z",
          confirmadaPor: "Ana",
          propuesta: { valores: { dolorPrincipal: "SECRETO-PROPUESTO" }, fuentes: [], fuentesPorCampo: {}, at: "2026-10-01T12:00:00.000Z", origen: "Sesiones" },
        },
        procesos: [],
        proyectos: [],
        entrega: null,
        fueraDeAlcance: [{ pedido: "SECRETO-FUERA-DE-ALCANCE", estado: "CONFIRMADO", proyecto: null, quienLoPidio: null, fecha: "2026-10-01T12:00:00.000Z" }],
        preventa: { fecha: "2026-09-01T12:00:00.000Z", archivada: false, texto: "SECRETO-PREVENTA" },
        auditoria: null,
      },
      { alcance: CONSUMIDORES_DE_LA_MEMORIA.correo.alcance },
    ).texto;
    expect(cuenta).toContain("Distribuidora de repuestos");
    const insumos = insumosDelCorreo(estado({ contenido: INTERNO }), {
      lectura: LECTURA,
      sesionId: "s-1",
      hoy: HOY,
      agenda: [],
      deLaReunion: { minuta: { acuerdos: ["Mariana envía la base"], decisiones: [] }, compromisos: [{ texto: "Compartir el plan", lado: "smarteam", quien: "Andrés", fecha: null }] },
      cuenta,
    });
    const texto = mensajeDelCorreo(contexto({ insumos }));
    expect(texto).not.toMatch(/SECRETO/);
    expect(texto).toContain("Acuerdo: Mariana envía la base");
    expect(texto).toContain("Compartir el plan · Smarteam (Andrés)");
    expect(texto).toMatch(/LO QUE YA SE SABE DE LA CUENTA \(para no repreguntar[^\n]*no lo cites como algo acordado en esta reunión\)/);
  });

  it("sin minuta, compromisos ni cuenta, el mensaje es el de antes", () => {
    const i = INSUMOS();
    expect(i.minuta).toBeNull();
    expect(i.compromisos).toEqual([]);
    expect(i.cuenta).toBe("");
    expect(mensajeDelCorreo(contexto())).not.toMatch(/LA MINUTA DE ESTA REUNIÓN|LOS COMPROMISOS QUE DEJÓ|LO QUE YA SE SABE DE LA CUENTA/);
  });

  it("⛔ el correo nunca lee Tareas, y lee la memoria con su lector (alcance del cliente)", () => {
    const leer = (rel: string) =>
      fs
        .readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
    for (const rel of ["lib/exploraciones/correo-de-seguimiento.ts", "lib/exploraciones/correo-de-seguimiento-pedido.ts", "lib/exploraciones/correo-de-seguimiento-server.ts"]) {
      expect(leer(rel), `${rel} lee Tareas`).not.toMatch(/@\/lib\/tareas\/|\b(?:prisma|tx|db)\.(?:tarea|proyectoDeTareas|tareaEvento|tareaVinculo|tareaComentario|lecturaDeReunion)\./);
    }
    expect(leer("lib/exploraciones/correo-de-seguimiento-server.ts")).toContain('memoriaDeLaCuenta(fila.clientId, { lector: "correo"');
    expect(CONSUMIDORES_DE_LA_MEMORIA.correo.alcance).toBe("cliente");
  });
});
