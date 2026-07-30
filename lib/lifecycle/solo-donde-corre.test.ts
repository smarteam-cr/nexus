/**
 * lib/lifecycle/solo-donde-corre.test.ts — el ciclo de Customer Success no ESCRIBE sobre
 * proyectos que no lo corren.
 *
 * Dos candados fs-scan contra dos fugas distintas que comparten la misma forma: un camino de
 * Customer Success que no pregunta de qué clase es el proyecto. Las dos son invisibles —
 * ninguna tira error, ninguna loguea, y las dos se auto-explican como "no pasó nada".
 *
 * ── FUGA 1 · una LECTURA que escribe compuertas ──────────────────────────────
 * `getProjectLifecycle` materializa el gate `USO_VALIDADO` cuando el puntaje UUS del CLIENTE
 * supera el umbral. El panel de ciclo de vida se monta para TODO proyecto, así que abrir la
 * pestaña de un desarrollo bastaba para escribirle una compuerta de una metodología que no
 * corre. Y esa fila lo volvía NO BORRABLE por `scripts/limpiar-piezas-basura.ts`, que se
 * niega ante "etapas marcadas".
 *
 * El freno que ya existía (`effective !== "HAND_OFF"`) no alcanza: el clasificador de
 * sesiones incluye a los desarrollos a propósito, así que la sesión de kickoff del cliente
 * puede quedar linkeada al desarrollo y sacarlo de esa etapa.
 *
 * ── FUGA 2 · hambruna del debounce del watchdog ──────────────────────────────
 * El gate de cartera de `runForProjectInner` devuelve ANTES del claim de eventos. El
 * agrupador del debounce consultaba `TimelineEvent` sin filtro de alcance y toma
 * `MAX_PROJECTS_PER_DEBOUNCE_TICK` proyectos por tick. Entonces un desarrollo con cronograma
 * entraba a la cola, ocupaba un slot, se salteaba, y sus eventos nunca se marcaban
 * procesados → volvía en CADA tick, para siempre. Con 5 desarrollos editándose, los
 * proyectos de Customer Success reales se quedaban sin debounce.
 *
 * Las dos se arreglan filtrando en el ORIGEN. Este test congela que el filtro siga ahí.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Igual que en las otras guardas: escáner de izquierda a derecha, no dos `replace`. */
function soloCodigo(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const codigoDe = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("fuga 1 — la lectura del ciclo de vida no escribe compuertas fuera de CS", () => {
  const LOADER = "lib/lifecycle/load.ts";

  it("el efecto secundario vive en una función CON NOMBRE, no suelto en el getter", () => {
    /* Un bloque suelto adentro de un getter no se ve en un diff ni se puede greppear.
       Con nombre propio, cualquiera que lea `getProjectLifecycle` sabe que escribe. */
    expect(
      codigoDe(LOADER),
      "El upsert de USO_VALIDADO tiene que estar en `materializarUsoValidado`, no inline.",
    ).toContain("async function materializarUsoValidado");
  });

  it("no materializa nada si el proyecto NO corre el ciclo de Customer Success", () => {
    const codigo = codigoDe(LOADER);
    const i = codigo.indexOf("async function materializarUsoValidado");
    expect(i, "no encontré la función").toBeGreaterThan(-1);
    // El guard tiene que ser lo PRIMERO: antes de calcular nada y antes del upsert.
    const cuerpo = codigo.slice(i, i + 900);
    const posGuard = cuerpo.indexOf("correCicloDeCs");
    const posUpsert = cuerpo.indexOf("projectStageGate.upsert");
    expect(posGuard, "falta el guard por `correCicloDeCs`").toBeGreaterThan(-1);
    expect(posUpsert, "no encontré el upsert").toBeGreaterThan(-1);
    expect(
      posGuard < posUpsert,
      "el guard de `correCicloDeCs` tiene que estar ANTES del upsert: si no, un desarrollo " +
        "acumula compuertas de la metodología de CS con solo abrir su pestaña, y esa fila lo " +
        "vuelve no borrable por el script de limpieza.",
    ).toBe(true);
  });

  it("`correCicloDeCs` se deriva del registro, no de una heurística local", () => {
    const codigo = codigoDe(LOADER);
    expect(
      codigo,
      "tiene que salir de `projectCapabilities` (lib/projects/kind.ts), que es la tabla de " +
        "decisiones. Una condición escrita a mano acá sería la quinta copia del criterio.",
    ).toContain("projectCapabilities");
    // Y las tres columnas de clase tienen que venir en el select, o `projectCapabilities`
    // recibiría undefined y devolvería la fila legacy para todos.
    for (const col of ["hubspotPipelineId", "proyectoInterno", "hermanoCsProjectId"]) {
      expect(codigo, `el select del loader no trae ${col}`).toContain(`${col}: true`);
    }
  });
});

describe("fuga 2 — el debounce del watchdog no le da slots a quien va a saltear", () => {
  const WATCHDOG = "lib/cs/watchdog.ts";

  it("el agrupador de eventos filtra por alcance de cartera", () => {
    /* Hay TRES `timelineEvent.groupBy` en el archivo (el reaper de claims, el debounce y el
       pre-filtro del sweep). El que importa es el del debounce: es el único que decide QUÉ
       proyectos consumen un slot. Por eso se ancla en la función y no en el primer match —
       una guarda que mira el groupBy equivocado da falsa seguridad. */
    const codigo = codigoDe(WATCHDOG);
    const fn = codigo.indexOf("export async function runWatchdogDebounceTick");
    expect(fn, "no encontré runWatchdogDebounceTick").toBeGreaterThan(-1);
    const i = codigo.indexOf("timelineEvent.groupBy", fn);
    expect(i, "no encontré el agrupador dentro del debounce").toBeGreaterThan(-1);
    const llamada = codigo.slice(i, i + 400);
    expect(
      llamada,
      "El `groupBy` de TimelineEvent tiene que filtrar por PROYECTO DE CARTERA. Sin eso, un " +
        "proyecto que el gate de runForProjectInner va a saltear igual ocupa uno de los " +
        "MAX_PROJECTS_PER_DEBOUNCE_TICK slots, sus eventos nunca se marcan procesados, y " +
        "vuelve en cada tick para siempre — dejando sin debounce a los proyectos de CS.",
    ).toContain("PROYECTO_DE_CARTERA_WHERE");
  });

  it("el gate de runForProjectInner SIGUE estando (defensa en profundidad)", () => {
    /* Filtrar en el origen no reemplaza al gate: la vía MANUAL recibe un projectId de la URL
       y nunca pasa por el agrupador. Los dos tienen que existir. */
    const codigo = codigoDe(WATCHDOG);
    expect(codigo).toContain("no_es_cartera_cs");
    expect(codigo).toContain("proyectoDeCarteraWhere({ id: projectId })");
  });
});
