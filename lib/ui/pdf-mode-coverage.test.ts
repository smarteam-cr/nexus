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
  path.join(RAIZ, "components", "canvas", "cronograma-sections"),
];

/**
 * Componentes SUELTOS que también se rinden dentro del motor, aunque no vivan en una carpeta
 * de secciones. Se listan a mano porque la carpeta que los contiene es de la app interna.
 *
 * `TimelineSection` es el caso que motivó agregar esta lista: el Gantt se monta dentro del
 * kickoff (`KickoffTimelineSection`) y su grilla vive en un `overflow-x: auto`. Un scroller
 * imprime SOLO su primer viewport, así que todo cronograma de más de ~14 semanas salía
 * cortado a la derecha, sin ningún indicio en el PDF de que faltaba algo. El escaneo por
 * carpeta no lo veía.
 */
const ARCHIVOS_SUELTOS = [path.join(RAIZ, "components", "canvas", "TimelineSection.tsx")];

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
  /* Un iframe muere en el PDF por CUATRO vías independientes, y ninguna avisa:
     `PdfReadySignal` enumera las `<img>` del documento de ARRIBA y no ve nada adentro, así
     que la señal de "listo" se dispara con el frame en blanco; `pdf-runner` mide la página
     con `scrollHeight` y un iframe solo aporta su caja declarada (recorte silencioso); lo
     animado se congela en un frame arbitrario; y Chrome imprime frames sandboxeados de
     forma poco confiable. Hasta 2026-08-12 el guard no lo detectaba y no había ningún
     iframe en el repo — el patrón entró junto con el primero. */
  { nombre: "<iframe> (Puppeteer no lo espera ni lo mide)", re: /<iframe[\s>]/ },
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
    for (const full of [...DIRS.flatMap(archivos), ...ARCHIVOS_SUELTOS]) {
      {
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

  it("el caso concreto: el Gantt se encoge en vez de cortarse, y sale abierto", () => {
    /* No alcanza con que el archivo mencione el modo impresión: la grilla NO puede quedar en
       un scroller, porque eso es exactamente lo que recorta. Se comprueba que el overflow
       dependa del modo y que exista el encogido. */
    const src = fs.readFileSync(path.join(RAIZ, "components", "canvas", "TimelineSection.tsx"), "utf8");
    expect(src, "el overflow de la grilla no depende del modo impresión").toMatch(
      /overflowX:\s*pdf \?/,
    );
    expect(src, "falta el encogido — sin él, encima, se sale de la hoja").toContain("fitZoom");
    /* Y las fases tienen que salir ABIERTAS. Se despliegan con un clic y en papel nadie puede
       hacerlo: colapsadas, el PDF imprime las barras de colores y CERO tareas. Es el modo de
       falla más caro de los dos, porque no da error — sale un documento lindo y hueco. */
    expect(src, "las fases salen colapsadas en el PDF: barras sin una sola tarea").toMatch(
      /const isOpen = pdf \|\|/,
    );
  });

  it("TODOS los que montan el Gantt le pasan `pdf` — no solo el kickoff", () => {
    /* El prop puede existir y no prenderlo nadie: mismo bug. Y esto ya casi pasa una vez —
       el documento del Cronograma es un segundo montaje, y la comprobación de arriba solo
       miraba al kickoff. Se busca a los que lo importan y se verifica cada uno. */
    const candidatos = [
      "components/canvas/kickoff-sections/KickoffSections.tsx",
      "components/canvas/cronograma-sections/CronogramaSections.tsx",
    ];
    // Exento CON MOTIVO: la página del cliente se ve en pantalla, no se imprime nunca.
    const EXENTO_EXTERNO = "components/external/TimelineLanding.tsx";

    const montadores = archivos(path.join(RAIZ, "components"))
      .map((f) => path.relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((rel) => rel !== EXENTO_EXTERNO && rel !== "components/canvas/TimelineSection.tsx")
      .filter((rel) => /from "@\/components\/canvas\/TimelineSection"/.test(fs.readFileSync(path.join(RAIZ, rel), "utf8")));

    expect(montadores.sort(), "apareció un montaje del Gantt que esta guarda no conocía").toEqual(
      candidatos.sort(),
    );
    for (const rel of montadores) {
      expect(
        fs.readFileSync(path.join(RAIZ, rel), "utf8"),
        `${rel} monta el Gantt sin pasarle \`pdf\`: en el PDF sale cortado a la derecha`,
      ).toMatch(/pdf=\{ctx\.pdfMode\}/);
    }
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
