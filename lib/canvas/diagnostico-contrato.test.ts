import { describe, expect, it } from "vitest";
import {
  DIAGNOSTICO_SECTION_DEFS,
  DIAGNOSTICO_TEMPLATE,
  SECCIONES_RETIRADAS_DEL_DIAGNOSTICO,
} from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_SECTION_DEFS } from "@/components/landing/configs/planificacion.defs";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";
import { DIAGNOSTICO_CANVAS, IMPLEMENTACION_CANVAS, PLANIFICACION_CANVAS } from "./canvas-defs";
import { ordenDelContrato } from "./diagnostico-contrato";

/**
 * EL CONTRATO DEL DIAGNÓSTICO (2026-10-02): las secciones y el orden del diagnóstico que hizo Caroline
 * Bersot para FUNDAUNA, que Elías acordó con ella y con Alex Vanegas. Si esta prueba falla, alguien
 * cambió el orden o sacó una sección del contrato: es una decisión de negocio, no de código.
 *
 * (La escala de madurez va entre «Cómo opera hoy y cómo va a operar» y «Fortalezas»; Elías la
 * postergó, así que todavía no está.)
 */
const CONTRATO_FUNDAUNA = [
  "diagnostico", // portada: tesis, el desafío en una frase, hubs, Cliente · Fecha · Versión · Estado
  "situacion_actual",
  "objetivos",
  "problema", // síntomas → causas → consecuencias negativas → positivas (las acciones)
  "desafio",
  "politica_rectora",
  "estado_actual", // cómo opera hoy y cómo va a operar
  "fortalezas",
  "acciones",
  "herramientas",
  "equipos_licencias",
  "preguntas",
  "gap_analysis",
  "alcance_acordado",
  "cierre",
];

describe("el contrato de FUNDAUNA", () => {
  it("un diagnóstico nuevo nace con las secciones y el orden de FUNDAUNA", () => {
    expect(DIAGNOSTICO_CANVAS.sections.map((s) => s.key)).toEqual(CONTRATO_FUNDAUNA);
  });

  it("las definiciones del motor van en el mismo orden, y después solo las retiradas (solo lectura)", () => {
    const keys = DIAGNOSTICO_SECTION_DEFS.map((d) => d.key);
    expect(keys.slice(0, CONTRATO_FUNDAUNA.length)).toEqual(CONTRATO_FUNDAUNA);
    const resto = DIAGNOSTICO_SECTION_DEFS.slice(CONTRATO_FUNDAUNA.length);
    expect(resto.map((d) => d.key).sort()).toEqual([...SECCIONES_RETIRADAS_DEL_DIAGNOSTICO].sort());
    expect(resto.every((d) => d.agentGenerated === false)).toBe(true);
  });

  it("el agente escribe todo el contrato menos el cierre, que lo cura el equipo", () => {
    const generadas = DIAGNOSTICO_TEMPLATE.sections.filter((d) => d.agentGenerated !== false).map((d) => d.key);
    expect(generadas).toEqual(CONTRATO_FUNDAUNA.filter((k) => k !== "cierre"));
  });

  it("cada acción tiene que decir qué causa ataca y qué objetivo mueve", () => {
    const def = DIAGNOSTICO_SECTION_DEFS.find((d) => d.key === "acciones")!;
    const items = (def.schema as { properties: { acciones: { items: { required: string[] } } } }).properties.acciones.items;
    expect(items.required).toEqual(expect.arrayContaining(["ataca", "mueve"]));
  });

  it("los objetivos cuantitativos apuntan a un resultado medible del handoff (no lo copian)", () => {
    const def = DIAGNOSTICO_SECTION_DEFS.find((d) => d.key === "objetivos")!;
    const props = (def.schema as { properties: { objetivos: { items: { properties: Record<string, unknown> } } } }).properties.objetivos.items.properties;
    expect(Object.keys(props)).toContain("resultado");
    expect(Object.keys(props)).not.toEqual(expect.arrayContaining(["lineaBase"]));
  });

  it("la política rectora salió de Planificación, y las acciones y herramientas de Ejecución", () => {
    expect(PLANIFICACION_CANVAS.sections.map((s) => s.key)).not.toContain("politica_rectora");
    expect(IMPLEMENTACION_CANVAS.sections.map((s) => s.key)).not.toEqual(expect.arrayContaining(["acciones"]));
    expect(IMPLEMENTACION_CANVAS.sections.map((s) => s.key)).not.toContain("herramientas");
    // Sus defs quedan SOLO LECTURA: los documentos de esos días se siguen viendo hasta regenerarse.
    expect(PLANIFICACION_SECTION_DEFS.find((d) => d.key === "politica_rectora")?.agentGenerated).toBe(false);
    expect(IMPLEMENTACION_SECTION_DEFS.find((d) => d.key === "acciones")?.agentGenerated).toBe(false);
    expect(IMPLEMENTACION_SECTION_DEFS.find((d) => d.key === "herramientas")?.agentGenerated).toBe(false);
  });

  it("sin detalle de configuración: el agente lo tiene prohibido", () => {
    expect(DIAGNOSTICO_TEMPLATE.agentIntro).toMatch(/NUNCA va detalle de configuración/);
  });
});

describe("ordenDelContrato: un diagnóstico viejo vuelve al orden de FUNDAUNA al regenerarse", () => {
  const canon = CONTRATO_FUNDAUNA;

  it("las canónicas en su orden, lo demás después en el orden que traía, y el cierre último", () => {
    const viejo = [
      "diagnostico", "contexto_alcance", "situacion_actual", "objetivos", "problema", "desafio", "estado_actual",
      "fortalezas", "gap_analysis", "preguntas", "quienes", "cierre", "politica_rectora", "acciones", "herramientas",
      "equipos_licencias", "alcance_acordado", "custom:notas",
    ];
    expect(ordenDelContrato(viejo, canon)).toEqual([
      ...CONTRATO_FUNDAUNA.filter((k) => k !== "cierre"),
      "contexto_alcance",
      "quienes",
      "custom:notas",
      "cierre",
    ]);
  });

  it("un documento ya en orden no cambia", () => {
    expect(ordenDelContrato(CONTRATO_FUNDAUNA, canon)).toEqual(CONTRATO_FUNDAUNA);
  });
});
