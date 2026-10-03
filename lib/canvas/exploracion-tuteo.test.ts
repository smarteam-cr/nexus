import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

/**
 * ⛔ La Exploración del CSE y los cuestionarios hablan en TUTEO (pedido de Elías, 2026-10-02).
 *
 * Cubre lo que lee una persona —la pantalla del CSE y del cliente— y lo que lee el agente: el prompt
 * de la exploración en voseo hacía que el documento saliera en voseo aunque el prompt terminara
 * pidiendo «Español, tuteo». Mismo detector que la exploración de venta (lib/ui/voseo.ts).
 */
const RAIZ = process.cwd();

function archivos(dir: string, filtro: (f: string) => boolean): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(rel, filtro));
    else if (filtro(e.name)) out.push(rel);
  }
  return out;
}

const fuente = (f: string) => /\.tsx?$/.test(f) && !f.includes(".test.");

const DE_LA_EXPLORACION_DEL_CSE = [
  "components/landing/configs/exploracion.defs.ts",
  "components/landing/configs/exploracion-lenses.ts",
  "components/landing/configs/exploracion.ts",
  "lib/canvas/exploracion-generate.ts",
  "lib/canvas/exploracion-preguntas.ts",
  "components/canvas/ExploracionWorkspace.tsx",
  ...archivos("components/canvas/exploracion-sections", fuente),
  ...archivos("lib/cuestionario", fuente),
  ...archivos("lib/guia-exploracion", fuente),
  ...archivos("components/cuestionario", fuente),
  ...archivos("components/guia-exploracion", fuente),
  "components/external/CuestionarioCliente.tsx",
  ...archivos("app/external/cuestionario", fuente),
  ...archivos("app/api/external/cuestionario", fuente),
  ...archivos("app/api/projects/[projectId]/cuestionario", fuente),
  ...archivos("app/api/projects/[projectId]/guia-exploracion", fuente),
].filter((f) => fs.existsSync(path.join(RAIZ, f)));

describe("⛔ la exploración del CSE y los cuestionarios hablan en tuteo, nunca en voseo", () => {
  it("hay archivos que revisar", () => {
    expect(DE_LA_EXPLORACION_DEL_CSE.length).toBeGreaterThan(15);
  });

  it("ni una forma de voseo en los textos que se leen (pantallas y prompts)", () => {
    const hallados: string[] = [];
    for (const rel of DE_LA_EXPLORACION_DEL_CSE) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const { linea, texto } of textosDelFuente(src, rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, "volvió el voseo (si una palabra es tuteo de verdad, súmala a su lista en lib/ui/voseo.ts)").toEqual([]);
  });
});
