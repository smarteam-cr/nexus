import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/agents/quien-la-lanzo.test.ts — UNA CORRIDA QUE NADIE SABE QUE TERMINÓ.
 *
 * ── EL DEFECTO, MEDIDO ───────────────────────────────────────────────────────
 * `AgentRun.triggeredByEmail` es lo único que hace que el centro de corridas avise a quien
 * apretó el botón. Sin esa columna, `/api/agent-runs` marca la corrida como `mine: false`, el
 * aviso nunca aparece, y el resultado queda esperando a que alguien se acuerde de volver a mirar
 * — sobre agentes que tardan de 30 s a varios minutos.
 *
 * Es un fallo perfectamente silencioso: nada tira, la corrida termina bien, el documento queda
 * guardado. Lo único que pasa es que la persona se fue a otra pantalla y nunca se entera. Al
 * censar el repo el 2026-08-16 aparecieron **cuatro** puertas humanas así (el resumen de cuenta,
 * el assist del Business Case, el procesamiento de una sesión y el assist de perfiles de puesto).
 *
 * ── POR QUÉ UN CENSO Y NO UN TEST POR RUTA ───────────────────────────────────
 * El modo de falla es de OMISIÓN: nadie rompe esto, simplemente se escribe una ruta nueva sin
 * acordarse. Un test por ruta protege las que ya existen y deja pasar la próxima, que es
 * exactamente la que va a fallar.
 */

const RAIZ = process.cwd();
const API = path.join(RAIZ, "app", "api");

/** Rutas de `app/api/**` que crean una corrida de agente. */
function rutasQueCreanCorridas(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rutasQueCreanCorridas(p, acc);
    else if (e.name === "route.ts") {
      const src = fs.readFileSync(p, "utf8");
      if (/\bagentRun\.(create|upsert)\b/.test(src)) {
        acc.push(path.relative(RAIZ, p).split(path.sep).join("/"));
      }
    }
  }
  return acc;
}

/**
 * Puertas de SISTEMA: crean corridas sin humano detrás, así que `triggeredByEmail` en null es lo
 * CORRECTO — estampar un email inventado sería peor que no avisar. Cada excepción con su motivo;
 * si esta lista crece sin uno, el censo dejó de proteger.
 */
const DE_SISTEMA: Array<{ ruta: string; porque: string }> = [];

describe("⭐ toda corrida disparada por una persona dice QUIÉN la lanzó", () => {
  const rutas = rutasQueCreanCorridas(API);

  it("hay rutas que censar (el censo no se quedó vacío por un cambio de estructura)", () => {
    /* Si `app/api` se moviera de lugar, el escaneo devolvería [] y el archivo entero pasaría en
       verde sin mirar nada. Es la forma clásica en que un censo se vuelve decorativo. */
    expect(rutas.length).toBeGreaterThan(4);
  });

  it("ninguna crea la corrida sin estampar el autor", () => {
    const mudas = rutas
      .filter((r) => !DE_SISTEMA.some((s) => s.ruta === r))
      .filter((r) => !fs.readFileSync(path.join(RAIZ, r), "utf8").includes("triggeredByEmail"));
    expect(
      mudas,
      "Estas rutas crean una corrida de agente y no estampan `triggeredByEmail`. La persona que " +
        "apretó el botón no va a recibir el aviso cuando termine, y nada más va a fallar. " +
        "Agregá `triggeredByEmail: await triggeredByEmail()` al `data`, o —si de verdad es una " +
        "puerta de sistema— declarala en DE_SISTEMA con su motivo:\n" +
        mudas.join("\n"),
    ).toEqual([]);
  });

  it("las excepciones declaradas existen y traen motivo", () => {
    for (const s of DE_SISTEMA) {
      expect(fs.existsSync(path.join(RAIZ, s.ruta)), `${s.ruta} ya no existe`).toBe(true);
      expect(s.porque.length, `${s.ruta}: excepción sin motivo escrito`).toBeGreaterThan(20);
    }
  });
});

describe("el resumen de cuenta lo pasa hasta el `create`", () => {
  /* Este no vive en una ruta: la ruta llama a `runAccountBrief`, así que el censo de arriba no lo
     alcanza. Es el caso que originó todo — un agente de ~30 s cuyo botón nunca avisaba. */
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("la ruta se lo pasa al runner", () => {
    expect(leer("app/api/cs/account-brief/[clientId]/route.ts")).toContain(
      "triggeredByEmail: await triggeredByEmail()",
    );
  });

  it("⚠ y el runner lo escribe en el `create`, no solo lo recibe", () => {
    /* La trampa: aceptar el parámetro y no usarlo. `tsc` no dice nada (el opcional se ignora
       sin error) y la ruta se ve arreglada desde afuera. */
    const src = leer("lib/cs/account-brief.ts");
    expect(src, "el runner recibe el autor y no lo guarda").toContain(
      "triggeredByEmail: opts?.triggeredByEmail ?? null",
    );
  });

  it("el script NO lo estampa: ahí no hay humano", () => {
    /* Correr el brief desde una terminal no tiene a quién avisarle, y `null` es la respuesta
       honesta. Que el script quede afuera es la prueba de que el arreglo distingue de verdad
       entre una persona y un proceso, en vez de estampar algo siempre. */
    expect(leer("scripts/run-account-brief.ts")).not.toContain("triggeredByEmail");
  });
});
