import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { herramientaDeLaLectura } from "@/lib/sessions/lectura-salida";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { armarTextoDeLaReunion } from "./texto";
import {
  HERRAMIENTA_DE_HECHOS,
  INSTRUCCIONES_DE_HECHOS,
  MAX_TOKENS_DE_HECHOS,
  MODELO_DE_HECHOS,
  MODELO_DE_HECHOS_BARATO,
  SISTEMA_FIJO,
  TOPE_LO_VENDIDO,
  admiteHerramientaForzada,
  contextoDeHechos,
  herramientaDeHechos,
  pedidoDeCalentamiento,
  pedidoDeHechos,
  pedidoDeLecturaYHechos,
  prefijoDeLaReunion,
  type EntradaDeHechos,
} from "./pedido";

const TRANSCRIPT = Array.from({ length: 12 }, (_, i) =>
  i % 2 ? `Elías González: Entonces configuramos el pipeline número ${i} con sus etapas.` : `Ana Pérez: Hoy llevamos las cotizaciones en una hoja de Excel compartida, punto ${i}.`,
).join("\n");

const entrada = (modelo = MODELO_DE_HECHOS): EntradaDeHechos => ({
  cliente: { name: "Acme", industry: "Manufactura", kind: "CLIENTE" },
  proyectos: [{ ref: "P1", id: "proy-1", nombre: "Implementación Sales Hub", loVendido: "Sales Hub Pro con dos pipelines." }],
  equipoSmarteam: ["Elías González"],
  reunion: { titulo: "Revisión de pipeline", fecha: "2026-10-01", texto: armarTextoDeLaReunion({ transcript: TRANSCRIPT, summary: null })! },
  modelo,
});

const lectura = { herramienta: herramientaDeLaLectura({ pideFueraDeAlcance: false, pidePresentacion: false, emailsDelEquipo: ["elias@smarteamcr.com"] }), instrucciones: "Arma la minuta." };

afterEach(() => vi.useRealTimers());

describe("la herramienta", () => {
  const herramienta = herramientaDeHechos();

  it("es estricta: todo objeto cierra sus propiedades y las pide todas", () => {
    expect(herramienta.name).toBe(HERRAMIENTA_DE_HECHOS);
    expect(herramienta.strict).toBe(true);
    const revisar = (nodo: unknown, camino: string) => {
      if (!nodo || typeof nodo !== "object") return;
      const n = nodo as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown };
      if (n.type === "object") {
        expect(n.additionalProperties, camino).toBe(false);
        expect([...(n.required ?? [])].sort(), camino).toEqual(Object.keys(n.properties ?? {}).sort());
      }
      for (const [k, v] of Object.entries(n.properties ?? {})) revisar(v, `${camino}.${k}`);
      if (n.items) revisar(n.items, `${camino}[]`);
    };
    revisar(herramienta.input_schema, "input");
  });

  it("sin restricciones que el modo estricto no admite", () => {
    const json = JSON.stringify(herramienta.input_schema);
    for (const prohibido of ["minLength", "maxLength", "minimum", "maximum", "maxItems", "minItems", "pattern"]) expect(json).not.toContain(prohibido);
  });
});

describe("el prefijo se comparte con la lectura (la caché)", () => {
  it("las dos herramientas, ordenadas por nombre e idénticas en el calentamiento y en los hechos", () => {
    const hechos = pedidoDeHechos({ ...entrada(), lectura });
    const calentamiento = pedidoDeCalentamiento({ ...entrada(), lectura });
    expect(hechos.tools!.map((t) => (t as Anthropic.Messages.Tool).name)).toEqual(["registrar_hechos", "registrar_lectura"]);
    expect(hechos.tools).toEqual(calentamiento.tools);
    expect(hechos.system).toEqual(calentamiento.system);
  });

  it("el orden de las herramientas no depende de cómo se pasen", () => {
    const a = prefijoDeLaReunion({ reunion: entrada().reunion, herramientas: [lectura.herramienta, herramientaDeHechos()], conCache: true });
    const b = prefijoDeLaReunion({ reunion: entrada().reunion, herramientas: [herramientaDeHechos(), lectura.herramienta], conCache: true });
    expect(a).toEqual(b);
  });

  it("la reunión va en el system con cache_control; lo que se pide va en el mensaje", () => {
    const p = pedidoDeHechos({ ...entrada(), lectura });
    const system = p.system as Anthropic.Messages.TextBlockParam[];
    expect(system).toHaveLength(2);
    expect(system[0]).toEqual({ type: "text", text: SISTEMA_FIJO });
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].text).toContain("Revisión de pipeline");
    expect(system[1].text).toContain("hoja de Excel");
    expect(system.map((s) => s.text).join("\n")).not.toContain("QUÉ TIENES QUE HACER");
    const mensaje = p.messages[0].content as string;
    expect(mensaje).toContain(INSTRUCCIONES_DE_HECHOS);
    expect(mensaje).toContain("P1 · Implementación Sales Hub");
  });

  it("nada que cambie entre llamadas antes del cache_control: el prefijo es el mismo otro día", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
    const uno = pedidoDeHechos({ ...entrada(), lectura });
    vi.setSystemTime(new Date("2027-03-01T09:30:00Z"));
    const dos = pedidoDeHechos({ ...entrada(), lectura });
    expect(JSON.stringify({ tools: uno.tools, system: uno.system })).toBe(JSON.stringify({ tools: dos.tools, system: dos.system }));
    expect(JSON.stringify(dos.system)).not.toContain("2027-03-01");
  });

  it("sin la lectura: solo la herramienta de los hechos y sin caché (la variante «aparte, sin caché»)", () => {
    const p = pedidoDeHechos(entrada());
    expect(p.tools!.map((t) => (t as Anthropic.Messages.Tool).name)).toEqual([HERRAMIENTA_DE_HECHOS]);
    expect((p.system as Anthropic.Messages.TextBlockParam[]).some((s) => s.cache_control)).toBe(false);
  });

  it("el calentamiento no pide respuesta y no fuerza herramienta (max_tokens 0 no admite tool_choice forzado)", () => {
    const p = pedidoDeCalentamiento({ ...entrada(), lectura });
    expect(p.max_tokens).toBe(0);
    expect(p.tool_choice).toEqual({ type: "auto" });
  });
});

