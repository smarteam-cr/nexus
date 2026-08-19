/**
 * lib/projects/etapa-retirada.test.ts — NADIE VUELVE A LEER LA ETAPA INVENTADA.
 *
 * Correr: `npx vitest run lib/projects/etapa-retirada.test.ts --project unit`.
 *
 * ── QUÉ SE RETIRÓ, Y POR QUÉ ESTO NO ES UN TEST DE LIMPIEZA ──────────────────────────────────
 * `Project.currentStage` y `Project.currentStep` son las columnas del subsistema de ETAPAS
 * (Diagnóstico / Planificación / Adopción × pasos). Su ÚNICO escritor era una pantalla que este
 * retiro borra. O sea que después del retiro son dos números congelados para siempre — y hasta
 * hoy el widget del proyecto los leía y pintaba «Etapa 1 → Análisis inicial».
 *
 * Medido contra producción el 2026-08-18: **68 de 138 proyectos activos (49 %)** no tienen
 * `hubspotServiceId`, así que la MITAD de la cartera mostraba esa etapa inventada. No es un
 * rótulo feo: es un dato del proyecto que nadie puso nunca y que ya no puede cambiar.
 *
 * ⛔ LAS COLUMNAS NO SE DROPEAN — un DROP es irreversible y no hace falta para que la pantalla
 * deje de mentir. Quedan en el schema, marcadas como retiradas. Justamente por eso hace falta
 * esta guarda: mientras la columna exista, `select: { currentStage: true }` sigue compilando, y
 * el próximo que quiera mostrar «en qué etapa va» la va a encontrar antes que al ciclo de vida
 * real. No falla nada — simplemente vuelve la mentira.
 *
 * La fuente de verdad de la etapa es `lib/lifecycle` (el ciclo real, que sí se actualiza).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";

/**
 * ⭐ VACÍA desde el 2026-08-19, y ése era el objetivo: las dos pantallas que todavía nombraban
 * estas columnas eran las del subsistema de etapas, y se borraron. Nadie las lee ya.
 *
 * Se conserva la lista (y no se borra el mecanismo) porque las COLUMNAS siguen en el schema a
 * propósito: mientras existan, `select: { currentStage: true }` compila, y el próximo que quiera
 * mostrar «en qué etapa va» las va a encontrar antes que al ciclo de vida real.
 */
const TODAVIA_LAS_NOMBRAN: { archivo: string; porque: string }[] = [];

const DIRECTORIOS = ["app", "components", "lib"];

function archivosQueLasNombran(): string[] {
  const encontrados: string[] = [];
  for (const dir of DIRECTORIOS) {
    for (const f of listarTsx(dir)) {
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      // Los comentarios explican por qué se retiró: mencionar no es leer.
      const soloCodigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/\bcurrentStage\b|\bcurrentStep\b/.test(soloCodigo)) {
        encontrados.push(f.split(path.sep).join("/"));
      }
    }
  }
  return encontrados;
}

describe("la etapa inventada no vuelve", () => {
  it("⛔ nadie lee currentStage/currentStep fuera de lo que ya está condenado", () => {
    /* La edición que la pone en rojo: sumar `currentStage: true` a cualquier `select` de
       producción — que es exactamente el gesto que la reintroduce. */
    const declarados = new Set(TODAVIA_LAS_NOMBRAN.map((e) => e.archivo));
    const nuevos = archivosQueLasNombran().filter((f) => !declarados.has(f));
    expect(
      nuevos,
      "Estos archivos leen las columnas del subsistema de etapas, que ya no tiene escritor: " +
        "el valor está congelado y mostrarlo afirma algo que nadie puso. La etapa real sale de " +
        "lib/lifecycle. Si el uso es legítimo, declaralo arriba con el porqué.",
    ).toEqual([]);
  });

  it("y los condenados siguen existiendo (la lista solo encoge)", () => {
    for (const e of TODAVIA_LAS_NOMBRAN) {
      expect(
        fs.existsSync(path.join(RAIZ, e.archivo)),
        `"${e.archivo}" ya no existe: sacalo de TODAVIA_LAS_NOMBRAN.`,
      ).toBe(true);
      expect(e.porque.length, `"${e.archivo}" no dice por qué`).toBeGreaterThan(20);
    }
  });

  it("el widget del proyecto no arma un rótulo de etapa por su cuenta", () => {
    /* El GPS es la superficie donde vivía la mentira. Su rama sin HubSpot ahora devuelve null y
       el widget no pinta nada — la etapa la resuelve `etapaParaLaUI(getProjectLifecycle(...))`.
       La edición que la pone en rojo: volver a componer el rótulo con la tabla de pasos. */
    const gps = fs.readFileSync(
      path.join(RAIZ, "app/api/projects/[projectId]/gps/route.ts"),
      "utf8",
    );
    expect(gps, "el GPS dejó de resolver la etapa por el ciclo de vida real").toContain(
      "etapaParaLaUI(",
    );
    expect(
      gps.includes("STAGE_LABELS") || gps.includes("getStageSteps"),
      "el GPS volvió a armar la etapa con la tabla de pasos del subsistema retirado",
    ).toBe(false);
  });

  it("los prompts no le cuentan al modelo una etapa que nadie mueve", () => {
    /* Dos agentes recibían «etapa N, paso M» del proyecto: el de post-sesión y el clasificador
       de sesión→proyecto. Un número congelado en el prompt es peor que ausente — el modelo lo
       usa como si significara algo. */
    for (const f of ["lib/sessions/post-process.ts", "lib/sessions/classify-session-project.ts"]) {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(
        /\bcurrentStage\b|\bcurrentStep\b/.test(src),
        `${f} volvió a mandarle la etapa congelada al modelo`,
      ).toBe(false);
    }
  });
});
