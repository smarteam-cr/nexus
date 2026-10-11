/**
 * lib/seguimiento/destinos.test.ts — el registro de destinos, congelado contra las secciones REALES de cada documento
 * (DECISIONS «Hechos, enrutador y novedades»). Si un documento renombra o retira una sección, el destino de un hecho
 * quedaría apuntando a la nada sin que nada lo dijera: esto se pone rojo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { PLANIFICACION_DEF_BY_KEY, SECCIONES_RETIRADAS_DE_PLANIFICACION } from "@/components/landing/configs/planificacion.defs";
import { DIAGNOSTICO_DEF_BY_KEY, SECCIONES_RETIRADAS_DEL_DIAGNOSTICO } from "@/components/landing/configs/diagnostico.defs";
import { DESARROLLO_DEF_BY_KEY } from "@/components/landing/configs/desarrollo.defs";
import { ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { SECCIONES_RETIRADAS_DE_EJECUCION } from "@/components/landing/configs/implementacion.defs";
import { pieceBySlug } from "@/lib/pieces/registry";
import { CAMPOS_DE_LA_FICHA } from "@/lib/clients/ficha";
import { DESTINOS, EXCLUSIONES, KINDS_CON_DESTINOS, destinosDeLaPieza, destinoParaElKind, destinoPorClave } from "./destinos";
import { TEMAS_DE_ACUERDO, TIPOS_DE_HECHO } from "./hechos/tipos";

const DEFS_POR_PIEZA: Record<string, Record<string, unknown>> = {
  kickoff: KICKOFF_DEF_BY_KEY,
  planning: PLANIFICACION_DEF_BY_KEY,
  diagnosis: DIAGNOSTICO_DEF_BY_KEY,
  "tech-requirements": DESARROLLO_DEF_BY_KEY,
  delivery: ENTREGA_DEF_BY_KEY,
};

describe("el registro de destinos", () => {
  it("las claves son únicas", () => {
    const claves = DESTINOS.map((d) => d.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("⛔ cada (pieza, sección) de una novedad existe en la def de su documento", () => {
    for (const d of DESTINOS.filter((x) => x.salida === "novedad")) {
      expect(d.pieza, d.clave).toBeTruthy();
      expect(d.seccion, d.clave).toBeTruthy();
      expect(pieceBySlug(d.pieza!), `${d.clave}: la pieza «${d.pieza}» no está en el registro`).not.toBeNull();
      const defs = DEFS_POR_PIEZA[d.pieza!];
      expect(defs, `${d.clave}: falta la def de la pieza «${d.pieza}» en este test`).toBeTruthy();
      expect(Object.keys(defs), `${d.clave}: la sección «${d.seccion}» no existe en ${d.pieza}`).toContain(d.seccion);
      expect(d.clave, "la clave de una novedad es «pieza.seccion»").toBe(`${d.pieza}.${d.seccion}`);
    }
  });

  it("⛔ ninguna novedad apunta a una sección retirada (Ejecución › pipelines se mudó a la Planificación)", () => {
    // Por pieza: «metricas_exito» se retiró de la Planificación, pero el kickoff tiene la suya.
    for (const d of DESTINOS.filter((x) => x.pieza === "planning")) expect(SECCIONES_RETIRADAS_DE_PLANIFICACION as readonly string[]).not.toContain(d.seccion);
    for (const d of DESTINOS.filter((x) => x.pieza === "diagnosis")) expect(SECCIONES_RETIRADAS_DEL_DIAGNOSTICO as readonly string[]).not.toContain(d.seccion);
    expect(DESTINOS.some((d) => d.pieza === "implementation"), "una decisión nunca va a Ejecución").toBe(false);
    for (const retirada of SECCIONES_RETIRADAS_DE_EJECUCION) expect(DESTINOS.some((d) => d.clave === `implementation.${retirada}`)).toBe(false);
  });

  it("⛔ ningún destino es el handoff (se congela)", () => {
    for (const d of DESTINOS) {
      expect(d.pieza, d.clave).not.toBe("handoff");
      expect(d.clave.startsWith("handoff"), d.clave).toBe(false);
    }
  });

  it("⛔ un resultado va a diagnóstico › objetivos y kickoff › métricas, nunca a la ficha", () => {
    const deResultado = DESTINOS.filter((d) => d.tipos.includes("resultado")).map((d) => d.clave).sort();
    expect(deResultado).toEqual(["diagnosis.objetivos", "kickoff.metricas_exito"]);
    // La ficha no lo puede proponer: sale de los resultados de cada proyecto.
    expect(CAMPOS_DE_LA_FICHA.find((c) => c.clave === "resultadosQuePersigue")?.deLosResultados).toBe(true);
  });

  it("todo tipo de hecho tiene al menos un destino o una exclusión escrita", () => {
    for (const t of TIPOS_DE_HECHO) {
      const tiene = DESTINOS.some((d) => d.tipos.includes(t));
      expect(tiene || !!EXCLUSIONES[t], `el tipo «${t}» no tiene destino ni exclusión`).toBe(true);
    }
  });

  it("todo tema de acuerdo aterriza en al menos un documento", () => {
    for (const tema of TEMAS_DE_ACUERDO) {
      expect(DESTINOS.some((d) => d.tipos.includes("acuerdo") && d.temas?.includes(tema)), tema).toBe(true);
    }
  });

  it("un aliado y una empresa de Smarteam no tienen destinos", () => {
    expect([...KINDS_CON_DESTINOS]).toEqual(["CLIENTE", "PROSPECTO"]);
    for (const d of DESTINOS) {
      expect(destinoParaElKind(d, "ALIADO"), d.clave).toBe(false);
      expect(destinoParaElKind(d, "INTERNO"), d.clave).toBe(false);
      expect(destinoParaElKind(d, null), d.clave).toBe(false);
    }
  });

  it("en un prospecto solo la ficha y Procesos (sin avance, etapa, alertas ni novedades de proyecto)", () => {
    const deProspecto = DESTINOS.filter((d) => destinoParaElKind(d, "PROSPECTO")).map((d) => d.clave).sort();
    expect(deProspecto).toEqual(["ficha", "ficha.stakeholders", "procesos"]);
  });

  it("la queja levanta alerta solo si la dijo el cliente (si no, va al vigía); Integraciones avisa que publica en vivo", () => {
    expect(destinoPorClave("alerta.queja")?.soloSiLoDijoElCliente).toBe(true);
    expect(destinoPorClave("vigia.queja")?.soloSiNoLoDijoElCliente).toBe(true);
    for (const d of DESTINOS.filter((x) => x.pieza === "tech-requirements")) expect(d.publicaEnVivo, d.clave).toBe(true);
    for (const d of DESTINOS.filter((x) => x.pieza && x.pieza !== "tech-requirements")) expect(!!d.publicaEnVivo, d.clave).toBe(false);
  });

  it("Procesos apunta a la sección que lee su módulo (client-info › procesos)", () => {
    const p = destinoPorClave("procesos")!;
    expect([p.pieza, p.seccion]).toEqual(["client-info", "procesos"]);
    const servidor = readFileSync(join(__dirname, "..", "procesos", "servidor.ts"), "utf8");
    expect(servidor).toContain('key: "procesos"');
    expect(servidor).toContain('canvasOfNested("client-info"');
  });

  it("destinosDeLaPieza devuelve solo las novedades de esa pieza", () => {
    expect(destinosDeLaPieza("planning").every((d) => d.pieza === "planning" && d.salida === "novedad")).toBe(true);
    expect(destinosDeLaPieza("handoff")).toEqual([]);
  });

  it("📸 la foto de las claves: cambiarla es decidirlo", () => {
    expect(DESTINOS.map((d) => `${d.clave} ← ${d.tipos.join("/")}${d.temas ? `:${d.temas.join("/")}` : ""} (${d.salida})`)).toEqual([
      "ficha ← cuenta (ficha)",
      "ficha.stakeholders ← persona (ficha)",
      "kickoff.equipo ← persona (novedad)",
      "kickoff.alcance ← acuerdo:alcance (novedad)",
      "kickoff.metricas_exito ← resultado (novedad)",
      "diagnosis.objetivos ← resultado (novedad)",
      "diagnosis.alcance_acordado ← acuerdo:alcance (novedad)",
      "planning.definicion_procesos ← acuerdo:proceso_despues (novedad)",
      "planning.arquitectura_solucion ← acuerdo:integracion (novedad)",
      "planning.propiedades ← acuerdo:propiedades (novedad)",
      "planning.pipelines ← acuerdo:pipeline (novedad)",
      "planning.automatizaciones ← acuerdo:automatizacion (novedad)",
      "planning.conversaciones ← acuerdo:conversaciones (novedad)",
      "tech-requirements.requerimiento ← acuerdo:integracion/alcance (novedad)",
      "tech-requirements.propiedades ← acuerdo:propiedades (novedad)",
      "tech-requirements.comunicacion ← acuerdo:integracion (novedad)",
      "procesos ← proceso_hoy (procesos)",
      "alerta.queja ← queja (alerta)",
      "vigia.riesgo ← riesgo (vigia)",
      "vigia.queja ← queja (vigia)",
      "cronograma.avance ← senal_cronograma (avance)",
      "etapa.encuesta ← senal_etapa (etapa)",
    ]);
  });
});
