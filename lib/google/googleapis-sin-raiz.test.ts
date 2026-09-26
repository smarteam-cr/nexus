import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

/**
 * lib/google/googleapis-sin-raiz.test.ts — nadie vuelve a importar la RAÍZ de `googleapis`.
 *
 * ── EL INCIDENTE: EL BUILD DEL 2026-09-26 SE QUEDÓ SIN MEMORIA EN EL VPS ─────────────
 * El deploy de c0e2bc2d murió en `next build`, paso «Running TypeScript», con «JavaScript heap out
 * of memory» (Mark-Compact ~4034 MB de ~4128 MB: el tope por defecto de Node en el VPS). Producción
 * no cayó porque deploy.sh no cambia el contenedor si el build falla, pero nada se podía desplegar.
 *
 * La causa: importar la raíz del paquete (`google` desde "googleapis", o un tipo escrito como
 * `import("googleapis").calendar_v3…`) hace que TypeScript cargue los .d.ts de las ~400 APIs de
 * Google: 903 archivos y 165 MB de los 210 MB de fuentes del programa. Nexus usa tres (Admin
 * Directory, Calendar v3 y Drive v3), y cada una tiene su propio módulo en
 * `googleapis/build/src/apis/<api>`, que exporta la MISMA función que `google.<api>` (la raíz la
 * copia de ahí) y sus tipos (`admin_directory_v1`, `calendar_v3`, `drive_v3`).
 *
 * Medido al arreglarlo (tsc --extendedDiagnostics): de 8278 a 7388 archivos y de 3857 MB a 2797 MB
 * de memoria. `next build` con el tope del VPS (4096) muere en «Running TypeScript» antes y pasa
 * después; con 3072 también pasa, con 2560 no: el type-check sigue pidiendo ~2,6-3 GB.
 *
 * ── QUÉ MIRA ────────────────────────────────────────────────────────────────────────
 * Todo lo que ve tsc (el tsconfig incluye cada .ts/.tsx del repo): app/, lib/, components/, pero
 * también hooks/, scripts/, test/ y los tests. Un script o un test con la raíz infla el type-check
 * del build igual que el código de producción. Los imports se leen con `ts.preProcessFile`, que
 * ve `from "…"`, `import type`, `export … from`, `import("…")` en un tipo, `require("…")` y
 * `vi.mock(import("…"))`, y no se deja engañar por comentarios ni cadenas.
 *
 * Si necesitas otra API de Google: `import { sheets as apiSheets } from "googleapis/build/src/apis/sheets"`.
 */

const RAIZ = process.cwd();
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, "/");

/** Lo que ve tsc: el repo entero menos node_modules y las carpetas con punto (.next*, .git…). */
function archivosQueVeTsc(): string[] {
  const out: string[] = [];
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.(?:ts|tsx|mts|cts)$/.test(e.name)) out.push(p);
    }
  };
  recorrer(RAIZ);
  return out;
}

/** Los especificadores de `googleapis` (la raíz o una subruta) que importa un archivo. */
function importsDeGoogleapis(fuente: string): string[] {
  if (!fuente.includes("googleapis")) return [];
  return ts
    .preProcessFile(fuente, true, true)
    .importedFiles.map((f) => f.fileName)
    .filter((s) => s === "googleapis" || s.startsWith("googleapis/"));
}

/**
 * Lo único permitido: el módulo de UNA API (`googleapis/build/src/apis/drive`, o una versión suya
 * como `…/apis/drive/v3`). Todo lo demás arrastra las ~400: la raíz, `build/src/index`,
 * `build/src/googleapis` y `build/src/apis` (o su `index`), que es el índice de todas.
 */
const PERMITIDO = /^googleapis\/build\/src\/apis\/(?!index(?:\.js)?$)[a-z0-9_]+(?:\/[a-z0-9_]+)?$/i;

const ARCHIVOS = archivosQueVeTsc();
const IMPORTS = ARCHIVOS.map((f) => ({ archivo: rel(f), specs: importsDeGoogleapis(fs.readFileSync(f, "utf8")) }));

describe("googleapis: solo las APIs que Nexus usa, nunca la raíz (build sin memoria, 2026-09-26)", () => {
  it("el escaneo está mirando algo: todo el repo y los 4 archivos que hablan con Google", () => {
    expect(ARCHIVOS.length, "el escaneo no encontró los archivos del repo").toBeGreaterThan(1000);
    const conGoogle = IMPORTS.filter((i) => i.specs.length > 0).map((i) => i.archivo);
    for (const f of ["lib/google/auth.ts", "lib/google/meet-sync.ts", "lib/google/drive-files.ts", "lib/google/meet-enrichment.ts"]) {
      expect(conGoogle, `el escaneo no ve el import de googleapis de ${f}`).toContain(f);
    }
  });

  it("LA guarda: ningún archivo importa la raíz de googleapis (ni un valor ni un tipo)", () => {
    /* La edición que la pone en rojo: volver a `import { google } from "googleapis"` en cualquiera
       de los 4 archivos, o escribir un tipo como `import("googleapis").drive_v3.Schema$File`. */
    const culpables = IMPORTS.flatMap((i) => i.specs.filter((s) => !PERMITIDO.test(s)).map((s) => `${i.archivo} → "${s}"`));
    expect(
      culpables,
      "Estos imports cargan los tipos de las ~400 APIs de Google y dejan sin memoria el type-check del " +
        "build en el VPS (pasó el 2026-09-26 con c0e2bc2d: murió en «Running TypeScript»). Importa solo " +
        'la API que usas: `import { drive as apiDrive } from "googleapis/build/src/apis/drive"`.',
    ).toEqual([]);
  });

  it("cada import profundo resuelve (si googleapis cierra sus rutas con `exports`, avisa esto y no el build)", () => {
    const req = createRequire(path.join(RAIZ, "package.json"));
    const profundos = [...new Set(IMPORTS.flatMap((i) => i.specs).filter((s) => PERMITIDO.test(s)))];
    expect(profundos.length, "no hay imports profundos que revisar").toBeGreaterThan(0);
    for (const s of profundos) expect(() => req.resolve(s), s).not.toThrow();
  });
});
