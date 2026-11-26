/**
 * «Hablar con Nexus» (21 nov, ./conversacion.ts): lo que decide el código y no el modelo. Pregunta como mucho dos rondas
 * de dos preguntas, la nota son las palabras de la persona, cada cambio va a un destino que existe con un valor válido y
 * una cita que la persona dijo, y los topes. Respuestas fijas: nada llama a la IA.
 */
import { describe, expect, it } from "vitest";
import { prefijoDeLaRespuesta } from "@/lib/exploraciones/forma-de-la-respuesta";
import {
  idDelCambio,
  laDijoLaPersona,
  leerElTurno,
  LISTO_SIN_CAMBIOS,
  mensajesValidos,
  NO_SE_PUDO_LEER,
  notaDeLaConversacion,
  comoSeLee,
  empiezaContando,
  pareceUnaPregunta,
  paraContarComoNota,
  esAlgoQueSeCuenta,
  sinElEncabezadoDeLaRespuesta,
  loQueConto,
  loQueContoEnPedazos,
  paraPreguntar,
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
    expect(String(pedidoDelTurno(ctx, una, "contar").messages[0].content)).not.toContain("YA NO PREGUNTES");
    expect(String(pedidoDelTurno(ctx, dos, "contar").messages[0].content)).toContain("YA NO PREGUNTES");
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

  it("si el código sabe que contó algo, una «consulta» del modelo se toma como «listo» (queda para guardar)", () => {
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

describe("si es una pregunta: el código decide lo seguro y el modelo lo dudoso (Elías, 21 nov)", () => {
  const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "Cemaco", contexto: "", destinos: [] };
  const ELIAS = "Es importante esto de que crédito cobro contacta a los clientes sin aprovechar para venderle más y que cada gestor tiene muchas cuentas";
  const PREGUNTA = "¿Cuales son los principales dolores de este cliente?";
  const RESPONDIO: MensajeDeLaConversacion[] = [
    { de: "persona", texto: PREGUNTA, es: "consulta" },
    { de: "nexus", texto: "Los principales dolores de CEMACO Ecuador son…", es: "respuesta" },
  ];

  it("lo que contó Elías en Cemaco es SEGURO contar: arranca con «Es importante»", () => {
    expect(pareceUnaPregunta(ELIAS)).toBe(false);
    expect(empiezaContando(ELIAS)).toBe(true);
    expect(comoSeLee([persona(ELIAS)])).toBe("contar");
  });

  it("«resumelos» después de una respuesta es SEGURO una pregunta: con tilde o sin ella (Cemaco, 21 nov)", () => {
    expect(comoSeLee([...RESPONDIO, persona("resumelos")])).toBe("pregunta");
    expect(comoSeLee([...RESPONDIO, persona("Resúmelos")])).toBe("pregunta");
    expect(comoSeLee([persona("resúmemelos en tres")])).toBe("pregunta");
  });

  it("no es una pregunta segura: lo que cuenta, aunque arranque con una palabra de pregunta SIN tilde o con un verbo que también pide", () => {
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
      "Compara precios con la competencia cada mes",
      "Es importante, ¿no?",
      "Cobran a mano (¿o con Excel?) y nadie lo actualiza",
      "Cuentas por cobrar vencidas: 40 mil",
      "Dimos de baja el CRM viejo",
      "Listos para arrancar en enero",
      "Dale, gracias",
      "que dijeron de la cobranza",
      // Las que encontró la segunda revisión del 21 nov: sin tildes se volvían pregunta, o eran exclamaciones y coletillas.
      "Busca que su equipo de ventas registre todo en HubSpot",
      "Revisa si le pagan antes de despachar",
      "Sabes que el gerente ya aprobó el presupuesto",
      "¡Qué desorden tienen con la cartera!",
      "Qué lío tienen con la cobranza, todo en Excel",
      "Es mucho para su tamaño, ¿o no?",
      "Pierden 40 mil al mes, ¿sabes?",
      "Dame un segundo, el gerente dice que no tienen presupuesto",
      "Cómo te decía, tienen 3 marcas",
      "Qué bárbaro, tienen 40 cuentas por gestor",
      "Cuándo arrancan no está claro, dijeron enero",
      "Por qué no compran: no ven el valor",
      "Hazlo simple: ellos quieren un solo pipeline",
      "El cliente preguntó «¿cuánto cuesta el Enterprise?»",
      // Una palabra de pregunta sin signo no es segura, con tilde o sin ella: la decide el modelo.
      "qué dijeron de la cobranza",
      "Cuánto pierden al mes",
    ])
      expect(pareceUnaPregunta(t), t).toBe(false);
  });

  it("pregunta segura: con signo, pidiendo algo o con una orden con su pronombre", () => {
    for (const t of [
      "¿Qué dijeron de la cobranza?",
      "Quiero saber qué dijeron de la cobranza",
      "Necesito saber quién decide la compra",
      "Revisa lo que dijeron de ecommerce",
      "Averigua si tienen HubSpot",
      "Oye, Nexus, ¿quién firma?",
      "Dime quién decide",
      "Resume lo que dijeron de ecommerce",
      "sabes si ya tienen HubSpot",
      "Sabes qué dijo Ana del ERP",
      "Busca qué dijeron del presupuesto",
      "El presupuesto de 15 mil, ¿es anual?",
      "resumelos",
      "Resúmelos",
      "explícame el segundo",
      "explicame el segundo",
      "compáralos con lo de Wherex",
      "ordénalos por impacto",
      "hazme un resumen",
      "Dímelo en corto",
      "me puedes resumir lo de la cobranza",
    ])
      expect(pareceUnaPregunta(t), t).toBe(true);
  });

  it("cómo se lee: contestarle a Nexus es contar; lo que no es seguro queda en duda para el modelo; los botones mandan", () => {
    expect(comoSeLee([persona("Pierden 40 mil"), nexus("¿De qué mes?"), persona("¿Enero, creo?")])).toBe("contar");
    expect(comoSeLee([persona("Pierden 40 mil"), nexus("¿Al mes?"), persona("¿Qué dijo Ana del ERP?")])).toBe("contar");
    expect(comoSeLee([...RESPONDIO, persona("¿Qué dijo Ana del ERP?")])).toBe("pregunta");
    expect(comoSeLee([persona("Anota que el ERP cambia en enero")])).toBe("contar");
    expect(comoSeLee([persona("Ojo, el gerente no quiere migrar")])).toBe("contar");
    for (const t of [
      "Que cada gestor tiene muchas cuentas",
      "que dijeron de la cobranza",
      "Quién decide la compra",
      "y el segundo",
      "más corto",
      "dame los tres más graves",
      "Explica que el proceso es manual",
      // Arranca contando y termina preguntando: lo decide el modelo.
      "Me dijeron que pierden 40 mil, ¿es mucho?",
      "Nos dijeron que quieren arrancar en enero. ¿Qué sigue?",
    ])
      expect(comoSeLee([...RESPONDIO, persona(t)]), t).toBe("duda");
    expect(comoSeLee([persona("¿Quién decide?")], { contar: true })).toBe("contar");
    expect(comoSeLee([persona(ELIAS)], { preguntar: true })).toBe("pregunta");
  });

  it("el pedido no lleva el nombre de quien escribe y dice si es seguro contar o si lo decide el modelo", () => {
    const pedido = String(pedidoDelTurno(ctx, [persona(ELIAS)], "contar").messages[0].content);
    expect(pedido).toContain("Te escribe alguien del equipo de Smarteam.");
    expect(pedido).toContain("NO ES UNA PREGUNTA");
    const duda = String(pedidoDelTurno(ctx, [...RESPONDIO, persona("y el segundo")], "duda").messages[0].content);
    expect(duda).toContain("PUEDE SER ALGO QUE CUENTA, UNA PREGUNTA O UN PEDIDO");
    expect(duda).toContain("NEXUS (respondió)");
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

  it("⛔ «Guardarlo como nota» nunca guarda una pregunta, un pedido ni un «gracias» (Elías, 25 nov: TEC · AE)", () => {
    const debajoDe = (texto: string): MensajeDeLaConversacion[] => [
      { de: "persona", texto, es: "consulta" },
      { de: "nexus", texto: "Los retos principales del AE son la integración con Fundatec y los leads de Meta.", es: "respuesta" },
    ];
    // Lo que pasó: alguien preguntó, Nexus respondió y «Guardarlo como nota» dejó la PREGUNTA como algo que sabe el equipo.
    // Lo SEGURO se corta acá; lo que no lleva signo («Oye, cuales son los retos del AE») lo corta lo que entiende Nexus al
    // contarlo: sin un hecho ni un cambio, no hay nada que guardar (nexus-en-la-preventa.int.test.ts).
    for (const pregunta of [
      "cuales son los retos principales del AE?",
      "Oye, cuales son los retos principales del AE?",
      "¿Sabías que cobran a mano con un Excel?",
      "Dime qué dijo Ana del ERP",
      "Por favor dime los retos",
      "Crea una tarea para llamar a Ana el viernes",
      "gracias",
      // Una pregunta con su frase de arranque, o un «¿» sin cerrar.
      "Tengo una duda. ¿Cuáles son los retos del AE?",
      "Hola Nexus, buenas tardes. ¿Cuáles son los retos del AE?",
      "Muy bien entonces. ¿Qué sigue?",
      "¿cuáles son los retos del AE",
      // «Responder con Nexus»: lo que va después del encabezado; un pedido o un «gracias» no es la respuesta.
      "Sobre Ventas · Datos (cómo registran hoy los contactos): dime los retos",
      "Sobre Ventas · Datos (qué CRM usan (HubSpot o Salesforce)): gracias",
      // …o solo una pregunta que pregunta.
      "Sobre Ventas · Datos (cómo registran hoy los contactos): ¿qué dijo Ana de esto?",
      // Tercera revisión del 25 nov: el tema adelante, un saludo con un «¿» sin cerrar, el arranque con dos puntos, lo que va
      // después del «?», un «Sobre …:» que no es el encabezado de La escala, pedidos sin signo.
      "Sobre la cobranza: ¿cuánto pierden al mes?",
      "Sobre la cobranza, ¿qué dijeron?",
      "En la reunión del martes, ¿qué dijo Ana?",
      "Con respecto al ERP, ¿qué sabemos?",
      "Quiero preguntarte algo. ¿Cuáles son los retos?",
      "Hola, ¿cuáles son los retos del AE",
      "Oye Nexus, ¿cuáles son los retos del AE",
      "Tengo una pregunta: ¿cuáles son los retos del AE?",
      "Hola Nexus, tengo una consulta: ¿quién decide?",
      "Buenas tardes Nexus. ¿Cuáles son los retos?",
      "Una última pregunta. ¿Qué sigue?",
      "Muchas gracias por la info. ¿Qué más sabes?",
      "cuales son los retos principales del AE? gracias",
      "cuales son los retos principales del AE?.",
      "cuales son los retos principales del AE? 👍",
      "«cuales son los retos principales del AE?»",
      "cuales son los retos principales del AE？",
      "Dame los retos del AE",
      "Quisiera conocer los retos del AE",
      "Haz un resumen de la cuenta",
      "Buen día, ¿quién decide?",
    ]) {
      expect(esAlgoQueSeCuenta(pregunta), pregunta).toBe(false);
      expect(paraContarComoNota(debajoDe(pregunta), 1), pregunta).toBeNull();
    }
    // Lo que cuenta algo sigue con su botón, aunque Nexus lo haya tomado por una pregunta.
    for (const cuenta of [
      "La cobranza la hacen a mano con un Excel",
      "Tienen 3 sedes y 40 vendedores",
      "Es importante, ¿no?",
      "Qué bárbaro, tienen 40 cuentas por gestor",
      "Pasa que tienen una tarea con el banco",
      // Afirmaciones que empiezan como una pregunta (la primera revisión del 25 nov: no se pueden perder).
      "Quien decide es el gerente general",
      "Donde más les duele es la cobranza",
      "Cuando hablamos con Ana dijo que el ERP cambia en enero",
      "Nos dijeron que arrancan en enero. ¿Qué sigue?",
      // Lo contado con una pregunta pegada (segunda revisión del 25 nov): con coma, en otro renglón o delante.
      "Tienen 40 vendedores, ¿eso cambia el plan?",
      "El gerente decide la compra, ¿lo agrego a la guía?",
      "Tienen 3 sedes en Guatemala\n¿Cómo lo vemos?",
      "¿Sabes qué? Tienen 40 vendedores por sede",
      // La respuesta a una pregunta de La escala, aunque dude (el signo no la corta).
      "Sobre Ventas · Datos (cómo registran hoy los contactos): en un Excel compartido",
      "Sobre Ventas · Datos (cómo registran hoy los contactos): ¿En un Excel, creo?",
      "Sobre Ventas · Datos (qué CRM usan (HubSpot o Salesforce)): HubSpot desde marzo",
      "Sobre Ventas · Datos (cuántos vendedores tienen): ¿Unos 40?",
      // Tercera revisión: lo contado en dos palabras con una pregunta pegada, y el tema seguido de lo que cuenta.
      "Usan Salesforce, ¿lo anoto?",
      "Usan HubSpot. ¿Te sirve?",
      "Sobre la cobranza, pierden 40 mil al mes",
      "Sobre todo les cuesta la cobranza",
      "En la reunión del martes dijeron que no tienen CRM, ¿lo anoto?",
      // Cuarta revisión: el tema seguido de lo contado en pocas palabras, «Explica que…», «Me ayudas a anotar que…», y la
      // respuesta a La escala en una palabra después de una pregunta.
      "En esa reunión firmaron el contrato. ¿Lo guardo?",
      "En la llamada aceptaron el precio, ¿lo anoto?",
      "Sobre la integración ya tienen API, ¿lo anoto?",
      "En la reunión dijeron que sí, ¿no?",
      "Usan SAP, ¿lo anoto?",
      "Explica que no tienen presupuesto",
      "Me ayudas a anotar que tienen 40 vendedores",
      "Sobre Ventas · Datos (qué CRM usan): ¿Cuál era? Salesforce",
      ELIAS,
    ]) {
      expect(esAlgoQueSeCuenta(cuenta), cuenta).toBe(true);
      expect(paraContarComoNota(debajoDe(cuenta), 1), cuenta).toEqual({ base: [], texto: cuenta });
    }
  });

  it("⛔ el encabezado de «Responder con Nexus» se reconoce igual que lo arma la preventa, también con paréntesis en la pregunta", () => {
    for (const pregunta of ["¿Cómo registran hoy los contactos?", "¿Qué CRM usan (HubSpot o Salesforce)?", ""]) {
      const p = prefijoDeLaRespuesta({ equipo: "Ventas", dimension: "Datos", pregunta });
      expect(sinElEncabezadoDeLaRespuesta(`${p}En un Excel: lo llena cada asesor.`), pregunta).toBe("En un Excel: lo llena cada asesor.");
    }
    expect(sinElEncabezadoDeLaRespuesta("Sobre todo les cuesta la cobranza")).toBeNull();
    // Sin el « · » de «Sobre <equipo> · <parte>» no es el encabezado: es alguien que escribe así.
    expect(sinElEncabezadoDeLaRespuesta("Sobre la cobranza: ¿cuánto pierden al mes?")).toBeNull();
    expect(sinElEncabezadoDeLaRespuesta("Sobre el ERP (el de antes): ¿qué dijo Ana?")).toBeNull();
    expect(sinElEncabezadoDeLaRespuesta("Pierden 40 mil al mes")).toBeNull();
  });

  it("⛔ la cita de un hecho de «Guardarlo como nota» se busca también en pedazos: «¿Unos 40?» y «Usan SAP, ¿lo anoto?» cuentan", () => {
    const enLaEscala = [persona("Sobre Ventas · Datos (cuántos vendedores tienen): ¿Unos 40?")];
    expect(laDijoLaPersona("Unos 40", loQueContoEnPedazos(enLaEscala))).toBe(true);
    expect(laDijoLaPersona("Unos 40", loQueConto(enLaEscala))).toBe(false);
    expect(laDijoLaPersona("Usan SAP", loQueContoEnPedazos([persona("Usan SAP, ¿lo anoto?")]))).toBe(true);
    // Lo que no escribió sigue sin contar, y un pedazo corto vale solo entero.
    expect(laDijoLaPersona("No tienen un CRM", loQueContoEnPedazos([persona("Oye, cuales son los retos principales del AE")]))).toBe(false);
    expect(laDijoLaPersona("SAP", loQueContoEnPedazos([persona("Usan SAP, ¿lo anoto?")]))).toBe(false);
  });

  it("⛔ con el chip de La escala, lo que arranca contando («Ojo: usan SAP», lo que sugiere «nada que guardar») no es seguro un cambio", () => {
    expect(comoSeLee([persona("Ojo: usan SAP")], { escala: "chip" })).toBe("duda");
    expect(comoSeLee([persona("Nos dijeron que usan SAP")], { escala: "chip" })).toBe("duda");
    expect(comoSeLee([persona("Ojo: usan SAP")])).toBe("contar");
  });

  it("⛔ la regla de no sacar un hecho de una pregunta va solo con «Guardarlo como nota», no al contar como siempre", () => {
    const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "X", contexto: "", destinos: [] };
    const m = [persona("Pierden 40 mil al mes"), nexus("¿De qué mes?"), persona("¿Enero, creo?")];
    expect(String(pedidoDelTurno(ctx, m, "contar").messages[0].content)).not.toContain("no inventes un hecho de una pregunta");
    expect(String(pedidoDelTurno(ctx, m, "contar", { desdeElBoton: true }).messages[0].content)).toContain("no inventes un hecho de una pregunta");
    // Y desde el botón no pregunta: si preguntara, la respuesta se juntaría en la nota con la pregunta de antes.
    expect(String(pedidoDelTurno(ctx, m, "contar").messages[0].content)).not.toContain("YA NO PREGUNTES");
    expect(String(pedidoDelTurno(ctx, m, "contar", { desdeElBoton: true }).messages[0].content)).toContain("YA NO PREGUNTES");
  });

  it("⛔ la nota son las palabras de la persona: nunca el texto de Nexus", () => {
    const m: MensajeDeLaConversacion[] = [
      persona("Pierden 40 mil al mes"),
      nexus("¿Es en cartera vencida?"),
      persona("Sí, en cartera vencida"),
      { de: "persona", texto: "¿Qué dijo Ana?", es: "consulta" },
      { de: "nexus", texto: "Ana dijo que el ERP cambia en enero.", es: "respuesta" },
    ];
    const nota = notaDeLaConversacion(m);
    expect(nota).toContain("Pierden 40 mil al mes");
    expect(nota).toContain("Sí, en cartera vencida");
    expect(nota).not.toContain("¿Es en cartera vencida?");
    expect(nota).not.toContain("Ana dijo");
    expect(nota).not.toContain("¿Qué dijo Ana?");
  });

  it("«¿Era una pregunta? Respóndela»: lo último de la persona, si no contestaba algo a Nexus", () => {
    expect(paraPreguntar([...RESPONDIO, persona("resumelos")])).toEqual({ base: RESPONDIO, texto: "resumelos" });
    expect(paraPreguntar([persona("Quien decide es el gerente")])).toEqual({ base: [], texto: "Quien decide es el gerente" });
    // Nexus le preguntó algo y, en vez de contestar, preguntó otra cosa: lo último se responde, lo de antes queda.
    const aclaracion = [persona("Pierden 40 mil"), nexus("¿Esa cifra es mensual?")];
    expect(paraPreguntar([...aclaracion, persona("¿Qué dijo Ana del ERP?")])).toEqual({ base: aclaracion, texto: "¿Qué dijo Ana del ERP?" });
    expect(paraPreguntar(RESPONDIO)).toBeNull();
  });
});
