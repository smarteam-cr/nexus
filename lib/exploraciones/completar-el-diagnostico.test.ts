/**
 * «Para completar el diagnóstico» (24 nov, TEC · AE): la respuesta lleva su pregunta adelante, se reconoce después qué
 * pregunta ya tiene respuesta, y arriba de la página se cuentan las notas que el Resumen no leyó.
 */
import { describe, expect, it } from "vitest";
import { cuerpoDeLaVuelta } from "@/lib/chat-de-nexus/lista";
import { notaDeLaConversacion } from "@/lib/chat-de-nexus/conversacion";
import { leidoHasta, notasNuevasDesde, prefijoDeLaRespuesta, respondeA, respuestaDe, tituloDeLasNuevas } from "./completar-el-diagnostico";

const PREGUNTA = { equipo: "Ventas", dimension: "Datos", dimensionId: "1.2", pregunta: "¿Cómo registran hoy los contactos que llegan?" };

describe("la respuesta lleva su pregunta", () => {
  it("el prefijo: equipo · parte y la pregunta sin sus signos (el chat lee como pregunta lo que tiene forma de pregunta)", () => {
    expect(prefijoDeLaRespuesta(PREGUNTA)).toBe("Sobre Ventas · Datos (Cómo registran hoy los contactos que llegan): ");
    expect(prefijoDeLaRespuesta({ ...PREGUNTA, pregunta: "¿Usan HubSpot?." })).toBe("Sobre Ventas · Datos (Usan HubSpot): ");
    expect(prefijoDeLaRespuesta(PREGUNTA)).not.toMatch(/[¿?]/);
  });

  it("⛔ la nota que se guarda es lo que escribió la persona, con la pregunta adelante (sobrevive a recargar: va en el mensaje)", () => {
    const mensajes = [{ de: "persona" as const, texto: `${prefijoDeLaRespuesta(PREGUNTA)}en un Excel que llena cada asesor` }];
    const nota = notaDeLaConversacion(mensajes);
    expect(nota).toBe("Sobre Ventas · Datos (Cómo registran hoy los contactos que llegan): en un Excel que llena cada asesor");
    expect(respondeA(nota, "Ventas", "Datos")).toBe(true);
    // El cuerpo de la vuelta no cambia: la respuesta es algo que se cuenta, como cualquier otro mensaje.
    expect(cuerpoDeLaVuelta({ conversacion: "c1", mensajes, modo: "normal", pedidosDeLaCuenta: false })).toEqual({ conversacion: "c1", mensajes });
  });

  it("⛔ con algo contado antes sin guardar, la respuesta queda en el medio de la nota y se reconoce igual", () => {
    const mensajes = [
      { de: "persona" as const, texto: "El gerente de ventas renunció la semana pasada." },
      { de: "nexus" as const, texto: "¿Quién lo reemplaza?" },
      { de: "persona" as const, texto: `${prefijoDeLaRespuesta(PREGUNTA)}en un Excel que llena cada asesor` },
      { de: "persona" as const, texto: `${prefijoDeLaRespuesta({ ...PREGUNTA, dimension: "Procesos", pregunta: "¿Quién aprueba?" })}la gerente` },
    ];
    const nota = notaDeLaConversacion(mensajes);
    expect(nota.startsWith("El gerente")).toBe(true);
    expect(respondeA(nota, "Ventas", "Datos")).toBe(true);
    expect(respondeA(nota, "Ventas", "Procesos")).toBe(true);
    expect(notasNuevasDesde({ "sabido:x1": nota }, { "sabido:x1": { en: "2026-11-24T22:00:00.000Z" } }, "2026-11-24T21:00:00.000Z")).toEqual({ total: 1, respuestas: 1 });
  });

  it("qué pregunta ya tiene respuesta: la más nueva, y solo la de ese equipo y esa parte", () => {
    const notas = {
      "sabido:mi0aaaaa111": "Sobre Ventas · Datos (Cómo registran…): en Excel",
      "sabido:mi0bbbbb222": "Sobre Ventas · Datos: ya migraron a HubSpot",
      "sabido:mi0ccccc333": "Sobre Marketing · Datos (Qué miden): nada",
      "sabido:mi0ddddd444": "Pierden 40 mil al mes en cartera",
      "nota:sesion-1": "Sobre Ventas · Datos: no es de «Lo que sabes»",
    };
    const autores = { "sabido:mi0aaaaa111": { en: "2026-11-24T20:00:00.000Z" }, "sabido:mi0bbbbb222": { en: "2026-11-24T21:00:00.000Z" } };
    expect(respuestaDe(notas, autores, "Ventas", "Datos")).toEqual({ clave: "sabido:mi0bbbbb222", en: "2026-11-24T21:00:00.000Z" });
    expect(respuestaDe(notas, autores, "Marketing", "Datos")?.clave).toBe("sabido:mi0ccccc333");
    expect(respuestaDe(notas, autores, "Servicio", "Datos")).toBeNull();
    expect(respondeA("Sobre Ventas · Datos Maestros: x", "Ventas", "Datos")).toBe(false);
  });
});

