import { describe, expect, it } from "vitest";
import { fichaVacia, textoAHtml, type FichaGuardada } from "./ficha";
import { cambiosDesdeHubspot, htmlATexto } from "./ficha-desde-hubspot";

const ficha = (retos: string, o: Partial<FichaGuardada> = {}): FichaGuardada => {
  const f = fichaVacia();
  return { ...f, valores: { ...f.valores, retosEstrategicos: retos }, ...o };
};

describe("lo que alguien cambió en HubSpot vuelve como propuesta (2026-10-09)", () => {
  it("el HTML que escribió Nexus no se propone", () => {
    const retos = "- Crecer en Panamá\n- Bajar el costo por lead";
    expect(cambiosDesdeHubspot(ficha(retos), { nexus_retos_estrategicos: textoAHtml(retos) })).toEqual([]);
  });

  it("un cambio hecho en HubSpot se propone una vez, como texto", () => {
    const html = "<p>Abrir <strong>Guatemala</strong> en 2027</p>";
    const cambios = cambiosDesdeHubspot(ficha("Crecer en Panamá"), { nexus_retos_estrategicos: html });
    expect(cambios).toEqual([{ clave: "retosEstrategicos", valor: "Abrir **Guatemala** en 2027", html }]);
    // Ya propuesto (o descartado): no vuelve hasta que HubSpot cambie de nuevo.
    expect(cambiosDesdeHubspot(ficha("Crecer en Panamá", { hubspotVisto: { retosEstrategicos: html } }), { nexus_retos_estrategicos: html })).toEqual([]);
  });

  it("vaciar en HubSpot no se propone, y los resultados no vuelven", () => {
    expect(cambiosDesdeHubspot(ficha("Crecer"), { nexus_retos_estrategicos: "", nexus_resultados_que_persigue: "<p>Otra cosa</p>" })).toEqual([]);
  });

  it("las viñetas vuelven como viñetas", () => {
    expect(htmlATexto("<ul><li>Uno</li><li>Dos</li></ul>")).toBe("- Uno\n- Dos");
  });
});
