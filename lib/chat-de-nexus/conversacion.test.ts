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
    expect(String(pedidoDelTurno(ctx, una, "Liz").messages[0].content)).not.toContain("YA NO PREGUNTES");
    expect(String(pedidoDelTurno(ctx, dos, "Liz").messages[0].content)).toContain("YA NO PREGUNTES");
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

  it("una pregunta sobre la cuenta es una consulta: la responde otra llamada", () => {
    expect(leerElTurno(respuesta('{"tipo":"consulta","pregunta":"¿Qué dijo Centauro de la cobranza?"}'), opciones())).toEqual({ tipo: "consulta", pregunta: "¿Qué dijo Centauro de la cobranza?" });
    expect(leerElTurno(respuesta('{"tipo":"consulta","pregunta":""}'), opciones())).toEqual(NO_SE_PUDO_LEER);
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
