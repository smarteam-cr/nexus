/**
 * lib/escala/documento/validar.test.ts — las pruebas de publicación pasan con lo bueno y frenan
 * cada defecto que dicen frenar.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { compararEscalas, diferenciaPorPalabras } from "./diferencias";
import { MINI_EDICION, MINI_ESCALA, MINI_ESCALA_CON_EDICION, MINI_ESPECIFICACION, MINI_MANUAL } from "./mini-escala.fixture";
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

  it("5 · un criterio que cambia de dimensión: el viejo se retira en la especificación y puede desaparecer", () => {
    // 1.1.O2 pasa a 1.2 como 1.2.O2: el viejo queda retirado; ningún otro puede faltar.
    const movido = MINI_ESCALA.replace("- El sistema señala desviaciones. `[1.1.O2 · comprobable]`\n", "").replace(
      "- La distribución se autoajusta. `[1.2.O1 · comprobable]`",
      "- La distribución se autoajusta. `[1.2.O1 · comprobable]`\n- El sistema señala desviaciones. `[1.2.O2 · comprobable]`",
    );
    const especificacion = MINI_ESPECIFICACION.replace("`1.1.F9` y `1.2.E9`", "`1.1.F9`, `1.1.O2` y `1.2.E9`");
    const prueba5 = (r: ResultadoDePrueba[]) => r.find((x) => x.nombre.startsWith("5"))!;
    expect(prueba5(validarEscala(parsearEscala(movido), { ...opts, especificacion, anterior: base })).ok).toBe(true);
    // Sin anotarlo como retirado, sí falla.
    expect(prueba5(validarEscala(parsearEscala(movido), { ...opts, anterior: base })).detalle).toEqual([
      "1.1.O2 estaba en la 9.9.9 y desapareció.",
    ]);
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

describe("la escala de juguete con una edición", () => {
  const opts = { especificacion: MINI_ESPECIFICACION, manual: MINI_MANUAL };
  const con = (cambio: (s: string) => string) => validarEscala(parsearEscala(cambio(MINI_ESCALA_CON_EDICION)), opts);
  const prueba8 = (r: ResultadoDePrueba[]) => r.find((x) => x.nombre.startsWith("8"))!;

  it("pasa todas, y la prueba 8 solo corre si hay ediciones", () => {
    const r = con((s) => s);
    expect(fallidas(r)).toEqual([]);
    expect(r.map((x) => x.nombre)).toContain("8 · Ediciones coherentes");
    expect(validarEscala(parsearEscala(MINI_ESCALA), opts).map((x) => x.nombre)).not.toContain("8 · Ediciones coherentes");
  });

  it("8 · cobertura: un criterio de la matriz del que la edición no dice nada", () => {
    // Llega un criterio nuevo a la matriz, en una dimensión que la edición ya adaptó.
    const r = con((s) =>
      s.replace("- La distribución se autoajusta. `[1.2.O1 · comprobable]`", "- La distribución se autoajusta. `[1.2.O1 · comprobable]`\n- Aprende sola. `[1.2.O2 · comprobable]`"),
    );
    expect(fallidas(r)).toEqual(["8 · Ediciones coherentes"]);
    expect(prueba8(r).detalle).toEqual([
      "[Tiendas de juguete] 1.2.O2 es de la matriz y la edición no dice nada de él: se reescribe, va en «No aplican» o va en «Se leen igual».",
    ]);
  });

  it("8 · cobertura: una dimensión de la que la edición solo cambia el nombre y la pregunta no tiene que cubrir nada", () => {
    const soloTextos = MINI_EDICION.replace(/\*\*Deficiente\.\*\*\n[\s\S]*$/, "");
    expect(soloTextos).toContain("*Costo de quedarse:* Los carritos se pierden.");
    expect(fallidas(validarEscala(parsearEscala(MINI_ESCALA + soloTextos), opts))).toEqual([]);
  });

  it("8 · un criterio en dos lugares", () => {
    const r = con((s) => s.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F1`."));
    expect(prueba8(r).detalle).toEqual(["[Tiendas de juguete] 1.2.F1 está reescrito y «No aplican»: va en un solo lugar."]);
  });

  it("8 · reescribir con el mismo texto de la matriz sobra", () => {
    const r = con((s) => s.replace("- Nadie mira los carritos. `[1.2.D1]`", "- Nadie ayuda. `[1.2.D1]`"));
    expect(prueba8(r).detalle).toEqual(["[Tiendas de juguete] 1.2.D1 está reescrito con el mismo texto de la escala general: sobra."]);
  });

  it("8 · reescribir no puede cambiar una palabra con valor fijo", () => {
    const r = con((s) => s.replace("- Nadie mira los carritos. `[1.2.D1]`", "- La mayoría de los carritos no los mira nadie. `[1.2.D1]`"));
    expect(prueba8(r).ok).toBe(false);
    expect(prueba8(r).detalle[0]).toMatch(/^\[Tiendas de juguete\] 1\.2\.D1 cambia las palabras con valor fijo/);
  });

  it("8 · una dimensión de base no cambia de nombre", () => {
    const r = con((s) => s + "\n#### 1.1 Rutinas de la tienda\n\n¿La tienda sigue sin la persona clave?\n");
    expect(prueba8(r).detalle).toEqual([
      "[Tiendas de juguete] 1.1 es de base operativa y se llama «Procesos y Rutinas» en toda la escala; la edición la llama «Rutinas de la tienda».",
    ]);
  });

  it("8 · sin perfil habitual", () => {
    const r = con((s) => s.replace("*Perfil habitual:* transaccional · recompra.\n", ""));
    expect(prueba8(r).detalle).toEqual(["[Tiendas de juguete] no dice su «Perfil habitual»."]);
  });

  it("8 · una edición no saca una dimensión", () => {
    // Saca los dos criterios de decisión de Funcional que aplican con equipo y deja solo el propio, que es de recompra.
    const r = con((s) =>
      s
        .replace("- Cada venta de la tienda entra sola al sistema. `[1.2.F1]`\n", "")
        .replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F101 · comprobable · hábito · recompra]`")
        .replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F1`, `1.2.F2`.")
        .replace("*Se leen igual:* `1.2.F2`, ", "*Se leen igual:* "),
    );
    expect(prueba8(r).detalle).toContain("[Tiendas de juguete] 1.2 deja de aplicar a con equipo/única: una edición no saca una dimensión.");
  });

  it("1 · un nivel que queda vacío SOLO dentro de la edición", () => {
    // Primero sale de «Se leen igual» y después entra a «No aplican» (en ese orden: el segundo reemplazo pisaría al primero).
    const r = con((s) => s.replace(", `1.2.O1`.\n", ".\n").replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.O1`."));
    const vacios = r.find((x) => x.nombre.startsWith("1"))!.detalle;
    expect(vacios).toContain("[Tiendas de juguete] 1.2 O (con equipo/única)");
    expect(vacios.every((v) => v.startsWith("[Tiendas de juguete]"))).toBe(true);
  });

  it("4 · un identificador a la vista en un texto de la edición", () => {
    const r = con((s) => s.replace("Los carritos se pierden.", "Los carritos se pierden, como dice 1.1."));
    expect(fallidas(r)).toEqual(["4 · Sin identificadores a la vista"]);
  });

  it("5 · los criterios propios también son identificadores: no pueden desaparecer", () => {
    const antes = parsearEscala(MINI_ESCALA_CON_EDICION);
    const sin = parsearEscala(MINI_ESCALA_CON_EDICION.replace("- El recordatorio sale cuando toca a cada producto. `[1.2.E101 · comprobable · recompra]`\n", ""));
    const r = validarEscala(sin, { ...opts, anterior: antes });
    expect(r.find((x) => x.nombre.startsWith("5"))!.detalle).toEqual(["1.2.E101 estaba en la 9.9.9 y desapareció."]);
  });

  it("estructura · un criterio propio de riesgo también necesita su mensaje", () => {
    const r = con((s) => s.replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F101 · comprobable · riesgo · hábito]`"));
    expect(fallidas(r)).toContain("Estructura");
  });
});

describe("los requeridos (prueba 9)", () => {
  const opts = { especificacion: MINI_ESPECIFICACION, manual: MINI_MANUAL };
  const prueba9 = (r: ResultadoDePrueba[]) => r.find((x) => x.nombre.startsWith("9"));
  const conEnlace = (texto: string) => texto.replace("`[1.2.F2 · evaluado · venta con equipo]`", "`[1.2.F2 · evaluado · venta con equipo · requiere 1.1.F1]`");

  it("solo corre si algún criterio requiere otro, y pasa con un enlace bien puesto", () => {
    expect(prueba9(validarEscala(parsearEscala(MINI_ESCALA), opts))).toBeUndefined();
    const r = validarEscala(parsearEscala(conEnlace(MINI_ESCALA)), opts);
    expect(prueba9(r)).toMatchObject({ nombre: "9 · Requeridos coherentes", ok: true });
    expect(fallidas(r)).toEqual([]);
  });

  it("9 · un requerido que no existe frena la publicación", () => {
    const r = validarEscala(parsearEscala(MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.F8]`")), opts);
    expect(fallidas(r)).toEqual(["9 · Requeridos coherentes"]);
    expect(prueba9(r)!.detalle).toEqual(["1.2.E1 requiere 1.1.F8, que no existe."]);
  });

  it("9 · lo que ya falla en la escala general no se repite por cada edición", () => {
    const r = validarEscala(parsearEscala(MINI_ESCALA_CON_EDICION.replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.O2]`")), opts);
    expect(prueba9(r)!.detalle).toEqual(["1.2.E1 requiere 1.1.O2, que es de un nivel posterior al suyo."]);
  });

  it("9 · en una edición: el enlace a un criterio que ella sacó no es una falla; que lo requiera un criterio PROPIO, sí", () => {
    const saca = (s: string) => s.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F2`.").replace("*Se leen igual:* `1.2.F2`, ", "*Se leen igual:* ");
    // De la matriz hacia el que la edición sacó: se cae solo.
    const general = MINI_ESCALA.replace("`[1.1.E2 · declarado · hábito]`", "`[1.1.E2 · declarado · hábito · requiere 1.2.F2]`");
    expect(fallidas(validarEscala(parsearEscala(general + saca(MINI_EDICION)), opts))).toEqual([]);
    // Desde un criterio propio: eso lo escribió la edición.
    const propio = saca(MINI_EDICION).replace("`[1.2.E101 · comprobable · recompra]`", "`[1.2.E101 · comprobable · recompra · requiere 1.2.F2]`");
    const r = validarEscala(parsearEscala(MINI_ESCALA + propio), opts);
    expect(fallidas(r)).toEqual(["9 · Requeridos coherentes"]);
    expect(prueba9(r)!.detalle).toEqual(["[Tiendas de juguete] 1.2.E101 requiere 1.2.F2, que en esta edición no existe."]);
  });

  it("9 · una falla que solo aparece dentro de la edición dice en cuál", () => {
    // El propio 1.2.F101 (Funcional) requiere 1.2.E101 (Eficiente): un nivel posterior.
    const edicion = MINI_EDICION.replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F101 · comprobable · hábito · requiere 1.2.E101]`");
    const r = validarEscala(parsearEscala(MINI_ESCALA + edicion), opts);
    expect(prueba9(r)!.detalle).toEqual(["[Tiendas de juguete] 1.2.F101 requiere 1.2.E101, que es de un nivel posterior al suyo."]);
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

  it("con ediciones: qué cambia leído con cada una, y lo que la edición dice con sus palabras y quedó viejo", () => {
    const a = parsearEscala(MINI_ESCALA_CON_EDICION);
    // Cambia el texto GENERAL de un criterio que la edición reescribe (sin tocar el suyo): quedó viejo.
    // Y cambia el de uno que la edición deja como está: leído con la edición, también cambia.
    const b = parsearEscala(
      MINI_ESCALA_CON_EDICION.replace("- Las ventas sin vendedor entran solas al sistema.", "- Las ventas sin vendedor entran solas y completas al sistema.").replace(
        "- El contacto está orquestado en cadencias.",
        "- El contacto está orquestado en cadencias fijas.",
      ),
    );
    const c = compararEscalas(a, b);
    expect(c.cambiados.map((x) => x.id)).toEqual(["1.2.F1", "1.2.E1"]);
    expect(c.ediciones).toHaveLength(1);
    expect(c.ediciones[0]).toMatchObject({ slug: "tiendas", nueva: false, viejos: ["1.2.F1"] });
    expect(c.ediciones[0].cambiados.map((x) => x.id)).toEqual(["1.2.E1"]);
    expect(c.edicionesRetiradas).toEqual([]);
  });

  it("una edición que llega en esta versión es nueva y no tiene nada viejo; una que se va, se dice", () => {
    const sin = parsearEscala(MINI_ESCALA);
    const con = parsearEscala(MINI_ESCALA_CON_EDICION);
    const c = compararEscalas(sin, con);
    expect(c.nuevos).toEqual([]);
    expect(c.ediciones[0]).toMatchObject({ slug: "tiendas", nueva: true, cambiados: [], viejos: [] });
    expect(c.ediciones[0].propiosDeLaEdicion).toBeGreaterThan(0);
    expect(compararEscalas(con, sin).edicionesRetiradas).toEqual(["Tiendas de juguete"]);
  });

  it("los requeridos que cambian se dicen aparte: no son un cambio de texto", () => {
    const a = parsearEscala(MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.F1]`"));
    const b = parsearEscala(
      MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.F1, 1.1.E2]`").replace(
        "`[1.2.F2 · evaluado · venta con equipo]`",
        "`[1.2.F2 · evaluado · venta con equipo · requiere 1.1.F1]`",
      ),
    );
    const c = compararEscalas(a, b);
    expect(c.cambiados).toEqual([]);
    expect(c.requeridos).toEqual([
      { id: "1.2.F2", antes: [], despues: ["1.1.F1"] },
      { id: "1.2.E1", antes: ["1.1.F1"], despues: ["1.1.F1", "1.1.E2"] },
    ]);
    expect(compararEscalas(a, a).requeridos).toEqual([]);
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
