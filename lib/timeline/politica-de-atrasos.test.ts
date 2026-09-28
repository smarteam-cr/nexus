/**
 * lib/timeline/politica-de-atrasos.test.ts — M5 (spec del replanteo §6.2, 2026-09-27): LA POLÍTICA DE LO ATRASADO SE
 * DECIDE EN UN SOLO LUGAR.
 *
 * Correr: `npx vitest run lib/timeline/politica-de-atrasos.test.ts --project unit`.
 *
 * El modo de falla que caza: alguien decide la política en otro lado (lee el interruptor desde la pantalla o el mensaje,
 * o compara con un nombre de opción suelto). Funcionaría —el valor de hoy es el mismo—, pero el día que Elías voltee el
 * interruptor, una propuesta abierta diría lo que no calculó o una parte del sistema seguiría con la opción vieja (D11).
 * Por eso: `POLITICA_DE_ATRASOS` lo importan solo el módulo y `marcarTareasEnCurso` (borrador-del-detalle.ts), y los
 * nombres de las opciones solo se escriben en el módulo (los demás usan sus predicados y sus tablas).
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  arrancaTodoHoy,
  esperaAlPlan,
  fasesVencidasDeLosTextos,
  leerPolitica,
  POLITICA_DE_ATRASOS,
  porCadaFasesVencidas,
  porCadaPendientesDelPasado,
  soloAvisaLasFasesVencidas,
  traeLoPendienteAHoy,
} from "./politica-de-atrasos";

const RAIZ = process.cwd();
const MODULO = "lib/timeline/politica-de-atrasos.ts";
const UNICO_LECTOR = "lib/timeline/borrador-del-detalle.ts";

/** Los fuentes del repo, sin tests (ni node_modules, ni builds). */
function fuentes(): string[] {
  const out: string[] = [];
  const saltar = new Set(["node_modules", ".git", "dist", "backups"]);
  const caminar = (dir: string) => {
    if (!fs.existsSync(path.join(RAIZ, dir))) return;
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (!saltar.has(e.name) && !e.name.startsWith(".next")) caminar(rel);
      } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
        out.push(rel);
      }
    }
  };
  for (const base of ["lib", "app", "components", "hooks", "scripts"]) caminar(base);
  return out;
}

