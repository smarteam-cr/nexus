/**
 * «Para completar el diagnóstico» (24 nov, TEC · AE): la respuesta lleva su pregunta adelante, se reconoce después qué
 * pregunta ya tiene respuesta, y arriba de la página se cuentan las notas que el Resumen no leyó.
 */
import { describe, expect, it } from "vitest";
import { cuerpoDeLaVuelta } from "@/lib/chat-de-nexus/lista";
import { notaDeLaConversacion } from "@/lib/chat-de-nexus/conversacion";
import {
  clavesNuevasDesde,
  contarLasNotas,
  cuantasNotas,
  equiposDeLasRespuestas,
  lasNotasNuevas,
  leidoHasta,
  notasSinUbicar,
  prefijoDeLaRespuesta,
  respondeA,
  respuestaDe,
  tituloDeLasNuevas,
  ultimaUbicacion,
} from "./completar-el-diagnostico";

/** Las notas que el Resumen no leyó, contadas: lo que hace la pantalla (`lasNotasNuevas` › `delResumen`). */
const notasNuevasDesde = (n: Record<string, string>, a: Parameters<typeof clavesNuevasDesde>[1], desde: string | null) => contarLasNotas(n, clavesNuevasDesde(n, a, desde));

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

  it("las claves de las nuevas, su cuenta y cómo se nombran (una sola regla para el aviso y la línea)", () => {
    expect(clavesNuevasDesde(notas, autores, "2026-11-24T21:35:00.000Z")).toEqual(["sabido:a3"]);
    expect(contarLasNotas(notas, ["sabido:a1", "sabido:a2", "sabido:a3"])).toEqual({ total: 3, respuestas: 2 });
    expect(cuantasNotas({ total: 1, respuestas: 1 })).toBe("1 respuesta");
    expect(cuantasNotas({ total: 2, respuestas: 2 })).toBe("2 respuestas");
    expect(cuantasNotas({ total: 2, respuestas: 1 })).toBe("2 notas");
    expect(cuantasNotas({ total: 0, respuestas: 0 })).toBe("");
  });
});

describe("las notas que «Ubicar» todavía no leyó (25 nov: una nota puede fijar el nivel)", () => {
  const notas = {
    "sabido:a1": "Sobre Ventas · Datos (Cómo registran): en Excel",
    "sabido:a2": "Sobre Servicio · Procesos: lo lleva Laura",
    "sabido:a3": "El gerente renunció la semana pasada",
  };
  const autores = {
    "sabido:a1": { en: "2026-11-24T21:00:00.000Z" },
    "sabido:a2": { en: "2026-11-24T21:30:00.000Z" },
    "sabido:a3": { en: "2026-11-25T09:00:00.000Z" },
  };
  const leyo = "2026-11-24T21:55:00.000Z";
  const termino = "2026-11-24T22:00:00.000Z";

  it("sin ninguna corrida de «Ubicar», todas; una de antes del 25 nov (sin `notas`) no leyó ninguna", () => {
    expect(notasSinUbicar(notas, autores, null)).toEqual(["sabido:a1", "sabido:a2", "sabido:a3"]);
    expect(notasSinUbicar(notas, autores, { en: termino })).toEqual(["sabido:a1", "sabido:a2", "sabido:a3"]);
  });

  it("las que no leyó la última vez, y las que se editaron después de que las leyó", () => {
    expect(notasSinUbicar(notas, autores, { en: termino, notasEn: leyo, notas: ["sabido:a1", "sabido:a2"] })).toEqual(["sabido:a3"]);
    // Una guardada MIENTRAS «Ubicar» corría y que no leyó, cuenta: se mira la lista, no la hora.
    expect(notasSinUbicar(notas, { ...autores, "sabido:a3": { en: "2026-11-24T21:59:00.000Z" } }, { en: termino, notasEn: leyo, notas: ["sabido:a1", "sabido:a2"] })).toEqual([
      "sabido:a3",
    ]);
    const leidasTodas = { en: termino, notasEn: leyo, notas: ["sabido:a1", "sabido:a2", "sabido:a3"] };
    const antes = { ...autores, "sabido:a3": { en: "2026-11-24T21:50:00.000Z" } };
    expect(notasSinUbicar(notas, antes, leidasTodas)).toEqual([]);
    // Editada después de ubicar: vuelve a ser nueva.
    expect(notasSinUbicar(notas, { ...antes, "sabido:a1": { en: "2026-11-25T10:00:00.000Z" } }, leidasTodas)).toEqual(["sabido:a1"]);
  });

  it("⛔ una nota editada MIENTRAS «Ubicar» corría se leyó con el texto de antes: cuenta desde que leyó, no desde que terminó", () => {
    const leidasTodas = { en: termino, notasEn: leyo, notas: ["sabido:a1", "sabido:a2", "sabido:a3"] };
    const editadaMientras = { ...autores, "sabido:a3": { en: "2026-11-24T21:50:00.000Z" }, "sabido:a1": { en: "2026-11-24T21:58:00.000Z" } };
    expect(notasSinUbicar(notas, editadaMientras, leidasTodas)).toEqual(["sabido:a1"]);
    // Sin la hora de lectura (no debería pasar desde el 25 nov), desde que terminó.
    expect(notasSinUbicar(notas, editadaMientras, { en: termino, notas: leidasTodas.notas })).toEqual([]);
  });
});

