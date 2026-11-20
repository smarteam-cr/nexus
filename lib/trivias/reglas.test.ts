/**
 * lib/trivias/reglas.test.ts — las reglas de una partida: los puntos (precisión y velocidad), una sola respuesta, nada
 * fuera de tiempo (con el reloj del servidor), volver a entrar es la misma participación, y a dónde avanza el anfitrión.
 */
import { describe, expect, it } from "vitest";
import {
  ALFABETO_DEL_CODIGO,
  calcularPosiciones,
  codigoDesdeBytes,
  decidirIngreso,
  distribucionDeRespuestas,
  esRespuestaCorrecta,
  partidaAbandonada,
  podioDe,
  tablaDePosiciones,
  evaluarRespuesta,
  hastaQuePreguntaCuenta,
  normalizarCodigo,
  preguntaAbierta,
  preguntaCerrada,
  puntosDeLaRespuesta,
  siguientePaso,
  type RelojDePartida,
} from "./reglas";
import type { PreguntaDeTrivia } from "./tipos";

const T0 = new Date("2026-11-19T15:00:00.000Z");
const en = (ms: number) => new Date(T0.getTime() + ms);

const multiple: PreguntaDeTrivia = {
  tipo: "OPCION_MULTIPLE",
  texto: "¿Qué objetos estándar tiene HubSpot?",
  opciones: ["Contactos", "Facturas de Odoo", "Empresas", "Pedidos de Shopify"],
  correctas: [0, 2],
  segundos: 20,
};
const verdaderoFalso: PreguntaDeTrivia = {
  tipo: "VERDADERO_FALSO",
  texto: "Un negocio puede tener varias empresas asociadas.",
  opciones: ["Verdadero", "Falso"],
  correctas: [0],
  segundos: 10,
};
const encuesta: PreguntaDeTrivia = {
  tipo: "ENCUESTA",
  texto: "¿Cómo te sentiste en el kickoff?",
  opciones: ["Bien", "Regular", "Perdido"],
  correctas: [],
  segundos: 15,
};

/** Una partida con la pregunta `indice` abierta desde T0 por `segundos`. */
function abierta(indice = 0, segundos = 20): RelojDePartida & { modo: "PRECISION" | "VELOCIDAD" } {
  return {
    estado: "PREGUNTA",
    modo: "VELOCIDAD",
    preguntaActual: indice,
    preguntaAbiertaAt: T0,
    preguntaCierraAt: en(segundos * 1000),
  };
}

describe("los puntos", () => {
  it("precisión: 1000 por acierto, sin importar cuánto tardó", () => {
    expect(puntosDeLaRespuesta({ modo: "PRECISION", esCorrecta: true, tardoMs: 0, limiteMs: 20_000 })).toBe(1000);
    expect(puntosDeLaRespuesta({ modo: "PRECISION", esCorrecta: true, tardoMs: 19_999, limiteMs: 20_000 })).toBe(1000);
    expect(puntosDeLaRespuesta({ modo: "PRECISION", esCorrecta: false, tardoMs: 0, limiteMs: 20_000 })).toBe(0);
  });

  it("velocidad: 1000 si es inmediato, 500 en el último instante, lineal en el medio", () => {
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: true, tardoMs: 0, limiteMs: 20_000 })).toBe(1000);
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: true, tardoMs: 10_000, limiteMs: 20_000 })).toBe(750);
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: true, tardoMs: 20_000, limiteMs: 20_000 })).toBe(500);
  });

  it("velocidad: un acierto nunca vale menos de 500 ni más de 1000, aunque el tiempo venga raro", () => {
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: true, tardoMs: 99_000, limiteMs: 20_000 })).toBe(500);
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: true, tardoMs: -5_000, limiteMs: 20_000 })).toBe(1000);
  });

  it("un error y una encuesta no suman", () => {
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: false, tardoMs: 0, limiteMs: 20_000 })).toBe(0);
    expect(puntosDeLaRespuesta({ modo: "VELOCIDAD", esCorrecta: null, tardoMs: 0, limiteMs: 20_000 })).toBe(0);
  });

  it("opción múltiple con varias correctas: vale cualquiera de ellas", () => {
    expect(esRespuestaCorrecta(multiple, 0)).toBe(true);
    expect(esRespuestaCorrecta(multiple, 2)).toBe(true);
    expect(esRespuestaCorrecta(multiple, 1)).toBe(false);
    expect(esRespuestaCorrecta(encuesta, 0)).toBeNull();
  });
});

