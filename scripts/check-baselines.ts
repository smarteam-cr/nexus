/**
 * scripts/check-baselines.ts — LA DEUDA DE ESLINT Y TSC SOLO BAJA.
 *
 * Correr: `npx tsx scripts/check-baselines.ts` — solo lectura: no toca la base ni escribe nada.
 *
 * A-23 (auditoría 2026-09-03): `eslint-baseline.txt` decía 67 cuando el conteo real era 57, y
 * NADIE leía ninguno de los dos archivos (ni el hook de pre-commit, que lintea solo lo staged).
 * Una línea base que nadie compara es una promesa vacía. Este script compara la realidad contra
 * los dos archivos:
 *   · la realidad SUPERA la línea base → falla: entró deuda nueva;
 *   · la realidad está POR DEBAJO   → también falla, diciendo el número: la línea base se baja en
 *     el mismo commit, para que siga describiendo la realidad (solo baja, nunca sube);
 *   · iguales → ok.
 * El test `lib/db/guard.test.ts` custodia que los archivos no SUBAN solos: subir uno exige tocar
 * el test, o sea un diff que alguien lee.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function correr(args: string[]): { codigo: number; salida: string } {
  try {
    const salida = execFileSync("npx", args, {
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });
    return { codigo: 0, salida };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { codigo: err.status ?? 1, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function lineaBase(archivo: string): number {
  const n = Number.parseInt(readFileSync(archivo, "utf8").trim(), 10);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${archivo} no tiene un entero: ${JSON.stringify(readFileSync(archivo, "utf8"))}`);
  return n;
}

function erroresDeTsc(): number {
  const r = correr(["tsc", "--noEmit", "--pretty", "false"]);
  return (r.salida.match(/error TS\d+/g) ?? []).length;
}

function erroresDeEslint(): number {
  const r = correr(["eslint", ".", "-f", "json"]);
  const inicio = r.salida.indexOf("[");
  if (inicio === -1) throw new Error(`eslint no devolvió JSON:\n${r.salida.slice(0, 500)}`);
  const informe = JSON.parse(r.salida.slice(inicio)) as Array<{ errorCount: number }>;
  return informe.reduce((n, f) => n + f.errorCount, 0);
}

function comparar(nombre: string, archivo: string, real: number): boolean {
  const base = lineaBase(archivo);
  if (real > base) {
    console.error(`✗ ${nombre}: ${real} errores y la línea base dice ${base} — entró deuda nueva.`);
    return false;
  }
  if (real < base) {
    console.error(`✗ ${nombre}: ${real} errores y la línea base dice ${base} — bajala a ${real} en ${archivo}, en este mismo commit.`);
    return false;
  }
  console.log(`✓ ${nombre}: ${real} errores = línea base.`);
  return true;
}

const resultados = [
  comparar("tsc", "tsc-baseline.txt", erroresDeTsc()),
  comparar("eslint", "eslint-baseline.txt", erroresDeEslint()),
];
process.exit(resultados.every(Boolean) ? 0 : 1);
