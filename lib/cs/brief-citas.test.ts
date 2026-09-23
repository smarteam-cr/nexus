import { describe, expect, it } from "vitest";
import {
  TOPE_NARRATIVA_CHARS,
  TOPE_STATEMENTS,
  extraerJson,
  parsearBriefCitado,
  type BriefSource,
} from "./brief-citas";

/**
 * lib/cs/brief-citas.test.ts — LA AFIRMACIÓN SIN FUENTE NO PASA.
 *
 * Hasta el 2026-08-16 esta lógica vivía privada dentro de `account-brief.ts` —un archivo que
 * importa Prisma y el SDK de Anthropic— y **no tenía ni un test**. O sea: la función que decide
 * si algo que el modelo inventó llega a una persona era justamente la que nadie probaba.
 *
 * Lo que se prueba acá no es el parseo por el parseo: es que **una cita que no existe en el
 * contexto haga desaparecer esa afirmación**. Ese es el único motivo por el que alguien puede
 * leer un brief y repetirlo en una llamada sin verificarlo a mano.
 */

const fuentes = (): Map<string, BriefSource> =>
  new Map([
    ["sesion:s1", { kind: "sesion", id: "s1", label: "Kickoff Wherex", date: "2026-06-02" }],
    ["alerta:a9", { kind: "alerta", id: "a9", label: "Uso en caída", date: null }],
  ]);

const salida = (statements: unknown[], headline?: unknown) =>
  JSON.stringify({ ...(headline !== undefined ? { headline } : {}), statements });

describe("⭐ sin fuente válida no hay afirmación", () => {
  it("una cita que NO está en el contexto se descarta, y las buenas siguen", () => {
    /* El caso que importa: el modelo escribe algo plausible y le pega una fuente inventada. Si
       pasara, sería indistinguible de un dato real — con cita y todo. */
    const r = parsearBriefCitado(
      salida([
        { text: "El kickoff se hizo el 2 de junio.", source: "sesion:s1" },
        { text: "El cliente pidió una integración con SAP.", source: "sesion:s99" },
      ]),
      fuentes(),
    );
    expect(r.statements).toHaveLength(1);
    expect(r.statements[0].text).toContain("kickoff");
    expect(r.discarded, "la afirmación con fuente inventada no se contó como descartada").toBe(1);
  });

  it("la afirmación se queda con los datos de la fuente REAL, no con los que mandó el modelo", () => {
    /* Si se copiara el `label` que viene en el JSON, el modelo podría renombrar la fuente y la
       cita diría algo que esa reunión nunca fue. La fuente sale del mapa, siempre. */
    const r = parsearBriefCitado(
      salida([
        { text: "Hubo caída de uso.", source: "alerta:a9", label: "Reunión con el CEO", date: "2020-01-01" },
      ]),
      fuentes(),
    );
    expect(r.statements[0].source).toEqual({
      kind: "alerta",
      id: "a9",
      label: "Uso en caída",
      date: null,
    });
  });

  it("tolera los corchetes con que el modelo suele envolver la cita", () => {
    const r = parsearBriefCitado(salida([{ text: "Algo.", source: "[sesion:s1]" }]), fuentes());
    expect(r.statements).toHaveLength(1);
  });

  it("un texto vacío se descarta aunque la fuente exista", () => {
    // Una cita sin afirmación no dice nada; ocuparía un renglón del resumen para nada.
    expect(() =>
      parsearBriefCitado(salida([{ text: "   ", source: "sesion:s1" }]), fuentes()),
    ).toThrow(/statement con fuente válida/);
  });

  it("⛔ si NINGUNA sobrevive, LANZA en vez de devolver un resumen vacío", () => {
    /* Un brief vacío guardado se vería como «esta cuenta no tiene nada que contar», que es una
       afirmación fuerte y falsa. Prefiere quedar en ERROR con su causa, que es auditable. */
    expect(() =>
      parsearBriefCitado(salida([{ text: "Todo bien.", source: "sesion:inventada" }]), fuentes()),
    ).toThrow(/statement con fuente válida/);
  });
});

describe("el tope de afirmaciones, y que el excedente se CUENTE", () => {
  it("corta en el tope y suma lo que sobró a los descartados", () => {
    /* Si el excedente no se contara, el panel diría «0 descartadas» sobre una salida que se
       recortó — y un descarte alto es justamente la señal de que el prompt está flojo. */
    const muchas = Array.from({ length: TOPE_STATEMENTS + 4 }, (_, i) => ({
      text: `Afirmación ${i}.`,
      source: "sesion:s1",
    }));
    const r = parsearBriefCitado(salida(muchas), fuentes());
    expect(r.statements).toHaveLength(TOPE_STATEMENTS);
    expect(r.discarded).toBe(4);
  });
});

