/**
 * «Hablar con Nexus» (21 nov, ./conversacion.ts): lo que decide el código y no el modelo. Pregunta como mucho dos rondas
 * de dos preguntas, la nota son las palabras de la persona, cada cambio va a un destino que existe con un valor válido y
 * una cita que la persona dijo, y los topes. Respuestas fijas: nada llama a la IA.
 */
import { describe, expect, it } from "vitest";
import {
  idDelCambio,
  laDijoLaPersona,
  leerElTurno,
  LISTO_SIN_CAMBIOS,
  mensajesValidos,
  NO_SE_PUDO_LEER,
  notaDeLaConversacion,
  esPreguntaSinDuda,
  laPreguntaDeLaPersona,
  pareceUnaPregunta,
  paraContarComoNota,
  pedidoDelTurno,
  porQueNoSigue,
  primerObjeto,
  puedePreguntar,
  TOPES,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
  type OpcionesDeLaLectura,
} from "./conversacion";

const respuesta = (texto: string) => ({ content: [{ type: "text" as const, text: texto, citations: null }] });
const persona = (texto: string): MensajeDeLaConversacion => ({ de: "persona", texto });
const nexus = (texto: string): MensajeDeLaConversacion => ({ de: "nexus", texto });

const DIJO = ["El gerente nos confirmó que pierden unos 40 mil dólares al mes en cartera vencida.", "al mes"];
const opciones = (extra: Partial<OpcionesDeLaLectura> = {}): OpcionesDeLaLectura => ({
  destinos: new Set(["negocio", "planes"]),
  valorValido: (d, v) => (d === "planes" ? (typeof v === "string" && v.trim() ? v.trim() : null) : v && typeof v === "object" ? v : null),
  loQueDijo: DIJO,
  puedePreguntar: true,
  ...extra,
});

describe("la conversación", () => {
  it("limpia los mensajes y exige que el último sea de la persona", () => {
    expect(mensajesValidos([persona("  hola  ")])).toEqual([persona("hola")]);
    expect(mensajesValidos([persona("hola"), nexus("¿De qué mes?")])).toBeNull();
    expect(mensajesValidos([persona("   ")])).toBeNull();
    expect(mensajesValidos([persona("x".repeat(TOPES.largoDelMensaje + 50))])![0].texto).toHaveLength(TOPES.largoDelMensaje);
  });

  it("pregunta como mucho dos rondas; después, el pedido dice que ya no pregunte", () => {
    const una = [persona("a"), nexus("¿b?"), persona("c")];
    const dos = [...una, nexus("¿d?"), persona("e")];
    expect(puedePreguntar([persona("a")])).toBe(true);
    expect(puedePreguntar(una)).toBe(true);
    expect(puedePreguntar(dos)).toBe(false);
    const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "Centauro", contexto: "", destinos: [] };
    expect(String(pedidoDelTurno(ctx, una, false).messages[0].content)).not.toContain("YA NO PREGUNTES");
    expect(String(pedidoDelTurno(ctx, dos, false).messages[0].content)).toContain("YA NO PREGUNTES");
  });

  it("la nota son las palabras de la persona, tal cual, sin lo que dijo Nexus", () => {
    const m = [persona("Pierden 40 mil en cartera."), nexus("¿Al mes o al año?"), persona("Al mes")];
    expect(notaDeLaConversacion(m)).toBe("Pierden 40 mil en cartera.\nAl mes");
  });

  it("lo que preguntó no va a la nota, y la respuesta de Nexus no cuenta como ronda de preguntas", () => {
    const m: MensajeDeLaConversacion[] = [
      { de: "persona", texto: "¿Quién decide?", es: "consulta" },
      { de: "nexus", texto: "Decide la gerente.", es: "respuesta" },
      { de: "persona", texto: "¿Y el presupuesto?", es: "consulta" },
      { de: "nexus", texto: "No lo sé.", es: "respuesta" },
      persona("Ana me dijo que tienen 15 mil aprobados."),
    ];
    expect(notaDeLaConversacion(m)).toBe("Ana me dijo que tienen 15 mil aprobados.");
    expect(puedePreguntar(m)).toBe(true);
    expect(mensajesValidos(m)![0]).toEqual({ de: "persona", texto: "¿Quién decide?", es: "consulta" });
  });
});