describe("responder: una vez y dentro del tiempo (reloj del servidor)", () => {
  it("dentro del tiempo vale, con lo que tardó medido desde que se abrió", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: multiple, indice: 0, opcion: 2, ahora: en(5_000), yaRespondio: false });
    expect(r).toEqual({ ok: true, esCorrecta: true, tardoMs: 5_000, puntos: 875 });
  });

  it("la doble respuesta queda bloqueada", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: multiple, indice: 0, opcion: 0, ahora: en(6_000), yaRespondio: true });
    expect(r).toEqual({ ok: false, rechazo: "ya-respondiste" });
  });

  it("en el instante del cierre o después ya no se acepta", () => {
    for (const ms of [20_000, 20_001, 60_000]) {
      const r = evaluarRespuesta({ partida: abierta(), pregunta: multiple, indice: 0, opcion: 0, ahora: en(ms), yaRespondio: false });
      expect(r, String(ms)).toEqual({ ok: false, rechazo: "tiempo-agotado" });
    }
  });

  it("un milisegundo antes del cierre todavía vale (y suma lo mínimo de velocidad)", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: multiple, indice: 0, opcion: 0, ahora: en(19_999), yaRespondio: false });
    expect(r).toMatchObject({ ok: true, esCorrecta: true, puntos: 500 });
  });

  it("si el anfitrión cerró antes (o respondieron todos), manda la hora de cierre, no los segundos de la pregunta", () => {
    const cerradaAntes = { ...abierta(), preguntaCierraAt: en(3_000) };
    const r = evaluarRespuesta({ partida: cerradaAntes, pregunta: multiple, indice: 0, opcion: 0, ahora: en(4_000), yaRespondio: false });
    expect(r).toEqual({ ok: false, rechazo: "tiempo-agotado" });
  });

  it("no se responde una pregunta que no es la de ahora, ni fuera de una pregunta", () => {
    expect(evaluarRespuesta({ partida: abierta(1), pregunta: multiple, indice: 0, opcion: 0, ahora: en(1_000), yaRespondio: false }))
      .toEqual({ ok: false, rechazo: "otra-pregunta" });
    const enEspera = { estado: "ESPERA" as const, modo: "PRECISION" as const, preguntaActual: 0, preguntaAbiertaAt: null, preguntaCierraAt: null };
    expect(evaluarRespuesta({ partida: enEspera, pregunta: multiple, indice: 0, opcion: 0, ahora: en(0), yaRespondio: false }))
      .toEqual({ ok: false, rechazo: "fuera-de-pregunta" });
    const enPosiciones = { ...abierta(), estado: "POSICIONES" as const };
    expect(evaluarRespuesta({ partida: enPosiciones, pregunta: multiple, indice: 0, opcion: 0, ahora: en(1_000), yaRespondio: false }))
      .toEqual({ ok: false, rechazo: "fuera-de-pregunta" });
  });

  it("una respuesta con hora ANTERIOR a la apertura (el anfitrión abrió mientras el pedido viajaba) no cuenta", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: multiple, indice: 0, opcion: 0, ahora: en(-50), yaRespondio: false });
    expect(r).toEqual({ ok: false, rechazo: "fuera-de-pregunta" });
    expect(preguntaAbierta(abierta(), en(-50))).toBe(false);
    expect(preguntaCerrada(abierta(), en(-50))).toBe(false);
  });

  it("una opción que no existe se rechaza", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: verdaderoFalso, indice: 0, opcion: 2, ahora: en(1_000), yaRespondio: false });
    expect(r).toEqual({ ok: false, rechazo: "opcion-invalida" });
  });

  it("encuesta: se acepta, sin correcta y sin puntos", () => {
    const r = evaluarRespuesta({ partida: abierta(), pregunta: encuesta, indice: 0, opcion: 1, ahora: en(1_000), yaRespondio: false });
    expect(r).toEqual({ ok: true, esCorrecta: null, tardoMs: 1_000, puntos: 0 });
  });

  it("precisión: un acierto lento vale lo mismo que uno rápido", () => {
    const partida = { ...abierta(), modo: "PRECISION" as const };
    const r = evaluarRespuesta({ partida, pregunta: multiple, indice: 0, opcion: 0, ahora: en(18_000), yaRespondio: false });
    expect(r).toMatchObject({ ok: true, puntos: 1000 });
  });
});

describe("volver a entrar desde otro dispositivo", () => {
  it("si ya juega, es la misma participación (también con la partida terminada)", () => {
    for (const estado of ["ESPERA", "PREGUNTA", "POSICIONES", "FINALIZADA"] as const) {
      expect(decidirIngreso(estado, true), estado).toBe("reusar");
    }
  });

  it("alguien nuevo entra en cualquier momento salvo con la partida terminada", () => {
    expect(decidirIngreso("ESPERA", false)).toBe("crear");
    expect(decidirIngreso("PREGUNTA", false)).toBe("crear");
    expect(decidirIngreso("POSICIONES", false)).toBe("crear");
    expect(decidirIngreso("FINALIZADA", false)).toBe("terminada");
  });
});

