/**
 * lib/ui/fin-de-linea.test.ts — ⛔ NINGÚN ARCHIVO DE CÓDIGO CON «\r\r\n».
 *
 * Correr: `npx vitest run lib/ui/fin-de-linea.test.ts --project unit`.
 *
 * El repo convive con archivos CRLF (CronogramaCanvas, las rutas del cronograma, el asistente…) y
 * archivos LF. Editar uno CRLF con un script que escribe «\n» → «\r\n» sobre texto que ya traía
 * «\r» deja «\r\r\n»: una línea en blanco fantasma en cada salto, que `tsc` y los tests no ven y que
 * solo `npm run build` (o el diff) delata, tarde. Pasó más de una vez (memoria «editar-archivos-crlf»).
 * El plan del borrador del cronograma (§3.5) pide que un test lo frene el mismo día.
 *
 * La edición que la pone en rojo: guardar cualquier .ts/.tsx de app/, components/, lib/, hooks/ o
 * scripts/ con un «\r» doble.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "./scan-source";

const DIRECTORIOS = ["app", "components", "lib", "hooks", "scripts"];

describe("fin de línea", () => {
  it("⛔ ningún archivo de código trae «\\r\\r» (el rastro de editar un CRLF con un script)", () => {
    const archivos = DIRECTORIOS.flatMap((d) => listarTsx(d));
    // La guarda tiene que estar mirando algo: sin archivos, pasaría en verde por no leer nada.
    expect(archivos.length).toBeGreaterThan(500);
    const conDobleCr = archivos.filter((rel) => fs.readFileSync(path.join(RAIZ, rel)).includes("\r\r"));
    expect(conDobleCr.map((f) => f.split(path.sep).join("/"))).toEqual([]);
  });
});