describe("el titular", () => {
  it("se recorta a 400 y se limpia", () => {
    const r = parsearBriefCitado(
      salida([{ text: "x", source: "sesion:s1" }], `  ${"a".repeat(500)}  `),
      fuentes(),
    );
    expect(r.headline).toHaveLength(400);
  });

  it("ausente o vacío queda en null, no en cadena vacía", () => {
    // Un titular "" pintaría un renglón en blanco donde debería no haber nada.
    const sinTitular = parsearBriefCitado(salida([{ text: "x", source: "sesion:s1" }]), fuentes());
    expect(sinTitular.headline).toBeNull();
    const enBlanco = parsearBriefCitado(
      salida([{ text: "x", source: "sesion:s1" }], "   "),
      fuentes(),
    );
    expect(enBlanco.headline).toBeNull();
  });
});

describe("malformado LANZA — es un problema distinto de una cita mala", () => {
  it("sin JSON", () => {
    expect(() => parsearBriefCitado("Perdón, no puedo ayudarte con eso.", fuentes())).toThrow(
      /sin JSON/,
    );
  });

  it("JSON roto (pero con las llaves balanceadas)", () => {
    /* ⚠ Un `{` sin su `}` NO llega hasta acá: `extraerJson` no encuentra objeto y el error es
       «sin JSON». Son dos mensajes distintos a propósito — uno dice que el modelo no devolvió
       un objeto, el otro que devolvió uno ilegible. */
    expect(() => parsearBriefCitado('{"statements": [,]}', fuentes())).toThrow(/JSON inválido/);
    expect(() => parsearBriefCitado('{"statements": [', fuentes())).toThrow(/sin JSON/);
  });

  it("sin el array `statements`", () => {
    expect(() => parsearBriefCitado('{"headline": "hola"}', fuentes())).toThrow(/sin array/);
  });
});

describe("extraerJson respeta comillas y escapes", () => {
  it("una llave DENTRO de un string no cierra el objeto", () => {
    /* El texto en español las trae («el equipo {sic}»), y recortar por la última `}` produciría
       un JSON cortado a la mitad — que se leería como «el modelo falló» cuando no falló. */
    const raw = 'Acá va: {"a": "tiene una } adentro", "b": 1} y después prosa.';
    expect(extraerJson(raw)).toBe('{"a": "tiene una } adentro", "b": 1}');
  });

  it("una comilla escapada no abre string", () => {
    const raw = '{"a": "dijo \\"listo\\"", "b": {"c": 2}}';
    expect(extraerJson(raw)).toBe(raw);
  });

  it("sin llaves, null", () => {
    expect(extraerJson("no hay nada")).toBeNull();
  });
});

/**
 * ⭐ LA NARRATIVA ES OPCIONAL, Y TIENE TOPE (2026-09-22)
 *
 * El resumen de PROYECTO gana un párrafo en prosa arriba de las afirmaciones; el de CUENTA no lo
 * pide. Este módulo es compartido, así que el campo tiene que ser aditivo en los dos sentidos:
 * si no viene, `null` y nada más — volverlo obligatorio rompería el brief de cuenta de golpe.
 */
describe("la narrativa (opcional) del resumen", () => {
  const FUENTES = new Map([
    ["sesion:s1", { kind: "sesion", id: "s1", label: "Kickoff", date: null }],
  ]);
  const conStatements = (extra: Record<string, unknown>) =>
    parsearBriefCitado(
      JSON.stringify({ statements: [{ text: "Algo", source: "sesion:s1" }], ...extra }),
      FUENTES,
    );

  it("sin narrativa devuelve null y NO lanza — es el caso del brief de cuenta", () => {
    expect(conStatements({}).narrativa).toBeNull();
  });

  it("una narrativa vacía o que no es texto queda en null, no en cadena vacía", () => {
    /* `""` pintaría un bloque en blanco arriba de los hallazgos: un hueco que se lee como error. */
    expect(conStatements({ narrativa: "   " }).narrativa).toBeNull();
    expect(conStatements({ narrativa: 42 }).narrativa).toBeNull();
  });

  it("se recorta al tope: un documento entero no entra a la fila ni a la pantalla", () => {
    const larga = conStatements({ narrativa: "x".repeat(TOPE_NARRATIVA_CHARS * 3) }).narrativa;
    expect(larga?.length).toBe(TOPE_NARRATIVA_CHARS);
  });

  it("no toca lo demás: el titular y las afirmaciones salen igual", () => {
    const r = conStatements({ headline: "Va trabado", narrativa: "Se vendió una migración." });
    expect(r.headline).toBe("Va trabado");
    expect(r.narrativa).toBe("Se vendió una migración.");
    expect(r.statements).toHaveLength(1);
    expect(r.discarded).toBe(0);
  });
});
