import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { armarTextoDeLaReunion } from "./texto";
import { hablanteDelEquipo, huellaDeHecho, leerSalidaDeHechos, limpiarCita, prepararParaVerificar } from "./salida";
import { HERRAMIENTA_DE_HECHOS } from "./pedido";

const TRANSCRIPT = [
  "Revisión de pipeline - Transcripción",
  "00:00:10",
  "Ana Pérez: Hoy seguimos todas las cotizaciones en una hoja de Excel compartida con el equipo comercial.",
  "Elías González: Perfecto, entonces proponemos un pipeline con cinco etapas para las ventas del país.",
  "Ana Pérez: Sí, aceptamos el pipeline de cinco etapas, eso nos sirve para la operación.",
  "00:12:40",
  "Ana Pérez: Me preocupa que el proyecto vaya lento, sentimos que estamos atrasados con la migración.",
  "Carlos Rojas: Yo soy el gerente comercial y voy a aprobar los cambios del pipeline.",
  "Elías González: Ya terminamos la configuración de las propiedades de contacto esta semana.",
  "Elías González: La verdad nos preocupa que el cliente no entregue la base de datos a tiempo.",
].join("\n");

const EQUIPO = ["Elías González", "Alexander Vanegas"];
const PROYECTOS = new Map([["P1", { id: "proy-1" }]]);

const texto = armarTextoDeLaReunion({ transcript: TRANSCRIPT, summary: null })!;
const opciones = { texto: prepararParaVerificar(texto), proyectosPorRef: PROYECTOS, equipoSmarteam: EQUIPO };

type Crudo = Record<string, unknown>;
const hecho = (h: Crudo = {}): Crudo => ({
  tipo: "cuenta",
  tema: "ninguno",
  frase: "El cliente sigue sus cotizaciones en Excel.",
  cita: "seguimos todas las cotizaciones en una hoja de Excel",
  ambito: "cuenta",
  quien: "cliente",
  gravedad: "ninguna",
  ...h,
});
const senal = (s: Crudo = {}): Crudo => ({
  ambito: "P1",
  frase: "Smarteam terminó la configuración de las propiedades de contacto.",
  cita: "Ya terminamos la configuración de las propiedades de contacto",
  quien: "smarteam",
  ...s,
});
const respuesta = (input: unknown, stop_reason: "tool_use" | "max_tokens" = "tool_use") =>
  ({ content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_HECHOS, input }], stop_reason }) as unknown as Pick<
    Anthropic.Messages.Message,
    "content" | "stop_reason"
  >;
const leer = (hechos: Crudo[], senales: { cronograma?: Crudo[]; etapa?: Crudo[] } = {}, stop: "tool_use" | "max_tokens" = "tool_use") =>
  leerSalidaDeHechos(respuesta({ hechos, senal_cronograma: senales.cronograma ?? [], senal_etapa: senales.etapa ?? [] }, stop), opciones);

