/**
 * lib/pedirle-a-nexus/veracidad.test.ts — la revisión del código sobre lo que propone «✨ Pedirle a Nexus» (23 nov): la
 * vara de las cifras, lo interno solo si se pide y Nexus lo tiene de la cuenta (24 nov; hasta ese día, nunca), lo escrito a
 * mano marcado, y solo piezas del documento.
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

describe("lo interno que el pedido no nombra, o que Nexus no tiene de la cuenta, no llega", () => {
  it("el presupuesto, quién decide o lo que alguien no quiere se descartan con el porqué", () => {
    for (const despues of ["El presupuesto aprobado no alcanza.", "El gerente no quiere cambiar de CRM.", "Quién decide es el director comercial."]) {
      const r = revisar([{ clave: "tesis", despues }], { pedido: "agrega que el gerente no quiere" });
      expect(r.cambios, despues).toEqual([]);
      expect(r.descartados[0].motivo, despues).toMatch(/interno/);
    }
  });

  it("⛔ lo que el pedido no nombra no llega aunque Nexus lo tenga de la cuenta", () => {
    const r = revisar([{ clave: "tesis", despues: "El presupuesto aprobado no alcanza." }], { pedido: "hazlo más corto", interno: ["El presupuesto aprobado no alcanza para este año."] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/interno.*no nombra/);
  });

  it("⛔ lo que el pedido nombra pero Nexus no tiene de la cuenta no llega: nada inventado", () => {
    const r = revisar([{ clave: "tesis", despues: "El presupuesto aprobado no alcanza." }], { pedido: "agrega que el presupuesto no alcanza", interno: ["Marcela pidió una demo del CRM."] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/no tiene en lo que sabe de la cuenta/);
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

  it("una frase de una nota interna que el pedido nombra sí llega, marcada como interna (24 nov; el 23 no llegaba)", () => {
    const nota = "el gerente financiero frenó la compra hasta enero por el cierre fiscal";
    const r = revisar([{ clave: "quitable", despues: "El gerente financiero frenó la compra hasta enero por el cierre." }], { pedido: `agrega que ${nota}`, interno: [nota] });
    expect(r.descartados).toEqual([]);
    expect(r.cambios[0]).toMatchObject({ clave: "quitable", interno: true });
  });
});

describe("lo interno que se pide y Nexus tiene de la cuenta (24 nov: Elías, «sí debería poner lo que el usuario de Nexus diga, siempre y cuando lo tenga en su contexto»)", () => {
  const nota = "Ojo: el presupuesto de marketing es de US$ 20.000 al año y el gerente no quiere pasarse.";

  it("llega marcado como interno: la pantalla avisa que lo verá el cliente al publicar", () => {
    const r = revisar([{ clave: "quitable", despues: "El presupuesto de marketing es de US$ 20.000 al año." }], { pedido: "agrega que el presupuesto de marketing es de US$ 20.000 al año", interno: [nota] });
    expect(r.descartados).toEqual([]);
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]).toMatchObject({ clave: "quitable", interno: true });
  });

  it("un cambio sin nada interno no va marcado", () => {
    const r = revisar([{ clave: "quitable", despues: "Otro riesgo que se puede quitar." }], { pedido: "cámbialo", interno: [nota] });
    expect(r.cambios[0].interno).toBeUndefined();
  });

  it("⛔ pedir una cosa interna no habilita otra: el presupuesto pedido no deja pasar lo que alguien no quiere", () => {
    const r = revisar([{ clave: "quitable", despues: "El presupuesto es de US$ 20.000 y el gerente no quiere pasarse." }], { pedido: "agrega que el presupuesto es de US$ 20.000", interno: [nota] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/«no quiere».*no nombra/);
  });

  it("⛔ un número de una nota no vale si el pedido no lo trae: Nexus no lee las notas, así que no puede saberlo", () => {
    expect(revisar([{ clave: "quitable", despues: "El presupuesto es de US$ 20.000." }], { pedido: "agrega el presupuesto", interno: [nota] }).cambios).toEqual([]);
    // Ni un número que coincide por casualidad con otro de las notas (la revisión del 24 nov).
    const notas = ["El presupuesto no está definido. Reunión con 2 gerentes."];
    expect(revisar([{ clave: "quitable", despues: "El presupuesto es de US$ 2 millones." }], { pedido: "agrega el presupuesto", interno: notas }).cambios).toEqual([]);
    expect(revisar([{ clave: "quitable", despues: "El presupuesto es limitado. Atienden 3 sucursales." }], { pedido: "agrega el presupuesto", interno: ["Tienen 3 vendedores y el presupuesto es limitado."] }).cambios).toEqual([]);
    // Sin pedir nada interno, la cifra de la nota es una cifra que nadie dijo.
    const r = revisar([{ clave: "quitable", despues: "Invierten 20.000 dólares en marketing." }], { pedido: "agrega cuánto invierten", interno: [nota] });
    expect(r.descartados[0].motivo).toMatch(/cifra que nadie dijo/);
  });

  it("⛔ el tema en una nota no alcanza: lo que se dice tiene que venir del pedido (nada inventado)", () => {
    const r = revisar([{ clave: "quitable", despues: "El presupuesto aprobado no alcanza para este año." }], { pedido: "agrega lo del presupuesto", interno: ["Pidieron el presupuesto del proyecto por correo."] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/más de lo que pediste/);
  });

  it("⛔ y tiene que estar en lo que Nexus sabe de la cuenta: lo que contradice la nota no pasa", () => {
    const r = revisar([{ clave: "quitable", despues: "El presupuesto es de 50 mil." }], { pedido: "pon que el presupuesto es de 50 mil", interno: ["Todavía no saben su presupuesto."] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/no está en lo que Nexus sabe de la cuenta/);
  });

  it("⛔ un pedido que pide quitar o no mencionar algo no nombra nada interno (lo interno se pide aparte)", () => {
    const pedidos = [
      "reescríbelo sin mencionar el presupuesto",
      "quita lo del presupuesto",
      "no pongas el presupuesto",
      "No incluyas nada sobre el presupuesto",
      "no quiero que aparezca el presupuesto",
      "no hace falta mencionar el presupuesto",
      "el presupuesto no debe ir",
      "deja fuera el presupuesto",
      "nunca menciones el presupuesto",
    ];
    for (const pedido of pedidos) {
      const r = revisar([{ clave: "quitable", despues: "El presupuesto de marketing es de US$ 20.000 al año." }], { pedido, interno: [nota] });
      expect(r.cambios, pedido).toEqual([]);
      expect(r.descartados[0].motivo, pedido).toMatch(/quitar o no mencionar/);
    }
    // «No tienen presupuesto» sí lo nombra: la negación es de lo que se dice, no del pedido.
    const r = revisar([{ clave: "quitable", despues: "No tienen presupuesto para este año." }], { pedido: "agrega que no tienen presupuesto para este año", interno: ["No tienen presupuesto para este año, ojo."] });
    expect(r.cambios[0]).toMatchObject({ interno: true });
  });

  it("los temas que la regla del modelo nombra son los que reconoce el código: nuestro precio, quién firma, lo que alguien no quiere, un descuento", () => {
    const casos = [
      { despues: "El precio de la licencia es de US$ 1.500 al mes.", pedido: "agrega que el precio de la licencia es de US$ 1.500 al mes", nota: "Les cotizamos: el precio de la licencia es de US$ 1.500 al mes." },
      { despues: "El gerente general firma el contrato en enero.", pedido: "agrega que el gerente general firma el contrato en enero", nota: "El gerente general firma el contrato en enero." },
      { despues: "El director no quiere dejar Salesforce.", pedido: "agrega que el director no quiere dejar Salesforce", nota: "Ojo: el director no quiere dejar Salesforce." },
      { despues: "Les damos un descuento del 15%.", pedido: "agrega que les damos un descuento del 15%", nota: "Les damos un descuento del 15% si firman en diciembre." },
    ];
    for (const c of casos) {
      // Sin notas de la cuenta, no llega.
      expect(revisar([{ clave: "quitable", despues: c.despues }], { pedido: c.pedido }).cambios, c.despues).toEqual([]);
      // Con la nota, llega marcado.
      expect(revisar([{ clave: "quitable", despues: c.despues }], { pedido: c.pedido, interno: [c.nota] }).cambios[0], c.despues).toMatchObject({ interno: true });
    }
  });
});

describe("lo que encontró la segunda revisión del 24 nov", () => {
  const pedir = (antes: string, despues: string, pedido: string, interno: string[] = []) =>
    revisarLaPropuesta({ piezas: [pieza("p", antes, { quitable: true })], propuesto: [{ clave: "p", despues }], pedido, delCliente: [], interno });

  it("⛔ palabra por palabra: que la pieza ya hablara del tema no deja pasar otra palabra interna", () => {
    const r = pedir("El presupuesto de marketing es fijo.", "El presupuesto de marketing es fijo y los presupuestos de ventas están congelados.", "hazlo más claro", ["Los presupuestos de ventas están congelados."]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/«presupuestos».*no nombra/);
    // Y lo interno de otro tema, en una pieza que ya decía algo parecido, tampoco.
    expect(pedir("Tus precios cambian según el canal.", "Tus precios cambian según el canal: con un descuento en nuestra propuesta lo ordenas.", "hazlo más claro").cambios).toEqual([]);
  });

  it("el vocabulario de la escala no es interno: precios, firmas, preferencias del cliente o la inversión en pauta", () => {
    for (const despues of [
      "Buscan los precios en un Excel.",
      "Aplican descuentos sin aprobación.",
      "El cliente firma la cotización por correo.",
      "Tu cliente prefiere comprar por WhatsApp.",
      "No miden el retorno de la inversión en pauta.",
    ]) {
      const r = pedir("Un texto de antes.", despues, "hazlo más claro");
      expect(r.cambios, despues).toHaveLength(1);
      expect(r.cambios[0].interno, despues).toBeUndefined();
    }
  });

  it("⛔ todo lo nuevo de lo interno sale del pedido: ni una causa ni una fecha que nadie dijo", () => {
    const causa = pedir("Televentas no da seguimiento a las cotizaciones.", "Televentas no da seguimiento a las cotizaciones porque no tiene presupuesto.", "menciona el presupuesto", ["El presupuesto está congelado."]);
    expect(causa.cambios).toEqual([]);
    expect(causa.descartados[0].motivo).toMatch(/más de lo que pediste/);
    const marzo = pedir("Un texto de antes.", "El gerente general aprueba el presupuesto en marzo.", "agrega que el gerente general aprueba el presupuesto", ["El gerente general aprueba el presupuesto."]);
    expect(marzo.descartados[0].motivo).toMatch(/«marzo»/);
    // Lo mismo, sin la fecha: llega marcado.
    expect(pedir("Un texto de antes.", "El gerente general aprueba el presupuesto.", "agrega que el gerente general aprueba el presupuesto", ["El gerente general aprueba el presupuesto."]).cambios[0]).toMatchObject({ interno: true });
  });

  it("⛔ lo que contradice la nota no pasa, aunque se pida con todas sus letras", () => {
    const r = pedir("Un texto de antes.", "El equipo comercial tiene presupuesto aprobado.", "agrega que el equipo comercial tiene presupuesto aprobado", ["El equipo comercial NO tiene presupuesto aprobado hasta enero."]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/contradice/);
  });

  it("⛔ un número vale con su palabra: el 20 de «20 vendedores» no respalda «20 mil»", () => {
    const r = pedir("Un texto de antes.", "El presupuesto es de 20 mil.", "agrega que el presupuesto es de 20 mil", ["Tienen 20 vendedores y el presupuesto es limitado."]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/no está en lo que Nexus sabe de la cuenta/);
  });

  it("⛔ una frase interna nueva al final de una oración larga se ve igual", () => {
    const r = pedir(
      "Ventas cotiza a mano, sin registro, y nadie sabe cuántas cotizaciones se pierden al mes.",
      "Ventas cotiza a mano, sin registro, y nadie sabe cuántas cotizaciones se pierden al mes, y la competencia les regaló licencias gratis.",
      "hazlo más claro",
    );
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/«la competencia».*no nombra/);
  });
});

describe("con el pedido hecho desde una sección (24 nov)", () => {
  it("solo llegan las piezas de esa sección; las cifras de toda la página siguen valiendo", () => {
    const seccion = [pieza("quitable", "Un riesgo que se puede quitar.", { quitable: true })];
    const r = revisarLaPropuesta({
      piezas: seccion,
      pagina: PIEZAS,
      propuesto: [
        { clave: "quitable", despues: "Se pierden 4 de cada 10 cotizaciones." },
        { clave: "tesis", despues: "Otra tesis." },
      ],
      pedido: "x",
      delCliente: [],
      interno: [],
    });
    expect(r.cambios.map((c) => c.clave)).toEqual(["quitable"]);
    expect(r.descartados[0]).toMatchObject({ clave: "tesis", motivo: expect.stringMatching(/otra sección/) });
  });
});