describe("qué ofrece el aviso de arriba del Resumen (25 nov): volver a ubicar o rehacer, un botón por vez", () => {
  const notas = { "sabido:a1": "Sobre Ventas · Datos (Cómo registran): en Excel", "sabido:a2": "Una de antes" };
  const autores = { "sabido:a1": { en: "2026-11-25T10:00:00.000Z" }, "sabido:a2": { en: "2026-11-20T10:00:00.000Z" } };
  const resumenDesde = "2026-11-24T12:00:00.000Z";
  const ubicacion = (o: { en: string; notas?: string[]; notasEn?: string }) => ({ modo: "posicionar", ...o });
  const leer = { modo: "leer", en: "2026-11-25T11:00:00.000Z" };
  const decidir = (corridas: { modo: string; en: string; notas?: string[]; notasEn?: string }[], enLaPreventa = true) =>
    lasNotasNuevas({ notas, autores, corridas, resumenDesde, enLaPreventa });

  it("una respuesta que «Ubicar» no leyó: primero volver a ubicar", () => {
    const r = decidir([ubicacion({ en: "2026-11-24T20:00:00.000Z", notas: ["sabido:a2"], notasEn: "2026-11-24T19:58:00.000Z" }), leer]);
    expect(r).toEqual({ delResumen: { total: 1, respuestas: 1 }, sinUbicar: { total: 1, respuestas: 1 }, ubicarPrimero: true });
  });

  it("ya la leyó «Ubicar»: rehacer el Resumen", () => {
    const r = decidir([ubicacion({ en: "2026-11-25T10:30:00.000Z", notas: ["sabido:a1", "sabido:a2"], notasEn: "2026-11-25T10:29:00.000Z" })]);
    expect(r.ubicarPrimero).toBe(false);
    expect(r.delResumen).toEqual({ total: 1, respuestas: 1 });
    expect(r.sinUbicar.total).toBe(0);
  });

  it("se editó después de ubicar: otra vez volver a ubicar", () => {
    const r = decidir([ubicacion({ en: "2026-11-25T09:30:00.000Z", notas: ["sabido:a1", "sabido:a2"], notasEn: "2026-11-25T09:29:00.000Z" })]);
    expect(r.ubicarPrimero).toBe(true);
  });

  it("fuera de la preventa, o sin haber ubicado nunca, el aviso no ofrece ubicar (no contradice a la línea ni esconde «Rehacer»)", () => {
    expect(decidir([ubicacion({ en: "2026-11-24T20:00:00.000Z" })], false).ubicarPrimero).toBe(false);
    const nunca = decidir([leer]);
    expect(nunca.ubicarPrimero).toBe(false);
    // La línea igual las cuenta: al ubicar por primera vez las lee.
    expect(nunca.sinUbicar).toEqual({ total: 2, respuestas: 1 });
  });

  it("la última corrida de «Ubicar» es la más nueva de ese modo", () => {
    expect(ultimaUbicacion([ubicacion({ en: "a" }), leer, ubicacion({ en: "b" }), leer])?.en).toBe("b");
    expect(ultimaUbicacion([leer])).toBeNull();
  });

  it("qué equipo nombra cada respuesta de una nota", () => {
    expect(equiposDeLasRespuestas("Sobre Ventas · Datos (Cómo registran): en Excel\nAlgo más\nsobre Admisiones · Procesos: a mano")).toEqual(["Ventas", "Admisiones"]);
    expect(equiposDeLasRespuestas("El gerente renunció")).toEqual([]);
  });
});
