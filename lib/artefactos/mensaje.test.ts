import { describe, expect, it } from "vitest";
import { mensajeDeLaCopia, TIPOS_QUE_LO_ALIMENTAN, type PartesDelMensaje } from "./mensaje";
import { tipoDeArtefacto, tiposCreablesEnElProyecto } from "./tipos";

const base = (over: Partial<PartesDelMensaje> = {}): PartesDelMensaje => ({
  pedido: "",
  instruccionesDeLaCopia: "",
  tipo: tipoDeArtefacto("integration")!,
  nombreDeLaCopia: "Integración con el ERP",
  empresa: "CEMACO",
  industria: "Retail",
  handoff: "[Sección: Desarrollo]\nIntegrar Intelisis.",
  reuniones: "",
  avisoSinReuniones: "",
  notas: "",
  memoria: "",
  alimentan: [],
  cierreDeFrontera: "",
  ...over,
});

describe("el mensaje con que se genera una copia", () => {
  it("dice qué documento es y su nombre, y lleva el handoff como fuente ancla", () => {
    const m = mensajeDeLaCopia(base());
    expect(m).toContain("Integración técnica «Integración con el ERP»");
    expect(m).toContain("=== HANDOFF DEL PROYECTO");
    expect(m).toContain("Integrar Intelisis.");
  });

  it("las instrucciones de ESTA copia y lo pedido van primero; las secciones vacías no inventan", () => {
    const m = mensajeDeLaCopia(base({ pedido: "PEDIDO", instruccionesDeLaCopia: "DE LA COPIA" }));
    expect(m.indexOf("PEDIDO")).toBeLessThan(m.indexOf("DE LA COPIA"));
    expect(m.indexOf("DE LA COPIA")).toBeLessThan(m.indexOf("Empresa:"));
    expect(m).toContain("no inventes");
  });

  it("sin handoff lo dice, y un documento que alimenta vacío no se nombra", () => {
    const m = mensajeDeLaCopia(base({ handoff: "", alimentan: [{ tipo: "planning", texto: "  " }] }));
    expect(m).toContain("(Sin handoff.");
    expect(m).not.toContain("PLANIFICACIÓN DEL PROYECTO");
  });

  it("la frontera va al final, después de las reuniones", () => {
    const m = mensajeDeLaCopia(base({ reuniones: "REUNIONES", cierreDeFrontera: "⛔ FRONTERA" }));
    expect(m.indexOf("REUNIONES")).toBeLessThan(m.indexOf("⛔ FRONTERA"));
  });

  it("cada tipo que admite copias sabe de qué tipos se alimenta, y solo de tipos que existen", () => {
    for (const t of tiposCreablesEnElProyecto()) {
      expect(TIPOS_QUE_LO_ALIMENTAN[t.id], t.id).toBeDefined();
      for (const a of TIPOS_QUE_LO_ALIMENTAN[t.id]) expect(tipoDeArtefacto(a), `${t.id} → ${a}`).not.toBeNull();
    }
  });
});
