import { describe, expect, it } from "vitest";
import { DocumentoPegadoSchema, DocumentoSubidoSchema } from "./esquemas";
import {
  entraEnLaLectura,
  MAX_TEXTO_DE_UNA_REUNION,
  MAX_TEXTO_DEL_ARCHIVO,
  MAX_TEXTO_PEGADO,
  MENSAJE_DE_ARCHIVO_LARGO,
  MENSAJE_DE_PEGADO_LARGO,
  sesionConLaMinuta,
  TOPE_DE_LA_LECTURA,
  TOPE_DURO_DEL_PEDIDO,
} from "./minuta-de-la-sesion";
import type { SesionPlaneada } from "./guia";

/** Una transcripción como la de Meet: «0:00:05 | Nombre» y lo que dijo, turno por turno. */
function transcripcion(turnos: number): string {
  const out: string[] = [];
  for (let i = 0; i < turnos; i++) {
    const min = Math.floor(i / 4);
    out.push(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}:${String((i * 15) % 60).padStart(2, "0")} | ${i % 2 ? "Alexander" : "Alejandro"}`);
    out.push(`Turno ${i}: lo que se dijo en este momento de la reunión, con algo de detalle para que pese como una real.`);
    out.push("");
  }
  return out.join("\n");
}

describe("una transcripción larga (Ulacit, 2026-11-17): entra entera, sin quitarle nada", () => {
  it("una reunión de una hora y veinte (unos 72.000 caracteres) pasa el esquema tal cual", () => {
    const larga = transcripcion(1200);
    expect(larga.length).toBeGreaterThan(60_000);
    const r = DocumentoPegadoSchema.safeParse({ titulo: "Cierre Ulacit", texto: larga, fecha: "2026-11-13" });
    expect(r.success).toBe(true);
    expect(r.data?.texto).toBe(larga.trim());
  });

  it("pegado de más se rechaza diciéndolo y mandando a subirlo como archivo, no se corta", () => {
    const r = DocumentoPegadoSchema.safeParse({ titulo: "x", texto: "a".repeat(MAX_TEXTO_PEGADO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MENSAJE_DE_PEGADO_LARGO);
    expect(MENSAJE_DE_PEGADO_LARGO).toMatch(/súbelo como archivo/);
  });

  it("un archivo admite lo que el agente lee de una reunión, y más largo se rechaza diciéndolo", () => {
    expect(DocumentoSubidoSchema.safeParse({ titulo: "x", texto: "a".repeat(MAX_TEXTO_PEGADO + 1) }).success).toBe(true);
    const r = DocumentoSubidoSchema.safeParse({ titulo: "x", texto: "a".repeat(MAX_TEXTO_DEL_ARCHIVO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MENSAJE_DE_ARCHIVO_LARGO);
  });

  it("lo que se acepta es lo que el agente lee entero: si divergen, algo se cortaría en silencio", () => {
    expect(MAX_TEXTO_DEL_ARCHIVO).toBe(MAX_TEXTO_DE_UNA_REUNION);
    expect(MAX_TEXTO_PEGADO).toBeLessThanOrEqual(MAX_TEXTO_DE_UNA_REUNION);
    expect(TOPE_DE_LA_LECTURA).toBeGreaterThanOrEqual(MAX_TEXTO_DE_UNA_REUNION);
  });
});

describe("qué reunión entra en una corrida (la regla que usa fuentes.ts): lo que no entra queda para la próxima, entero", () => {
  it("la primera entra aunque sea la más larga, y aunque HubSpot ya ocupe lugar", () => {
    expect(entraEnLaLectura({ usado: 0, reunionesDentro: 0, largo: MAX_TEXTO_DE_UNA_REUNION })).toBe(true);
    expect(entraEnLaLectura({ usado: 40_000, reunionesDentro: 0, largo: MAX_TEXTO_DE_UNA_REUNION })).toBe(true);
  });

  it("…salvo que el pedido no cupiera en el modelo: ahí espera, en vez de fallar igual cada vez", () => {
    expect(entraEnLaLectura({ usado: TOPE_DURO_DEL_PEDIDO - MAX_TEXTO_DE_UNA_REUNION + 1, reunionesDentro: 0, largo: MAX_TEXTO_DE_UNA_REUNION })).toBe(false);
  });

  it("detrás de otra, entra solo si cabe en el tope de la corrida", () => {
    expect(entraEnLaLectura({ usado: TOPE_DE_LA_LECTURA - 10, reunionesDentro: 1, largo: 10 })).toBe(true);
    expect(entraEnLaLectura({ usado: TOPE_DE_LA_LECTURA - 10, reunionesDentro: 1, largo: 11 })).toBe(false);
  });

  it("el pedido duro deja lugar a las notas (60.000) y a las instrucciones dentro del contexto del modelo", () => {
    // ~3,5 caracteres por token en español; el modelo admite 200.000 tokens.
    expect((TOPE_DURO_DEL_PEDIDO + 60_000) / 3.5).toBeLessThan(160_000);
  });
});

describe("la minuta de una sesión: qué marca se va y cuál se queda", () => {
  const base: SesionPlaneada = { id: "s-uno", titulo: "Cierre Ulacit", fecha: "2026-11-13", objetivo: "Cerrar el alcance" };

  it.each(["otroCanal", "noSeHizo"] as const)("marcada «%s»: queda con su reunión y sin la marca (ya no es cierta)", (resultado) => {
    const s = sesionConLaMinuta({ ...base, resultado }, "doc-1");
    expect(s).toEqual({ ...base, reunion: { origen: "documento", id: "doc-1" } });
    expect("resultado" in s).toBe(false);
  });

  it("marcada «cortada»: conserva la marca y lo que pasó a la siguiente (borrarlo se llevaba esas preguntas sin aviso)", () => {
    const s = sesionConLaMinuta({ ...base, resultado: "cortada", pasaron: ["metas", "tiempos"] }, "doc-1");
    expect(s).toEqual({ ...base, resultado: "cortada", pasaron: ["metas", "tiempos"], reunion: { origen: "documento", id: "doc-1" } });
  });

  it("sin marca, solo se le pone la reunión y conserva lo demás", () => {
    expect(sesionConLaMinuta(base, "doc-2")).toEqual({ ...base, reunion: { origen: "documento", id: "doc-2" } });
  });
});