describe("las citas se verifican contra lo que se mandó", () => {
  it("una cita que está en la transcripción se acepta, con su fuente y quién la dijo", () => {
    const r = leer([hecho()]);
    expect(r.descartados).toEqual([]);
    expect(r.hechos).toHaveLength(1);
    expect(r.hechos[0]).toMatchObject({ tipo: "cuenta", fuenteDeLaCita: "transcripcion", hablante: "Ana Pérez", quien: "cliente", projectId: null });
  });

  it("una cita que no está en el texto se descarta", () => {
    const r = leer([hecho({ cita: "usamos Salesforce desde hace cinco años" })]);
    expect(r.hechos).toEqual([]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["cita_no_aparece"]);
  });

  it("una cita de menos de 12 caracteres, también (no prueba nada)", () => {
    const r = leer([hecho({ cita: "Excel" })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["cita_corta"]);
  });

  it("una cita más larga que una frase se descarta", () => {
    const r = leer([hecho({ cita: "a".repeat(401) })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["cita_larga"]);
  });

  it("una cita que junta lo que dijeron dos personas no es de nadie", () => {
    const r = leer([hecho({ cita: "para las ventas del país. Sí, aceptamos el pipeline" })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["cita_de_varios_hablantes"]);
  });

  it("si el modelo copió el número del turno y el nombre, se limpian y la cita vale", () => {
    const r = leer([hecho({ cita: "[1] Ana Pérez: Hoy seguimos todas las cotizaciones en una hoja de Excel" })]);
    expect(r.hechos).toHaveLength(1);
    expect(r.hechos[0].cita).toBe("Hoy seguimos todas las cotizaciones en una hoja de Excel");
  });

  it("una cita de las notas de Gemini vale, con fuente «notas» y sin hablante", () => {
    const notas = "Resumen\n".concat("El equipo revisó el avance del proyecto y la migración de los contactos desde el sistema anterior. ".repeat(6));
    const soloNotas = armarTextoDeLaReunion({ transcript: null, summary: { overview: notas } })!;
    const r = leerSalidaDeHechos(
      respuesta({ hechos: [hecho({ cita: "la migración de los contactos desde el sistema anterior", quien: "no_se" })], senal_cronograma: [], senal_etapa: [] }),
      { ...opciones, texto: prepararParaVerificar(soloNotas) },
    );
    expect(r.hechos).toHaveLength(1);
    expect(r.hechos[0]).toMatchObject({ fuenteDeLaCita: "notas", hablante: null, quien: null });
  });
});

describe("la gente de Smarteam", () => {
  it("una persona del equipo no es gente del cliente", () => {
    const r = leer([hecho({ tipo: "persona", frase: "Elías González es el consultor a cargo de la implementación.", cita: "proponemos un pipeline con cinco etapas" })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["persona_de_smarteam"]);
  });

  it("una persona del cliente se acepta", () => {
    const r = leer([hecho({ tipo: "persona", frase: "Carlos Rojas es el gerente comercial y aprueba los cambios.", cita: "Yo soy el gerente comercial y voy a aprobar los cambios" })]);
    expect(r.hechos).toHaveLength(1);
    expect(r.hechos[0].quien).toBe("cliente");
  });

  it("«quien» lo decide el turno, no el modelo: una preocupación dicha por Smarteam queda como de Smarteam", () => {
    const r = leer([
      hecho({
        tipo: "queja",
        frase: "Preocupa que el cliente no entregue la base de datos.",
        cita: "nos preocupa que el cliente no entregue la base de datos a tiempo",
        quien: "cliente",
        gravedad: "alta",
      }),
    ]);
    expect(r.hechos[0]).toMatchObject({ quien: "smarteam", hablante: "Elías González", gravedad: "alta" });
  });

  it("y una dicha por el cliente, como del cliente aunque el modelo diga otra cosa", () => {
    const r = leer([hecho({ tipo: "queja", frase: "El cliente siente que el proyecto va lento.", cita: "sentimos que estamos atrasados con la migración", quien: "smarteam" })]);
    expect(r.hechos[0].quien).toBe("cliente");
  });

  it("hablanteDelEquipo: nombre y apellido sí; otro nombre no; un nombre suelto que coincide, no se sabe", () => {
    expect(hablanteDelEquipo("Elías González", EQUIPO)).toBe(true);
    expect(hablanteDelEquipo("elias gonzalez ugalde", EQUIPO)).toBe(true);
    expect(hablanteDelEquipo("Ana Pérez", EQUIPO)).toBe(false);
    expect(hablanteDelEquipo("Elías", EQUIPO)).toBeNull();
    expect(hablanteDelEquipo("Ana", EQUIPO)).toBe(false);
  });
});

describe("el ámbito", () => {
  it("un P# de la lista lleva su proyecto", () => {
    const r = leer([hecho({ tipo: "acuerdo", tema: "pipeline", frase: "El cliente aceptó un pipeline de cinco etapas.", cita: "aceptamos el pipeline de cinco etapas", ambito: "P1" })]);
    expect(r.hechos[0]).toMatchObject({ ambito: "P1", projectId: "proy-1", tema: "pipeline" });
  });

  it("un P# desconocido pasa a «cuenta»", () => {
    const r = leer([hecho({ ambito: "P7" })]);
    expect(r.hechos[0]).toMatchObject({ ambito: "cuenta", projectId: null });
  });

  it("un ámbito que no es un ámbito, también", () => {
    const r = leer([hecho({ ambito: "el proyecto de ventas" })]);
    expect(r.hechos[0].ambito).toBe("cuenta");
  });
});

describe("la respuesta cortada", () => {
  it("se queda con los ítems completos y marca `cortada`", () => {
    const r = leer([hecho(), hecho({ tipo: "proceso_hoy", frase: "El equipo comercial comparte una hoja de cálculo.", cita: "compartida con el equipo comercial" })], {}, "max_tokens");
    expect(r.cortada).toBe(true);
    expect(r.hechos).toHaveLength(1);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["cortado"]);
  });

  it("lo que se pierde es lo último de la última lista con algo (las señales van después de los hechos)", () => {
    const r = leer([hecho()], { cronograma: [senal()] }, "max_tokens");
    expect(r.hechos.map((h) => h.tipo)).toEqual(["cuenta"]);
    expect(r.descartados).toEqual([expect.objectContaining({ motivo: "cortado" })]);
  });

  it("un ítem a medias (sin cita) es incompleto", () => {
    const r = leer([hecho({ cita: "" })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["incompleto"]);
  });

  it("sin la herramienta no hay hechos, y se dice", () => {
    const r = leerSalidaDeHechos({ content: [{ type: "text", text: "No encontré hechos." }], stop_reason: "end_turn" } as unknown as Pick<Anthropic.Messages.Message, "content" | "stop_reason">, opciones);
    expect(r).toMatchObject({ hechos: [], llamoLaHerramienta: false, cortada: false });
  });
});

describe("las señales", () => {
  it("salen como hechos de tipo señal, con su proyecto", () => {
    const r = leer([], { cronograma: [senal()], etapa: [] });
    expect(r.hechos).toEqual([expect.objectContaining({ tipo: "senal_cronograma", projectId: "proy-1", quien: "smarteam" })]);
  });
});

describe("la frase", () => {
  it("con voseo se descarta (llega a una novedad)", () => {
    const r = leer([hecho({ frase: "El cliente dice que vos tenés que mandar la base." })]);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["voseo"]);
  });

  it("«portugués» no es voseo", () => {
    const r = leer([hecho({ frase: "El cliente quiere el sitio en portugués." })]);
    expect(r.hechos).toHaveLength(1);
  });

  it("el tema solo vale en un acuerdo, y una queja sin gravedad queda en «media»", () => {
    const r = leer([
      hecho({ tema: "pipeline" }),
      hecho({ tipo: "queja", frase: "El cliente siente que la migración va atrasada.", cita: "estamos atrasados con la migración", gravedad: "ninguna" }),
    ]);
    expect(r.hechos[0].tema).toBeUndefined();
    expect(r.hechos[1].gravedad).toBe("media");
  });
});

describe("la huella y los repetidos", () => {
  it("es igual para el mismo hecho con otras mayúsculas o tildes", () => {
    expect(huellaDeHecho("cuenta", undefined, "El cliente usa EXCEL para las cotizaciones")).toBe(huellaDeHecho("cuenta", undefined, "el cliente usá excel para las cotizaciónes"));
  });

  it("cambia con el tipo y con el tema", () => {
    expect(huellaDeHecho("acuerdo", "pipeline", "Un pipeline de cinco etapas")).not.toBe(huellaDeHecho("acuerdo", "propiedades", "Un pipeline de cinco etapas"));
    expect(huellaDeHecho("cuenta", undefined, "Usa Excel")).not.toBe(huellaDeHecho("riesgo", undefined, "Usa Excel"));
  });

  it("el mismo hecho dos veces en la reunión se anota una", () => {
    const r = leer([hecho(), hecho({ frase: "El cliente sigue sus COTIZACIONES en excel." })]);
    expect(r.hechos).toHaveLength(1);
    expect(r.descartados.map((d) => d.motivo)).toEqual(["repetido"]);
  });

  it("más de 12 hechos: lo que sobra se descarta", () => {
    const herramientas = ["Excel", "Sheets", "Trello", "Asana", "Notion", "Jira", "Slack", "Zoom", "Teams", "Drive", "Dropbox", "Salesforce", "Pipedrive", "Zendesk"];
    const muchos = herramientas.map((h) => hecho({ frase: `El cliente usa ${h} para sus cotizaciones.` }));
    const r = leer(muchos);
    expect(r.hechos).toHaveLength(12);
    expect(r.descartados.filter((d) => d.motivo === "sobra")).toHaveLength(2);
  });
});

describe("limpiarCita", () => {
  it("saca comillas, el número del turno y el nombre de quien habló", () => {
    const hablantes = new Set(["ana perez"]);
    expect(limpiarCita("«[4] Ana Pérez: hola a todos»", hablantes)).toBe("hola a todos");
  });

  it("no saca un «algo:» que no es el nombre de nadie", () => {
    expect(limpiarCita("Regla: todo lead nuevo va a ventas", new Set(["ana perez"]))).toBe("Regla: todo lead nuevo va a ventas");
  });
});
