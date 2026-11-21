/**
 * El agente de impacto (./impacto.ts) decide sí o no con casos fijos, sin llamar a la IA: lo que el código decide antes
 * de llamar, y cómo lee una respuesta (fija) del modelo.
 */
import { describe, expect, it } from "vitest";
import { antesDeLlamar, leerElImpacto, MODELO_DEL_IMPACTO, pedidoDelImpacto, textoDelAviso, type EntregableParaElImpacto } from "./impacto";
import { plegarHitos } from "./respuesta-del-cliente";

const respuesta = (texto: string) => ({ content: [{ type: "text" as const, text: texto, citations: null }] });

const sinCliente = plegarHitos([]);
const entregable: EntregableParaElImpacto = {
  nombre: "la página de La escala",
  armado: true,
  publicado: true,
  piezas: [
    { parte: "Titular", texto: "Las cuentas a crédito no se cobran a tiempo. Cada gestor lleva 800 clientes." },
    { parte: "Ventas", texto: "Reto principal: La gerencia no ve qué vende cada asesor" },
    { parte: "Puntos clave", texto: "La cartera vive en Excel: nadie ve el atraso del día" },
  ],
  cliente: sinCliente,
  loAceptado: "",
};
const aceptado = plegarHitos([
  { tipo: "presentada", fecha: "2026-11-18", nota: null, loQueSeVio: "- [Titular] …", publicadaEn: null, porEmail: "a@smarteamcr.com", en: "2026-11-18T15:00:00.000Z" },
  { tipo: "acepto", fecha: null, nota: null, loQueSeVio: "- [Titular] …", publicadaEn: null, porEmail: "a@smarteamcr.com", en: "2026-11-18T16:00:00.000Z" },
]);

describe("antes de llamar a la IA", () => {
  it("sin entregable armado no hay nada que rehacer", () => {
    expect(antesDeLlamar({ texto: "El gerente dijo que pierden 40 mil al mes" }, { ...entregable, armado: false })).toBe("sin-entregable");
    expect(antesDeLlamar({ texto: "El gerente dijo que pierden 40 mil al mes" }, { ...entregable, piezas: [] })).toBe("sin-entregable");
  });
  it("una nota de dos palabras no cambia nada", () => {
    expect(antesDeLlamar({ texto: "ver esto" }, entregable)).toBe("nota-corta");
  });
  it("una nota con un hecho y un entregable armado sí se pregunta", () => {
    expect(antesDeLlamar({ texto: "El gerente dijo que pierden 40 mil al mes en cartera" }, entregable)).toBeNull();
  });
});

describe("el pedido", () => {
  it("va a Haiku, con la nota, quién la escribió, las partes y la escalera", () => {
    const p = pedidoDelImpacto({ texto: "Pierden US$ 40 mil al mes en cartera vencida", por: "Liz", en: "2026-11-21T10:00:00Z" }, { ...entregable, cliente: aceptado, loAceptado: "Lo que el cliente ACEPTÓ…" });
    expect(p.model).toBe(MODELO_DEL_IMPACTO);
    const texto = JSON.stringify(p.messages) + String(p.system);
    expect(texto).toContain("Pierden US$ 40 mil");
    expect(texto).toContain("la escribió Liz el 2026-11-21");
    expect(texto).toContain("Titular · Ventas · Puntos clave");
    expect(texto).toContain("Aceptado por el cliente");
    expect(texto).toContain("Lo que el cliente ACEPTÓ");
    expect(texto).toContain("Se le presentó al cliente el 2026-11-18");
  });
});

describe("la lectura de la respuesta", () => {
  it("SÍ: con su por qué y solo las partes que el entregable tiene", () => {
    const i = leerElImpacto(respuesta('{"cambia":true,"porque":"la nota trae lo que pierden al mes en cartera.","partes":["Titular","titular","Otra cosa"],"contradiceLoAceptado":false}'), entregable);
    expect(i).toEqual({ cambia: true, porque: "la nota trae lo que pierden al mes en cartera", partes: ["Titular"], contradiceLoAceptado: null });
  });
  it("NO: lo dice el modelo", () => {
    expect(leerElImpacto(respuesta('{"cambia":false,"porque":"","partes":[]}'), entregable).cambia).toBe(false);
  });
  it("NO: un sí sin por qué, o ilegible, no dispara nada", () => {
    expect(leerElImpacto(respuesta('{"cambia":true,"porque":"","partes":["Titular"]}'), entregable).cambia).toBe(false);
    expect(leerElImpacto(respuesta("no sé"), entregable).cambia).toBe(false);
    expect(leerElImpacto(respuesta('{"cambia":"true","porque":"trae una cifra nueva de cartera"}'), entregable).cambia).toBe(false);
  });
  it("«contradice lo aceptado» solo vale si el cliente aceptó algo, y la fecha la pone el registro", () => {
    const crudo = '{"cambia":true,"porque":"dice que el problema ya no es la cartera","partes":["Titular"],"contradiceLoAceptado":true}';
    expect(leerElImpacto(respuesta(crudo), entregable).contradiceLoAceptado).toBeNull();
    expect(leerElImpacto(respuesta(crudo), { ...entregable, cliente: aceptado }).contradiceLoAceptado).toBe("2026-11-18");
  });
});

describe("el aviso", () => {
  it("dice qué cambia y, delante, si contradice lo aceptado", () => {
    const i = { cambia: true, porque: "La nota trae lo que pierden al mes", partes: [], contradiceLoAceptado: null };
    expect(textoDelAviso(i, "la página de La escala")).toBe("Esto cambia la página de La escala: la nota trae lo que pierden al mes.");
    expect(textoDelAviso({ ...i, contradiceLoAceptado: "2026-11-18" }, "la página de La escala", () => "18 nov")).toBe(
      "Esto contradice lo que el cliente aceptó el 18 nov. Esto cambia la página de La escala: la nota trae lo que pierden al mes.",
    );
    expect(textoDelAviso({ ...i, cambia: false }, "x")).toBe("");
  });
});
