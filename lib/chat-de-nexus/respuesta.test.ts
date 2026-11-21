/**
 * Nexus responde preguntas sobre la cuenta (21 nov, ./respuesta.ts): lo que decide el código. Primero lo del equipo y las
 * reuniones más nuevas hasta el tope (avisando lo que quedó afuera), cada cita se busca en su fuente, de quién es sale del
 * turno, y sin respaldo o sin respuesta dice que no lo sabe. Respuestas fijas: nada llama a la IA.
 */
import { describe, expect, it } from "vitest";
import { armarLasFuentes, leerLaRespuesta, pedidoDeLaRespuesta, type FuenteDeLaCuenta, type ReunionDeLaCuenta } from "./respuesta";

const reunion = (titulo: string, fecha: string, turnos: [string, "cliente" | "smarteam" | null, string][], puertasAdentro = false): ReunionDeLaCuenta => ({
  titulo,
  fecha,
  puertasAdentro,
  turnos: turnos.map(([hablante, deQuien, texto]) => ({ hablante, deQuien, texto })),
});
const NOTA: FuenteDeLaCuenta = { clave: "N1", tipo: "nota", titulo: "Nota del equipo", fecha: "2026-11-21", porQuien: "Liz Flores", texto: "El gerente nos confirmó por WhatsApp que el ERP lo cambian en enero." };
const respuesta = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o), citations: null }] });

const NUEVA = reunion("Diagnóstico de Cobranza", "2026-11-10", [
  ["Ana Mora", "cliente", "La cobranza la hacemos a mano con un Excel que nadie actualiza."],
  ["Liz Flores", "smarteam", "En HubSpot eso se puede automatizar con secuencias de cobro."],
]);
const VIEJA = reunion("Kickoff comercial", "2026-09-01", [["Ana Mora", "cliente", "x".repeat(500)]]);

describe("lo que lee", () => {
  it("lo del equipo siempre, las reuniones más nuevas hasta el tope, y avisa lo que quedó afuera", () => {
    const { fuentes, afuera } = armarLasFuentes([NOTA], [NUEVA, VIEJA], 500);
    expect(fuentes.map((f) => f.clave)).toEqual(["N1", "R1"]);
    expect(afuera).toEqual({ reuniones: 1, ejemplos: ["2026-09-01: Kickoff comercial"] });
    expect(armarLasFuentes([], [NUEVA, VIEJA]).afuera.reuniones).toBe(0);
  });

  it("el pedido dice de qué lado es cada turno, y las fuentes van con caché", () => {
    const { fuentes, afuera } = armarLasFuentes([NOTA], [NUEVA]);
    const p = pedidoDeLaRespuesta({ empresa: "Centauro", fuentes, afuera, conversacion: [{ de: "persona", texto: "¿Cómo cobran?" }], pregunta: "¿Cómo cobran?" });
    const [bloque, pregunta] = p.messages[0].content as { type: string; text: string; cache_control?: unknown }[];
    expect(bloque.cache_control).toEqual({ type: "ephemeral" });
    expect(bloque.text).toContain("Ana Mora (cliente): La cobranza");
    expect(bloque.text).toContain("Liz Flores (Smarteam): En HubSpot");
    expect(bloque.text).toContain("lo escribió Liz Flores, del equipo");
    expect(pregunta.text).toContain("¿Cómo cobran?");
  });
});

describe("la respuesta", () => {
  const { fuentes, afuera } = armarLasFuentes([NOTA], [NUEVA]);

  it("cada cita se busca en su fuente; de quién es sale del turno", () => {
    const r = leerLaRespuesta(
      respuesta({
        sabe: true,
        respuesta: "Hoy cobran a mano, con un Excel. Smarteam les propuso automatizarlo; el ERP lo cambian en enero.",
        citas: [
          { fuente: "R1", cita: "la cobranza la hacemos a mano con un Excel" },
          { fuente: "R1", cita: "eso se puede automatizar con secuencias de cobro" },
          { fuente: "N1", cita: "el ERP lo cambian en enero" },
          { fuente: "R1", cita: "cobran con transferencias todos los viernes" },
          { fuente: "R9", cita: "la cobranza la hacemos a mano con un Excel" },
        ],
      }),
      fuentes,
      afuera,
    );
    expect(r.sabe).toBe(true);
    expect(r.sinRespaldo).toBe(false);
    expect(r.citas.map((c) => [c.fuente, c.deQuien, c.hablante])).toEqual([
      ["R1", "cliente", "Ana Mora"],
      ["R1", "smarteam", "Liz Flores"],
      ["N1", "equipo", "Liz Flores"],
    ]);
    expect(r.citas[0].deDonde).toBe("Reunión del 2026-11-10: Diagnóstico de Cobranza");
    expect(r.citas[2].deDonde).toBe("Lo dijo Liz Flores del equipo, 2026-11-21");
  });

  it("sin ninguna cita que se sostenga, queda marcada sin respaldo", () => {
    const r = leerLaRespuesta(respuesta({ sabe: true, respuesta: "Decide el gerente general.", citas: [{ fuente: "R1", cita: "el que decide es el gerente general" }] }), fuentes, afuera);
    expect(r).toMatchObject({ sabe: true, citas: [], sinRespaldo: true });
  });

  it("si no lo sabe dice que no lo sabe; si no se pudo leer, no dice «no lo sé»", () => {
    expect(leerLaRespuesta(respuesta({ sabe: false, respuesta: "No lo sé: no aparece.", citas: [{ fuente: "R1", cita: "la cobranza la hacemos a mano con un Excel" }] }), fuentes, afuera)).toMatchObject({ sabe: false, citas: [] });
    const rara = leerLaRespuesta({ content: [{ type: "text", text: "uy", citations: null }] }, fuentes, afuera);
    expect(rara).toMatchObject({ sabe: false, noSePudo: true });
    expect(rara.texto).not.toContain("No lo sé");
    const cortada = leerLaRespuesta({ ...respuesta({ sabe: true, respuesta: "Hoy cobran", citas: [] }), stop_reason: "max_tokens" }, fuentes, afuera);
    expect(cortada).toMatchObject({ sabe: false, noSePudo: true });
  });

  it("una cita copiada sin los «eh» o con otras mayúsculas igual se sostiene, con el texto de la transcripción", () => {
    const r = leerLaRespuesta(respuesta({ sabe: true, respuesta: "Cobran a mano.", citas: [{ fuente: "R1", cita: "la cobranza, eh, la hacemos a mano con un excel" }] }), fuentes, afuera);
    expect(r.citas).toHaveLength(1);
    expect(r.citas[0].hablante).toBe("Ana Mora");
  });
});
