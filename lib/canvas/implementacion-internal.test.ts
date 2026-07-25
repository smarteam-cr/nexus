/**
 * lib/canvas/implementacion-internal.test.ts — GUARD: "Implementación es INTERNA".
 *
 * Mismo molde que exploracion-internal.test.ts, y por el mismo motivo: la guía de
 * construcción se armó copiando piezas del gemelo Desarrollo, que SÍ tiene superficie
 * externa (`/external/desarrollo` + `publish-desarrollo`). La próxima persona que copie
 * del gemelo se traería esa superficie sin notarlo — y este documento contiene internal
 * names propuestos, precondiciones de construcción y prompts de agente: nada que un
 * cliente deba ver. El requisito no es "el botón está apagado": es que NO EXISTA el
 * camino. Si algún día se decide exponerla, se viene acá y se borra el guard — que es
 * exactamente la conversación que queremos forzar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pieceBySlug } from "@/lib/pieces/registry";

const RAIZ = process.cwd();

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

const MENCIONA = /implementaci[oó]n|implementacion/i;

describe("Implementación es un documento INTERNO: no existe camino a la superficie externa", () => {
  it("no hay ninguna ruta bajo app/external/ que sea de implementación", () => {
    const ofensores = walk("app/external").filter((f) => MENCIONA.test(f));
    expect(
      ofensores,
      `Apareció una ruta externa de implementación: ${ofensores.join(", ")}. Es interna por diseño.`,
    ).toEqual([]);
  });

  it("ningún archivo de app/external/ importa el workspace o el adaptador", () => {
    const ofensores: string[] = [];
    for (const f of walk("app/external")) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      if (/implementacion-landing-adapter|ImplementacionWorkspace|configs\/implementacion/.test(src))
        ofensores.push(f);
    }
    expect(ofensores).toEqual([]);
  });

  it("no existe un endpoint publish-implementacion (ni equivalente)", () => {
    const ofensores = walk("app/api").filter(
      (f) => MENCIONA.test(f) && /publish|external|compartir|share/i.test(f),
    );
    expect(ofensores).toEqual([]);
  });

  it("la pieza está declarada como INTERNA en el registro", () => {
    expect(pieceBySlug("implementation")?.clientFacing).toBe(false);
  });
});
