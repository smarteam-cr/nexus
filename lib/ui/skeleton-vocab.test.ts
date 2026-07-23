/**
 * lib/ui/skeleton-vocab.test.ts — TESTS PERMANENTES DEL VOCABULARIO DE SKELETONS.
 *
 * Por qué existen: la app llegó a tener 39 "slabs opacos" (rectángulos rellenos
 * grandes que ocupan espacio sin comunicar qué viene) porque el único átomo del
 * sistema era macizo y la única primitiva estructural estaba escondida dentro de
 * Table.tsx. La convención sola no lo evitó; esto es lo que FRENA el merge.
 *
 * Mismo patrón estructural que lib/cobranza/costos-privacy.test.ts: se escanea el
 * árbol con fs y se afirma sobre el código fuente.
 *
 * T1 · anti-slab: nada con `skeleton-shimmer` alto y vacío (la regla ESLint cubre
 *      el caso `<Skeleton>`; acá se cubre el div a mano).
 * T2 · primitivas sanas: CardsSkeleton y ListSkeleton delinean (border-line).
 * T3 · animación única: cero `animate-pulse` como estado de carga.
 * T4 · sin texto suelto: cero "Cargando…" como único contenido de un branch.
 * T5 · Spinner acotado: no aparece en ningún loading.tsx.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, EXENTOS_STL, archivosUi } from "./scan-source";

const ARCHIVOS = archivosUi(EXENTOS_STL);
const LOADINGS = ARCHIVOS.filter((f) => path.basename(f) === "loading.tsx");

/**
 * DEUDA CONOCIDA — ratchet de la migración (olas 3-5 del plan de loaders).
 *
 * La estandarización se hizo por olas: primitivas → workspace del cliente → loading.tsx.
 * Estos archivos son los que faltan (módulos secundarios y el motor de landing). El test
 * NO los perdona en silencio: falla si aparece un ofensor NUEVO, y falla también si una
 * entrada de acá ya fue arreglada (obliga a sacarla) — así la lista solo puede encoger.
 * Cuando quede vacía, se borra la constante y la regla ESLint anti-slab pasa a `error`.
 */
const DEUDA = {
  slabs: [
    "app/(shell)/sessions/AnalysisPanel.tsx:468",
    "components/canvas/BlockRenderer.tsx:9",
    "components/charts/EChartRenderer.tsx:10",
    "components/clients/ClientCanvasPanel.tsx:141",
    "components/clients/ClientInfoPanel.tsx:128",
    "components/clients/MinuteDialog.tsx:211",
    "components/clients/ProjectCanvasPanel.tsx:31",
    "components/clients/ProjectSessionsReview.tsx:152",
    "components/clients/SectionDiscoveryModal.tsx:9",
  ],
  animatePulse: [
    "app/(shell)/audits/[id]/AuditDetailClient.tsx",
    "app/(shell)/marketing/generacion/EngineClient.tsx",
    "app/portal/page.tsx",
    "components/business-cases/BusinessCaseWorkspace.tsx",
    "components/chat/PlanningChat.tsx",
    "components/clients/ClientContextCards.tsx",
  ],
  // El aside de /sessions es excelente, pero su panel derecho usa un spinner centrado.
  spinnerEnLoading: ["app/(shell)/sessions/loading.tsx"],
};

/** Compara contra la deuda: reporta lo NUEVO y lo YA ARREGLADO (que hay que quitar). */
function contraDeuda(actuales: string[], conocidos: string[]) {
  const norm = (s: string) => s.split(/[\\/]/).join("/");
  const act = actuales.map(norm);
  const con = conocidos.map(norm);
  return {
    nuevos: act.filter((a) => !con.includes(a)),
    yaArreglados: con.filter((c) => !act.includes(c)),
  };
}

/** Altura Tailwind > h-12 (48px): a partir de ahí un rectángulo vacío ya no es "una línea". */
const ALTO_DE_PANEL = /(?:^| )h-(?:1[3-9]|[2-9][0-9]|screen|full)(?: |$)/;

