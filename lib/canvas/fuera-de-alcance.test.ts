import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HANDOFF_CANVAS } from "./canvas-defs";

/**
 * lib/canvas/fuera-de-alcance.test.ts — «SE CONVERSÓ Y NO SE VENDIÓ», Y NO SALE DE CASA.
 *
 * La sección lista lo que el cliente PIDIÓ en la venta y quedó afuera del alcance. Sirve a dos
 * cosas: defender el alcance cuando reaparece como «esto ya lo habíamos hablado», y saber qué
 * ofrecerle después. Las dos son conversaciones INTERNAS.
 *
 * ⛔ Es el contenido más caro de filtrar de todo el handoff. Mandarle al cliente un apartado
 * titulado «lo que pediste y no te vendimos» —con precios y motivos— no es una fuga de datos: es
 * un problema comercial en un documento que él archiva. Y el camino existe: seis documentos leen
 * el handoff, y el 2026-08-16 se taparon DOS que lo leían entero sin filtro.
 *
 * Hoy no puede pasar porque las seis listas son ALLOWLIST (opt-in): una key nueva queda afuera
 * sola. Este archivo existe para que agregarla sea imposible por accidente — el escaneo no
 * transcribe las seis listas, las descubre, así que una séptima también queda cubierta.
 */

const RAIZ = process.cwd();
const CONFIGS = path.join(RAIZ, "components", "landing", "configs");
const KEY = "fuera_de_alcance";

/** Las allowlists de handoff declaradas, descubiertas — no transcritas. */
function allowlistsDeHandoff(): Array<{ archivo: string; nombre: string; keys: string[] }> {
  const out: Array<{ archivo: string; nombre: string; keys: string[] }> = [];
  for (const archivo of fs.readdirSync(CONFIGS).filter((f) => f.endsWith(".defs.ts"))) {
    const src = fs.readFileSync(path.join(CONFIGS, archivo), "utf8");
    const re = /export const (\w*HANDOFF_KEYS)\s*=\s*\[([\s\S]*?)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      out.push({
        archivo,
        nombre: m[1],
        keys: [...m[2].matchAll(/"([a-z_]+)"/g)].map((k) => k[1]),
      });
    }
  }
  return out;
}

describe("la sección existe, en la fuente única", () => {
  it("con su key y su rótulo", () => {
    const sec = HANDOFF_CANVAS.sections.find((s) => s.key === KEY);
    expect(sec, "desapareció la sección «se conversó y no se vendió»").toBeDefined();
    expect(sec?.label).toBe("Se conversó y no se vendió");
  });

  it("⚠ y va DESPUÉS de «¿Qué vendimos?», que es lo que la hace legible", () => {
    /* Sola, una lista de pedidos sueltos no dice nada. Pegada al alcance vendido, se lee como lo
       que es: el borde. Si el orden se mueve, el documento pierde ese contraste. */
    const keys = HANDOFF_CANVAS.sections.map((s) => s.key);
    expect(keys.indexOf(KEY)).toBe(keys.indexOf("alcance_contratado") + 1);
  });
});

describe("⛔ y NO cruza al cliente por ninguna de las puertas", () => {
  const listas = allowlistsDeHandoff();

  it("el escaneo encuentra las allowlists — si no, esta guarda no mira nada", () => {
    /* La receta anti-guarda-decorativa: sin este assert, un cambio de nombre o de formato dejaría
       el escaneo en cero y las tres afirmaciones de abajo pasarían sobre una lista vacía. */
    expect(listas.length, "no se encontró ninguna allowlist de handoff").toBeGreaterThanOrEqual(6);
    for (const l of listas) {
      expect(l.keys.length, `${l.archivo}/${l.nombre}: allowlist vacía — ¿cambió el formato?`).toBeGreaterThan(0);
    }
  });

  it("⭐ ninguna la incluye", () => {
    const culpables = listas.filter((l) => l.keys.includes(KEY));
    expect(
      culpables.map((l) => `${l.archivo}/${l.nombre}`),
      "una lista que el cliente lee incluyó «se conversó y no se vendió» — es lo que el cliente pidió y NO le vendimos",
    ).toEqual([]);
  });

  it("⚠ y todas las keys que dejan pasar existen en el canvas", () => {
    /* Efecto colateral que vale: una allowlist con una key mal escrita no filtra de más, filtra de
       MENOS —esa sección nunca llega— y el documento sale flaco sin que nada avise. */
    const delCanvas = new Set(HANDOFF_CANVAS.sections.map((s) => s.key));
    for (const l of listas) {
      for (const k of l.keys) {
        expect(delCanvas.has(k), `${l.archivo}/${l.nombre}: "${k}" no existe en el canvas de handoff`).toBe(true);
      }
    }
  });
});

describe("⛔ el prompt del agente de CS no se queda corto", () => {
  const SEED = "scripts/seed-handoff-agent.ts";
  const src = fs.readFileSync(path.join(RAIZ, SEED), "utf8");

  it("⭐ pide TODAS las secciones del canvas, no las que había cuando se escribió", () => {
    /* Los dos agentes por tipo DERIVAN sus keys del canvas, así que no pueden quedarse cortos.
       El de Customer Success no: su prompt está transcrito a mano en el seed, y hasta hoy nada lo
       ataba a la plantilla. Una sección nueva en el canvas —un cambio de UNA línea— dejaba ese
       prompt corto, y `analyze` DESCARTA EN SILENCIO las keys que no vienen: la sección quedaba
       vacía para siempre, sin error en ningún lado. Es el mismo agujero que la fase 9 vino a
       tapar del otro lado. */
    for (const { key } of HANDOFF_CANVAS.sections) {
      expect(src, `el prompt de Customer Success no pide la sección "${key}"`).toContain(`"key": "${key}"`);
    }
  });

  it("y dice cuántas cards produce, sin mentir", () => {
    const n = HANDOFF_CANVAS.sections.length;
    expect(src, `la descripción quedó vieja: son ${n} secciones`).toContain(`Produce ${n} cards`);
  });

  it("⚠ y el seed COMPARA antes de pisar el prompt vivo", () => {
    /* Era el peor modo de falla del repo, y no por gusto: este prompt arranca todos los proyectos
       y además escribe las FASES del cronograma. Vive en la base para poder calibrarlo desde
       /agents sin deploy, y una corrida por reflejo borraba esa calibración sin dejar rastro —
       con 15 versiones del archivo en git, «volver a la anterior» tampoco es obvio. */
    expect(src, "el seed volvió a escribir sin comparar").toContain(
      "existing.systemPrompt !== HANDOFF_SYSTEM_PROMPT",
    );
    expect(src, "no hay salida temprana: compara y escribe igual").toMatch(/!force\s*\)\s*\{[\s\S]{0,900}return;/);
    expect(src).toContain('const force = process.argv.includes("--force")');
  });
});
