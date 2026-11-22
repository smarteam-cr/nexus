/**
 * La conversación guardada de «Hablar con Nexus» (21 nov): se arma de las vueltas con sus mensajes, a cada respuesta le
 * vuelven sus citas, lo que no se pudo leer no aparece, el «listo» trae su nota, lo propuesto y lo que se hizo con cada
 * cambio, y una conversación cerrada no vuelve. Sin base.
 */
import { describe, expect, it } from "vitest";
import { TOPES, type CambioPropuesto } from "./conversacion";
import { estadosValidos, leerLaSalida, reconstruirLaConversacion, RESPUESTA_SIN_ACCESO, sinLasReuniones, type SalidaDeLaVuelta } from "./guardada";
import type { RespuestaDeNexus } from "./respuesta";

const R1: RespuestaDeNexus = { sabe: true, texto: "La cobranza la hacen a mano.", citas: [{ fuente: "R1", deDonde: "Reunión", texto: "a mano", deQuien: "cliente", hablante: "Ana Mora" }], sinRespaldo: false, afuera: { reuniones: 0, ejemplos: [] } };
const CAMBIO: CambioPropuesto = { id: "negocio:abc", destino: "negocio", valor: { cartera: "US$ 40.000" }, porque: "x", cita: "40 mil" };

const p1 = { de: "persona" as const, texto: "¿Cómo cobran hoy?" };
const consulta: SalidaDeLaVuelta = { tipo: "consulta", pregunta: "¿Cómo cobran hoy?", mensajes: [p1], respuesta: R1 };
const conMensajes = (m: NonNullable<SalidaDeLaVuelta["mensajes"]>) => m;
const historia = conMensajes([{ ...p1, es: "consulta" }, { de: "nexus", es: "respuesta", texto: R1.texto }, { de: "persona", texto: "Pierden 40 mil al mes" }]);

describe("la conversación al volver", () => {
  it("una pregunta de Nexus queda como su mensaje, y quedan las vueltas que faltan", () => {
    const c = reconstruirLaConversacion("c1", [{ tipo: "pregunta", preguntas: ["¿De qué mes?"], mensajes: [{ de: "persona", texto: "Pierden 40 mil" }] }], 1);
    expect(c).toEqual({
      id: "c1",
      mensajes: [
        { de: "persona", texto: "Pierden 40 mil" },
        { de: "nexus", texto: "¿De qué mes?" },
      ],
      quedan: TOPES.turnosPorConversacion - 1,
      listo: null,
    });
  });

  it("una respuesta vuelve con sus citas, también la de una vuelta anterior", () => {
    const sola = reconstruirLaConversacion("c1", [consulta], 1)!;
    expect(sola.mensajes).toEqual([{ ...p1, es: "consulta" }, { de: "nexus", es: "respuesta", texto: R1.texto, respuesta: R1 }]);
    const despues = reconstruirLaConversacion("c1", [consulta, { tipo: "pregunta", preguntas: ["¿Al mes?"], mensajes: historia }], 2)!;
    expect(despues.mensajes[1]).toMatchObject({ de: "nexus", respuesta: R1 });
    expect(despues.mensajes.map((m) => m.de)).toEqual(["persona", "nexus", "persona", "nexus"]);
  });

  it("el «listo» trae su nota, lo propuesto, lo que se hizo y la revisión", () => {
    const listo: SalidaDeLaVuelta = {
      tipo: "listo",
      cambios: [CAMBIO],
      hechos: [{ tipo: "cuenta", frase: "Pierden US$ 40.000 al mes en cartera vencida.", cita: "Pierden 40 mil" }, { tipo: "x", frase: "  ", cita: "" }],
      descartados: 0,
      mensajes: historia,
      notaClave: "sabido:a1",
      estados: { [CAMBIO.id]: "aplicado" },
      guardado: { hechos: { estado: "escritos", escritos: 1 }, impacto: { cambia: false, aviso: "" } },
    };
    const c = reconstruirLaConversacion("c1", [consulta, listo], 2)!;
    expect(c.listo).toEqual({ notaClave: "sabido:a1", hechos: ["Pierden US$ 40.000 al mes en cartera vencida."], contado: false, cambios: [CAMBIO], estados: { [CAMBIO.id]: "aplicado" }, guardado: listo.guardado });
    // El «listo» no suma un mensaje de Nexus: lo que sigue es «Adónde va».
    expect(c.mensajes).toHaveLength(3);
    // Sin la nota anotada (la persona no apretó «Guardar», o la revisión no llegó): no se afirma que quedó guardada, y
    // vuelve lo que Nexus entendió para poder guardarla.
    expect(reconstruirLaConversacion("c1", [{ ...listo, notaClave: undefined, guardado: undefined }], 1)!.listo).toMatchObject({ notaClave: null, guardado: null });
  });

  it("lo que no se pudo leer, o la pregunta que no se respondió, no aparece (volvió al cuadro)", () => {
    const sinLeer: SalidaDeLaVuelta = { tipo: "listo", cambios: [], hechos: [], descartados: 0, sinLeer: true, mensajes: historia };
    expect(reconstruirLaConversacion("c1", [consulta, sinLeer], 2)!.mensajes.map((m) => m.texto)).toEqual(["¿Cómo cobran hoy?", R1.texto]);
    expect(reconstruirLaConversacion("c1", [{ tipo: "consulta", pregunta: "x", mensajes: [p1] }], 1)).toBeNull();
  });

  it("cerrada con «Nueva conversación», o de antes de guardar los mensajes: no vuelve", () => {
    expect(reconstruirLaConversacion("c1", [{ ...consulta, cerrada: true }], 1)).toBeNull();
    expect(reconstruirLaConversacion("c1", [{ tipo: "pregunta", preguntas: ["¿Qué?"] }], 1)).toBeNull();
    expect(reconstruirLaConversacion("c1", [], 0)).toBeNull();
  });

  it("el tope sigue contando las corridas (también las que fallaron)", () => {
    expect(reconstruirLaConversacion("c1", [consulta], TOPES.turnosPorConversacion + 2)!.quedan).toBe(0);
  });
});

