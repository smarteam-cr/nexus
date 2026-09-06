import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HANDOFF_CANVAS } from "./canvas-defs";
import { agruparPorCliente, recortarTexto, type OportunidadDetectada } from "@/lib/ventas/oportunidades";

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

describe("D-11 (2026-09-04) · la sección SÍ sale de casa hacia Ventas — por UNA puerta, interna", () => {
  /* «Saber qué ofrecerle después» era la mitad del motivo de la sección, y hasta hoy no tenía
     lector: solo la veía quien abría el handoff de ese proyecto. /sales la lista por cliente junto
     con la sugerencia que el CSE deja al marcar «Entrega realizada» — que el panel vendía como
     «sugerencia para Ventas» sin que Ventas tuviera dónde leerla. */
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  const item = (o: Partial<OportunidadDetectada>): OportunidadDetectada => ({
    clientId: "c1", clientName: "Acme", projectId: "p1", projectName: "CRM", fuente: "handoff", texto: "x", fecha: null, autor: null, ...o,
  });

  it("agrupa por cliente: la sugerencia humana antes que el handoff, lo reciente primero, sin fecha al final", () => {
    const grupos = agruparPorCliente([
      item({ clientId: "c2", clientName: "Beta", fuente: "handoff", fecha: null }),
      item({ clientId: "c1", fuente: "handoff", fecha: "2026-08-01T00:00:00.000Z", texto: "h-viejo" }),
      item({ clientId: "c1", fuente: "handoff", fecha: "2026-09-01T00:00:00.000Z", texto: "h-nuevo" }),
      item({ clientId: "c1", fuente: "entrega", fecha: "2026-07-01T00:00:00.000Z", texto: "sugerencia", autor: "ana@smarteamcr.com" }),
      item({ clientId: "c3", clientName: "Gamma", fuente: "entrega", fecha: "2026-09-03T00:00:00.000Z" }),
    ]);
    expect(grupos.map((g) => g.clientName), "por ítem más reciente; sin fecha al final").toEqual(["Gamma", "Acme", "Beta"]);
    const acme = grupos[1]!;
    expect(acme.ultima).toBe("2026-09-01T00:00:00.000Z");
    expect(acme.items.map((i) => i.texto), "la sugerencia del CSE va primero aunque sea más vieja; el handoff, nuevo → viejo").toEqual(["sugerencia", "h-nuevo", "h-viejo"]);
  });

  it("recorta con «…» por encima del tope y nunca devuelve más que el tope", () => {
    expect(recortarTexto("  hola \r\n\r\n\r\n\r\nmundo  ")).toBe("hola\n\nmundo");
    const largo = recortarTexto("a".repeat(2000), 50);
    expect(largo.length).toBeLessThanOrEqual(50);
    expect(largo.endsWith("…")).toBe(true);
  });

  it("⭐ la sección tiene UN lector fuera del embudo, y es interno (lib/ventas), nunca un documento", () => {
    /* La edición que lo pone en rojo: importar `loadFueraDeAlcanceDeTodos` desde un generador de
       documento «para que el kickoff sepa qué no vendimos» — es exactamente lo que el describe de
       arriba impide por las allowlists, y esta puerta nueva lo saltearía. */
    const lector = leer("lib/canvas/load-canvas-context.ts");
    expect(lector, "el lector vive en el archivo sancionado por el candado del embudo").toContain("export async function loadFueraDeAlcanceDeTodos(");
    const cuerpo = lector.slice(lector.indexOf("export async function loadFueraDeAlcanceDeTodos("), lector.indexOf("Serializa el cronograma"));
    expect(cuerpo.length, "la guarda no mira nada").toBeGreaterThan(300);
    expect(cuerpo, "solo ESA key").toContain("key: FUERA_DE_ALCANCE_KEY");
    expect(lector).toContain(`const FUERA_DE_ALCANCE_KEY = "${KEY}"`);
    expect(cuerpo, "los internos de Smarteam quedan afuera: no hay a quién venderles").toContain("proyectoInterno: false");

    const consumidores: string[] = [];
    const rec = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if ((e.name.endsWith(".ts") || e.name.endsWith(".tsx")) && !e.name.includes(".test.")) {
          const rel = path.relative(RAIZ, p).split(path.sep).join("/");
          if (rel === "lib/canvas/load-canvas-context.ts") continue;
          if (/loadFueraDeAlcanceDeTodos\s*\(/.test(soloCodigo(fs.readFileSync(p, "utf8")))) consumidores.push(rel);
        }
      }
    };
    for (const d of ["lib", "app", "components", "scripts"]) rec(path.join(RAIZ, d));
    expect(consumidores.sort(), "un lector nuevo de «se conversó y no se vendió»: si alimenta un documento, es lo que el cliente pidió y NO le vendimos").toEqual(["lib/ventas/cargar-oportunidades.ts"]);
  });

  it("LA guarda: /sales carga las oportunidades SOLO con `ventas.read`, y las dos fuentes son las declaradas", () => {
    /* La edición que lo pone en rojo: cargarlas para todo interno «porque la página ya es interna» —
       la página sí; el dato es lo más interno del handoff y lo decide la celda de Ventas. */
    const pagina = soloCodigo(leer("app/(shell)/sales/page.tsx"));
    /* Se afirma la GARANTÍA, no la forma exacta de escribirla: la celda decide, y sin ella viaja
       `null`. Antes esto anclaba el ternario entero en una línea y se puso rojo al meter la carga
       dentro del `Promise.all` de la página — un cambio que no toca el gate. */
    expect(pagina, "la celda de Ventas es la que decide").toContain('can(ctx.teamMember, "ventas", "read")');
    expect(
      /puedeVerOportunidades\s*\?\s*cargarOportunidadesDetectadas\(\)\s*:\s*Promise\.resolve\(null\)/.test(pagina),
      "sin la celda no se carga nada: tiene que viajar null, no la lista",
    ).toBe(true);
    expect(pagina).toContain("<SalesClient prospects={prospects} oportunidades={oportunidades} />");
    const cliente = soloCodigo(leer("app/(shell)/sales/SalesClient.tsx"));
    expect(cliente, "sin datos no se pinta nada, ni un bloque vacío").toContain("{oportunidades && <OportunidadesDetectadas grupos={oportunidades} />}");
    const cargador = soloCodigo(leer("lib/ventas/cargar-oportunidades.ts"));
    expect(cargador, "la nota de la compuerta de entrega, solo las que tienen texto").toContain('gate: "ENTREGA_REALIZADA", note: { not: null }, project: { proyectoInterno: false }');
    expect(cargador).toContain("loadFueraDeAlcanceDeTodos()");
    expect(cargador, "solo lectura: nada de acá escribe").not.toMatch(/\.(update|create|upsert|delete)(Many)?\(/);
    const panel = leer("components/lifecycle/ProjectLifecyclePanel.tsx");
    expect(panel, "el panel dejó de prometer un traspaso que no existía: ahora dice dónde se lee").toContain("Ventas la lee en /sales › Oportunidades detectadas");
  });
});
