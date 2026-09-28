/**
 * lib/escala/documento/validar.test.ts — las pruebas de publicación pasan con lo bueno y frenan
 * cada defecto que dicen frenar.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { compararEscalas, diferenciaPorPalabras } from "./diferencias";
import { MINI_ESCALA, MINI_ESPECIFICACION, MINI_MANUAL } from "./mini-escala.fixture";
import { leerRetirados, parsearEscala } from "./parsear";
import { validarEscala, type ResultadoDePrueba } from "./validar";

const fallidas = (r: ResultadoDePrueba[]) => r.filter((x) => !x.ok).map((x) => x.nombre);

describe("la escala de juguete", () => {
  const base = parsearEscala(MINI_ESCALA);
  const opts = { especificacion: MINI_ESPECIFICACION, manual: MINI_MANUAL };

  it("pasa todas", () => {
    expect(fallidas(validarEscala(base, opts))).toEqual([]);
  });

  it("5 · un identificador repetido", () => {
    const e = parsearEscala(MINI_ESCALA.replace("`[1.1.E2 · declarado · hábito]`", "`[1.1.E1 · declarado · hábito]`"));
    const r = validarEscala(e, opts);
    expect(fallidas(r)).toEqual(["5 · Identificadores estables"]);
    expect(r.find((x) => !x.ok)!.detalle).toEqual(["1.1.E1 está repetido."]);
  });

  it("5 · un identificador retirado que se vuelve a usar (los retirados salen de la especificación)", () => {
    expect(leerRetirados(MINI_ESPECIFICACION)).toEqual(["1.1.F9", "1.2.E9"]);
    const e = parsearEscala(MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", "`[1.2.E9 · comprobable]`"));
    expect(fallidas(validarEscala(e, opts))).toEqual(["5 · Identificadores estables"]);
  });

  it("5 · algo que estaba en la versión anterior y desapareció", () => {
    const e = parsearEscala(MINI_ESCALA.replace("- El sistema señala desviaciones. `[1.1.O2 · comprobable]`\n", ""));
    const r = validarEscala(e, { ...opts, anterior: base });
    expect(r.find((x) => x.nombre.startsWith("5"))!.detalle).toEqual(["1.1.O2 estaba en la 9.9.9 y desapareció."]);
  });

  it("4 · un identificador a la vista del cliente", () => {
    const e = parsearEscala(MINI_ESCALA.replace("Hay un pipeline configurado.", "Hay un pipeline, como pide 1.2."));
    expect(fallidas(validarEscala(e, opts))).toEqual(["4 · Sin identificadores a la vista"]);
  });

  it("1 · un nivel que se queda vacío para un perfil", () => {
    // Sin 1.1.E2, Eficiente de 1.1 solo tiene un criterio de «cliente recurrente»: vacío en la relación única.
    const e = parsearEscala(MINI_ESCALA.replace("- El proceso se refina en cadencia. `[1.1.E2 · declarado · hábito]`\n", ""));
    const r = validarEscala(e, opts);
    expect(fallidas(r)).toContain("1 · Ningún nivel vacío");
    expect(r.find((x) => x.nombre.startsWith("1"))!.detalle).toContain("1.1 E (con equipo/única)");
  });

  it("7 · la especificación o el manual van con otra escala", () => {
    const r = validarEscala(base, { especificacion: MINI_ESPECIFICACION.replace("escala: 9.9.9", "escala: 9.9.8"), manual: MINI_MANUAL });
    expect(fallidas(r)).toEqual(["7 · Documentos alineados"]);
  });

  it("estructura · un criterio de riesgo sin mensaje", () => {
    const e = parsearEscala(MINI_ESCALA.replace("| `1.1.F3` | Duplicados | Tus reportes pueden estar inflados. |\n", ""));
    expect(fallidas(validarEscala(e, opts))).toEqual(["Estructura"]);
  });
});

describe("el archivo real pasa todas, con su especificación y su manual", () => {
  it("todas en verde", () => {
    const r = validarEscala(parsearEscala(leerArchivoDeLaEscala("escala")), {
      especificacion: leerArchivoDeLaEscala("especificacion"),
      manual: leerArchivoDeLaEscala("manual"),
    });
    expect(r.filter((x) => !x.ok)).toEqual([]);
  });
});

describe("qué cambió entre versiones", () => {
  it("nuevos, retirados y cambiados", () => {
    const a = parsearEscala(MINI_ESCALA);
    const b = parsearEscala(
      MINI_ESCALA.replace("Hay un pipeline configurado.", "Hay un pipeline configurado y documentado.")
        .replace("- La distribución se autoajusta. `[1.2.O1 · comprobable]`", "- La distribución se autoajusta. `[1.2.O1 · comprobable]`\n- Aprende sola. `[1.2.O2 · comprobable]`")
        .replace("- El sistema señala desviaciones. `[1.1.O2 · comprobable]`\n", ""),
    );
    const c = compararEscalas(a, b);
    expect(c.nuevos).toEqual(["1.2.O2"]);
    expect(c.retirados).toEqual(["1.1.O2"]);
    expect(c.cambiados).toEqual([
      { id: "1.1.F1", antes: "Hay un pipeline configurado.", despues: "Hay un pipeline configurado y documentado." },
    ]);
  });

  it("la diferencia palabra por palabra se vuelve a pegar tal cual", () => {
    const antes = "Los deals estancados se reconocen a tiempo y tienen un paso acordado.";
    const despues = "Los deals estancados se reconocen antes del plazo y tienen un paso acordado.";
    const t = diferenciaPorPalabras(antes, despues);
    expect(t.filter((x) => x.tipo !== "agregado").map((x) => x.texto).join("")).toBe(antes);
    expect(t.filter((x) => x.tipo !== "quitado").map((x) => x.texto).join("")).toBe(despues);
    expect(t.filter((x) => x.tipo === "quitado").map((x) => x.texto.trim())).toEqual(["a tiempo"]);
    expect(t.filter((x) => x.tipo === "agregado").map((x) => x.texto.trim())).toEqual(["antes del plazo"]);
  });

  it("iguales, un solo tramo", () => {
    expect(diferenciaPorPalabras("igual", "igual")).toEqual([{ tipo: "igual", texto: "igual" }]);
  });
});
