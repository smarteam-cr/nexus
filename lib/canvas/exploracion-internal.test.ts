/**
 * lib/canvas/exploracion-internal.test.ts — GUARD PERMANENTE de "Exploración es INTERNA".
 *
 * El requisito no es "el botón de publicar está apagado": es que **no exista el camino**
 * a la superficie externa. Un flag se prende sin querer; un camino que no existe hay que
 * construirlo a propósito. Y el riesgo es concreto: Exploración se construyó copiando el
 * canvas Desarrollo, que SÍ tiene `/external/desarrollo` + `publish-desarrollo` + botón
 * "Compartir con dev" — la próxima persona que copie ese gemelo se traería la superficie
 * externa sin notarlo.
 *
 * Este test escanea el árbol REAL (mismo patrón fs-scan que costos-privacy.test.ts y
 * skeleton-vocab.test.ts) y falla si aparece cualquiera de esos caminos. Si algún día se
 * decide de verdad exponer la exploración a alguien de afuera, hay que venir acá y
 * borrar el guard — que es exactamente la conversación que queremos forzar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Lista recursiva de archivos bajo `dir` (rutas relativas a RAIZ, con "/"). */
function walk(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

const MENCIONA_EXPLORACION = /exploraci[oó]n|exploracion/i;

describe("Exploración es un documento INTERNO: no existe camino a la superficie externa", () => {
  it("no hay ninguna ruta bajo app/external/ que sea de exploración", () => {
    const externos = walk("app/external");
    const ofensores = externos.filter((f) => MENCIONA_EXPLORACION.test(f));
    expect(
      ofensores,
      `Apareció una ruta externa de exploración: ${ofensores.join(", ")}. ` +
        "Exploración es interna por diseño — si esto cambió, es una decisión de producto que va en DECISIONS.md.",
    ).toEqual([]);
  });

  it("ningún archivo de app/external/ importa el canvas, el adaptador o el workspace de Exploración", () => {
    const ofensores: string[] = [];
    for (const f of walk("app/external")) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      if (/exploracion-landing-adapter|ExploracionWorkspace|configs\/exploracion/.test(src)) ofensores.push(f);
    }
    expect(ofensores, `Estos archivos externos consumen Exploración: ${ofensores.join(", ")}`).toEqual([]);
  });

  it("no existe un endpoint publish-exploracion (ni equivalente)", () => {
    const apiFiles = walk("app/api");
    const ofensores = apiFiles.filter(
      (f) => MENCIONA_EXPLORACION.test(f) && /publish|external|compartir|share/i.test(f),
    );
    expect(
      ofensores,
      `Apareció un endpoint de publicación de exploración: ${ofensores.join(", ")}`,
    ).toEqual([]);
  });

  it("el workspace de Exploración no trae publicación ni compartir (a diferencia del de Desarrollo)", () => {
    const src = fs.readFileSync(path.join(RAIZ, "components/canvas/ExploracionWorkspace.tsx"), "utf8");
    // Se escanea el CÓDIGO, no la prosa: el header del archivo explica justamente por qué
    // no está el bloque de compartir del gemelo, y nombrar ahí `publish-desarrollo` o
    // `/external/` es documentación correcta — no puede hacer fallar al guard.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const señal of ["publish-exploracion", "publish-desarrollo", "/external/", "devUrl"]) {
      expect(
        codigo.includes(señal),
        `ExploracionWorkspace usa "${señal}" en CÓDIGO — el documento es interno y no se comparte.`,
      ).toBe(false);
    }
  });

  it("el canvas declara su propio nombre y NO reusa el de un documento cliente-facing", () => {
    // Sanity del ruteo: si alguien apuntara el agente de exploración al canvas Kickoff
    // (que sí es cliente-facing y sí publica), el contenido interno terminaría en la
    // vista externa del kickoff. El mapa es la fuente de ese ruteo.
    const src = fs.readFileSync(path.join(RAIZ, "lib/canvas/canvas-defs.ts"), "utf8");
    expect(src).toMatch(/exploracion:\s*"Exploración"/);
  });
});