describe("tool_choice según el modelo", () => {
  it("con Sonnet 4.6 y Haiku 4.5, forzado a registrar_hechos", () => {
    for (const m of [MODELO_DE_HECHOS, MODELO_DE_HECHOS_BARATO]) {
      expect(admiteHerramientaForzada(m)).toBe(true);
      expect(pedidoDeHechos(entrada(m)).tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_HECHOS });
    }
  });

  it("con Opus 5.5 o Sonnet 5.5 da 400: va auto (la herramienta es estricta igual)", () => {
    for (const m of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]) {
      expect(admiteHerramientaForzada(m)).toBe(false);
      expect(pedidoDeHechos(entrada(m)).tool_choice).toEqual({ type: "auto" });
    }
  });

  it("los hechos no se cortan con el tope de siempre", () => {
    expect(pedidoDeHechos(entrada()).max_tokens).toBe(MAX_TOKENS_DE_HECHOS);
  });
});

describe("la lectura y los hechos en una sola llamada (variante C)", () => {
  it("las mismas herramientas y la misma reunión (sin caché), las dos partes en el mensaje y el tope de las dos", () => {
    const p = pedidoDeLecturaYHechos({ ...entrada(), lectura, maxTokensDeLaLectura: 6000 });
    const conCache = pedidoDeHechos({ ...entrada(), lectura });
    expect(p.tools).toEqual(conCache.tools);
    expect((p.system as Anthropic.Messages.TextBlockParam[]).map((s) => s.text)).toEqual((conCache.system as Anthropic.Messages.TextBlockParam[]).map((s) => s.text));
    expect((p.system as Anthropic.Messages.TextBlockParam[]).some((s) => s.cache_control)).toBe(false);
    expect(p.tool_choice).toEqual({ type: "any" });
    expect(p.max_tokens).toBe(6000 + MAX_TOKENS_DE_HECHOS);
    const mensaje = p.messages[0].content as string;
    expect(mensaje).toContain("Arma la minuta.");
    expect(mensaje).toContain(INSTRUCCIONES_DE_HECHOS);
  });
});

describe("el contexto", () => {
  it("lo vendido se recorta", () => {
    const largo = "x".repeat(TOPE_LO_VENDIDO + 500);
    const c = contextoDeHechos({ ...entrada(), proyectos: [{ ref: "P1", id: "p", nombre: "Uno", loVendido: largo }] });
    expect(c).toContain("x".repeat(TOPE_LO_VENDIDO));
    expect(c).not.toContain("x".repeat(TOPE_LO_VENDIDO + 1));
  });

  it("sin proyectos lo dice: todo va a la cuenta", () => {
    expect(contextoDeHechos({ ...entrada(), proyectos: [] })).toContain("todo hecho va a «cuenta»");
  });

  it("un prospecto se dice", () => {
    expect(contextoDeHechos({ ...entrada(), cliente: { name: "Beta", industry: null, kind: "PROSPECTO" } })).toContain("prospecto");
  });
});

describe("el prompt está en tuteo", () => {
  it("ni el sistema, ni las reglas, ni el contexto tienen voseo", () => {
    const p = pedidoDeHechos({ ...entrada(), lectura });
    const todo = [SISTEMA_FIJO, INSTRUCCIONES_DE_HECHOS, p.messages[0].content as string, JSON.stringify(herramientaDeHechos())].join("\n");
    expect(voseoEnProsa(todo)).toEqual([]);
  });
});
