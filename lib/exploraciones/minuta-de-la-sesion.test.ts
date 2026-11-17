import { describe, expect, it } from "vitest";
import { DocumentoPegadoSchema } from "./esquemas";
import { marcaDelRecorte, MAX_TEXTO_DEL_DOCUMENTO, MAX_TEXTO_PEGADO, recortarParaElAgente, sesionConLaMinuta } from "./minuta-de-la-sesion";
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

describe("una transcripción larga (Ulacit, 2026-11-17): entra, y se guarda el principio y el final", () => {
  it("lo que ya cabe no se toca", () => {
    const t = transcripcion(50);
    expect(recortarParaElAgente(t)).toEqual({ texto: t, quitados: 0 });
  });

  it("lo largo queda dentro de lo que lee el agente, con el arranque, el cierre y la marca en el medio", () => {
    const t = transcripcion(1200); // ~ 1 h 20 de reunión, más de 60.000 caracteres
    expect(t.length).toBeGreaterThan(MAX_TEXTO_DEL_DOCUMENTO);
    const r = recortarParaElAgente(t);
    expect(r.texto.length).toBeLessThanOrEqual(MAX_TEXTO_DEL_DOCUMENTO);
    expect(r.quitados).toBeGreaterThan(0);
    expect(r.texto).toContain("Turno 0:");
    expect(r.texto).toContain("Turno 1199:");
    expect(r.texto).toMatch(/se quitaron [\d ]+ caracteres del medio/);
    // Lo que se quitó y lo que quedó suman el original (salvo los espacios que se recortan junto a la marca).
    expect(r.texto.length - marcaDelRecorte(r.quitados).length + r.quitados).toBeLessThanOrEqual(t.length);
    expect(r.texto.length - marcaDelRecorte(r.quitados).length + r.quitados).toBeGreaterThan(t.length - 10);
  });

  it("corta entre turnos, sin partir una línea a la mitad", () => {
    const r = recortarParaElAgente(transcripcion(1200));
    const [antes, despues] = r.texto.split(/\n\n\[… se quitaron [\d ]+ caracteres del medio[^\]]*\]\n\n/);
    expect(antes.split("\n").at(-1)).toMatch(/^(Turno \d+: .*\.|\d+:\d{2}:\d{2} \| \w+)$/);
    expect(despues.split("\n")[0]).toMatch(/^(Turno \d+: .*\.|\d+:\d{2}:\d{2} \| \w+)$/);
  });

  it("un archivo de más de lo que se acepta pegar conserva su final real (se recorta sobre el texto entero)", () => {
    const enorme = transcripcion(6000); // ~ 6 h, más que MAX_TEXTO_PEGADO
    expect(enorme.length).toBeGreaterThan(MAX_TEXTO_PEGADO);
    const r = recortarParaElAgente(enorme);
    expect(r.texto).toContain("Turno 5999:");
    expect(r.texto.length).toBeLessThanOrEqual(MAX_TEXTO_DEL_DOCUMENTO);
    expect(DocumentoPegadoSchema.safeParse({ titulo: "x", texto: r.texto }).success).toBe(true);
  });

  it("sin saltos de línea igual queda dentro del tope", () => {
    const r = recortarParaElAgente("a".repeat(90_000));
    expect(r.texto.length).toBeLessThanOrEqual(MAX_TEXTO_DEL_DOCUMENTO);
    expect(r.quitados).toBeGreaterThan(29_000);
  });

  it("el esquema ya no rechaza una reunión larga: el «Cuerpo inválido» venía de ahí", () => {
    const larga = transcripcion(1200);
    expect(DocumentoPegadoSchema.safeParse({ titulo: "Cierre Ulacit", texto: larga, fecha: "2026-11-13" }).success).toBe(true);
    const r = DocumentoPegadoSchema.safeParse({ titulo: "x", texto: "a".repeat(MAX_TEXTO_PEGADO + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("El texto es demasiado largo: pega una parte.");
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