describe("la respuesta del modelo", () => {
  it("lee el objeto aunque venga con cercos o texto alrededor", () => {
    expect(primerObjeto('Claro:\n```json\n{"tipo":"pregunta","preguntas":["¿Al mes?"]}\n```')).toEqual({ tipo: "pregunta", preguntas: ["¿Al mes?"] });
    expect(primerObjeto('{"a":"con } adentro"}')).toEqual({ a: "con } adentro" });
    expect(primerObjeto("sin json")).toBeNull();
  });

  it("una pregunta: como mucho dos, sin voseo", () => {
    const r = leerElTurno(respuesta('{"tipo":"pregunta","preguntas":["¿Es al mes?","¿Lo podés confirmar?","¿Quién lo dijo?","¿Algo más?"]}'), opciones());
    expect(r).toEqual({ tipo: "pregunta", preguntas: ["¿Es al mes?", "¿Quién lo dijo?"] });
  });

  it("sin rondas, una pregunta es «listo, sin cambios»; lo que no se entiende queda «sin leer»", () => {
    expect(leerElTurno(respuesta('{"tipo":"pregunta","preguntas":["¿Al mes?"]}'), opciones({ puedePreguntar: false }))).toEqual(LISTO_SIN_CAMBIOS);
    expect(leerElTurno(respuesta("no entendí"), opciones())).toEqual(NO_SE_PUDO_LEER);
  });

  it("una pregunta sobre la cuenta es una consulta, con las palabras de la persona y no las del modelo", () => {
    const laPregunta = "¿Qué dijo Centauro de la cobranza?";
    expect(leerElTurno(respuesta('{"tipo":"consulta","pregunta":"¿Qué dijo Elías de la cobranza?"}'), opciones({ laPregunta }))).toEqual({ tipo: "consulta", pregunta: laPregunta });
    expect(leerElTurno(respuesta('{"tipo":"consulta"}'), opciones({ laPregunta }))).toEqual({ tipo: "consulta", pregunta: laPregunta });
  });

  it("si lo que escribió NO es una pregunta, una «consulta» del modelo se toma como «listo»: la nota se guarda", () => {
    expect(leerElTurno(respuesta('{"tipo":"consulta","pregunta":"¿Qué dijo Elías sobre crédito y cobro?"}'), opciones())).toEqual(LISTO_SIN_CAMBIOS);
    expect(leerElTurno(respuesta('{"tipo":"consulta"}'), opciones({ laPregunta: null }))).toEqual(LISTO_SIN_CAMBIOS);
  });

  it("un cambio pasa solo con destino conocido, valor válido y una cita que la persona dijo", () => {
    const r = leerElTurno(
      respuesta(
        JSON.stringify({
          tipo: "listo",
          cambios: [
            { destino: "negocio", valor: { cartera: "US$ 40.000 al mes vencidos" }, porque: "Es su cartera.", cita: "pierden unos 40 mil dólares al mes en cartera vencida" },
            { destino: "negocio", valor: { cartera: "US$ 40.000 al mes vencidos" }, porque: "Repetido.", cita: "pierden unos 40 mil dólares al mes en cartera vencida" },
            { destino: "presupuesto", valor: "US$ 10.000", porque: "No está en la lista.", cita: "pierden unos 40 mil dólares al mes" },
            { destino: "planes", valor: "", porque: "Valor vacío.", cita: "pierden unos 40 mil dólares al mes" },
            { destino: "planes", valor: "Cambiar el ERP en enero", porque: "No lo dijo.", cita: "cambian el ERP en enero" },
            { destino: "planes", valor: "Cobrar mejor", porque: "Sin cita.", cita: "" },
            { destino: "planes", valor: "Revisar la cobranza", porque: "Respuesta corta.", cita: "al mes" },
          ],
          hechos: [{ tipo: "cuenta", frase: "Pierden plata en cartera vencida", cita: "pierden unos 40 mil dólares al mes en cartera vencida" }, { tipo: "", frase: "x", cita: "y" }],
        }),
      ),
      opciones(),
    );
    if (r.tipo !== "listo") throw new Error("esperaba listo");
    expect(r.cambios.map((c) => c.destino)).toEqual(["negocio", "planes"]);
    expect(r.cambios[0].id).toBe(idDelCambio("negocio", { cartera: "US$ 40.000 al mes vencidos" }));
    expect(r.descartados).toBe(5);
    expect(r.hechos).toEqual([{ tipo: "cuenta", frase: "Pierden plata en cartera vencida", cita: "pierden unos 40 mil dólares al mes en cartera vencida" }]);
  });

  it("la cita: palabra por palabra en lo que dijo, o una respuesta corta entera", () => {
    expect(laDijoLaPersona("pierden unos 40 mil dolares al mes", DIJO)).toBe(true);
    expect(laDijoLaPersona("pierden unos 90 mil dólares al mes", DIJO)).toBe(false);
    expect(laDijoLaPersona("al mes", DIJO)).toBe(true);
    expect(laDijoLaPersona("mes", ["Eso lo dijo el gerente general de la empresa hoy en la mañana"])).toBe(false);
    // Corta, solo entera: «en» de «sí, en enero» no prueba nada.
    expect(laDijoLaPersona("en", ["sí, en enero"])).toBe(false);
    expect(laDijoLaPersona("sí, en enero", ["Sí, en enero."])).toBe(true);
  });
});

