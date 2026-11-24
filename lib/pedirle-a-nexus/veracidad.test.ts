/**
 * lib/pedirle-a-nexus/veracidad.test.ts — la revisión del código sobre lo que propone «✨ Pedirle a Nexus» (23 nov): la
 * vara de las cifras, lo interno nunca (aunque se pida), lo escrito a mano marcado, y solo piezas del documento.
 */
import { describe, expect, it } from "vitest";
import type { PiezaDelDocumento } from "./contrato";
import { cifrasDe, revisarLaPropuesta } from "./veracidad";

const pieza = (clave: string, valor: string | null, o: Partial<PiezaDelDocumento> = {}): PiezaDelDocumento => ({
  clave,
  nombre: `Pieza ${clave}`,
  seccion: "Puntos clave",
  valor,
  tope: 600,
  agregar: valor === null,
  quitable: false,
  aMano: false,
  conCita: false,
  ...o,
});

const PIEZAS = [
  pieza("titular", "13 sesiones y 8 h de conversación con 3 personas de tu equipo."),
  pieza("tesis", "4 de cada 10 cotizaciones se pierden por falta de seguimiento."),
  pieza("escrita", "Lo escribió Ana a mano.", { aMano: true }),
  pieza("quitable", "Un riesgo que se puede quitar.", { quitable: true }),
  pieza("nuevo", null),
];

const revisar = (propuesto: { clave: string; despues: string | null }[], o: { pedido?: string; delCliente?: string[]; interno?: string[] } = {}) =>
  revisarLaPropuesta({ piezas: PIEZAS, propuesto, pedido: o.pedido ?? "mejóralo", delCliente: o.delCliente ?? [], interno: o.interno ?? [] });

describe("las cifras", () => {
  it("lee los números sin separadores", () => {
    expect(cifrasDe("4.800 clientes, 2 de cada 10 y US$1,5M")).toEqual(["4800", "2", "10", "15"]);
  });

  it("una cifra que nadie dijo no llega: Nexus no inventa", () => {
    const r = revisar([{ clave: "tesis", despues: "7 de cada 10 cotizaciones se pierden." }]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/cifra que nadie dijo \(7\)/);
  });

  it("la cifra que trae el pedido sí llega, y la que ya estaba en la página también", () => {
    const r = revisar([{ clave: "tesis", despues: "2 de cada 10 cotizaciones se pierden; son 13 sesiones." }], { pedido: "cambia a 2 de cada 10" });
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]).toMatchObject({ clave: "tesis", antes: PIEZAS[1].valor, despues: "2 de cada 10 cotizaciones se pierden; son 13 sesiones." });
  });

  it("la cifra de lo que el equipo confirmó para el cliente sí llega", () => {
    const r = revisar([{ clave: "nuevo", despues: "Contactan a 4.800 clientes al mes." }], { delCliente: ["Crédito y cobro contacta a 4800 clientes al mes"] });
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0].agregar).toBe(true);
  });
});

describe("lo interno nunca llega, aunque se pida", () => {
  it("el presupuesto, quién decide o lo que alguien no quiere se descartan con el porqué", () => {
    for (const despues of ["El presupuesto aprobado no alcanza.", "El gerente no quiere cambiar de CRM.", "Quién decide es el director comercial."]) {
      const r = revisar([{ clave: "tesis", despues }], { pedido: "agrega que el gerente no quiere" });
      expect(r.cambios, despues).toEqual([]);
      expect(r.descartados[0].motivo, despues).toMatch(/interno/);
    }
  });

  it("una frase copiada de una nota interna del equipo no llega", () => {
    const nota = "Ojo: Marcela desconfía del equipo de TI porque el último proyecto se cayó en marzo";
    const r = revisar([{ clave: "tesis", despues: "El equipo de TI porque el último proyecto se cayó es lo que más frena." }], { interno: [nota] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/interno/);
  });

  it("lo que ya decía la pieza no cuenta como nuevo", () => {
    const piezas = [pieza("p", "Deciden quién aprueba el presupuesto de marketing en el comité.")];
    const r = revisarLaPropuesta({ piezas, propuesto: [{ clave: "p", despues: "Deciden en comité quién aprueba el presupuesto de marketing." }], pedido: "más corto", delCliente: [], interno: [] });
    expect(r.cambios).toHaveLength(1);
  });
});

describe("solo piezas del documento, con sus reglas", () => {
  it("una clave que no es de la página no llega", () => {
    const r = revisar([{ clave: "otra-empresa", despues: "algo" }]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0]).toMatchObject({ clave: null, motivo: "Esa parte no es de esta página." });
  });

  it("lo escrito a mano llega marcado: la pantalla pregunta antes de pisarlo", () => {
    const r = revisar([{ clave: "escrita", despues: "Lo cambió Nexus." }]);
    expect(r.cambios[0].aMano).toBe(true);
  });

  it("una pieza que no se quita no se vacía; una que sí, se quita", () => {
    expect(revisar([{ clave: "tesis", despues: "" }]).descartados[0].motivo).toMatch(/vacía/);
    expect(revisar([{ clave: "quitable", despues: "" }]).cambios[0]).toMatchObject({ clave: "quitable", despues: null });
  });

  it("lo que no cambia no es un cambio, y la misma pieza dos veces cuenta una", () => {
    const r = revisar([
      { clave: "tesis", despues: PIEZAS[1].valor },
      { clave: "quitable", despues: "Otro riesgo." },
      { clave: "quitable", despues: "Otro riesgo distinto." },
    ]);
    expect(r.cambios.map((c) => c.clave)).toEqual(["quitable"]);
  });

  it("lo que pasa del largo de la pieza no llega", () => {
    const r = revisarLaPropuesta({ piezas: [pieza("corta", "Hola", { tope: 10 })], propuesto: [{ clave: "corta", despues: "Un texto bastante más largo" }], pedido: "x", delCliente: [], interno: [] });
    expect(r.descartados[0].motivo).toMatch(/largo/);
  });
});

describe("el tuteo", () => {
  it("un texto con voseo no llega: la página le habla de tú al cliente", () => {
    const r = revisarLaPropuesta({
      piezas: PIEZAS,
      propuesto: [{ clave: "quitable", despues: "Tenés que ordenar el seguimiento." }],
      pedido: "x",
      delCliente: [],
      interno: [],
      voseo: (t) => (/\btenés\b/i.test(t) ? ["Tenés"] : []),
    });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/voseo/);
  });
});

describe("lo que la revisión del 23 nov encontró", () => {
  it("una cifra que el cliente no ve (su cita no la sostiene) no vale para otra pieza", () => {
    const piezas = [pieza("oculta", "US$ 40.000 al mes en cartera", { noLaVeElCliente: true }), pieza("tesis", "La cartera no se cobra.")];
    const r = revisarLaPropuesta({ piezas, propuesto: [{ clave: "tesis", despues: "Pierden US$ 40.000 al mes." }], pedido: "x", delCliente: [], interno: [] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/cifra que nadie dijo/);
  });

  it("una frase de una nota interna no pasa aunque venga en el pedido", () => {
    const nota = "el gerente financiero frenó la compra hasta enero por el cierre fiscal";
    const r = revisar([{ clave: "quitable", despues: "El gerente financiero frenó la compra hasta enero por el cierre." }], { pedido: `agrega que ${nota}`, interno: [nota] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/interno/);
  });
});
