/**
 * lib/timeline/propuesta-grande.test.ts — LA GUARDA DEL FIXTURE GRANDE (L3 P3b, spec §0.4).
 *
 * Correr: `npx vitest run lib/timeline/propuesta-grande.test.ts --project unit`.
 *
 * `__fixtures__/propuesta-grande.json` sale de un proyecto real, anonimizado FUERA del repo. Esta guarda cuida
 * dos cosas:
 *   1. que no se cuele nada real: se recorre TODO string del JSON y cada uno tiene que ser un valor de enum,
 *      un id o una clave armada con ellos, una fecha, «Tarea NNN», «Nota NNN», «Semana 0» / «Fase A…L», o un
 *      texto de `TEXTOS_SINTETICOS`. La edición que la pone en rojo: pegar un nombre real (una persona, una
 *      marca, un título de tarea) en cualquier campo;
 *   2. que siga siendo el caso que miden las guardas de L3 a L7: los conteos salen del CÓDIGO (`resumir`),
 *      nunca de contar `cambios` a mano (130 casillas, no 131; 73 nuevas, no 74).
 * Y que ningún .ts lo IMPORTE (el «Running TypeScript» de `next build` inferiría su tipo literal).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  borradorDelFixture,
  FASE_QUE_SE_ALARGA,
  FASE_TERMINADA,
  leerFixtureGrande,
  RUTA_DEL_FIXTURE_GRANDE,
  vivoDelFixture,
} from "./__fixtures__/propuesta-grande";
import { resumir } from "./borrador";

/** Todo el texto libre del fixture, escrito a mano (sintético). Nada de acá sale del proyecto real. */
const TEXTOS_SINTETICOS: readonly string[] = [
  "Un proyecto real anonimizado el 2026-09-26 con plan-legible/fixture/anonimizar.cjs (fuera del repo): su cronograma, la propuesta de «Regenerar todo» y la salida del paso 2.",
  "Instrucciones del CSE: «Fase K dura 5 semanas (no 3)».",
  "Instrucciones del CSE: «después de ella se suma una fase nueva «Fase L» de 2 semanas».",
  "Fase A sigue en curso con tres sesiones pendientes; el paso de tareas debe contemplarlas dentro de la fase.",
  "Fase D está casi terminada según las instrucciones; el paso de tareas debe reflejarlo, pero la fase no se toca.",
  "Fase E queda en pausa hasta que se entregue Fase K.",
  "Fase B ya se completó y Fase C se entregó.",
  "Priorizar Fase A antes que Fase E. Fase K depende del cliente.",
  "Priorizar Fase A antes que Fase E. Fase K depende del cliente.\nPRUEBA: «Fase K» dura 5 semanas (no 3) y después se suma una fase nueva «Fase L» de 2 semanas.",
];

/** Los valores de enum que el fixture conserva tal cual. */
const ENUMS = new Set([
  // estados, orígenes y fuentes
  "PENDING",
  "IN_PROGRESS",
  "DONE",
  "SUSPENDED",
  "AGENT",
  "HUMAN",
  "MODIFIED",
  "AI_CONFIRMED",
  "AI_SUGGESTED",
  // dueño y tipo de tarea
  "CLIENTE",
  "SMARTEAM",
  "AMBOS",
  "DEV",
  "SESSION",
  "TASK",
  // tipo de fase
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
  // el borrador
  "borrador-v1",
  "contexto",
  "handoff",
  "regenerar",
  "primera",
  "fase-cambia",
  "fase-nueva",
  "fase-se-va",
  "tarea-nueva",
  "tarea-se-va",
  "tarea-cambia",
  "ancla",
  "orden",
  "durationWeeks",
  "startWeek",
  "sessionCount",
  "activityType",
  "notes",
  "name",
  "titulo",
  "nota",
  // las particularidades
  "ATRASO",
]);

const ID = /^(f\d{2}|t\d{3}|r-paso[12]|n:p\d{2}|p\d{4})$/;
const CLAVE_ARMADA =
  /^(fase:(f\d{2}|n:p\d{2}):(durationWeeks|startWeek|sessionCount|activityType|notes|name|se-va)|tarea:t\d{3}:(se-va|cambia)|t:t\d{3})$/;
const FECHA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
const PERMITIDOS = [ID, CLAVE_ARMADA, FECHA, /^Tarea \d{3}$/, /^Nota \d{3}$/, /^(Semana 0|Fase [A-L])$/];

/** La fuente normalizada (`\r\n` → `\n`) y sin comentarios: un ejemplo en un comentario no es un import. */
const sinComentarios = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

