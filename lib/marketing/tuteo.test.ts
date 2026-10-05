/**
 * lib/marketing/tuteo.test.ts — ⛔ Marketing habla en tuteo, nunca en voseo.
 *
 * Correr: `npx vitest run lib/marketing/tuteo.test.ts --project unit`.
 *
 * Nace con el rediseño del 2026-10-04 (sistema «Nexus · interfaz interna»): las pantallas de Marketing estaban en
 * voseo («Generá», «Aceptá», «Corré el motor») y los atajos de «Ajustar con IA» le pedían al agente en voseo
 * («Hacelo más corto»): un pedido en voseo invita a contestar en voseo, y esa respuesta es una publicación.
 *
 * Mira los TEXTOS (cadenas, plantillas y JSX, con el AST de lib/ui/voseo.ts) de las pantallas, las rutas y lo que
 * la pantalla lee de lib/marketing. Quedan fuera los prompts de lib/marketing/agents: cambiarlos mueve lo que
 * escribe el agente y es otra decisión. La edición que la pone en rojo: escribir «Revisá» o «aceptala» acá.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Los .ts y .tsx de una carpeta, sin las pruebas ni la carpeta de los agentes. */
function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "agents" && e.name !== "__fixtures__") out.push(...fuentes(rel));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const CARPETAS = ["components/marketing", "app/(shell)/marketing", "app/api/marketing"];
const DE_LIB = [
  "lib/marketing/schema.ts",
  "lib/marketing/marketing-ui.ts",
  "lib/marketing/idea-sem.ts",
  "lib/marketing/parecidas.ts",
  "lib/marketing/tanda.ts",
];
const DE_MARKETING = [...CARPETAS.flatMap(fuentes), ...DE_LIB];

describe("⛔ Marketing habla en tuteo, nunca en voseo", () => {
  it("ni una forma de voseo en los textos que se leen", () => {
    const hallados: string[] = [];
    for (const rel of DE_MARKETING) {
      for (const { linea, texto } of textosDelFuente(leer(rel), rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, `Voseo en Marketing. Pásalo a tuteo («Revisa», «acéptala»):\n${hallados.join("\n")}`).toEqual([]);
  });

  it("la guarda mira algo (si la lista de archivos queda vacía, no protege nada)", () => {
    expect(DE_MARKETING.length).toBeGreaterThan(20);
  });
});
