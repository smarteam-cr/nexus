/**
 * lib/trivias/schema.test.ts — lo que entra del editor: cada tipo de pregunta se valida y sale normalizado, y el
 * primer problema llega en palabras que el editor muestra tal cual.
 */
import { describe, expect, it } from "vitest";
import { AvanzarInput, PreguntasJugadas, ResponderInput, TriviaInput, leerPreguntasJugadas } from "./schema";
import { revisarTrivia } from "./validar";
import { PREGUNTAS_DE_EJEMPLO, TITULO_DE_EJEMPLO, triviaDeEjemplo } from "@/scripts/lib/trivia-de-ejemplo";

const multiple = {
  tipo: "OPCION_MULTIPLE",
  texto: "  ¿Qué objetos estándar tiene HubSpot?  ",
  opciones: ["Contactos", " Empresas ", "Negocios"],
  correctas: [1, 0, 1],
  segundos: 30,
};

function primerError(input: unknown): string | undefined {
  const r = TriviaInput.safeParse(input);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe("TriviaInput", () => {
  it("normaliza: textos sin espacios de más, correctas sin repetir y en orden, 20 s por defecto", () => {
    const r = TriviaInput.parse({ titulo: "  Onboarding  ", preguntas: [multiple, { ...multiple, segundos: undefined }] });
    expect(r.titulo).toBe("Onboarding");
    expect(r.preguntas[0]).toEqual({
      tipo: "OPCION_MULTIPLE",
      texto: "¿Qué objetos estándar tiene HubSpot?",
      opciones: ["Contactos", "Empresas", "Negocios"],
      correctas: [0, 1],
      segundos: 30,
    });
    expect(r.preguntas[1].segundos).toBe(20);
  });

  it("verdadero o falso lleva siempre sus dos opciones fijas", () => {
    const r = TriviaInput.parse({
      titulo: "VF",
      preguntas: [{ tipo: "VERDADERO_FALSO", texto: "¿Sí?", opciones: ["x"], correctas: [1], segundos: 10 }],
    });
    expect(r.preguntas[0].opciones).toEqual(["Verdadero", "Falso"]);
    expect(r.preguntas[0].correctas).toEqual([1]);
  });

  it("una encuesta no guarda correctas aunque lleguen", () => {
    const r = TriviaInput.parse({
      titulo: "Pulso",
      preguntas: [{ tipo: "ENCUESTA", texto: "¿Cómo vas?", opciones: ["Bien", "Mal"], correctas: [0], segundos: 15 }],
    });
    expect(r.preguntas[0].correctas).toEqual([]);
  });

  it("dice qué falta, con el número de la pregunta", () => {
    expect(primerError({ titulo: "", preguntas: [multiple] })).toBe("Ponle un título a la trivia.");
    expect(primerError({ titulo: "T", preguntas: [] })).toBe("Agrega al menos una pregunta.");
    expect(primerError({ titulo: "T", preguntas: [multiple, { ...multiple, correctas: [] }] })).toBe(
      "Pregunta 2: marca al menos una opción correcta.",
    );
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, opciones: ["Solo una"], correctas: [0] }] })).toBe(
      "Pregunta 1: pon al menos 2 opciones.",
    );
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, opciones: ["A", "a"], correctas: [0] }] })).toBe(
      "Pregunta 1: hay dos opciones iguales.",
    );
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, opciones: ["A", ""], correctas: [0] }] })).toBe(
      "Pregunta 1: hay una opción vacía; escríbela o quítala.",
    );
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, texto: "   " }] })).toBe("Pregunta 1: escribe la pregunta.");
    expect(
      primerError({ titulo: "T", preguntas: [{ tipo: "VERDADERO_FALSO", texto: "¿?", opciones: [], correctas: [], segundos: 20 }] }),
    ).toBe("Pregunta 1: elige si la respuesta es verdadero o falso.");
  });

  it("rechaza más de 4 opciones, una correcta que no existe y tiempos fuera de rango", () => {
    expect(TriviaInput.safeParse({ titulo: "T", preguntas: [{ ...multiple, opciones: ["a", "b", "c", "d", "e"] }] }).success).toBe(false);
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, correctas: [3] }] })).toBe(
      "Pregunta 1: marcaste como correcta una opción que no existe.",
    );
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, segundos: 2 }] })).toBe("El tiempo mínimo es de 5 segundos.");
    expect(primerError({ titulo: "T", preguntas: [{ ...multiple, segundos: 600 }] })).toBe("El tiempo máximo es de 120 segundos.");
  });
});

