/**
 * Las respuestas a «¿Cuándo lo presentas?» son APPEND-ONLY: quién respondió qué y cuándo es el dato que pidió Elías
 * (2026-10-14). Nada del código actualiza ni borra una fila de PresentacionDeDocumento. Y nadie fuera de
 * lib/presentaciones (y la migración) la escribe: así cada respuesta pasa por la regla de quién responde.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) salida.push(p);
  }
  return salida;
}

const TODOS = ["lib", "app", "components", "scripts"].flatMap((d) => archivos(join(RAIZ, d)));
const rel = (f: string) => relative(RAIZ, f).split("\\").join("/");

describe("PresentacionDeDocumento es append-only", () => {
  it("ningún archivo la actualiza ni la borra", () => {
    const ofensores = TODOS.filter((f) => /presentacionDeDocumento\.(update|updateMany|upsert|delete|deleteMany)\b/.test(readFileSync(f, "utf8")));
    expect(ofensores.map(rel)).toEqual([]);
  });

  it("solo la escriben lib/presentaciones/servidor.ts y la migración del Json viejo", () => {
    const escritores = TODOS.filter((f) => /presentacionDeDocumento\.(create|createMany)\b/.test(readFileSync(f, "utf8"))).map(rel);
    expect(escritores.sort()).toEqual(["lib/presentaciones/servidor.ts", "scripts/migrar-presentacion-del-diagnostico.ts"]);
  });

  it("el Json viejo del diagnóstico solo lo lee la migración (sin contar los comentarios)", () => {
    const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const ofensores = TODOS.filter((f) => /diagnosticoPresentacion/.test(sinComentarios(readFileSync(f, "utf8")))).map(rel);
    expect(ofensores).toEqual(["scripts/migrar-presentacion-del-diagnostico.ts"]);
  });
});
