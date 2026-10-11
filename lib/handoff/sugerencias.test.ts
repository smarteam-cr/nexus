/**
 * lib/handoff/sugerencias.test.ts — «Buscar lo nuevo» sobre un handoff congelado (etapa 3b): el pedido, la
 * verificación de las citas, el bloque y lo que ya se descartó.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  NOMBRE_DE_LA_HERRAMIENTA,
  TOPE_DE_SUGERENCIAS,
  bloqueDeSugerencia,
  descartadasDe,
  leerSugerencias,
  pedidoDeSugerencias,
  seccionesConSugerencias,
  sugerenciaDelBloque,
  topePorFuente,
  type FuenteNueva,
} from "./sugerencias";
import { esSugerenciaPendiente } from "./congelado";

const SECCIONES = [
  { key: "resultados_cliente", label: "Resultados que el cliente necesita alcanzar" },
  { key: "alcance_contratado", label: "¿Qué vendimos?" },
  { key: "stakeholders_handoff", label: "Stakeholders clave" },
  { key: "riesgos_banderas", label: "Riesgos y banderas rojas" },
];

const R1: FuenteNueva = {
  codigo: "R1",
  tipo: "reunion",
  id: "ses-1",
  titulo: "Seguimiento semanal",
  fecha: "2026-09-15T16:00:00.000Z",
  sala: "[CON EL CLIENTE] ",
  texto: "Ana: Ya no vamos a usar Zendesk, vamos a pasar todo el soporte a Service Hub desde octubre. Pedro: ok.",
};
const M1: FuenteNueva = {
  codigo: "M1",
  tipo: "manual",
  id: "fm-1",
  titulo: "Minuta del comité",
  fecha: "2026-09-18T16:00:00.000Z",
  sala: "",
  texto: "El comité decidió que Laura Méndez será la nueva responsable del proyecto por parte del cliente.",
};

const respuesta = (sugerencias: unknown[]): Pick<Anthropic.Messages.Message, "content"> => ({
  content: [{ type: "tool_use", id: "t1", name: NOMBRE_DE_LA_HERRAMIENTA, input: { sugerencias } } as Anthropic.Messages.ToolUseBlock],
});

describe("pedidoDeSugerencias", () => {
  const pedido = pedidoDeSugerencias({
    empresa: "FUNDAUNA",
    proyecto: "Service Hub",
    congeladoAt: "2026-09-02T15:00:00.000Z",
    handoff: "[Sección: ¿Qué vendimos?]\nService Hub con integración a Zendesk.",
    secciones: SECCIONES,
    fuentes: [R1, M1],
    exclusiones: "Ignora el proyecto de contratos.",
    instrucciones: "=== INSTRUCCIONES ADICIONALES ===\nSé breve.",
    descartadas: [{ seccion: "riesgos_banderas", texto: "El cliente está molesto", cita: "estamos molestos" }],
  });
  const mensaje = String(pedido.messages[0].content);

  it("⛔ «Resultados que el cliente necesita alcanzar» nunca recibe sugerencias", () => {
    expect(seccionesConSugerencias(SECCIONES).map((s) => s.key)).not.toContain("resultados_cliente");
    const herramienta = (pedido.tools ?? [])[0] as Anthropic.Messages.Tool;
    const props = (herramienta.input_schema as { properties: { sugerencias: { items: { properties: { seccion: { enum: string[] }; fuente: { enum: string[] } } } } } }).properties;
    expect(props.sugerencias.items.properties.seccion.enum).not.toContain("resultados_cliente");
    expect(props.sugerencias.items.properties.fuente.enum).toEqual(["R1", "M1"]);
  });

  it("lee lo que ya dice el handoff, las fuentes nuevas con su código, las exclusiones, las instrucciones y lo descartado", () => {
    expect(mensaje).toContain("LO QUE YA DICE EL HANDOFF CONGELADO");
    expect(mensaje).toContain("Service Hub con integración a Zendesk.");
    expect(mensaje).toContain("[R1] [CON EL CLIENTE] «Seguimiento semanal»");
    expect(mensaje).toContain("[M1] «Minuta del comité»");
    expect(mensaje).toContain("Ignora el proyecto de contratos.");
    expect(mensaje).toContain("Sé breve.");
    expect(mensaje).toContain("YA SE DESCARTÓ");
    expect(mensaje).toContain("El cliente está molesto");
    expect(mensaje).toContain("2 sep 2026");
  });

  it("la herramienta es obligatoria y el prompt prohíbe fases, alcance nuevo y voseo", () => {
    expect(pedido.tool_choice).toEqual({ type: "tool", name: NOMBRE_DE_LA_HERRAMIENTA });
    const sistema = String(pedido.system);
    expect(sistema).toContain("No propongas fases");
    expect(sistema).toContain("Pedido nuevo, fuera de lo vendido:");
    expect(sistema).toContain("TAL CUAL");
    expect(sistema).not.toMatch(/\b(podés|tenés|escribí|registrá|usá)\b/);
  });
});

describe("leerSugerencias — solo entra lo que se puede verificar", () => {
  const ctx = { secciones: SECCIONES, fuentes: [R1, M1] };

  it("una cita que está tal cual en su fuente entra", () => {
    const l = leerSugerencias(
      respuesta([
        {
          seccion: "alcance_contratado",
          texto: "Antes decía integración con Zendesk; ahora el soporte pasa entero a Service Hub.",
          fuente: "R1",
          cita: "vamos a pasar todo el soporte a Service Hub desde octubre",
        },
        { seccion: "stakeholders_handoff", texto: "Se suma Laura Méndez como responsable del cliente.", fuente: "m1", cita: "«Laura Méndez será la nueva responsable del proyecto»" },
      ]),
      ctx,
    );
    expect(l.verificadas.map((v) => v.seccion)).toEqual(["alcance_contratado", "stakeholders_handoff"]);
    expect(l.verificadas[1].fuente.codigo).toBe("M1");
    expect(l.sinCita).toBe(0);
  });

  it("⛔ una cita inventada, o de OTRA fuente, no entra", () => {
    const l = leerSugerencias(
      respuesta([
        { seccion: "alcance_contratado", texto: "Se suma un portal.", fuente: "R1", cita: "queremos un portal de autoservicio" },
        { seccion: "stakeholders_handoff", texto: "Laura es la responsable.", fuente: "R1", cita: "Laura Méndez será la nueva responsable del proyecto" },
      ]),
      ctx,
    );
    expect(l.verificadas).toEqual([]);
    expect(l.sinCita).toBe(2);
  });

  it("sección prohibida o desconocida, fuente desconocida o texto vacío: fuera", () => {
    const l = leerSugerencias(
      respuesta([
        { seccion: "resultados_cliente", texto: "Meta nueva", fuente: "R1", cita: "vamos a pasar todo el soporte a Service Hub" },
        { seccion: "inventada", texto: "x", fuente: "R1", cita: "vamos a pasar todo el soporte a Service Hub" },
        { seccion: "alcance_contratado", texto: "x", fuente: "R9", cita: "vamos a pasar todo el soporte a Service Hub" },
        { seccion: "alcance_contratado", texto: "  ", fuente: "R1", cita: "vamos a pasar todo el soporte a Service Hub" },
      ]),
      ctx,
    );
    expect(l.verificadas).toEqual([]);
    expect(l.fuera).toBe(4);
  });

  it("no repite la misma cita en la misma sección, ni lo que ya se descartó", () => {
    const cita = "vamos a pasar todo el soporte a Service Hub desde octubre";
    const l = leerSugerencias(
      respuesta([
        { seccion: "alcance_contratado", texto: "Uno", fuente: "R1", cita },
        { seccion: "alcance_contratado", texto: "Otro", fuente: "R1", cita },
        { seccion: "stakeholders_handoff", texto: "Laura es la responsable.", fuente: "M1", cita: "Laura Méndez será la nueva responsable del proyecto" },
      ]),
      { ...ctx, descartadas: [{ seccion: "stakeholders_handoff", texto: "Laura es la responsable.", cita: "otra frase cualquiera de antes" }] },
    );
    expect(l.verificadas.map((v) => v.texto)).toEqual(["Uno"]);
    expect(l.fuera).toBe(2);
  });

  it("sin la herramienta, o con basura, no entra nada (y no revienta)", () => {
    expect(leerSugerencias({ content: [{ type: "text", text: "nada", citations: null } as Anthropic.Messages.TextBlock] }, ctx).verificadas).toEqual(
      [],
    );
    expect(leerSugerencias(respuesta(["basura", null, 3]), ctx).fuera).toBe(3);
  });

  it(`como mucho ${TOPE_DE_SUGERENCIAS}`, () => {
    const texto = Array.from({ length: 30 }, (_, i) => `frase número ${i} que dijo el cliente`).join(". ");
    const fuente: FuenteNueva = { ...R1, texto };
    const muchas = Array.from({ length: 30 }, (_, i) => ({
      seccion: "alcance_contratado",
      texto: `Cosa ${i}`,
      fuente: "R1",
      cita: `frase número ${i} que dijo el cliente`,
    }));
    expect(leerSugerencias(respuesta(muchas), { secciones: SECCIONES, fuentes: [fuente] }).verificadas).toHaveLength(TOPE_DE_SUGERENCIAS);
  });
});

describe("el bloque de una sugerencia", () => {
  const [v] = leerSugerencias(
    respuesta([
      {
        seccion: "alcance_contratado",
        texto: "El soporte pasa entero a Service Hub.",
        fuente: "R1",
        cita: "vamos a pasar todo el soporte a Service Hub desde octubre",
      },
    ]),
    { secciones: SECCIONES, fuentes: [R1] },
  ).verificadas;
  const b = bloqueDeSugerencia(v);

  it("dice qué cambia y de qué reunión sale, con la cita", () => {
    expect(b.content).toContain("**Lo nuevo:** El soporte pasa entero a Service Hub.");
    expect(b.content).toContain("De la reunión «Seguimiento semanal» del 15 sep 2026");
    expect(b.content).toContain("«vamos a pasar todo el soporte a Service Hub desde octubre»");
  });

  it("lleva la marca (así no llega a los agentes hasta que alguien la usa) y lo que se propuso", () => {
    expect(esSugerenciaPendiente({ status: "DRAFT", data: b.data })).toBe(true);
    expect(sugerenciaDelBloque(b.data)).toEqual({ cita: v.cita, texto: v.texto });
    expect(sugerenciaDelBloque({ otra: 1 })).toBeNull();
  });
});

describe("lo descartado no vuelve", () => {
  it("lo propuesto antes que hoy no está en el documento (ni pendiente ni usado) se descartó", () => {
    const anteriores = [
      { modo: "sugerir", sugerencias: [{ seccion: "a", texto: "Uno", cita: "frase uno larga" }, { seccion: "b", texto: "Dos", cita: "frase dos larga" }] },
      { modo: "sugerir", sugerencias: [{ seccion: "a", texto: "Uno otra vez", cita: "Frase uno larga." }] },
      null,
      { otra: "cosa" },
    ];
    const d = descartadasDe(anteriores, ["frase dos larga"]);
    expect(d).toEqual([{ seccion: "a", texto: "Uno", cita: "frase uno larga" }]);
  });
});

describe("topePorFuente", () => {
  it("reparte el espacio y nunca baja de 2.000 ni sube de 20.000 por fuente", () => {
    expect(topePorFuente(1)).toBe(20_000);
    expect(topePorFuente(6)).toBe(10_000);
    expect(topePorFuente(100)).toBe(2_000);
    expect(topePorFuente(0)).toBe(20_000);
  });
});
