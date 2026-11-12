import { describe, expect, it } from "vitest";
import { bloqueDeResultados, fuenteConTope, mensajeDeLaCopia, tieneFoco, TIPOS_QUE_LO_ALIMENTAN, type PartesDelMensaje } from "./mensaje";
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
  it("el rótulo de las reuniones dice si las eligió el equipo o entraron solas", () => {
    expect(mensajeDeLaCopia(base({ reuniones: "R" }))).toContain("LAS REUNIONES ELEGIDAS POR EL EQUIPO");
    const solas = mensajeDeLaCopia(base({ reuniones: "R", reunionesSolas: true }));
    expect(solas).toContain("LAS REUNIONES DEL PROYECTO");
    expect(solas).not.toContain("ELEGIDAS POR EL EQUIPO");
  });

  it("un documento del cliente no le habla al equipo; uno interno no lleva esa regla", () => {
    expect(mensajeDeLaCopia(base())).toContain("no le hables al equipo de Smarteam");
    expect(mensajeDeLaCopia(base({ tipo: tipoDeArtefacto("implementation")! }))).not.toContain("no le hables al equipo");
  });

  it("lo que queda vacío pide su porqué en __vacias", () => {
    expect(mensajeDeLaCopia(base())).toContain("__vacias");
  });

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

  it("las reuniones elegidas van antes del handoff como la fuente principal, y el handoff queda como límite", () => {
    const m = mensajeDeLaCopia(base({ reuniones: "SESIONES DE MARKETING" }));
    expect(m.indexOf("SESIONES DE MARKETING")).toBeLessThan(m.indexOf("=== HANDOFF"));
    expect(m).toContain("la fuente PRINCIPAL de este documento");
    expect(m).toContain("es el LÍMITE de lo que este documento puede prometer");
    expect(m).not.toContain("tu fuente ancla");
    // ⛔ la frontera va delante de las reuniones elegidas aunque no haya documentos que alimenten
    expect(m.indexOf("⛔ REGLA")).toBeGreaterThan(-1);
    expect(m.indexOf("⛔ REGLA")).toBeLessThan(m.indexOf("SESIONES DE MARKETING"));
  });

  it("las reuniones que entraron solas siguen detrás del handoff, que sigue siendo la fuente ancla", () => {
    const m = mensajeDeLaCopia(base({ reuniones: "SESIONES", reunionesSolas: true }));
    expect(m.indexOf("=== HANDOFF")).toBeLessThan(m.indexOf("SESIONES"));
    expect(m).toContain("tu fuente ancla");
  });

  it("los resultados del handoff: con foco, solo los que lo tocan; sin resultados, nada", () => {
    expect(bloqueDeResultados("", "Diagnóstico de marketing")).toBe("");
    const conFoco = bloqueDeResultados("- R1 · Vista 360", "Diagnóstico de marketing");
    expect(conFoco).toContain("«Diagnóstico de marketing»");
    expect(conFoco).toContain("SOLO los que tocan ese foco");
    expect(conFoco).toContain("- R1 · Vista 360");
    expect(bloqueDeResultados("- R1 · Vista 360", null)).not.toContain("foco");
  });

  it("elegidas sin texto: sin foco en el mensaje ni en los resultados (una sola regla)", () => {
    expect(tieneFoco({ reuniones: "  ", reunionesSolas: false })).toBe(false);
    expect(tieneFoco({ reuniones: "R", reunionesSolas: true })).toBe(false);
    expect(tieneFoco({ reuniones: "R" })).toBe(true);
    const m = mensajeDeLaCopia(base({ reuniones: "", avisoSinReuniones: "AVISO SIN REUNIONES" }));
    expect(m).toContain("AVISO SIN REUNIONES");
    expect(m).toContain("tu fuente ancla");
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
