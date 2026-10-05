import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MS_SIN_LATIDO_PARA_COLGADA, cortePorLatido, estaColgada, wherePorLatido } from "./run-colgada";

/**
 * lib/agents/run-colgada.test.ts — UNA CORRIDA QUE DICE «RUNNING» NO SIEMPRE ESTÁ VIVA.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Encontrada EN VIVO el 2026-08-02, no en revisión: el centro de corridas mostraba "Detalle de
 * cronograma · RC Inmobiliaria — Corriendo…" desde hacía **546 horas**. El proceso había muerto
 * a los segundos de arrancar (`createdAt` idéntico a `updatedAt`) y nadie escribió el estado
 * final, así que la fila quedó `RUNNING` para siempre.
 *
 * No lo detecta ningún test de los de antes porque el dato es *válido*: `RUNNING` es un estado
 * legítimo. Lo que no es legítimo es CREERLE sin mirar cuándo fue la última señal.
 */

const hace = (ms: number) => new Date(Date.now() - ms);
const MIN = 60 * 1000;

describe("cuándo una corrida está colgada", () => {
  it("recién arrancada → viva", () => {
    expect(estaColgada({ status: "RUNNING", updatedAt: hace(5 * MIN) })).toBe(false);
  });

  it("sin señales hace 23 días → colgada (el caso real)", () => {
    expect(estaColgada({ status: "RUNNING", updatedAt: hace(546 * 60 * MIN) })).toBe(true);
  });

  it("PENDING también cuenta: murió antes de siquiera empezar", () => {
    /* Un run puede morir entre que se crea la fila y que arranca el trabajo. Si solo se mirara
       RUNNING, ése quedaría "en curso" para siempre igual. */
    expect(estaColgada({ status: "PENDING", updatedAt: hace(60 * MIN) })).toBe(true);
    expect(estaColgada({ status: "PENDING", updatedAt: hace(1 * MIN) })).toBe(false);
  });

  it("una terminada NUNCA está colgada, por vieja que sea", () => {
    // Si no, toda corrida DONE del año pasado se reportaría como fallada.
    for (const status of ["DONE", "ERROR", "ARCHIVED"]) {
      expect(estaColgada({ status, updatedAt: hace(999 * 60 * MIN) })).toBe(false);
    }
  });

  it("justo en el umbral todavía cuenta como viva", () => {
    // Estrictamente mayor: en el borde exacto se peca de paciente, no de matarla.
    const ahora = new Date();
    const justo = new Date(ahora.getTime() - MS_SIN_LATIDO_PARA_COLGADA);
    expect(estaColgada({ status: "RUNNING", updatedAt: justo }, ahora)).toBe(false);
    expect(
      estaColgada({ status: "RUNNING", updatedAt: new Date(justo.getTime() - 1) }, ahora),
    ).toBe(true);
  });

  it("mira el ÚLTIMO LATIDO, no cuándo empezó", () => {
    /* Una corrida larga que va reportando fases sigue viva por más que haya arrancado hace
       horas. Con `createdAt` se mataría trabajo legítimo solo por durar — que es justo el
       riesgo de bajar el umbral. */
    expect(estaColgada({ status: "RUNNING", updatedAt: hace(2 * MIN) })).toBe(false);
  });

  it("el corte para el `where` y la función pura dicen lo mismo", () => {
    /* El endpoint filtra en SQL con `cortePorLatido` y después re-evalúa en memoria con
       `estaColgada`. Si divergieran, una corrida podría caer en los dos baldes o en ninguno. */
    const ahora = new Date();
    const corte = cortePorLatido(ahora);
    const apenasViva = new Date(corte.getTime() + 1000);
    const apenasMuerta = new Date(corte.getTime() - 1000);
    expect(estaColgada({ status: "RUNNING", updatedAt: apenasViva }, ahora)).toBe(false);
    expect(estaColgada({ status: "RUNNING", updatedAt: apenasMuerta }, ahora)).toBe(true);
  });

  it("`wherePorLatido` parte las «en curso» igual que `estaColgada`: viva o colgada, nunca las dos", () => {
    /* Evalúa los dos `where` sobre filas en memoria. Si alguien cambia el corte, los estados o el `gte`/`lt` de uno
       solo, una corrida cae en los dos baldes (o en ninguno) y /agents cuenta distinto que el centro. */
    type Fila = { status: string; updatedAt: Date };
    type Where = {
      AND?: Where[];
      status?: { in?: string[] } | string;
      updatedAt?: { gte?: Date; lt?: Date };
    };
    const cumple = (f: Fila, w: Where): boolean =>
      (w.AND ?? []).every((x) => cumple(f, x)) &&
      (w.status === undefined ||
        (typeof w.status === "string" ? f.status === w.status : (w.status.in ?? []).includes(f.status))) &&
      (w.updatedAt?.gte === undefined || f.updatedAt.getTime() >= w.updatedAt.gte.getTime()) &&
      (w.updatedAt?.lt === undefined || f.updatedAt.getTime() < w.updatedAt.lt.getTime());

    const ahora = new Date();
    const { vivas, colgadas } = wherePorLatido(ahora);
    const edades = [0, 5 * MIN, MS_SIN_LATIDO_PARA_COLGADA - 1, MS_SIN_LATIDO_PARA_COLGADA, MS_SIN_LATIDO_PARA_COLGADA + 1, 546 * 60 * MIN];
    for (const status of ["PENDING", "RUNNING", "DONE", "ERROR", "ARCHIVED"]) {
      for (const edad of edades) {
        const f = { status, updatedAt: new Date(ahora.getTime() - edad) };
        const enCurso = status === "PENDING" || status === "RUNNING";
        const caso = `${status} sin latido hace ${edad} ms`;
        expect(cumple(f, vivas as Where), `${caso}: viva`).toBe(enCurso && !estaColgada(f, ahora));
        expect(cumple(f, colgadas as Where), `${caso}: colgada`).toBe(estaColgada(f, ahora));
      }
    }
  });
});

