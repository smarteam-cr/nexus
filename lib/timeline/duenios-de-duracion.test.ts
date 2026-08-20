/**
 * lib/timeline/duenios-de-duracion.test.ts — QUIÉN PUEDE ACORTAR UNA FASE, Y CÓMO PROTEGE SUS TAREAS.
 *
 * Correr: `npx vitest run lib/timeline/duenios-de-duracion.test.ts --project unit`.
 *
 * ── EL BUG QUE ESTE CENSO EXISTE PARA QUE NO VUELVA ──────────────────────────────────────────
 * Una tarea guarda su `weekIndex` RELATIVO a su fase. Si la fase se acorta y sus tareas no se
 * re-acomodan, quedan en una semana que la fase ya no tiene. Nada falla: la fila sigue ahí, la
 * pantalla la pinta, y el dato queda inválido en silencio.
 *
 * Medido el 2026-08-20: **34 tareas en 7 fases de 5 proyectos**. Multiquimica tenía 10 tareas en
 * una fase de UNA semana.
 *
 * ⭐ Y el daño no era cosmético. El modificador con IA devuelve el cronograma COMPLETO, así que
 * copia esas semanas inválidas y `validateTimelinePayload` rechaza su propuesta ENTERA: esos 5
 * proyectos **no podían usar «Pedir cambio con IA» en absoluto**. 231 s y $0,29 de modelo
 * quemados por intento, con un error que el CSE no puede accionar. Un apagón total sobre el 10 %
 * de la cartera, invisible durante meses.
 *
 * ── POR QUÉ UN CENSO Y NO UN TEST POR RUTA ───────────────────────────────────────────────────
 * El agujero apareció DOS VECES, en dos caminos que nadie relacionaba: el PUT del cronograma y el
 * `apply-items` de la propuesta. Los dos escriben `durationWeeks` y los dos ignoraban las tareas,
 * porque en los dos «las tareas se manejan en otro lado». Un test por ruta habría cubierto la que
 * se conocía; lo que hace falta es que **un escritor NUEVO no pueda nacer sin declarar cómo
 * protege las tareas de la fase que acorta**.
 *
 * INV22 cuenta las que ya existen; esto impide que se generen.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";

/** Blanquea comentarios conservando saltos: NOMBRAR el problema para explicarlo no es causarlo. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Los escritores conocidos de `durationWeeks`, con CÓMO cada uno protege las tareas de la fase.
 * ⚠ La lista solo puede encoger o crecer con un porqué escrito — que es un diff en castellano que
 * alguien lee, no un flag que se agrega al pasar.
 */
const ESCRITORES: { archivo: string; protege: string }[] = [
  {
    archivo: "app/api/projects/[projectId]/timeline/route.ts",
    protege:
      "El PUT. Con `tasks` en el cuerpo, el validador rechaza cualquier weekIndex fuera de rango. " +
      "Sin `tasks` (undefined = «no tocar»), acomoda las que quedaron más allá y lo avisa en la " +
      "respuesta. Ese segundo caso era el agujero original.",
  },
  {
    archivo: "app/api/projects/[projectId]/timeline/proposal/apply-items/route.ts",
    protege:
      "Resuelve deltas de FASE, y las tareas nunca producen un delta acá — así que escribía la " +
      "duración sin mirarlas. Mismo agujero que el PUT, en otra puerta. Ahora acomoda y avisa.",
  },
  {
    archivo: "app/api/projects/[projectId]/timeline/detail/apply-all/route.ts",
    protege:
      "NO cambia la duración: la LEE para pasársela a `normalizeCuratedTasks`, que acota las " +
      "tareas curadas contra ella. Va en el censo porque el archivo la nombra y la próxima " +
      "persona tiene que ver por qué no es un riesgo.",
  },
  {
    archivo: "lib/timeline/apply-curated-phase.ts",
    protege:
      "NO escribe la duración: sus dos `update` tocan solo el estado de la fase. La RECIBE como " +
      "parámetro y `normalizeCuratedTasks` acota cada `weekIndex` contra ella (línea 64), así que " +
      "es el escritor de tareas que más protegido está. Va en el censo porque nombra las dos " +
      "cosas y la próxima persona tiene que ver por qué no es un riesgo.",
  },
  {
    archivo: "scripts/fusionar-fases-cronograma.ts",
    protege:
      "Fusiona dos fases a mano. Ya acotaba: calcula `ultimaSemana = durationWeeks - 1` y mete " +
      "ahí lo que no entra. Es el precedente del criterio que usan los otros tres.",
  },
];

