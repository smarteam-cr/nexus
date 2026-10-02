import { describe, expect, it } from "vitest";
import { ErrorDeFormato } from "../documento/tipos";
import { parsearMapaDeHerramientas } from "./parsear";

const MAPA = `---
documento: Mapa de herramientas
version: 1.2.0
escala: 8.7.0
fecha: 2026-10-01
estado: Borrador
---

# Mapa de herramientas

Qué es el mapa.

**Lo habilita, no lo cumple.** Cómo se lee.

## Insider One

*Clave:* insider
*Color:* fucsia
*Qué es:* Una plataforma.
*Cuándo conviene:* Con mucho tráfico.
*Revisado:* 2026-10-01
*Responsable:* por definir

### Marketing
- \`2.2.O1\` Decide el mensaje de cada persona.
- \`2.6.O3\` Personaliza en la sesión.

## HubSpot

*Clave:* hubspot
*Color:* Naranja
*Qué es:* El CRM.
- \`1.1.F2\` Sales Hub Starter: pipelines con etapas.

## Historial de versiones

**1.2.0 (2026-10-01).** Una línea
que sigue.
`;

/** El mapa con una línea cambiada (para probar los errores). */
const con = (de: string, a: string) => MAPA.replace(de, a);

function errorDe(texto: string): ErrorDeFormato {
  try {
    parsearMapaDeHerramientas(texto);
  } catch (e) {
    if (e instanceof ErrorDeFormato) return e;
    throw e;
  }
  throw new Error("no falló");
}

describe("parsearMapaDeHerramientas", () => {
  it("lee el encabezado, la introducción, cada herramienta y el historial", () => {
    const m = parsearMapaDeHerramientas(MAPA);
    expect(m.version).toBe("1.2.0");
    expect(m.escala).toBe("8.7.0");
    expect(m.intro).toEqual(["Qué es el mapa.", "**Lo habilita, no lo cumple.** Cómo se lee."]);
    expect(m.herramientas.map((h) => h.clave)).toEqual(["insider", "hubspot"]);
    const [insider, hubspot] = m.herramientas;
    expect(insider).toMatchObject({ nombre: "Insider One", sigla: "I", color: "fucsia", queEs: "Una plataforma.", cuandoConviene: "Con mucho tráfico.", revisado: "2026-10-01" });
    expect(insider.aportes).toEqual({ "2.2.O1": "Decide el mensaje de cada persona.", "2.6.O3": "Personaliza en la sesión." });
    // El color se lee sin importar mayúsculas; lo que no dice queda null.
    expect(hubspot).toMatchObject({ color: "naranja", sigla: "H", cuandoConviene: null, responsable: null });
    expect(m.historial).toEqual([{ version: "1.2.0", fecha: "2026-10-01", texto: "Una línea que sigue." }]);
  });

  it("una sigla propia reemplaza la inicial", () => {
    const m = parsearMapaDeHerramientas(con("*Clave:* hubspot", "*Clave:* hubspot\n*Sigla:* hs"));
    expect(m.herramientas[1].sigla).toBe("HS");
  });

  it("una línea que no se entiende dentro de una herramienta es un error con su número", () => {
    const e = errorDe(con("- `2.6.O3` Personaliza en la sesión.", "- 2.6.O3 sin las comillas"));
    expect(e.linea).toBe(26);
    expect(e.message).toMatch(/No entiendo esta línea dentro de «Insider One»/);
  });

  it("solo se mapean Funcional, Eficiente y Óptimo", () => {
    expect(errorDe(con("`2.6.O3`", "`2.6.I2`")).message).toMatch(/2\.6\.I2: solo se mapean/);
  });

  it("un criterio repetido en una herramienta, un campo desconocido o un color que no existe frenan", () => {
    expect(errorDe(con("`2.6.O3`", "`2.2.O1`")).message).toMatch(/nombra dos veces 2\.2\.O1/);
    expect(errorDe(con("*Responsable:* por definir", "*Dueño:* yo")).message).toMatch(/«Dueño» no es un campo/);
    expect(errorDe(con("*Color:* fucsia", "*Color:* morado")).message).toMatch(/puede ser celeste, naranja, fucsia, turquesa, lima/);
  });

  it("cada herramienta dice su clave, su color, qué es y al menos un criterio", () => {
    expect(errorDe(con("*Clave:* insider\n", "")).message).toMatch(/no dice su clave/);
    expect(errorDe(con("*Qué es:* El CRM.\n", "")).message).toMatch(/«HubSpot» no dice su qué es/);
    expect(errorDe(con("- `1.1.F2` Sales Hub Starter: pipelines con etapas.\n", "")).message).toMatch(/«HubSpot» no nombra ningún criterio/);
  });

  it("dos herramientas no comparten clave ni sigla", () => {
    expect(errorDe(con("*Clave:* hubspot", "*Clave:* insider")).message).toMatch(/misma clave/);
    expect(errorDe(con("*Clave:* hubspot", "*Clave:* hubspot\n*Sigla:* I")).message).toMatch(/misma sigla/);
  });

  it("sin versión no hay mapa", () => {
    expect(errorDe(MAPA.replace("version: 1.2.0\n", "")).message).toMatch(/no dice su versión/);
  });
});