describe("lo que manda una partida en vivo", () => {
  it("avanzar y responder son estrictos: nada de campos de más", () => {
    expect(AvanzarInput.safeParse({ accion: "empezar", desde: { estado: "ESPERA", pregunta: 0 } }).success).toBe(true);
    expect(AvanzarInput.safeParse({ accion: "saltar", desde: { estado: "ESPERA", pregunta: 0 } }).success).toBe(false);
    expect(ResponderInput.safeParse({ pregunta: 0, opcion: 1 }).success).toBe(true);
    expect(ResponderInput.safeParse({ pregunta: 0, opcion: 1, puntos: 1000 }).success).toBe(false);
    expect(ResponderInput.safeParse({ pregunta: 0, opcion: 4 }).success).toBe(false);
  });

  it("la copia de preguntas rota no se juega (lista vacía) en vez de reventar", () => {
    expect(leerPreguntasJugadas([{ tipo: "OPCION_MULTIPLE" }])).toEqual([]);
    expect(leerPreguntasJugadas(null)).toEqual([]);
    const buena = [{ tipo: "ENCUESTA", texto: "¿?", opciones: ["a", "b"], correctas: [], segundos: 20 }];
    expect(PreguntasJugadas.parse(buena)).toEqual(buena);
    expect(leerPreguntasJugadas(buena)).toEqual(buena);
  });
});

describe("el editor (sin Zod) y la ruta (con Zod) llegan al mismo veredicto", () => {
  const vf = { tipo: "VERDADERO_FALSO" as const, texto: "¿Sí?", opciones: [] as string[], correctas: [0], segundos: 10 };
  const casos: { nombre: string; t: { titulo: string; preguntas: (typeof multiple | typeof vf)[] } }[] = [
    { nombre: "bien", t: { titulo: " T ", preguntas: [multiple, vf] } },
    { nombre: "sin título", t: { titulo: "  ", preguntas: [multiple] } },
    { nombre: "sin preguntas", t: { titulo: "T", preguntas: [] } },
    { nombre: "sin correcta", t: { titulo: "T", preguntas: [vf, { ...multiple, correctas: [] }] } },
    { nombre: "opción vacía", t: { titulo: "T", preguntas: [{ ...multiple, opciones: ["A", "  "], correctas: [0] }] } },
    { nombre: "opciones iguales", t: { titulo: "T", preguntas: [{ ...multiple, opciones: ["Sí", "sí"], correctas: [0] }] } },
    { nombre: "VF sin elegir", t: { titulo: "T", preguntas: [{ ...vf, correctas: [] }] } },
    { nombre: "tiempo corto", t: { titulo: "T", preguntas: [{ ...multiple, segundos: 3 }] } },
    { nombre: "tiempo con decimales", t: { titulo: "T", preguntas: [{ ...multiple, segundos: 12.5 }] } },
    { nombre: "tiempo vacío", t: { titulo: "T", preguntas: [{ ...multiple, segundos: Number.NaN }] } },
    { nombre: "texto largo", t: { titulo: "T", preguntas: [{ ...multiple, texto: "x".repeat(301) }] } },
  ];

  it.each(casos)("$nombre", ({ t }) => {
    const editor = revisarTrivia(t as Parameters<typeof revisarTrivia>[0]);
    const ruta = TriviaInput.safeParse(t);
    expect(editor.ok).toBe(ruta.success);
    if (editor.ok && ruta.success) expect(editor.datos).toEqual(ruta.data);
    // Los problemas de una pregunta armada (y los del título o la lista) se dicen con las MISMAS palabras.
    if (!editor.ok && !ruta.success) {
      const mensajeDeLaRuta = ruta.error.issues[0]?.message ?? "";
      if (mensajeDeLaRuta.startsWith("Pregunta ") || editor.pregunta === null) expect(editor.mensaje).toBe(mensajeDeLaRuta);
    }
  });
});

describe("la trivia de ejemplo (scripts/seed-trivia-ejemplo.ts)", () => {
  it("pasa el schema de la pantalla: 10 preguntas, una sola correcta cada una, de los dos tipos", () => {
    const t = TriviaInput.parse(triviaDeEjemplo());
    expect(t.titulo).toBe(TITULO_DE_EJEMPLO);
    expect(t.preguntas).toHaveLength(10);
    for (const p of t.preguntas) expect(p.correctas, p.texto).toHaveLength(1);
    expect(new Set(t.preguntas.map((p) => p.tipo))).toEqual(new Set(["OPCION_MULTIPLE", "VERDADERO_FALSO"]));
    expect(new Set(PREGUNTAS_DE_EJEMPLO.map((p) => p.tema)).size).toBe(10);
  });
});