describe("el reloj de la pregunta", () => {
  it("abierta antes de la hora de cierre; cerrada en esa hora y después", () => {
    const p = abierta();
    expect(preguntaAbierta(p, en(19_999))).toBe(true);
    expect(preguntaCerrada(p, en(19_999))).toBe(false);
    expect(preguntaAbierta(p, en(20_000))).toBe(false);
    expect(preguntaCerrada(p, en(20_000))).toBe(true);
  });

  it("los puntos que se muestran no cuentan la pregunta abierta (nadie deduce si acertó antes del cierre)", () => {
    expect(hastaQuePreguntaCuenta(abierta(3), en(1_000))).toBe(2);
    expect(hastaQuePreguntaCuenta(abierta(3), en(30_000))).toBe(3);
    const enEspera: RelojDePartida = { estado: "ESPERA", preguntaActual: 0, preguntaAbiertaAt: null, preguntaCierraAt: null };
    expect(hastaQuePreguntaCuenta(enEspera, en(0))).toBe(-1);
  });
});

describe("el anfitrión avanza", () => {
  const preguntas = [multiple, verdaderoFalso, encuesta];
  const espera: RelojDePartida = { estado: "ESPERA", preguntaActual: 0, preguntaAbiertaAt: null, preguntaCierraAt: null };

  it("empezar abre la primera pregunta con su tiempo", () => {
    expect(siguientePaso(espera, "empezar", preguntas, T0)).toEqual({
      ok: true,
      cambio: { estado: "PREGUNTA", preguntaActual: 0, preguntaAbiertaAt: T0, preguntaCierraAt: en(20_000) },
    });
  });

  it("cerrar adelanta la hora de cierre a ahora; con la pregunta cerrada no hace nada", () => {
    expect(siguientePaso(abierta(), "cerrar", preguntas, en(4_000))).toEqual({ ok: true, cambio: { preguntaCierraAt: en(4_000) } });
    expect(siguientePaso(abierta(), "cerrar", preguntas, en(25_000)).ok).toBe(false);
  });

  it("mostrar resultados solo con la pregunta cerrada", () => {
    expect(siguientePaso(abierta(), "posiciones", preguntas, en(1_000)).ok).toBe(false);
    expect(siguientePaso(abierta(), "posiciones", preguntas, en(20_000))).toEqual({ ok: true, cambio: { estado: "POSICIONES" } });
  });

  it("siguiente abre la pregunta que sigue con SU tiempo; en la última, no", () => {
    const posiciones: RelojDePartida = { ...abierta(0), estado: "POSICIONES" };
    expect(siguientePaso(posiciones, "siguiente", preguntas, en(30_000))).toEqual({
      ok: true,
      cambio: { estado: "PREGUNTA", preguntaActual: 1, preguntaAbiertaAt: en(30_000), preguntaCierraAt: en(40_000) },
    });
    const ultima: RelojDePartida = { ...abierta(2), estado: "POSICIONES" };
    expect(siguientePaso(ultima, "siguiente", preguntas, en(30_000)).ok).toBe(false);
  });

  it("terminar lleva al podio y, con una pregunta abierta, la cierra", () => {
    expect(siguientePaso(abierta(), "terminar", preguntas, en(2_000))).toEqual({
      ok: true,
      cambio: { estado: "FINALIZADA", terminadaAt: en(2_000), preguntaCierraAt: en(2_000) },
    });
    const posiciones: RelojDePartida = { ...abierta(2), estado: "POSICIONES" };
    expect(siguientePaso(posiciones, "terminar", preguntas, en(90_000))).toEqual({
      ok: true,
      cambio: { estado: "FINALIZADA", terminadaAt: en(90_000) },
    });
    const terminada: RelojDePartida = { ...abierta(), estado: "FINALIZADA" };
    expect(siguientePaso(terminada, "terminar", preguntas, en(90_000)).ok).toBe(false);
  });

  it("no se empieza dos veces ni sin preguntas", () => {
    expect(siguientePaso(abierta(), "empezar", preguntas, T0).ok).toBe(false);
    expect(siguientePaso(espera, "empezar", [], T0).ok).toBe(false);
  });
});

