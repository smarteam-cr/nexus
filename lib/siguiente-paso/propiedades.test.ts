import { describe, expect, it } from "vitest";
import { nombresDelEquipo, propiedadesDelSiguientePaso } from "./propiedades";

describe("propiedades de siguiente paso", () => {
  it("son tres por equipo (Ventas, CS y Dev), sin Marketing", () => {
    const nombres = propiedadesDelSiguientePaso().map((p) => p.name);
    expect(nombres).toEqual([
      "siguiente_paso_ventas",
      "siguiente_paso_ventas_fecha",
      "siguiente_paso_ventas_responsable",
      "siguiente_paso_cs",
      "siguiente_paso_cs_fecha",
      "siguiente_paso_cs_responsable",
      "siguiente_paso_dev",
      "siguiente_paso_dev_fecha",
      "siguiente_paso_dev_responsable",
    ]);
  });

  it("el responsable es un usuario de HubSpot y nunca usa el nombre de HubSpot", () => {
    const props = propiedadesDelSiguientePaso();
    for (const p of props.filter((x) => x.name.endsWith("_responsable"))) {
      expect(p).toMatchObject({ type: "enumeration", externalOptions: true, referencedObjectType: "OWNER" });
    }
    expect(props.some((p) => p.name === "hs_next_step")).toBe(false);
  });

  it("los nombres del escritor salen de la misma regla que las propiedades", () => {
    const nombres = new Set(propiedadesDelSiguientePaso().map((p) => p.name));
    for (const n of Object.values(nombresDelEquipo("cs"))) expect(nombres.has(n)).toBe(true);
  });
});