describe("arriba: lo nuevo que el Resumen no leyó", () => {
  const notas = {
    "sabido:a1": "Sobre Ventas · Datos (Cómo registran): en Excel",
    "sabido:a2": "Sobre Servicio · Procesos: lo lleva Laura",
    "sabido:a3": "El gerente renunció la semana pasada",
    "sabido:a4": "Una nota de antes",
  };
  const autores = {
    "sabido:a1": { en: "2026-11-24T21:00:00.000Z" },
    "sabido:a2": { en: "2026-11-24T21:30:00.000Z" },
    "sabido:a3": { en: "2026-11-24T21:40:00.000Z" },
    "sabido:a4": { en: "2026-11-20T10:00:00.000Z" },
  };

  it("cuenta solo las de después y cuáles son respuestas", () => {
    expect(notasNuevasDesde(notas, autores, "2026-11-24T20:00:00.000Z")).toEqual({ total: 3, respuestas: 2 });
    expect(notasNuevasDesde(notas, autores, "2026-11-24T21:35:00.000Z")).toEqual({ total: 1, respuestas: 0 });
    expect(notasNuevasDesde(notas, autores, null)).toEqual({ total: 0, respuestas: 0 });
  });

  it("el título: respuestas si todas lo son; si no, notas", () => {
    expect(tituloDeLasNuevas({ total: 2, respuestas: 2 })).toBe("Hay 2 respuestas nuevas");
    expect(tituloDeLasNuevas({ total: 1, respuestas: 1 })).toBe("Hay 1 respuesta nueva");
    expect(tituloDeLasNuevas({ total: 3, respuestas: 2 })).toBe("Hay 3 notas nuevas en «Lo que sabes del cliente»");
    expect(tituloDeLasNuevas({ total: 0, respuestas: 0 })).toBeNull();
  });

  it("⛔ lo que se guardó MIENTRAS Nexus escribía no lo leyó: cuenta desde que empezó su corrida", () => {
    const at = "2026-11-24T21:45:00.000Z";
    const empezo = "2026-11-24T21:35:00.000Z";
    expect(leidoHasta(at, { estado: "DONE", empezo })).toBe(empezo);
    // Sin corrida (o una que falló, o un Resumen de una versión del historial), desde que se armó.
    expect(leidoHasta(at, null)).toBe(at);
    expect(leidoHasta(at, { estado: "ERROR", empezo })).toBe(at);
    expect(leidoHasta(null, { estado: "DONE", empezo })).toBeNull();
    expect(notasNuevasDesde(notas, autores, leidoHasta(at, { estado: "DONE", empezo }))).toEqual({ total: 1, respuestas: 0 });
  });
});
