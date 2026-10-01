/**
 * lib/exploraciones/guardas.test.ts — las reglas de la exploración de venta que no son de una función.
 *
 * ⛔ Tuteo, nunca voseo, en todo lo que el vendedor lee: las pantallas, los mensajes de la API y los
 * textos del guion y de las casillas. Mira los TEXTOS con el AST (lib/ui/voseo.ts): un comentario
 * que cita el voseo no cuenta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

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

const DE_LA_EXPLORACION = [
  ...archivos("lib/exploraciones", (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")),
  ...archivos("components/exploraciones", (f) => /\.tsx?$/.test(f)),
  ...archivos("app/(shell)/sales/exploraciones", (f) => /\.tsx?$/.test(f)),
  ...archivos("app/api/sales/exploraciones", (f) => /\.tsx?$/.test(f)),
  "components/ui/Segmentado.tsx",
  "lib/clients/cliente-de-la-empresa-de-ventas.ts",
];

describe("⛔ la exploración de venta habla en tuteo, nunca en voseo", () => {
  it("hay archivos que revisar", () => {
    expect(DE_LA_EXPLORACION.length).toBeGreaterThan(15);
  });

  it("ni una forma de voseo en los textos que se leen", () => {
    const hallados: string[] = [];
    for (const rel of DE_LA_EXPLORACION) {
      const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const { linea, texto } of textosDelFuente(fuente, rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, "volvió el voseo (si una palabra es tuteo de verdad, súmala a su lista en lib/ui/voseo.ts)").toEqual([]);
  });
});