/** El fuente sin comentarios y con `\n`: MENCIONAR una opción en una explicación no es decidirla. */
function soloCodigo(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const LEE_EL_INTERRUPTOR = /\bPOLITICA_DE_ATRASOS\b/;
const NOMBRA_UNA_OPCION = /(["'`])(en-el-orden-del-plan|todo-desde-hoy|traer-a-hoy)\1/;

describe("⭐ M5 · la política de lo atrasado se decide en un solo lugar", () => {
  const archivos = fuentes();

  it("la guarda mira el árbol de verdad (sin un escaneo vacío)", () => {
    /* Sin este piso, un `fuentes()` roto dejaría las dos guardas de abajo verdes sobre una lista vacía. */
    expect(archivos.length, "el escaneo no encontró fuentes").toBeGreaterThan(500);
    expect(archivos).toContain(MODULO);
    expect(archivos).toContain(UNICO_LECTOR);
    expect(LEE_EL_INTERRUPTOR.test(soloCodigo(UNICO_LECTOR)), "el único lector ya no lee el interruptor").toBe(true);
    expect(NOMBRA_UNA_OPCION.test(soloCodigo(MODULO)), "el módulo ya no nombra sus opciones").toBe(true);
  });

  it("⛔ `POLITICA_DE_ATRASOS` lo leen solo el módulo y `marcarTareasEnCurso` (borrador-del-detalle.ts)", () => {
    /* La edición que la pone en rojo: importar el interruptor en el mensaje, la vista, la reprogramación o una ruta (si
       se voltea el valor, una propuesta abierta diría lo que no calculó). */
    const culpables = archivos.filter((f) => f !== MODULO && f !== UNICO_LECTOR && LEE_EL_INTERRUPTOR.test(soloCodigo(f)));
    expect(culpables, "leen el interruptor fuera de `marcarTareasEnCurso`: lean `borrador.hoy.politica`").toEqual([]);
  });

  it("⛔ nadie fuera del módulo escribe «en-el-orden-del-plan», «todo-desde-hoy» ni «traer-a-hoy»", () => {
    /* La edición que la pone en rojo: decidir la política en otro lugar (`politica.fasesVencidas === "todo-desde-hoy"`,
       una tabla de textos con una opción de menos, o `pendientesDelPasado: "traer-a-hoy"` fijo en una ruta). Se pregunta
       con los predicados y se arma la tabla con `porCadaFasesVencidas` / `porCadaPendientesDelPasado`. */
    const culpables = archivos.filter((f) => f !== MODULO && NOMBRA_UNA_OPCION.test(soloCodigo(f)));
    expect(culpables, "deciden la política fuera de politica-de-atrasos.ts: usen sus predicados o sus tablas").toEqual([]);
  });
});

describe("M5 · las opciones del interruptor", () => {
  it("⭐ lo vigente: en el orden del plan y «solo avisar» lo pendiente del pasado (decisión de Elías, 2026-09-27)", () => {
    /* La edición que la pone en rojo: dejar «traer-a-hoy» prendido (Elías decidió «solo avisar»; la otra opción queda
       hecha y apagada) o cambiar el orden de lo atrasado sin decidirlo. */
    expect(POLITICA_DE_ATRASOS).toEqual({
      fasesVencidas: "en-el-orden-del-plan",
      pendientesDelPasado: "avisar",
      casiTerminada: { maxAbiertas: 2, minHecho: 0.7 },
    });
  });

  it("⭐ `leerPolitica` conoce «traer-a-hoy» (una propuesta calculada con ella se lee) y rechaza lo que no existe", () => {
    /* La edición que la pone en rojo: no sumar «traer-a-hoy» a lo que se valida (la propuesta calculada con ella se leía
       sin reloj: la línea 5 volvía a «Atrasadas» y las traídas perdían su porqué). */
    for (const pendientesDelPasado of ["avisar", "traer-a-hoy"] as const) {
      const p = { ...POLITICA_DE_ATRASOS, pendientesDelPasado };
      expect(leerPolitica(JSON.parse(JSON.stringify(p))), pendientesDelPasado).toEqual(p);
    }
    expect(leerPolitica({ ...POLITICA_DE_ATRASOS, pendientesDelPasado: "traer-a-mañana" })).toBeNull();
    expect(leerPolitica({ ...POLITICA_DE_ATRASOS, fasesVencidas: "otra" })).toBeNull();
  });

  it("⭐ los predicados y las tablas cubren cada opción, y sin reloj los textos son los del orden del plan", () => {
    /* Las ediciones que la ponen en rojo: un predicado que mira el campo equivocado, o una tabla que cruza dos opciones. */
    const con = (o: Partial<typeof POLITICA_DE_ATRASOS>) => ({ ...POLITICA_DE_ATRASOS, ...o });
    expect([esperaAlPlan, arrancaTodoHoy, soloAvisaLasFasesVencidas].map((f) => f(con({ fasesVencidas: "en-el-orden-del-plan" })))).toEqual([true, false, false]);
    expect([esperaAlPlan, arrancaTodoHoy, soloAvisaLasFasesVencidas].map((f) => f(con({ fasesVencidas: "todo-desde-hoy" })))).toEqual([false, true, false]);
    expect([esperaAlPlan, arrancaTodoHoy, soloAvisaLasFasesVencidas].map((f) => f(con({ fasesVencidas: "avisar" })))).toEqual([false, false, true]);
    expect(traeLoPendienteAHoy(con({ pendientesDelPasado: "traer-a-hoy" }))).toBe(true);
    expect(traeLoPendienteAHoy(con({ pendientesDelPasado: "avisar" }))).toBe(false);
    expect(porCadaFasesVencidas({ enElOrdenDelPlan: 1, todoDesdeHoy: 2, avisar: 3 })).toEqual({
      "en-el-orden-del-plan": 1,
      "todo-desde-hoy": 2,
      avisar: 3,
    });
    expect(porCadaPendientesDelPasado({ avisar: 1, traerAHoy: 2 })).toEqual({ avisar: 1, "traer-a-hoy": 2 });
    expect(fasesVencidasDeLosTextos(null)).toBe("en-el-orden-del-plan");
    expect(fasesVencidasDeLosTextos(con({ fasesVencidas: "todo-desde-hoy" }))).toBe("todo-desde-hoy");
  });
});
