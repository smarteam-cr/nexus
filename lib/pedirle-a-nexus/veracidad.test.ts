/**
 * lib/pedirle-a-nexus/veracidad.test.ts — la revisión del código sobre lo que propone «✨ Pedirle a Nexus» (23 nov): la
 * vara de las cifras, lo escrito a mano marcado, solo piezas del documento, y lo interno (24 nov; hasta ese día, nunca):
 *   1. todo cambio que toca lo interno llega marcado;
 *   2. lo interno que el pedido no nombra no llega;
 *   3. lo pedido va con las palabras del pedido, si Nexus lo tiene de la cuenta, y con lo que lo respalda a la vista: el
 *      sentido (si dice lo mismo que la nota) lo juzga quien aplica, no el código.
 * Los casos con nombre son los que encontraron las cinco vueltas de revisión del 24 nov.
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

/** Un cambio a una sola pieza (`antes`), con otras piezas de la página si hacen falta. */
const pedir = (antes: string, despues: string, pedido: string, interno: string[] = [], otras: PiezaDelDocumento[] = []) =>
  revisarLaPropuesta({ piezas: [pieza("p", antes, { quitable: true })], pagina: [...otras, pieza("p", antes, { quitable: true })], propuesto: [{ clave: "p", despues }], pedido, delCliente: [], interno });
const ANTES = "Un texto de antes.";

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

  it("una cifra que el cliente no ve (su cita no la sostiene) no vale para otra pieza", () => {
    const piezas = [pieza("oculta", "US$ 40.000 al mes en cartera", { noLaVeElCliente: true }), pieza("tesis", "La cartera no se cobra.")];
    const r = revisarLaPropuesta({ piezas, propuesto: [{ clave: "tesis", despues: "Pierden US$ 40.000 al mes." }], pedido: "x", delCliente: [], interno: [] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/cifra que nadie dijo/);
  });
});

