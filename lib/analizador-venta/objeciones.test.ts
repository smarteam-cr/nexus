/**
 * El punto «Objeciones» del análisis de cada reunión de venta (2026-11-20, Elías tras la sesión con Ventas): cada objeción
 * del cliente con su cita, cómo se manejó y cómo manejarla con LAER. Las citas se verifican como todas las del análisis
 * (sin cita que esté, no va), la objeción es del CLIENTE y su clase es una de las de la tarjeta «Objeciones».
 */
import { describe, expect, it } from "vitest";
import { leerElAnalisis, leerObjeciones, leerResultadoGuardado, type LoQueHabia, type TurnoNumerado } from "./analisis";
import { criterioComoTexto, PUNTOS_DEL_ANALISIS, VERSION_DEL_CRITERIO } from "./criterio";
import { loDeLaSesion } from "./revision";
import { OBJECIONES_COMUNES } from "@/lib/exploraciones/objeciones-comunes";
import { CLASES_DE_OBJECION, ETIQUETA_DE_LA_OBJECION } from "@/lib/exploraciones/casillas";

// Inventada (las transcripciones reales no salen de la base).
const TURNOS: TurnoNumerado[] = [
  { n: 1, hablante: "Laura Vega", texto: "Mira, la verdad es que no entiendo para qué quieres saber mi ticket promedio, eso es información interna." },
  { n: 2, hablante: "Diego Solís", texto: "Te entiendo. Lo pregunto porque si quieren llegar a la meta de este año, necesitamos saber cuántos negocios hacen falta." },
  { n: 3, hablante: "Laura Vega", texto: "Bueno, eso sí tiene sentido, te lo paso por correo." },
  { n: 4, hablante: "Laura Vega", texto: "Además ya tenemos Pipedrive y la gente está acostumbrada a usarlo todos los días." },
];
const HABIA: LoQueHabia = { guia: true, escala: true, posicionamiento: true, delCliente: ["Laura Vega"] };
const LAER = { escuchar: "Deja que termine.", reconocer: "Es normal cuidar esos números.", explorar: "¿A qué meta quieren llegar?", responder: "Explica el cálculo hacia atrás desde su meta." };

