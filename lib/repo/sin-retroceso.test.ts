/**
 * lib/repo/sin-retroceso.test.ts — ningún archivo del código trae el carácter de retroceso (U+0008).
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un script de Python que escribe una regex con «\b» sin cadena cruda deja un retroceso en lugar del límite de palabra
 * (KNOWN-ERRORS). La regex compila igual y nunca coincide: el 2026-10-24 había cinco así, cuatro de ellas en pruebas que
 * pasaban sin mirar nada y una en el filtro de 401/403 de la copia de proyectos de HubSpot (paso cero del roadmap).
 * Ningún archivo legítimo del repo necesita ese carácter: si hace falta nombrarlo, se escribe «\x08».
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(__dirname, "../..");
const CARPETAS = ["lib", "app", "components", "scripts", "hooks", "test"];
const EXTENSIONES = /\.(ts|tsx|js|mjs|cjs)$/;
const RETROCESO = String.fromCharCode(8);

function archivos(dir: string): string[] {
  let out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out = out.concat(archivos(ruta));
    else if (EXTENSIONES.test(nombre)) out.push(ruta);
  }
  return out;
}

describe("sin el carácter de retroceso", () => {
  it("ningún archivo de código lo trae (la regex con «\\b» escrita desde Python)", () => {
    const conRetroceso: string[] = [];
    for (const carpeta of CARPETAS) {
      for (const ruta of archivos(join(RAIZ, carpeta))) {
        const lineas = readFileSync(ruta, "utf8").split("\n");
        lineas.forEach((l, i) => {
          if (l.includes(RETROCESO)) conRetroceso.push(`${relative(RAIZ, ruta)}:${i + 1}`);
        });
      }
    }
    expect(conRetroceso, "cambia el retroceso por \\b (o escríbelo como \\x08 si de verdad hace falta)").toEqual([]);
  });
});
