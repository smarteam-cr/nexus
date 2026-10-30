import { describe, expect, it } from "vitest";
import { fuenteConTope, mensajeDeLaCopia, TIPOS_QUE_LO_ALIMENTAN, type PartesDelMensaje } from "./mensaje";
import { tipoDeArtefacto, tiposCreablesEnElProyecto } from "./tipos";

const base = (over: Partial<PartesDelMensaje> = {}): PartesDelMensaje => ({
  pedido: "",
  instruccionesDeLaCopia: "",
  tipo: tipoDeArtefacto("tech-requirements")!,
  nombreDeLaCopia: "Integración con el ERP",
  empresa: "CEMACO",
  industria: "Retail",
  alcanceEtiquetado: "",
  servicio: "",
  delTipo: "",
  frontera: "⛔ REGLA",
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
    expect(m).toContain("Requerimiento técnico «Integración con el ERP»");
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

  it("⛔ la exploración interna entra detrás de la regla, aunque no haya reuniones ni notas", () => {
    const m = mensajeDeLaCopia(base({ alimentan: [{ tipo: "exploration", texto: "supuesto interno" }], cierreDeFrontera: "" }));
    expect(m.indexOf("⛔ REGLA")).toBeGreaterThan(-1);
    expect(m.indexOf("⛔ REGLA")).toBeLessThan(m.indexOf("supuesto interno"));
    expect(m).toContain("NUNCA se afirma como hecho");
  });

  it("sin documentos que alimenten no repite la regla", () => {
    expect(mensajeDeLaCopia(base())).not.toContain("⛔ REGLA");
  });

  it("lleva el servicio, los tags y lo propio del tipo", () => {
    const m = mensajeDeLaCopia(base({ servicio: "SmartLoop", alcanceEtiquetado: "Sales Hub", delTipo: "BLOQUE DEL SERVICIO" }));
    expect(m).toContain("Servicio contratado: SmartLoop (servicio recurrente)");
    expect(m).toContain("Alcance etiquetado (tags del proyecto): Sales Hub");
    expect(m.indexOf("BLOQUE DEL SERVICIO")).toBeLessThan(m.indexOf("=== HANDOFF"));
  });

  it("una fuente larga se corta en una sección y lo dice", () => {
    const texto = `[Sección: A]\n${"x".repeat(80)}\n\n[Sección: B]\n${"y".repeat(80)}`;
    const r = fuenteConTope(texto, 120);
    expect(r).toContain("[Sección: A]");
    expect(r).not.toContain("[Sección: B]");
    expect(r).toContain("se recortó por largo");
    expect(fuenteConTope("corto", 120)).toBe("corto");
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
