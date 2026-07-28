/**
 * lib/ui/pdf-mode-coverage.test.ts — lo que no sobrevive a Puppeteer tiene que consultarlo.
 *
 * ── EL BUG QUE HABRÍA CAZADO ─────────────────────────────────────────────────
 * El PDF se genera con Puppeteer sobre la MISMA página que ve el usuario. El export dispara
 * en cuanto las fuentes y las imágenes cargaron (`PdfReadySignal`), y ahí congela. Todo lo
 * que aparezca DESPUÉS de ese instante —o que dependa del viewport, o que viva adentro de un
 * scroller— sale mal, y sale mal EN SILENCIO: no hay error, hay un PDF feo.
 *
 * `sections-diagram.tsx` lo resolvió bien: `ctx.pdfMode ? <DiagramStatic/> : <FlowchartViewer/>`.
 * `KickoffSections.tsx` montaba el MISMO `FlowchartViewer` con `ssr:false` y sin consultar
 * nada, así que el PDF del kickoff habría impreso el esqueleto gris en lugar de los procesos.
 * Nada lo señalaba: `pdfMode` estaba implementado en UN solo archivo de todo el repo.
 *
 * ── EL CRITERIO ──────────────────────────────────────────────────────────────
 * Un archivo del motor que use alguno de estos patrones DEBE mencionar `pdfMode`, o estar
 * en `EXENTOS` con el motivo escrito:
 *
 *   ssr: false      monta después del snapshot → sale el `loading`
 *   <canvas         no entra confiablemente en `page.pdf()` (ver DECISIONS §Roles)
 *   NNvh / dvh      se resuelve contra el viewport del RUNNER (1600px), no contra la hoja
 *   overflow auto   un scroller imprime SOLO su primer viewport → se corta lo de al lado
 *
 * fs-scan, como el resto de las guardas de UI del repo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Los archivos que se rinden DENTRO del motor `.stl` — los únicos que llegan al PDF. */
const DIRS = [
  path.join(RAIZ, "components", "landing"),
  path.join(RAIZ, "components", "canvas", "kickoff-sections"),
  path.join(RAIZ, "components", "canvas", "desarrollo-sections"),
  path.join(RAIZ, "components", "canvas", "exploracion-sections"),
  path.join(RAIZ, "components", "canvas", "implementacion-sections"),
];

/**
 * Exentos, CON MOTIVO. Entrar acá es una decisión, no un atajo.
 */
const EXENTOS: Record<string, string> = {
  // Es el que YA resuelve el problema: define `DiagramStatic`, la variante de impresión.
  "components/landing/diagram-static.tsx": "es la variante estática de impresión en sí misma",
  // Primitivas de edición: `mode='read'` no las renderiza, así que nunca llegan al PDF.
  "components/landing/inline.tsx": "chrome de edición — no se renderiza en mode=read",
  "components/landing/sortable.tsx": "chrome de edición — no se renderiza en mode=read",
  // El motor: aplica `.stl-pdf-mode` desde afuera y pasa `ctx` a las secciones.
  "components/landing/LandingView.tsx": "el contenedor, no una sección",
};

const PATRONES: { nombre: string; re: RegExp }[] = [
  { nombre: "ssr:false (monta async)", re: /ssr:\s*false/ },
  { nombre: "<canvas> (no entra en page.pdf)", re: /<canvas[\s>]/ },
  { nombre: "unidades de viewport (vh/dvh)", re: /\b\d+(vh|dvh|svh)\b/ },
  { nombre: "scroller (overflow auto)", re: /overflow(X|Y)?:\s*"auto"|overflow-(x|y)-auto/ },
];

/**
 * Solo CÓDIGO. Los encabezados de estos archivos EXPLICAN la regla y la nombran — el de
 * `sections-roles.tsx` dice textualmente que evita "canvas, `ssr:false`" porque el motor se
 * renderiza en PDF. Escanear el comentario lo acusaba de cometer justo lo que documenta
 * haber evitado. Mismo criterio y misma expresión que `codigoDe` en
 * lib/pieces/enabled-filter.test.ts.
 */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function archivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(full);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("todo lo que Puppeteer no captura consulta `pdfMode`", () => {
  it("ningún componente del motor usa un patrón hostil al PDF sin consultarlo", () => {
    const ofensores: string[] = [];
    for (const dir of DIRS) {
      for (const full of archivos(dir)) {
        const rel = path.relative(RAIZ, full).replace(/\\/g, "/");
        if (EXENTOS[rel]) continue;
        const src = soloCodigo(fs.readFileSync(full, "utf8"));
        const hits = PATRONES.filter((p) => p.re.test(src)).map((p) => p.nombre);
        if (hits.length > 0 && !src.includes("pdfMode")) {
          ofensores.push(`${rel} → ${hits.join(", ")}`);
        }
      }
    }
    expect(
      ofensores,
      "Estos se rinden en el PDF y no tienen variante de impresión. Agregá la rama " +
        "`ctx.pdfMode ? … : …` (ver components/landing/sections-diagram.tsx) o sumalos a " +
        "EXENTOS con el motivo:\n" + ofensores.join("\n"),
    ).toEqual([]);
  });

  it("el caso concreto: los procesos del kickoff tienen su variante estática", () => {
    // Es EL bug que motivó esta guarda; se nombra aparte para que el diff lo recuerde.
    const src = fs.readFileSync(
      path.join(RAIZ, "components", "canvas", "kickoff-sections", "KickoffSections.tsx"), "utf8",
    );
    expect(src).toMatch(/ctx\.pdfMode \?/);
    expect(src).toContain("DiagramStatic");
  });
});
