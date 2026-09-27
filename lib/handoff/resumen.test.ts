/**
 * lib/handoff/resumen.test.ts
 *
 * Correr: `npx vitest run lib/handoff/resumen.test.ts --project unit`.
 *
 * Lo que se prueba es la parte PURA —el tope de caracteres y la vejez del resumen— más el cableado
 * de las dos puertas, que ningún tipo protege.
 *
 * El tope importa más de lo que parece: el resumen vive en la cabecera de la tarjeta del handoff,
 * al lado de otros cuatro datos. Un modelo que devuelve doce líneas no produce «un resumen largo»,
 * produce el problema que el resumen vino a resolver — el documento empujado fuera de la pantalla.
 * El prompt pide brevedad; esto la garantiza.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_CARACTERES_RESUMEN,
  INSTRUCCION_RESUMEN,
  normalizarResumen,
  resumenDesactualizado,
} from "./resumen";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

describe("normalizarResumen — el tope se cumple pase lo que pase", () => {
  it("un resumen breve pasa tal cual", () => {
    const t = "Se vendió Sales Hub Pro con migración desde Salesforce y dos integraciones a medida.";
    expect(normalizarResumen(t)).toBe(t);
  });

  it("recorta por el final de una ORACIÓN, no a mitad de palabra", () => {
    const frase = "Se vendió una implementación de HubSpot con migración de datos. ";
    const largo = frase.repeat(30);
    const r = normalizarResumen(largo);
    expect(r.length).toBeLessThanOrEqual(MAX_CARACTERES_RESUMEN);
    expect(r, "cortó a mitad de oración").toMatch(/\.$/);
  });

  it("una sola frase kilométrica se corta por palabra entera y lo dice con puntos suspensivos", () => {
    const r = normalizarResumen("palabra ".repeat(300).trim());
    expect(r.length).toBeLessThanOrEqual(MAX_CARACTERES_RESUMEN + 1);
    expect(r.endsWith("…")).toBe(true);
    expect(r, "partió una palabra por la mitad").not.toMatch(/palabr…$/);
  });

  it("le saca el markdown que el modelo mete igual aunque se le pida que no", () => {
    /* Pasa con todos los modelos y en todos los prompts: el negrita y la viñeta se cuelan. En una
       tarjeta que no renderiza markdown eso se ve como asteriscos sueltos. */
    const r = normalizarResumen("- **Alcance:** Sales Hub.\n- Migración desde *Salesforce*.");
    expect(r).toBe("Alcance: Sales Hub. Migración desde Salesforce.");
  });

  it("le saca las comillas envolventes y los bloques de código", () => {
    expect(normalizarResumen('"Se vendió Sales Hub."')).toBe("Se vendió Sales Hub.");
    expect(normalizarResumen("```\nSe vendió Sales Hub.\n```")).toBe("Se vendió Sales Hub.");
  });

  it("aplasta los saltos de línea: es UNA línea en una cabecera", () => {
    expect(normalizarResumen("Primera frase.\n\nSegunda frase.")).toBe("Primera frase. Segunda frase.");
  });
});

describe("resumenDesactualizado", () => {
  const ayer = new Date("2026-09-26T10:00:00Z");
  const hoy = new Date("2026-09-27T10:00:00Z");

  it("el handoff se regeneró después del resumen → viejo", () => {
    expect(resumenDesactualizado({ handoffResumenAt: ayer, handoffGeneratedAt: hoy })).toBe(true);
  });

  it("el resumen es posterior o simultáneo → al día", () => {
    expect(resumenDesactualizado({ handoffResumenAt: hoy, handoffGeneratedAt: ayer })).toBe(false);
    expect(resumenDesactualizado({ handoffResumenAt: hoy, handoffGeneratedAt: hoy })).toBe(false);
  });

  it("sin alguna de las dos fechas NO se acusa de viejo", () => {
    /* Un proyecto sin resumen no tiene un resumen viejo: tiene ninguno, y la pantalla ofrece
       generarlo. Decir «desactualizado» sobre la nada manda a regenerar algo que no existe. */
    expect(resumenDesactualizado({ handoffResumenAt: null, handoffGeneratedAt: hoy })).toBe(false);
    expect(resumenDesactualizado({ handoffResumenAt: ayer, handoffGeneratedAt: null })).toBe(false);
  });
});

describe("la instrucción dice lo que no se puede dejar de decir", () => {
  it("prohíbe inventar y manda empezar por el alcance", () => {
    /* Sin la primera regla, el resumen se vuelve una fuente de verdad paralela al handoff — y como
       es la que se lee primero, gana. La segunda es lo que hace que un texto recortado siga
       sirviendo: lo que sobrevive es qué se vendió. */
    expect(INSTRUCCION_RESUMEN).toMatch(/SOLO lo que dice el documento/);
    expect(INSTRUCCION_RESUMEN).toMatch(/No inventes/);
    expect(INSTRUCCION_RESUMEN).toMatch(/Empieza por el alcance contratado/);
  });

  it("le pide el tope al modelo además de imponérselo", () => {
    expect(INSTRUCCION_RESUMEN).toContain(String(MAX_CARACTERES_RESUMEN));
  });
});

describe("las dos puertas están cableadas", () => {
  it("resume EL DOCUMENTO, no las sesiones que lo originaron", () => {
    /* Resumir la fuente en vez del documento da un texto que contradice al handoff sin que nadie
       entienda por qué: dos versiones de qué se vendió, y la corta pareciendo la autorizada. */
    const src = leer("lib/handoff/resumen.ts");
    expect(src).toContain("loadHandoffContext(projectId)");
  });

  it("cada corrida del agente de handoff lo regenera", () => {
    /* Si no, el resumen describe una versión anterior del documento y nada lo señala. Va
       fire-and-forget: el handoff ya está escrito y guardado, así que un fallo acá no puede
       tumbar la corrida. */
    const analyze = leer("app/api/clients/[id]/analyze/route.ts");
    expect(analyze).toContain("generarResumenDeHandoff");
  });

  it("y hay una puerta MANUAL, que es la que alcanza a los handoffs viejos", () => {
    /* Los ~75 que ya existen no se van a regenerar solo por esto: una corrida completa del agente
       cuesta, y pisa lo que el CSE haya editado a mano. */
    const ruta = leer("app/api/projects/[projectId]/handoff/resumen/route.ts");
    expect(ruta).toContain("generarResumenDeHandoff");
    expect(ruta, "generar cuesta tokens: exige el mismo permiso que generar el handoff").toContain(
      "guardProjectGenerateHandoff",
    );
  });
});
