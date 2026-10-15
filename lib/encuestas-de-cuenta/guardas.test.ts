/**
 * Las respuestas sobre la cuenta son APPEND-ONLY: la historia de cómo cambió la lectura de cada cliente es el dato que
 * se quiere analizar. Nada del código actualiza ni borra una fila de RespuestaDeCuenta (la fusión de fichas la muda por
 * su mecanismo genérico, SE_MUDAN, que solo cambia el cliente).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SE_MUDAN } from "@/lib/clients/fusion-de-empresas";

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

describe("RespuestaDeCuenta es append-only", () => {
  it("ningún archivo la actualiza ni la borra", () => {
    const ofensores = ["lib", "app", "components", "scripts"]
      .flatMap((d) => archivos(join(RAIZ, d)))
      .filter((f) => /respuestaDeCuenta\.(update|updateMany|upsert|delete|deleteMany)\b/.test(readFileSync(f, "utf8")));
    expect(ofensores).toEqual([]);
  });

  it("la fusión de dos fichas la muda al cliente que sigue", () => {
    expect(SE_MUDAN).toContainEqual(["respuestaDeCuenta", "clientId"]);
  });
});