describe("la tabla y la distribución", () => {
  const jugadores = [
    { id: "a", nombre: "Ana" },
    { id: "b", nombre: "Beto" },
    { id: "c", nombre: "Carla" },
    { id: "d", nombre: "Dani" },
  ];
  const respuestas = [
    { jugadorId: "a", pregunta: 0, puntos: 900, esCorrecta: true },
    { jugadorId: "b", pregunta: 0, puntos: 900, esCorrecta: true },
    { jugadorId: "c", pregunta: 0, puntos: 0, esCorrecta: false },
    { jugadorId: "a", pregunta: 1, puntos: 0, esCorrecta: false },
    { jugadorId: "b", pregunta: 1, puntos: 600, esCorrecta: true },
  ];

  it("ordena por puntos, comparte el lugar en empate e incluye a quien no sumó", () => {
    expect(calcularPosiciones(jugadores, respuestas, 0).map((p) => [p.nombre, p.puntos, p.lugar])).toEqual([
      ["Ana", 900, 1],
      ["Beto", 900, 1],
      ["Carla", 0, 3],
      ["Dani", 0, 3],
    ]);
  });

  it("cuenta solo hasta la pregunta indicada, con los aciertos", () => {
    const tabla = calcularPosiciones(jugadores, respuestas, 1);
    expect(tabla[0]).toEqual({ jugadorId: "b", nombre: "Beto", puntos: 1500, aciertos: 2, lugar: 1 });
    expect(tabla[1]).toMatchObject({ nombre: "Ana", puntos: 900, aciertos: 1, lugar: 2 });
  });

  it("el podio: los 3 primeros LUGARES con sus empates, sin quien no sumó", () => {
    const tabla = [
      { jugadorId: "a", nombre: "A", puntos: 3000, aciertos: 3, lugar: 1 },
      { jugadorId: "b", nombre: "B", puntos: 2000, aciertos: 2, lugar: 2 },
      { jugadorId: "c", nombre: "C", puntos: 1000, aciertos: 1, lugar: 3 },
      { jugadorId: "d", nombre: "D", puntos: 1000, aciertos: 1, lugar: 3 },
      { jugadorId: "e", nombre: "E", puntos: 0, aciertos: 0, lugar: 5 },
    ];
    expect(podioDe(tabla).map((p) => p.nombre)).toEqual(["A", "B", "C", "D"]);
    const todosEnCero = tabla.map((p) => ({ ...p, puntos: 0, lugar: 1 }));
    expect(podioDe(todosEnCero)).toEqual([]);
  });

  it("la tabla tras una pregunta: los 5 primeros lugares, sin pasar de 10 filas", () => {
    const empatados = Array.from({ length: 14 }, (_, i) => ({ jugadorId: `j${i}`, nombre: `J${i}`, puntos: 0, aciertos: 0, lugar: 1 }));
    expect(tablaDePosiciones(empatados)).toHaveLength(10);
    const escalonados = Array.from({ length: 8 }, (_, i) => ({ jugadorId: `j${i}`, nombre: `J${i}`, puntos: 800 - i, aciertos: 1, lugar: i + 1 }));
    expect(tablaDePosiciones(escalonados).map((p) => p.lugar)).toEqual([1, 2, 3, 4, 5]);
  });

  it("una partida sin terminar y quieta por más de 12 h ya no se muestra en vivo", () => {
    expect(partidaAbandonada("ESPERA", T0, en(13 * 3_600_000))).toBe(true);
    expect(partidaAbandonada("PREGUNTA", T0, en(11 * 3_600_000))).toBe(false);
    expect(partidaAbandonada("FINALIZADA", T0, en(48 * 3_600_000))).toBe(false);
  });

  it("cuántos eligieron cada opción", () => {
    expect(distribucionDeRespuestas(4, [0, 2, 2, 3, 2])).toEqual([1, 0, 3, 1]);
    expect(distribucionDeRespuestas(2, [5, -1])).toEqual([0, 0]);
  });
});

describe("el código de la partida", () => {
  it("6 caracteres del alfabeto sin los que se confunden", () => {
    const c = codigoDesdeBytes([0, 30, 31, 255, 7, 100]);
    expect(c).toHaveLength(6);
    for (const ch of c) expect(ALFABETO_DEL_CODIGO).toContain(ch);
    expect(ALFABETO_DEL_CODIGO).not.toMatch(/[01ILO]/);
  });

  it("acepta lo que escribe la persona (minúsculas, espacios, guion) y rechaza lo que no puede ser", () => {
    expect(normalizarCodigo("k7m 2qx")).toBe("K7M2QX");
    expect(normalizarCodigo("K7M-2QX")).toBe("K7M2QX");
    expect(normalizarCodigo("K7M2Q")).toBeNull();
    expect(normalizarCodigo("K7M2QO")).toBeNull(); // la O no existe en el alfabeto
    expect(normalizarCodigo("../../x")).toBeNull();
  });
});