describe("solo piezas del documento, con sus reglas", () => {
  it("una clave que no es de la página no llega", () => {
    const r = revisar([{ clave: "otra-empresa", despues: "algo" }]);
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0]).toMatchObject({ clave: null, motivo: "Esa parte no es de esta página." });
  });

  it("lo escrito a mano llega marcado: la pantalla pregunta antes de pisarlo", () => {
    expect(revisar([{ clave: "escrita", despues: "Lo cambió Nexus." }]).cambios[0].aMano).toBe(true);
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

  it("un texto con voseo no llega: la página le habla de tú al cliente", () => {
    const r = revisarLaPropuesta({ piezas: PIEZAS, propuesto: [{ clave: "quitable", despues: "Tenés que ordenar el seguimiento." }], pedido: "x", delCliente: [], interno: [], voseo: (t) => (/\btenés\b/i.test(t) ? ["Tenés"] : []) });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/voseo/);
  });

  it("con el pedido hecho desde una sección, solo llegan sus piezas; las cifras de toda la página siguen valiendo", () => {
    const r = revisarLaPropuesta({
      piezas: [pieza("quitable", "Un riesgo que se puede quitar.", { quitable: true })],
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

describe("lo interno · 1. todo cambio que lo toca llega marcado", () => {
  const CAMPANAS = "Las campañas corren hasta agotar presupuesto sin que nadie mida qué dejan.";

  it("reescribir sin pedirlo una oración que ya hablaba de un tema interno llega marcado (con su pregunta)", () => {
    const r = pedir(CAMPANAS, "Las campañas corren hasta agotar presupuesto, que se congela en enero, sin que nadie mida qué dejan.", "hazlo más claro");
    expect(r.cambios[0]).toMatchObject({ interno: true });
    // Lo que no toca la oración interna no se marca.
    expect(pedir(`${CAMPANAS} Nadie revisa los leads.`, `${CAMPANAS} Nadie revisa los contactos que llegan.`, "hazlo más claro").cambios[0].interno).toBeUndefined();
  });

  it("un cambio sin nada interno no va marcado", () => {
    expect(revisar([{ clave: "quitable", despues: "Otro riesgo que se puede quitar." }], { pedido: "cámbialo" }).cambios[0].interno).toBeUndefined();
  });

  it("el vocabulario de la escala y de la operación del cliente no es interno", () => {
    for (const despues of [
      "Buscan los precios en un Excel.",
      "Aplican descuentos sin aprobación.",
      "El cliente firma la cotización por correo.",
      "Tu cliente prefiere comprar por WhatsApp.",
      "No miden el retorno de la inversión en pauta.",
      "El cliente firma el contrato en papel.",
      "Deciden la compra en comité.",
    ]) {
      const r = pedir(ANTES, despues, "hazlo más claro");
      expect(r.cambios, despues).toHaveLength(1);
      expect(r.cambios[0].interno, despues).toBeUndefined();
    }
  });
});

describe("lo interno · 2. lo que el pedido no nombra no llega", () => {
  it("el presupuesto, quién decide o lo que alguien no quiere se descartan con el porqué", () => {
    for (const despues of ["El presupuesto aprobado no alcanza.", "Quién decide es el director comercial.", "La competencia les ofreció licencias gratis."]) {
      const r = revisar([{ clave: "tesis", despues }], { pedido: "agrega que el gerente no quiere", interno: [`${despues} (nota)`] });
      expect(r.cambios, despues).toEqual([]);
      expect(r.descartados[0].motivo, despues).toMatch(/no nombra/);
    }
  });

  it("⛔ palabra por palabra: que la pieza ya hablara del tema no deja pasar otra palabra interna", () => {
    expect(pedir("El presupuesto de marketing es fijo.", "El presupuesto de marketing es fijo y los presupuestos de ventas están congelados.", "hazlo más claro", ["Los presupuestos de ventas están congelados."]).descartados[0].motivo).toMatch(/«presupuestos».*no nombra/);
    expect(pedir("Tus precios cambian según el canal.", "Tus precios cambian según el canal: con un descuento en nuestra propuesta lo ordenas.", "hazlo más claro").cambios).toEqual([]);
    const larga = "Ventas cotiza a mano, sin registro, y nadie sabe cuántas cotizaciones se pierden al mes.";
    expect(pedir(larga, `${larga.slice(0, -1)}, y la competencia les regaló licencias gratis.`, "hazlo más claro").descartados[0].motivo).toMatch(/«la competencia».*no nombra/);
  });

  it("⛔ las palabras con tilde al final cuentan («presupuestó», «objetó»)", () => {
    expect(pedir(ANTES, "La gerencia ya presupuestó el CRM para enero.", "mejóralo").descartados[0].motivo).toMatch(/no nombra/);
    expect(pedir(ANTES, "El gerente objetó la fecha.", "mejóralo").descartados[0].motivo).toMatch(/no nombra/);
  });

  it("⛔ quién aprueba la compra o firma la propuesta, en cualquier orden, es tema", () => {
    for (const despues of ["El gerente general aprueba la compra.", "El directorio aprobó la propuesta.", "El gerente firmará la propuesta en enero.", "La compra la aprueba el gerente general.", "La propuesta la firma el director."])
      expect(pedir(ANTES, despues, "mejóralo").cambios, despues).toEqual([]);
  });

  it("⛔ una frase copiada de una nota interna no llega si el pedido no la trae", () => {
    const nota = "Ojo: Marcela desconfía del equipo de TI porque el último proyecto se cayó en marzo";
    const r = revisar([{ clave: "tesis", despues: "El equipo de TI porque el último proyecto se cayó es lo que más frena." }], { interno: [nota] });
    expect(r.cambios).toEqual([]);
    expect(r.descartados[0].motivo).toMatch(/interno/);
  });

  it("⛔ un pedido que pide quitar o no mencionar algo no nombra nada interno (lo interno se pide aparte)", () => {
    const nota = ["El presupuesto de marketing es limitado."];
    const pidenQueNo = [
      "reescríbelo sin mencionar el presupuesto",
      "reescríbelo sin decir el presupuesto",
      "quita lo del presupuesto",
      "quítale lo del presupuesto",
      "hay que quitar lo del presupuesto",
      "no pongas el presupuesto",
      "No incluyas nada sobre el presupuesto",
      "no quiero que aparezca el presupuesto",
      "no hace falta mencionar el presupuesto",
      "nunca lo menciones, el presupuesto",
      "el presupuesto no lo menciones",
      "jamás menciones el presupuesto",
      "deja el presupuesto fuera",
      "que no se mencione el presupuesto",
      "no se mencione el presupuesto",
      "evita mencionar el presupuesto",
      "hazlo más corto y evita el presupuesto",
      "evita lo del presupuesto",
      "hazlo más corto, sin el presupuesto",
      "Hazlo más corto. Sin el presupuesto.",
      "hazlo más corto y sin el presupuesto",
    ];
    for (const pedido of pidenQueNo) expect(pedir(ANTES, "El presupuesto de marketing es limitado.", pedido, nota).descartados[0]?.motivo, pedido).toMatch(/quitar o no mencionar/);
  });

  it("lo que se cuenta con «nunca», «ni», «sin el», «eliminar» o «no lo incluye» no es un «no lo pongas»", () => {
    const casos: [string, string][] = [
      ["agrega que nunca tienen presupuesto para marketing", "Nunca tienen presupuesto para marketing."],
      ["agrega que nunca ponen presupuesto para marketing", "Nunca ponen presupuesto para marketing."],
      ["agrega que no hay presupuesto ni metas claras para el CRM", "No hay presupuesto ni metas claras para el CRM."],
      ["agrega que el presupuesto alcanza para eliminar las hojas de cálculo", "El presupuesto alcanza para eliminar las hojas de cálculo."],
      ["agrega que el presupuesto no lo incluye todo", "El presupuesto no lo incluye todo."],
      ["agrega que el presupuesto de marketing es limitado sin el IVA", "El presupuesto de marketing es limitado sin el IVA."],
      ["agrega que trabajan sin el presupuesto aprobado", "Trabajan sin el presupuesto aprobado."],
    ];
    for (const [pedido, despues] of casos) {
      const r = pedir(ANTES, despues, pedido, [`Nota: ${despues}`]);
      expect(r.cambios[0], pedido).toMatchObject({ interno: true });
    }
  });
});

describe("lo interno · 3. lo pedido, con las palabras del pedido, si Nexus lo tiene, y con lo que lo respalda a la vista", () => {
  const nota = "Ojo: el presupuesto de marketing es de US$ 20.000 al año y el gerente no quiere pasarse.";

  it("llega marcado y con la nota que lo respalda, para que quien aplica la compare", () => {
    const r = pedir(ANTES, "El presupuesto de marketing es de US$ 20.000 al año.", "agrega que el presupuesto de marketing es de US$ 20.000 al año", [nota]);
    expect(r.descartados).toEqual([]);
    expect(r.cambios[0]).toMatchObject({ interno: true, respaldo: [nota] });
  });

  it("los temas que la regla del modelo nombra son los que reconoce el código: sin nota no llegan; con nota, marcados", () => {
    const casos = [
      { despues: "El precio de la licencia es de US$ 1.500 al mes.", pedido: "agrega que el precio de la licencia es de US$ 1.500 al mes", nota: "Les cotizamos: el precio de la licencia es de US$ 1.500 al mes." },
      { despues: "Quien firma el contrato es el gerente general.", pedido: "agrega que quien firma el contrato es el gerente general", nota: "Ojo: quien firma el contrato es el gerente general." },
      { despues: "El director no quiere dejar Salesforce.", pedido: "agrega que el director no quiere dejar Salesforce", nota: "Ojo: el director no quiere dejar Salesforce." },
      { despues: "Les damos un descuento del 15%.", pedido: "agrega que les damos un descuento del 15%", nota: "Les damos un descuento del 15% si firman en diciembre." },
      { despues: "El gerente general aprueba la compra.", pedido: "agrega que el gerente general aprueba la compra", nota: "El gerente general aprueba la compra." },
    ];
    for (const c of casos) {
      expect(pedir(ANTES, c.despues, c.pedido).descartados[0]?.motivo, c.despues).toMatch(/no tiene en lo que sabe de la cuenta/);
      expect(pedir(ANTES, c.despues, c.pedido, [c.nota]).cambios[0], c.despues).toMatchObject({ interno: true, respaldo: [c.nota] });
    }
  });

  it("⛔ el cambio ENTERO va con las palabras y los números del pedido: ni una causa, ni una fecha, ni una oración inventada al lado", () => {
    const causa = pedir("Televentas no da seguimiento a las cotizaciones.", "Televentas no da seguimiento a las cotizaciones porque no tiene presupuesto.", "menciona el presupuesto", ["El presupuesto está congelado."]);
    expect(causa.descartados[0].motivo).toMatch(/más de lo que pediste/);
    const marzo = pedir(ANTES, "El gerente general aprueba el presupuesto en marzo.", "agrega que el gerente general aprueba el presupuesto", ["El gerente general aprueba el presupuesto."]);
    expect(marzo.descartados[0].motivo).toMatch(/«marzo»/);
    const alLado = pedir(ANTES, "El presupuesto de marketing es de US$ 20.000 al año. Se aprobó en la junta de marzo.", "agrega que el presupuesto de marketing es de US$ 20.000 al año", [nota]);
    expect(alLado.descartados[0].motivo).toMatch(/más de lo que pediste/);
    // Un número de la nota que el pedido no trae: Nexus no lee las notas, así que no puede saberlo.
    const cifra = pedir(ANTES, "El presupuesto es de US$ 20.000.", "agrega el presupuesto", [nota]);
    expect(cifra.cambios).toEqual([]);
    // Y en la oración de al lado, tampoco.
    expect(pedir(ANTES, "El presupuesto está aprobado; son 50 mil.", "agrega que el presupuesto está aprobado", ["El presupuesto está aprobado, son 20 mil."]).cambios).toEqual([]);
  });

  it("lo que la página ya muestra respalda el vocabulario de la escala, y se muestra como respaldo (sin la pieza que cambia)", () => {
    const campanas = pieza("otra", "Las campañas corren hasta agotar presupuesto sin que nadie mida qué dejan.");
    const r = pedir(ANTES, "Corren hasta agotar el presupuesto.", "agrega que corren hasta agotar el presupuesto", [], [campanas]);
    expect(r.cambios[0]).toMatchObject({ interno: true, respaldo: [campanas.valor] });
    // La pieza que se cambia no se respalda a sí misma.
    const propia = pedir("No tienen presupuesto para el CRM.", "Tienen presupuesto para el CRM.", "agrega que tienen presupuesto para el CRM");
    expect(propia.descartados[0].motivo).toMatch(/no tiene en lo que sabe de la cuenta/);
  });

  it("el sentido lo juzga quien aplica: lo que contradice la nota, u otra cifra, llega marcado con la nota al lado", () => {
    // El código no decide si «tienen presupuesto» contradice «NO tiene presupuesto»: la persona ve la nota y decide.
    const contra = "El equipo comercial NO tiene presupuesto aprobado hasta enero.";
    const r = pedir(ANTES, "El equipo comercial tiene presupuesto aprobado.", "agrega que el equipo comercial tiene presupuesto aprobado", [contra]);
    expect(r.cambios[0]).toMatchObject({ interno: true, respaldo: [contra] });
    const otraCifra = pedir("Tienes 20 mil contactos en la base.", "Tienes 20 mil contactos en la base. El presupuesto es de 20 mil.", "agrega que el presupuesto es de 20 mil", ["El presupuesto es de 50 mil."]);
    expect(otraCifra.cambios[0]).toMatchObject({ interno: true, respaldo: ["El presupuesto es de 50 mil."] });
  });

  it("una frase de una nota que el pedido trae llega marcada, con la nota de respaldo", () => {
    const fiscal = "el gerente financiero frenó la compra hasta enero por el cierre fiscal";
    const r = revisar([{ clave: "quitable", despues: "El gerente financiero frenó la compra hasta enero por el cierre." }], { pedido: `agrega que ${fiscal}`, interno: [fiscal] });
    expect(r.descartados).toEqual([]);
    expect(r.cambios[0]).toMatchObject({ clave: "quitable", interno: true, respaldo: [fiscal] });
  });
});