describe("el umbral vive en UN solo lugar", () => {
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("es el conservador de los que había (30 min), no el corto", () => {
    /* Bajarlo a 15 haría que una generación lenta pero sana se reporte como fallada, y que la
       persona la relance al pedo. La asimetría del error manda. */
    expect(MS_SIN_LATIDO_PARA_COLGADA).toBe(30 * 60 * 1000);
  });

  it("el watchdog de CS lo importa en vez de tener el suyo", () => {
    const src = leer("lib/cs/watchdog.ts");
    expect(src).toContain("MS_SIN_LATIDO_PARA_COLGADA");
    expect(src, "el watchdog volvió a escribir el número a mano").not.toMatch(
      /STALE_CLAIM_MS\s*=\s*\d+\s*\*/,
    );
  });

  it("el feed no confía en el estado crudo", () => {
    /* El bug entero era `status: { in: ["PENDING","RUNNING"] }` a secas. Si vuelve esa consulta
       sin el corte por latido, vuelve el "Corriendo…" eterno. */
    const src = leer("app/api/agent-runs/route.ts");
    expect(src).toContain("wherePorLatido()");
    expect(src).toContain("porLatido.vivas");
    expect(src).toContain("porLatido.colgadas");
    expect(src).toContain("estaColgada(");
  });

  it("⛔ /agents cuenta «corriendo ahora» con el mismo corte que el centro de corridas", () => {
    /* La edición que la pone en rojo: volver a `count({ where: { status: "RUNNING" } })`. Contaba las colgadas de
       hace semanas como si corrieran, mientras el centro de corridas ya las mostraba como falladas. */
    const src = leer("app/(shell)/agents/page.tsx");
    expect(src, "/agents dejó de usar el corte por latido").toContain("wherePorLatido().vivas");
    expect(src, "/agents volvió a contar el estado crudo").not.toMatch(/status:\s*"RUNNING"/);
  });

  it("Marketing NO se unificó, y está dicho por qué", () => {
    /* Sus 15 min responden "¿arranco otro?", no "¿esto murió?". El test fija la DECISIÓN de
       dejarlas separadas: si alguien las junta buscando simetría, acá se entera de que la
       diferencia era intencional. */
    const src = leer("lib/marketing/runs.ts");
    expect(src).toContain("15 * 60 * 1000");
    expect(src).toContain("run-colgada");
  });
});

describe("C-13: el feed no trae el output de las corridas; el motivo del error se pide aparte", () => {
  it("el select no incluye `output`, y el texto del error sale de una lectura acotada a las corridas en ERROR", () => {
    /* La edición que lo pone en rojo: `output: true` de vuelta en el select «para no hacer dos
       consultas» — el documento entero de cada corrida DONE, hasta 25 veces por tick, para no
       mostrarlo. */
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/agent-runs/route.ts"), "utf8");
    const i = src.indexOf("const select = {");
    const select = src.slice(i, src.indexOf("satisfies Prisma.AgentRunSelect", i));
    expect(select.length, "la guarda no está mirando el select").toBeGreaterThan(50);
    expect(select, "el output de todas las corridas del feed, cada tick").not.toContain("output: true");
    expect(src, "la segunda lectura tiene que acotarse a las que están en ERROR").toContain('.filter((r) => r.status === "ERROR").map((r) => r.id)');
    expect(src).toContain("id: { in: idsConError }");
    expect(src).toContain("select: { id: true, output: true }");
    expect(src, "el motivo del error sale de esa lectura, no del select del feed").toContain("parseRunError(outputPorId.get(r.id) ?? null)");
  });
});