describe("T1 · anti-slab: ningún shimmer alto y vacío escrito a mano", () => {
  it("todo div con skeleton-shimmer y altura de panel tiene borde o hijos", () => {
    const ofensores: string[] = [];
    for (const rel of ARCHIVOS) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const lineas = src.split("\n");
      lineas.forEach((linea, i) => {
        if (!linea.includes("skeleton-shimmer")) return;
        // Solo la clase en la MISMA línea (heurística deliberadamente simple y estable).
        const m = linea.match(/className="([^"]*skeleton-shimmer[^"]*)"/);
        if (!m || !ALTO_DE_PANEL.test(m[1])) return;
        // Legítimos: la cáscara declara borde, o el padre fija la altura (marcado).
        if (m[1].includes("border") || linea.includes("slab-ok")) return;
        // Auto-cerrado y sin hijos en la misma línea → es un slab.
        if (linea.includes("/>")) ofensores.push(`${rel}:${i + 1}`);
      });
    }
    const { nuevos, yaArreglados } = contraDeuda(ofensores, DEUDA.slabs);
    expect(
      nuevos,
      `Slabs opacos NUEVOS (rectángulo relleno alto y vacío). Usá SkeletonPanel con minH, o ` +
        `marcá {/* slab-ok */} si el padre fija la altura:\n${nuevos.join("\n")}`,
    ).toEqual([]);
    expect(
      yaArreglados,
      `Estos ya no son slabs: sacalos de DEUDA.slabs para que la lista siga encogiendo:\n${yaArreglados.join("\n")}`,
    ).toEqual([]);
  });
});

describe("T2 · las primitivas de grilla y lista DELINEAN, no rellenan", () => {
  const src = fs.readFileSync(path.join(RAIZ, "components", "ui", "Skeleton.tsx"), "utf8");

  it("SkeletonPanel exige minH y dibuja la cáscara con border-line", () => {
    expect(src, "SkeletonPanel debe existir").toContain("export function SkeletonPanel");
    expect(src, "minH tiene que ser obligatoria (sin `?`)").toMatch(/minH: string;/);
    expect(src).toContain("border border-line");
  });

  it("CardsSkeleton y ListSkeleton componen cáscaras delineadas", () => {
    const cards = src.slice(src.indexOf("export function CardsSkeleton"), src.indexOf("// ── ListSkeleton"));
    const list = src.slice(src.indexOf("export function ListSkeleton"), src.indexOf("// ── TableSkeleton"));
    expect(cards, "CardsSkeleton debe usar SkeletonPanel (celdas delineadas, no rellenas)").toContain(
      "SkeletonPanel",
    );
    expect(list, "ListSkeleton debe dibujar filas con border-line").toContain("border border-line");
  });
});

describe("T3 · una sola animación de carga", () => {
  it("no queda animate-pulse como estado de carga", () => {
    // Solo dentro de un className (no en comentarios: este mismo repo documenta la regla
    // escribiendo "reemplaza animate-pulse", y eso no es una violación).
    const ofensores = ARCHIVOS.filter((rel) => {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      return src
        .split("\n")
        .some((l) => /animate-pulse/.test(l) && /className|class=/.test(l) && !/^\s*(?:\*|\/\/)/.test(l));
    });
    const { nuevos, yaArreglados } = contraDeuda(ofensores, DEUDA.animatePulse);
    expect(
      nuevos,
      `La técnica única es \`skeleton-shimmer\` (globals.css). animate-pulse NUEVO en:\n${nuevos.join("\n")}`,
    ).toEqual([]);
    expect(
      yaArreglados,
      `Ya sin animate-pulse: sacalos de DEUDA.animatePulse:\n${yaArreglados.join("\n")}`,
    ).toEqual([]);
  });
});

describe("T4 · sin texto de carga suelto", () => {
  it("ningún branch de carga devuelve solo un párrafo «Cargando…»", () => {
    const patron = /return\s*(?:\(\s*)?<p[^>]*>\s*(?:Cargando|Preparando|Procesando)[^<]*<\/p>/;
    const ofensores = ARCHIVOS.filter((rel) => patron.test(fs.readFileSync(path.join(RAIZ, rel), "utf8")));
    expect(
      ofensores,
      `Un párrafo de una línea que swapea a contenido alto es layout shift puro. Usá un ` +
        `skeleton estructural que reserve la altura:\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });
});

describe("T5 · Spinner solo para acciones en curso", () => {
  it("ningún loading.tsx usa Spinner para reservar la pantalla", () => {
    const ofensores = LOADINGS.filter((rel) =>
      /<Spinner/.test(fs.readFileSync(path.join(RAIZ, rel), "utf8")),
    );
    const { nuevos, yaArreglados } = contraDeuda(ofensores, DEUDA.spinnerEnLoading);
    expect(
      nuevos,
      `Un spinner no reserva altura: el contenido salta al llegar. En un loading.tsx va un ` +
        `skeleton estructural:\n${nuevos.join("\n")}`,
    ).toEqual([]);
    expect(
      yaArreglados,
      `Ya sin Spinner: sacalos de DEUDA.spinnerEnLoading:\n${yaArreglados.join("\n")}`,
    ).toEqual([]);
  });
});