describe("los topes", () => {
  it("por conversación y por día", () => {
    expect(porQueNoSigue(0, 0)).toBeNull();
    expect(porQueNoSigue(TOPES.turnosPorConversacion, 0)).toContain("Nueva conversación");
    expect(porQueNoSigue(0, TOPES.turnosPorDia)).toContain("tope del día");
  });
});

describe("si es una pregunta lo decide el código (Elías, 21 nov)", () => {
  const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "Cemaco", contexto: "", destinos: [] };
  const ELIAS = "Es importante esto de que crédito cobro contacta a los clientes sin aprovechar para venderle más y que cada gestor tiene muchas cuentas";

  it("lo que contó Elías en Cemaco no es una pregunta: va a la nota", () => {
    expect(pareceUnaPregunta(ELIAS)).toBe(false);
    expect(laPreguntaDeLaPersona([persona(ELIAS)])).toBeNull();
  });

  it("contar, aunque arranque como reacción, con una palabra de pregunta SIN tilde o con un verbo que también pide", () => {
    for (const t of [
      "Ojo con el gerente: no quiere migrar dos veces",
      "Como te dije, pierden unos 40 mil al mes",
      "Como es costumbre, el cierre es en diciembre",
      "Cuando hablamos con Ana dijo que el ERP cambia en enero",
      "Esto de que cobran a mano es lo que más les duele",
      "El presupuesto es de 15 mil para este año.",
      "Marco habló con el gerente por WhatsApp",
      // Las que encontró la revisión del 21 nov: el dictado abre muchas con «Que…».
      "Que cada gestor tiene muchas cuentas",
      "Y que además cobran a mano",
      "Quien decide es el gerente general",
      "Donde más les duele es la cobranza",
      "Cuanto antes arranquen, mejor",
      "Para que sepas, el ERP cambia en enero",
      "Hay algo de resistencia en ventas",
      "Busca crecer en Guatemala el año que viene",
      "Lista de precios: 15 mil",
      "Explica que el proceso es manual",
      "Es importante, ¿no?",
      "Cobran a mano (¿o con Excel?) y nadie lo actualiza",
      // Una pregunta sin tilde ni signo se toma como contar, a propósito: ante la duda, contar.
      "que dijeron de la cobranza",
    ])
      expect(pareceUnaPregunta(t), t).toBe(false);
  });

  it("preguntar: con signo, con palabra de pregunta (con o sin tilde) o pidiendo algo", () => {
    for (const t of [
      "¿Qué dijeron de la cobranza?",
      "qué dijeron de la cobranza",
      "Quién decide la compra",
      "Quiero saber qué dijeron de la cobranza",
      "Necesito saber quién decide la compra",
      "Revisa lo que dijeron de ecommerce",
      "Averigua si tienen HubSpot",
      "Oye Nexus qué dijo Ana del ERP",
      "Oye, Nexus, ¿quién firma?",
      "Cuánto pierden al mes",
      "cuándo arrancan",
      "Por qué no quieren migrar",
      "Dime quién decide",
      "Resume lo que dijeron de ecommerce",
      "Y qué pasó con el presupuesto",
      "sabes si ya tienen HubSpot",
      "El presupuesto de 15 mil, ¿es anual?",
    ])
      expect(pareceUnaPregunta(t), t).toBe(true);
  });

  it("la pregunta es la última de la persona; con «contar», nunca", () => {
    expect(laPreguntaDeLaPersona([persona("Pierden 40 mil"), nexus("¿Al mes?"), persona("¿Qué dijo Ana del ERP?")])).toBe("¿Qué dijo Ana del ERP?");
    expect(laPreguntaDeLaPersona([persona("¿Qué dijo Ana del ERP?")], true)).toBeNull();
    expect(laPreguntaDeLaPersona([persona("¿Algo?"), nexus("Sí")])).toBeNull();
  });

  it("el pedido no lleva el nombre de quien escribe y dice si lo último es pregunta", () => {
    const pedido = String(pedidoDelTurno(ctx, [persona(ELIAS)], false).messages[0].content);
    expect(pedido).toContain("Te escribe alguien del equipo de Smarteam.");
    expect(pedido).toContain("NO ES UNA PREGUNTA");
    expect(String(pedidoDelTurno(ctx, [persona("¿Quién decide?")], true).messages[0].content)).toContain("TIENE FORMA DE PREGUNTA");
  });

  it("«Guardarlo como nota»: sale el par pregunta-respuesta y lo escrito vuelve al final como algo que cuenta", () => {
    const m: MensajeDeLaConversacion[] = [
      persona("Pierden 40 mil"),
      nexus("¿Al mes?"),
      { de: "persona", texto: ELIAS, es: "consulta" },
      { de: "nexus", texto: "No lo sé.", es: "respuesta" },
    ];
    expect(paraContarComoNota(m, 3)).toEqual({ base: m.slice(0, 2), texto: ELIAS });
    expect(paraContarComoNota(m, 1)).toBeNull();
    expect(paraContarComoNota(m, 9)).toBeNull();
    // Solo la última respuesta: una del medio, movida al final, se leería como respuesta a lo que Nexus preguntó después.
    expect(paraContarComoNota([...m, persona("Es del área de TI"), nexus("¿De qué equipo?")], 3)).toBeNull();
  });

  it("una pregunta con su signo, que no contesta a Nexus, se responde aunque el modelo diga «listo»", () => {
    const laPregunta = "¿Quién decide la compra?";
    expect(esPreguntaSinDuda([persona(laPregunta)])).toBe(true);
    expect(leerElTurno(respuesta('{"tipo":"listo","cambios":[],"hechos":[]}'), opciones({ laPregunta, sinDuda: true }))).toEqual({ tipo: "consulta", pregunta: laPregunta });
    // Si contesta lo que Nexus preguntó, o no lleva signo, lo decide el modelo.
    expect(esPreguntaSinDuda([persona("Pierden 40 mil"), nexus("¿De qué mes?"), persona("¿Enero, creo?")])).toBe(false);
    expect(esPreguntaSinDuda([persona("Quién decide la compra")])).toBe(false);
    expect(esPreguntaSinDuda([persona(laPregunta)], true)).toBe(false);
  });
});
