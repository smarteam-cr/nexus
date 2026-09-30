/**
 * lib/escala/documento/validar.test.ts — las pruebas de publicación pasan con lo bueno y frenan
 * cada defecto que dicen frenar.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala, RUTA_DE_LAS_PRUEBAS } from "./archivos";
import { compararEscalas, diferenciaPorPalabras } from "./diferencias";
import { MINI_EDICION, MINI_ESCALA, MINI_ESCALA_CON_EDICION, MINI_ESPECIFICACION, MINI_MANUAL } from "./mini-escala.fixture";
import { leerRetirados, parsearEscala } from "./parsear";
import { ErrorDeFormato } from "./tipos";
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

  it("estructura · una palabra con valor fijo que el lector no entendió frena la publicación (si no, dejaría de cuidar el umbral)", () => {
    // Con la prosa intacta, cambiar «la mayoría» al reescribir falla la 8. Si la oración que le da su
    // valor se reescribe de una forma que el lector no entiende, la palabra dejaría de ser fija y esa
    // falla desaparecería en silencio: por eso la propia prosa frena.
    const prosa = (s: string) => s.replace("«La mayoría» quiere decir al menos 80%.", "«La mayoría» significa al menos 80%.");
    const r = con(prosa);
    expect(fallidas(r)).toEqual(["Estructura"]);
    expect(r[0].detalle).toEqual([
      "«La mayoría» está entre comillas en «Cómo se leen los criterios» y no se le encuentra su valor: la oración tiene que decir «quiere decir …», como las demás.",
    ]);
  });

  it("4 · un identificador a la vista en el vistazo del área de una edición", () => {
    const r = con((s) => s.replace("**Funcional.** La tienda vende sola.", "**Funcional.** La tienda vende sola, como dice 1.2."));
    expect(fallidas(r)).toEqual(["4 · Sin identificadores a la vista"]);
    expect(r.find((x) => x.nombre.startsWith("4"))!.detalle[0]).toMatch(/^\[Tiendas de juguete\] vistazo de F del área 1/);
  });

  it("8 · la misma palabra con valor fijo en plural no es otro umbral; que falte, sí", () => {
    const general = (s: string) => s.replace("- Las ventas sin vendedor entran solas al sistema.", "- La cadencia de contacto se sostiene.");
    const plural = con((s) => general(s).replace("- Cada venta de la tienda entra sola al sistema. `[1.2.F1]`", "- Las cadencias de la tienda se sostienen. `[1.2.F1]`"));
    expect(fallidas(plural)).toEqual([]);
    const sinLaPalabra = con((s) => general(s).replace("- Cada venta de la tienda entra sola al sistema. `[1.2.F1]`", "- Las cadencias de la tienda se cumplen. `[1.2.F1]`"));
    expect(prueba8(sinLaPalabra).detalle[0]).toMatch(/^\[Tiendas de juguete\] 1\.2\.F1 cambia las palabras con valor fijo .*la matriz: «se sostiene»; la edición: «ninguna»/);
  });

  it("8 · la matriz no usa los números de una edición", () => {
    const r = con((s) => s.replace("- El sistema señala desviaciones. `[1.1.O2 · comprobable]`", "- El sistema señala desviaciones. `[1.1.O2 · comprobable]`\n- Otro. `[1.1.O101 · comprobable]`"));
    expect(prueba8(r).detalle).toEqual(["1.1.O101 está en la matriz con un número de edición: la matriz numera por debajo de 100."]);
  });

  it("8 · cada edición tiene su bloque, y una edición que no trae ninguna área no cambia nada", () => {
    const otra = MINI_EDICION.split("## Edición — Tiendas de juguete")[1].replace("*Clave:* tiendas", "*Clave:* colegios").replace("1.2.F101", "1.2.F102").replace("1.2.E101", "1.2.E102");
    const mismoBloque = con((s) => s + "\n## Edición — Colegios de juguete" + otra);
    expect(prueba8(mismoBloque).detalle).toEqual(["[Colegios de juguete] numera sus criterios propios desde el 101, igual que «Tiendas de juguete»: cada edición tiene su bloque."]);
    const vacia = con((s) => s + "\n## Edición — Vacía\n\nPara nadie.\n\n*Clave:* vacia\n\n*Perfil habitual:* mixta · única.\n");
    expect(prueba8(vacia).detalle).toEqual(["[Vacía] no cambia nada: no trae ninguna área."]);
  });
});

// ── La prueba 8 en `pruebas_escala.py` ───────────────────────────────────────
// La especificación dice qué mira la prueba 8, y el script de Python la corre donde Nexus no está (en
// otro proyecto que use la escala, solo él protege). Una revisión encontró diez defectos que frenaba
// Nexus y el Python dejaba pasar. Acá se corre la función DEL PROPIO ARCHIVO sobre los mismos casos de
// juguete: lo que frena uno, lo frena el otro. Sin Python en la máquina, esta parte se salta.

const PYTHON = ["python3", "python"].find((p) => {
  try {
    return spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
});

/** Toma las funciones de lectura y la prueba 8 del archivo de Python y las corre sobre cada texto que llega por la entrada. */
const PUENTE_DE_LA_PRUEBA_8 = `
import ast, json, re, sys
from itertools import product
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
src = open(sys.argv[1], encoding="utf-8").read()
NOMBRES = ("PAT", "PERFILES", "REESCRITO", "ID", "PARTE_DE_EDICIONES", "LETRA")
partes = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in NOMBRES for t in n.targets))]
ns = {"re": re, "product": product}
exec(compile(ast.Module(body=partes, type_ignores=[]), "pruebas_escala.py", "exec"), ns)
salida = {}
for nombre, texto in json.load(sys.stdin).items():
    s, matriz, crit = ns["leer_texto"](ns["limpiar"](texto))
    salida[nombre] = ns["incoherencias_de_ediciones"](s, matriz, crit, ns["leer_ediciones"](s))
print(json.dumps(salida, ensure_ascii=False))
`;