describe("lo que se lee y se guarda", () => {
  it("una salida que no es una vuelta no se lee", () => {
    expect(leerLaSalida(null)).toBeNull();
    expect(leerLaSalida("{no es json")).toBeNull();
    expect(leerLaSalida(JSON.stringify({ error: "x", mensajes: [] }))).toBeNull();
    expect(leerLaSalida(JSON.stringify({ tipo: "pregunta", preguntas: ["a"] }))).toMatchObject({ tipo: "pregunta" });
  });
  it("solo estados de cambios de esa vuelta, y solo «aplicado» o «descartado»", () => {
    expect(estadosValidos([CAMBIO], { [CAMBIO.id]: "descartado", "otro:1": "aplicado", [`${CAMBIO.id}x`]: "aplicado" })).toEqual({ [CAMBIO.id]: "descartado" });
    expect(estadosValidos([CAMBIO], { [CAMBIO.id]: "aplicando" })).toEqual({});
  });
});

describe("sin acceso a la cuenta, al volver", () => {
  it("las respuestas que leyeron reuniones se cambian por un aviso; las que no, quedan", () => {
    const sinLeerReuniones: RespuestaDeNexus = { ...R1, texto: "Según las notas, nadie decide.", citas: [], afuera: { ...R1.afuera, sinAcceso: true } };
    const c = reconstruirLaConversacion(
      "c1",
      [
        consulta,
        {
          tipo: "consulta",
          pregunta: "¿Quién decide?",
          respuesta: sinLeerReuniones,
          mensajes: [...historia.slice(0, 2), { de: "persona", texto: "¿Quién decide?" }],
        },
      ],
      2,
    )!;
    const s = sinLasReuniones(c);
    expect(s.mensajes[1]).toEqual({ de: "nexus", es: "respuesta", texto: RESPUESTA_SIN_ACCESO });
    expect(JSON.stringify(s)).not.toContain("a mano");
    expect(s.mensajes[3]).toMatchObject({ texto: "Según las notas, nadie decide.", respuesta: sinLeerReuniones });
  });
});