describe("el punto «Objeciones» del análisis", () => {
  it("es un punto del criterio, sube su versión y el criterio le cuenta al agente las clases, LAER y las comunes", () => {
    expect(PUNTOS_DEL_ANALISIS.map((p) => p.id)).toContain("objeciones");
    expect(VERSION_DEL_CRITERIO).toBe("2026-11-20");
    const t = criterioComoTexto({ positionStatement: null });
    expect(t).toContain("objeciones");
    expect(t).toContain("cifras (No quiere dar cifras)");
    expect(t).toMatch(/ESCUCHAR: .*\n\s+RECONOCER/);
    expect(t).toContain("«¿Para qué quieres saber mi ticket promedio?»");
  });

  it("la objeción común «No quiere dar cifras», con su clase y el cálculo hacia atrás", () => {
    expect(CLASES_DE_OBJECION).toContain("cifras");
    expect(ETIQUETA_DE_LA_OBJECION.cifras).toBe("No quiere dar cifras");
    const o = OBJECIONES_COMUNES.find((x) => x.clase === "cifras");
    expect(o?.dice).toBe("«¿Para qué quieres saber mi ticket promedio?»");
    expect(o?.responder).toMatch(/si quieres llegar a tal meta y conviertes a tal tasa, necesitas tantos negocios, tantas oportunidades y tantos leads/);
  });

  it("con la frase del cliente verificada, la respuesta del vendedor y los cuatro pasos de LAER", () => {
    const { objeciones, caidas } = leerObjeciones(
      [
        {
          texto: "No quiere compartir su ticket promedio.",
          clase: "cifras",
          citas: [{ turno: 1, texto: "no entiendo para qué quieres saber mi ticket promedio" }],
          manejo: "bien",
          como_se_manejo: "Explicaste para qué sirve el dato y lo pasó.",
          respuesta: [{ turno: 2, texto: "necesitamos saber cuántos negocios hacen falta" }],
          laer: LAER,
        },
      ],
      TURNOS,
      HABIA,
    );
    expect(caidas).toBe(0);
    expect(objeciones).toHaveLength(1);
    expect(objeciones[0]).toMatchObject({ clase: "cifras", manejo: "bien", cita: { turno: 1, hablante: "Laura Vega" }, respuesta: { turno: 2, hablante: "Diego Solís" }, laer: LAER });
  });

  it("dos objeciones en la misma frase son dos; y la frase del cliente no pasa por la respuesta del vendedor", () => {
    const una = (clase: string) => ({
      texto: "Es caro y ya tienen Pipedrive.",
      clase,
      citas: [{ turno: 4, texto: "ya tenemos Pipedrive y la gente está acostumbrada" }],
      manejo: "bien",
      como_se_manejo: "x",
      respuesta: [{ turno: 4, texto: "ya tenemos Pipedrive y la gente está acostumbrada" }],
      laer: LAER,
    });
    // Sin la lista de quién es del cliente, igual: la respuesta no puede ser el mismo turno ni la misma persona.
    const { objeciones } = leerObjeciones([una("precio"), una("herramienta"), una("herramienta")], TURNOS, { guia: true, escala: true, posicionamiento: true });
    expect(objeciones.map((o) => o.clase)).toEqual(["precio", "herramienta"]);
    expect(objeciones.every((o) => o.respuesta === null && o.manejo === "no")).toBe(true);
  });

  it("se cae sin cita que esté, con la cita de alguien de Smarteam, con una clase que no existe o sin LAER completo", () => {
    const base = { texto: "Ya tiene herramienta.", clase: "herramienta", citas: [{ turno: 4, texto: "ya tenemos Pipedrive y la gente está acostumbrada" }], manejo: "no", como_se_manejo: "No se respondió.", laer: LAER };
    const { objeciones, caidas } = leerObjeciones(
      [
        { ...base, citas: [{ turno: 4, texto: "esto nunca se dijo en la reunión de ninguna manera" }] },
        { ...base, citas: [{ turno: 2, texto: "necesitamos saber cuántos negocios hacen falta" }] },
        { ...base, clase: "inventada" },
        { ...base, laer: { ...LAER, responder: "" } },
        base,
      ],
      TURNOS,
      HABIA,
    );
    expect(caidas).toBe(4);
    expect(objeciones.map((o) => o.clase)).toEqual(["herramienta"]);
  });

  it("«bien manejada» sin una respuesta que esté no se sostiene: queda «sin manejar»", () => {
    const { objeciones } = leerObjeciones(
      [{ texto: "Ya tiene herramienta.", clase: "herramienta", citas: [{ turno: 4, texto: "ya tenemos Pipedrive y la gente está acostumbrada" }], manejo: "bien", como_se_manejo: "x", respuesta: [], laer: LAER }],
      TURNOS,
      HABIA,
    );
    expect(objeciones[0].manejo).toBe("no");
    expect(objeciones[0].respuesta).toBeNull();
  });

  it("viaja en el análisis y se lee de lo guardado; un análisis de antes no las trae (no es «no hubo»)", () => {
    const { resultado } = leerElAnalisis(
      { resumen: "Bien.", juicios: [], bien: [], recomendaciones: [], objeciones: [{ texto: "No quiere dar su ticket.", clase: "cifras", citas: [{ turno: 1, texto: "para qué quieres saber mi ticket promedio" }], manejo: "no", como_se_manejo: "x", laer: LAER }] },
      TURNOS,
      HABIA,
    );
    expect(resultado.objeciones).toHaveLength(1);
    const guardado = leerResultadoGuardado(JSON.parse(JSON.stringify(resultado)));
    expect(loDeLaSesion(guardado!).objeciones).toHaveLength(1);
    const deAntes = leerResultadoGuardado({ resumen: "x", juicios: [], recomendaciones: [] });
    expect(loDeLaSesion(deAntes!).objeciones).toBeNull();
  });
});