describe.skipIf(!PYTHON)("la prueba 8 frena lo mismo en Nexus y en pruebas_escala.py", () => {
  const opts = { especificacion: MINI_ESPECIFICACION, manual: MINI_MANUAL };
  const otraEdicion = MINI_EDICION.split("## Edición — Tiendas de juguete")[1].replace("*Clave:* tiendas", "*Clave:* colegios").replace("1.2.F101", "1.2.F102").replace("1.2.E101", "1.2.E102");
  const bueno = MINI_ESCALA_CON_EDICION;
  const casos: Record<string, string> = {
    "bien escrita": bueno,
    "la misma palabra con valor fijo, en plural": bueno
      .replace("- Las ventas sin vendedor entran solas al sistema.", "- La cadencia de contacto se sostiene.")
      .replace("- Cada venta de la tienda entra sola al sistema. `[1.2.F1]`", "- Las cadencias de la tienda se sostienen. `[1.2.F1]`"),
    "un espacio suelto al final de un criterio": bueno.replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F101 · comprobable · hábito]`  "),
    cobertura: bueno.replace("- La distribución se autoajusta. `[1.2.O1 · comprobable]`", "- La distribución se autoajusta. `[1.2.O1 · comprobable]`\n- Aprende sola. `[1.2.O2 · comprobable]`"),
    "reescrito y en «No aplican»": bueno.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F1`."),
    "reescrito y en «Se leen igual»": bueno.replace("*Se leen igual:* `1.2.F2`", "*Se leen igual:* `1.2.F1`, `1.2.F2`"),
    "en «No aplican» y en «Se leen igual»": bueno.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.E1`."),
    "el mismo texto de la matriz": bueno.replace("- Nadie mira los carritos. `[1.2.D1]`", "- Nadie ayuda. `[1.2.D1]`"),
    "cambia una palabra con valor fijo": bueno.replace("- Nadie mira los carritos. `[1.2.D1]`", "- La mayoría de los carritos no los mira nadie. `[1.2.D1]`"),
    "una dimensión de base con otro nombre": bueno + "\n#### 1.1 Rutinas de la tienda\n\n¿La tienda sigue sin la persona clave?\n",
    "sin perfil habitual": bueno.replace("*Perfil habitual:* transaccional · recompra.\n", ""),
    "saca una dimensión": bueno
      .replace("- Cada venta de la tienda entra sola al sistema. `[1.2.F1]`\n", "")
      .replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F101 · comprobable · hábito · recompra]`")
      .replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F1`, `1.2.F2`.")
      .replace("*Se leen igual:* `1.2.F2`, ", "*Se leen igual:* "),
    "dos ediciones con el mismo bloque": bueno + "\n## Edición — Colegios de juguete" + otraEdicion,
    "un criterio propio fuera de su bloque": bueno.replace("1.2.E101", "1.2.E250"),
    "la matriz con un número de edición": bueno.replace("- El sistema señala desviaciones. `[1.1.O2 · comprobable]`", "- El sistema señala desviaciones. `[1.1.O2 · comprobable]`\n- Otro. `[1.1.O101 · comprobable]`"),
    "el título de la edición con guion": bueno.replace("## Edición — Tiendas de juguete", "## Edición - Tiendas de juguete"),
    "el título de la parte con guion": bueno.replace("# Parte 5 — Ediciones por industria", "# Parte 5 - Ediciones por industria"),
    "una palabra con valor fijo sin su valor": bueno.replace("«La mayoría» quiere decir al menos 80%.", "«La mayoría» significa al menos 80%."),
  };
  const PASAN = ["bien escrita", "la misma palabra con valor fijo, en plural", "un espacio suelto al final de un criterio"];

  const r = spawnSync(PYTHON!, ["-c", PUENTE_DE_LA_PRUEBA_8, RUTA_DE_LAS_PRUEBAS], { encoding: "utf8", input: JSON.stringify(casos) });
  const python = JSON.parse(r.stdout || "{}") as Record<string, string[]>;

  /** Lo que frena Nexus: el lector (no lo lee) o la validación (la 8, o la estructura cuando es la prosa). */
  const nexusLoFrena = (texto: string): boolean => {
    try {
      return validarEscala(parsearEscala(texto), opts).some((x) => !x.ok && (x.nombre.startsWith("8") || x.nombre === "Estructura"));
    } catch (e) {
      if (e instanceof ErrorDeFormato) return true;
      throw e;
    }
  };

  it("el Python corrió sobre todos los casos", () => {
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(python).sort()).toEqual(Object.keys(casos).sort());
  });

  it.each(Object.keys(casos))("%s", (nombre) => {
    const debePasar = PASAN.includes(nombre);
    expect(nexusLoFrena(casos[nombre]), "Nexus").toBe(!debePasar);
    expect((python[nombre] ?? []).length > 0, `pruebas_escala.py: ${JSON.stringify(python[nombre])}`).toBe(!debePasar);
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
    expect(c.ediciones[0]).toMatchObject({ slug: "tiendas", nueva: false, viejos: ["1.2.F1"], nuevos: [], retirados: [], requeridos: [] });
    expect(c.ediciones[0].cambiados.map((x) => x.id)).toEqual(["1.2.E1"]);
    expect(c.edicionesRetiradas).toEqual([]);
  });

  it("con ediciones: lo que entra, lo que sale y los requeridos que cambian SOLO en la edición", () => {
    const a = parsearEscala(MINI_ESCALA_CON_EDICION);
    const b = parsearEscala(
      // Entra un criterio propio (con su requerido), sale otro, y uno propio que ya estaba cambia lo que requiere.
      MINI_ESCALA_CON_EDICION.replace(
        "- El carrito abandonado recibe un recordatorio. `[1.2.F101 · comprobable · hábito]`",
        "- El carrito abandonado recibe un recordatorio. `[1.2.F101 · comprobable · hábito · requiere 1.1.F1]`\n- Quien compró recibe una invitación a volver. `[1.2.F102 · comprobable · requiere 1.1.F1]`",
      )
        .replace("- El recordatorio sale cuando toca a cada producto. `[1.2.E101 · comprobable · recompra]`\n", "")
        // Y entra uno a la MATRIZ (la edición lo deja como está): ese es de la versión, no de la edición.
        .replace("- La distribución se autoajusta. `[1.2.O1 · comprobable]`", "- La distribución se autoajusta. `[1.2.O1 · comprobable]`\n- Aprende sola. `[1.2.O2 · comprobable]`")
        .replace(", `1.2.O1`.\n", ", `1.2.O1`, `1.2.O2`.\n"),
    );
    const c = compararEscalas(a, b);
    expect(c.nuevos).toEqual(["1.2.O2"]);
    expect(c.ediciones[0]).toMatchObject({
      nuevos: ["1.2.F102"],
      retirados: ["1.2.E101"],
      requeridos: [{ id: "1.2.F101", antes: [], despues: ["1.1.F1"] }],
    });
  });

  it("lo viejo se mira PARTE POR PARTE: un nivel es descripción y resultado, y la edición puede decir uno solo", () => {
    // La edición dice con sus palabras solo el RESULTADO de Eficiente; la descripción la hereda.
    const conResultado = MINI_ESCALA_CON_EDICION.replace("**Eficiente.**\n\n- El recordatorio sale", "**Eficiente.**\n\n*Resultado:* El recordatorio llega solo.\n\n- El recordatorio sale");
    const a = parsearEscala(conResultado);
    // Cambia el resultado general: el de la edición quedó viejo.
    const soloResultado = compararEscalas(a, parsearEscala(conResultado.replace("*Resultado:* Esfuerzo coordinado.", "*Resultado:* Esfuerzo coordinado y medido.")));
    expect(soloResultado.ediciones[0].viejos).toEqual(["1.2.E"]);
    // Cambian el resultado Y la descripción generales en la misma versión. Leído con la edición el
    // nivel «cambia» (hereda la descripción nueva), y aun así su resultado quedó viejo: antes esto
    // pasaba sin aviso y la publicación no se frenaba.
    const losDos = compararEscalas(
      a,
      parsearEscala(conResultado.replace("*Resultado:* Esfuerzo coordinado.", "*Resultado:* Esfuerzo coordinado y medido.").replace("**Eficiente.** Multicanal.", "**Eficiente.** Multicanal y medido.")),
    );
    expect(losDos.ediciones[0].cambiados.map((x) => x.id)).toContain("1.2.E");
    expect(losDos.ediciones[0].viejos).toEqual(["1.2.E"]);
    // Si solo cambia lo que la edición hereda, nada suyo quedó viejo.
    const soloLoHeredado = compararEscalas(a, parsearEscala(conResultado.replace("**Eficiente.** Multicanal.", "**Eficiente.** Multicanal y medido.")));
    expect(soloLoHeredado.ediciones[0].viejos).toEqual([]);
  });

  it("lo viejo también mira la dimensión (pregunta, descripción, costo) y el área (descripción y vistazo)", () => {
    const a = parsearEscala(MINI_ESCALA_CON_EDICION);
    const b = parsearEscala(
      MINI_ESCALA_CON_EDICION.replace("*Costo de quedarse:* Los negocios mueren en silencio.", "*Costo de quedarse:* Los negocios mueren sin que nadie lo vea.")
        .replace("Mide Ventas.", "Mide el área de Ventas.")
        .replace("**Ventas.** Base.", "**Ventas.** Base sólida."),
    );
    expect(compararEscalas(a, b).ediciones[0].viejos).toEqual(["área 1", "1.2"]);
    // Cuando la edición actualiza lo suyo en la misma versión, ya no es viejo.
    const alDia = parsearEscala(
      MINI_ESCALA_CON_EDICION.replace("*Costo de quedarse:* Los negocios mueren en silencio.", "*Costo de quedarse:* Los negocios mueren sin que nadie lo vea.").replace(
        "*Costo de quedarse:* Los carritos se pierden.",
        "*Costo de quedarse:* Los carritos se pierden sin que nadie lo vea.",
      ),
    );
    expect(compararEscalas(a, alDia).ediciones[0].viejos).toEqual([]);
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