function strings(v: unknown, donde: string, out: Array<{ donde: string; s: string }>): void {
  if (typeof v === "string") out.push({ donde, s: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${donde}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${donde}.${k}`, out);
}

describe("L3 P3b · el fixture grande no trae nada real", () => {
  it("⛔ lista blanca: todo string es un enum, un id, una fecha, «Tarea/Nota NNN», una fase anonimizada o un texto sintético", () => {
    /* La edición que la pone en rojo: pegar un nombre real (una persona, una marca, el título de una tarea de
       verdad) en cualquier campo del JSON. */
    const crudo = JSON.parse(fs.readFileSync(path.join(process.cwd(), RUTA_DEL_FIXTURE_GRANDE), "utf8")) as unknown;
    const todos: Array<{ donde: string; s: string }> = [];
    strings(crudo, "$", todos);
    expect(todos.length).toBeGreaterThan(1000);
    const raros = todos.filter(
      ({ s }) => !ENUMS.has(s) && !TEXTOS_SINTETICOS.includes(s) && !PERMITIDOS.some((re) => re.test(s)),
    );
    expect(raros).toEqual([]);
    // Y sin campos que traerían personas o fechas de edición.
    const claves = JSON.stringify(crudo);
    for (const campo of ["createdAt", "updatedAt", "statusChangedByEmail", "originFingerprint", "@"]) {
      expect(claves, campo).not.toContain(campo);
    }
  });

  it("⛔ ningún .ts importa un JSON de __fixtures__ (se LEE con fs)", () => {
    /* La edición que la pone en rojo: `import fixture from "./__fixtures__/propuesta-grande.json"` en un test
       (o `"./propuesta-grande.json"` desde la misma carpeta): con `resolveJsonModule` el «Running TypeScript» de
       `next build` inferiría el tipo literal de todo el archivo, la etapa que murió por memoria el 26-sep. Cada
       import de un .json se resuelve (relativo o con `@/`) y se mira si cae en una carpeta __fixtures__.
       (lib/cobranza importa sus goldens chicos desde antes: no es de esta guarda.) */
    const importDeJson = /(?:from\s+|import\s*\(\s*)["']([^"']+\.json)["']/g;
    const raiz = process.cwd();
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name.startsWith(".next") || rel === "lib/cobranza") continue;
          recorrer(rel);
        } else if (/\.(ts|tsx|mts)$/.test(e.name)) {
          const src = sinComentarios(fs.readFileSync(path.join(raiz, rel), "utf8"));
          for (const [, spec] of src.matchAll(importDeJson)) {
            const destino = spec.startsWith("@/") ? spec.slice(2) : path.posix.join(dir, spec);
            if (/(^|\/)__fixtures__\//.test(destino)) culpables.push(`${rel} → ${spec}`);
          }
        }
      }
    };
    for (const dir of ["lib", "components", "app", "scripts", "test"]) {
      if (fs.existsSync(path.join(raiz, dir))) recorrer(dir);
    }
    expect(culpables).toEqual([]);
  });
});

describe("L3 P3b · el fixture grande sigue siendo el caso que miden las guardas", () => {
  it("los conteos, sacados del código: 133 crudos, 112 vivas, 130 casillas de tareas y una nueva que «ya está»", () => {
    /* La edición que la pone en rojo: regenerar el fixture con otra anonimización que junte o separe títulos
       (cambian los «ya está») o que pierda un cambio. */
    const f = leerFixtureGrande();
    const vivo = vivoDelFixture(f);
    const b = borradorDelFixture(f);
    const porTipo = (t: string) => b.cambios.filter((c) => c.tipo === t).length;
    expect(b.cambios).toHaveLength(133);
    expect([porTipo("fase-cambia"), porTipo("fase-nueva"), porTipo("tarea-se-va"), porTipo("tarea-nueva")]).toEqual([1, 1, 57, 74]);
    const vivas = vivo.fases.flatMap((x) => x.tareas ?? []);
    expect(vivas).toHaveLength(112);
    expect(vivas.filter((t) => t.status === "DONE")).toHaveLength(46);
    expect(vivas.filter((t) => t.status === "PENDING")).toHaveLength(66);
    expect(vivo.fases.find((x) => x.id === FASE_TERMINADA)!.status).toBe("DONE");
    expect(vivo.fases.find((x) => x.id === FASE_QUE_SE_ALARGA)!.durationWeeks).toBe(3);

    const r = resumir(vivo, b, [], { tareas: "listas" });
    expect(r.tareas.nuevas).toBe(73);
    expect(r.tareas.seVan).toBe(57);
    const items = r.grupos.flatMap((g) => g.tareas);
    expect(items.filter((t) => t.estado !== "ya-esta")).toHaveLength(130);
    expect(items.filter((t) => t.estado === "ya-esta")).toHaveLength(1);
    expect(r.marcadas).toBe(132);
    expect(r.indice).toHaveLength(14);
    expect(f.hoy).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});
