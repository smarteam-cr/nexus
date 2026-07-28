/**
 * lib/print/job-token.test.ts — el pase de impresión no puede volver a ser de un solo uso.
 *
 * ── EL BUG QUE HABRÍA CAZADO ─────────────────────────────────────────────────
 * El token era consumible UNA vez: la segunda vez que se pedía la misma página, 404. Suena
 * razonable, y rompía el PDF de la peor forma — sin decir nada. Si la página se vuelve a
 * cargar (el Fast Refresh de dev recarga toda pestaña abierta al tocar un archivo, y
 * Chromium reintenta una navegación que falló), la segunda vuelta caía en un 404, la hoja
 * quedaba vacía, nunca aparecía `data-pdf-ready`, y quince segundos después el usuario leía
 * "No se pudo generar el PDF" sin una sola pista de por qué.
 *
 * Lo que el un-solo-uso compraba era impedir la re-ejecución de un token filtrado. Pero vive
 * 60 segundos, son 256 bits y la URL solo existe dentro del contenedor: el TTL ya acota esa
 * ventana. La expiración SÍ tiene que seguir rechazando — eso es lo que no se puede perder.
 *
 * fs-scan, como el resto de las guardas del repo: el módulo toca la base y no vale la pena
 * un mock para comprobar una decisión que se lee en cuatro líneas.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "lib/print/job-token.ts"), "utf8");

describe("el pase de impresión sobrevive a que la página se recargue", () => {
  it("no rechaza por haber sido usado", () => {
    expect(
      src,
      "volvió el candado por reuso: cualquier recarga de la página de impresión deja el PDF " +
        "en un timeout mudo de 15s. Ver el encabezado de lib/print/job-token.ts.",
    ).not.toMatch(/if\s*\(\s*row\.usedAt\s*\|\|/);
  });

  it("pero SÍ sigue rechazando el vencido — eso es lo que lo acota", () => {
    expect(src).toMatch(/row\.expiresAt\.getTime\(\)\s*<\s*Date\.now\(\)/);
  });

  it("y sigue atado al par (tipo, documento): un pase ajeno no abre este documento", () => {
    expect(src).toMatch(/tipo !== docType \|\| id !== docId/);
  });

  it("`usedAt` se anota una vez y no se pisa — es auditoría, no candado", () => {
    expect(src).toMatch(/if\s*\(!row\.usedAt\)/);
  });
});