const DIRECTORIOS = ["app", "lib", "scripts"];

/** Archivos que ESCRIBEN una fase y además nombran su duración: los que pueden acortarla. */
function escritoresDeDuracion(): string[] {
  const encontrados: string[] = [];
  for (const dir of DIRECTORIOS) {
    for (const f of listarTsx(dir)) {
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, f), "utf8"));
      const escribe = /timelinePhase\.(update|updateMany|upsert)\b/.test(src);
      if (escribe && src.includes("durationWeeks")) {
        encontrados.push(f.split(path.sep).join("/"));
      }
    }
  }
  return encontrados;
}

describe("quién puede acortar una fase está censado", () => {
  it("⛔ ningún escritor de duración sin declarar cómo protege sus tareas", () => {
    /* La edición que la pone en rojo: un `timelinePhase.update` con `durationWeeks` en un archivo
       nuevo. Que es exactamente cómo nació la segunda mitad de este bug. */
    const declarados = new Set(ESCRITORES.map((e) => e.archivo));
    const nuevos = escritoresDeDuracion().filter((f) => !declarados.has(f));
    expect(
      nuevos,
      "Apareció un escritor de `durationWeeks` sin declarar. Acortar una fase deja sus tareas en " +
        "semanas que ya no existen, y eso NO falla: el dato queda inválido en silencio y rompe el " +
        "modificador con IA de ese proyecto entero. Declaralo arriba con cómo las protege.",
    ).toEqual([]);
  });

  it("y los declarados siguen existiendo (la lista no se pudre)", () => {
    for (const e of ESCRITORES) {
      expect(
        fs.existsSync(path.join(RAIZ, e.archivo)),
        `"${e.archivo}" ya no existe: sacalo del censo.`,
      ).toBe(true);
      expect(e.protege.length, `"${e.archivo}" no dice cómo protege las tareas`).toBeGreaterThan(60);
    }
  });
});

describe("los dos caminos vivos acomodan de verdad", () => {
  const leer = (rel: string) =>
    soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

  it("⛔ el PUT acomoda cuando la fase se acorta sin traer sus tareas", () => {
    /* La edición que la pone en rojo: borrar el bloque de reubicación. Sin él vuelve el caso
       exacto que dejó 34 tareas fuera de rango. */
    const put = leer("app/api/projects/[projectId]/timeline/route.ts");
    expect(put).toContain("p.durationWeeks < existing.durationWeeks");
    expect(put).toContain("weekIndex: { gte: p.durationWeeks }");
  });

  it("⛔ y `apply-items` también", () => {
    const items = leer(
      "app/api/projects/[projectId]/timeline/proposal/apply-items/route.ts",
    );
    expect(items).toContain("nuevaDuracion < antes.durationWeeks");
    expect(items).toContain("weekIndex: { gte: nuevaDuracion }");
  });

  it("⚠ y los dos lo AVISAN: el silencio es cómo esto se acumuló", () => {
    /* Mover una tarea de semana le cambia la fecha planificada. Hacerlo callado es cómo se
       juntaron 34 sin que nadie se enterara. La edición que la pone en rojo: dejar de devolver
       `avisos` en la respuesta. */
    for (const rel of [
      "app/api/projects/[projectId]/timeline/route.ts",
      "app/api/projects/[projectId]/timeline/proposal/apply-items/route.ts",
    ]) {
      const src = leer(rel);
      expect(src, `${rel} dejó de reportar las tareas que corrió`).toContain("avisosDeReubicacion");
      expect(src, `${rel} guarda el aviso pero no lo devuelve`).toMatch(/avisos:\s*avisosDeReubicacion/);
    }
  });
});
