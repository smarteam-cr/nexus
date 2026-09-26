/**
 * lib/timeline/semana-unica.test.ts — L3 (D4): UNA sola base para «S».
 *
 * Correr: `npx vitest run lib/timeline/semana-unica.test.ts --project unit`.
 *
 * «S» con número es SIEMPRE la semana del proyecto desde 0: la de la cabecera del Gantt (`S{w}`), la de
 * `fase.arranque-relativo` del chat y la de `etiquetaDeSemana` / `semanaDelProyecto` (weeks.ts). La semana
 * de una fase va en palabras, desde 1 («Semana 2»). Antes el mismo cambio se leía «inicio S3 → S5» en la
 * barra, «S4 → S6» en el chip e «inicia S 4» en el campo, y el chat leía «S1» como la semana 1 de la fase:
 * «pásala a la S5» tenía tres respuestas.
 *
 * Los tests de conducta viven con cada pieza (weeks.test.ts, proposal-deltas.test.ts, borrador.test.ts,
 * contexto-del-cronograma.test.ts). Este escaneo cuida lo que una conducta no ve entera: que nadie vuelva a
 * escribir una «S» que suma 1 en los archivos que arman lo que leen el CSE y el chat, y que el campo
 * «inicia S» del Gantt siga en la base de su cabecera.
 * ⚠ P3b suma acá `lib/timeline/vista-de-la-propuesta.ts` cuando exista.
 * La fuente se lee normalizada (`\r\n` → `\n`: hay archivos CRLF) y sin comentarios.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leerFuente = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

/** Una «S» que suma 1 dentro del template: `S${w + 1}`, `S${t.weekIndex + 1}`, `S${Number(c.from) + 1}`. */
const S_MAS_UNO = /S\$\{[^}]*\+\s*1\s*\}/g;

/** El cuerpo de una función de nivel superior (`function nombre(` … la primera `}` en la columna 0). Tira si falta. */
function funcion(src: string, nombre: string): string {
  const i = src.search(new RegExp(`\\nfunction ${nombre}\\(|\\nexport function ${nombre}\\(`));
  if (i < 0) throw new Error(`no encuentro la función «${nombre}»`);
  const j = src.indexOf("\n}\n", i + 1);
  if (j < 0) throw new Error(`no encuentro el final de «${nombre}»`);
  return src.slice(i, j + 3);
}

describe("L3 (D4) · «S» con número es la semana del proyecto desde 0, en todos lados", () => {
  it("⛔ ninguna «S» suma 1 en lo que arma el contexto del chat y los textos de la propuesta", () => {
    /* La edición que la pone en rojo: volver a `S${w + 1}` en las semanas del contexto (con o sin propuesta) o a
       `S${Number(c.from) + 1}` en el chip del inicio. */
    const archivos = ["lib/asistente/contexto-del-cronograma.ts", "lib/asistente/contexto.ts", "lib/timeline/proposal-deltas.ts"];
    for (const rel of archivos) {
      const src = soloCodigo(leerFuente(rel));
      expect(src.length, rel).toBeGreaterThan(1000);
      expect(src.match(S_MAS_UNO) ?? [], rel).toEqual([]);
    }
  });

  it("⛔ en borrador.ts, ni la proyección, ni los títulos, ni el texto de una tarea que cambia", () => {
    /* La edición que la pone en rojo: `inicio S${de + 1}` en `proyectarConPlan`, «· S${weekIndex + 1}» en
       `tituloDe`, o «pasa a S${weekIndex + 1}» en `textoDelCambioDeTarea`. */
    const src = soloCodigo(leerFuente("lib/timeline/borrador.ts"));
    for (const nombre of ["proyectarConPlan", "tituloDe", "textoDelCambioDeTarea"]) {
      const cuerpo = funcion(src, nombre);
      expect(cuerpo.match(S_MAS_UNO) ?? [], nombre).toEqual([]);
      expect(cuerpo, `${nombre}: una «S» con número a mano (usa semanaDelProyecto o etiquetaDeSemana)`).not.toMatch(/`[^`]*\bS\$\{/);
    }
  });

  it("⛔ el campo «inicia S» del Gantt cuenta como su cabecera (S0 = la primera columna)", () => {
    /* La edición que la pone en rojo: volver el campo a base 1 (`value={p.startWeek + 1}`, `min={1}`,
       `raw - 1` al guardar): «inicia S 3» volvería a ser la columna S2. */
    const gantt = soloCodigo(leerFuente("components/canvas/TimelineGantt.tsx"));
    const desde = gantt.indexOf(">inicia S<");
    expect(desde, "no encuentro el campo «inicia S»").toBeGreaterThan(-1);
    const campo = gantt.slice(desde, gantt.indexOf("/>", desde));
    expect(campo).toContain("onUpdatePhase(p.key, { startWeek:");
    expect(campo, "el campo suma 1 al mostrar").not.toMatch(/startWeek\s*\+\s*1/);
    expect(campo, "el campo resta 1 al guardar").not.toMatch(/raw\s*-\s*1/);
    expect(campo).toContain("min={0}");
    expect(campo).toContain("S0 = la primera");
    // La cabecera: `S{w}` (o `semanaDelProyecto`), nunca `S{w + 1}`.
    expect(/>\s*S\{w\}\s*</.test(gantt) || gantt.includes("semanaDelProyecto("), "la cabecera cambió de base").toBe(true);
    expect(gantt, "la cabecera suma 1").not.toMatch(/S\{\s*w\s*\+\s*1\s*\}/);
  });
});
