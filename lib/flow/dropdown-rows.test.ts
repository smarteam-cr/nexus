import fs from "node:fs";
import path from "node:path";
import { PIEZAS_DE_UN_SERVICIO_RECURRENTE } from "@/lib/servicios/ciclo";
import { describe, expect, it } from "vitest";
import { buildPieceRows, type CanvasParaFila } from "./dropdown-rows";

const c = (over: Partial<CanvasParaFila> & { slug: string | null }): CanvasParaFila => ({
  id: `id-${over.slug ?? "custom"}`,
  name: over.slug ?? "Sin nombre",
  ...over,
});

const slugs = (rows: ReturnType<typeof buildPieceRows>) => rows.map((r) => r.slug);
const de = (rows: ReturnType<typeof buildPieceRows>, slug: string) =>
  rows.find((r) => r.slug === slug)!;

describe("el desplegable muestra el FLUJO, no solo lo que existe", () => {
  it("un proyecto sin ninguna pieza igual lista todo el recorrido", () => {
    // Ésta es la razón de ser del cambio: antes, una pieza que el proyecto no tenía era
    // indistinguible de una que no existe en Nexus. El CSE no podía saber que el
    // Diagnóstico era una opción.
    //
    // ⚠ El orden es el de PRESENTACIÓN (lib/flow/orden-de-presentacion.ts), no el narrativo
    // de las etapas: el cronograma encabeza porque es el documento que se abre todos los
    // días. Quién es dueño de ese orden se sostiene en `orden-de-presentacion.test.ts`.
    const rows = buildPieceRows([]);
    expect(slugs(rows)).toEqual([
      "timeline",
      "kickoff",
      "exploration",
      "diagnosis",
      "planning",
      "implementation",
      "tech-requirements",
      "delivery",
    ]);
    expect(rows.every((r) => r.state === "por_activar")).toBe(true);
    expect(rows.every((r) => r.canvasId === null)).toBe(true);
  });

  it("el HANDOFF no está: tiene su propia sección arriba del panel", () => {
    expect(slugs(buildPieceRows([]))).not.toContain("handoff");
  });

  it("distingue generada de vacía por el contenido, no por que exista la fila", () => {
    const rows = buildPieceRows([
      c({ slug: "kickoff", name: "Kickoff", hasContent: true }),
      c({ slug: "diagnosis", name: "Diagnóstico", hasContent: false }),
    ]);
    expect(de(rows, "kickoff").state).toBe("generada");
    expect(de(rows, "diagnosis").state).toBe("vacia");
    expect(de(rows, "planning").state).toBe("por_activar");
  });

  it("cada pieza trae su agente para el CTA de generar", () => {
    const rows = buildPieceRows([]);
    expect(de(rows, "kickoff").agent?.agentId).toBe("agent-kickoff-canvas");
    expect(de(rows, "exploration").agent?.async).toBe(true);
    // El cronograma tiene su propio CTA dentro del canvas (conoce fases y publicación),
    // así que acá no trae agente: no se dispara desde el desplegable.
    expect(de(rows, "timeline").agent).toBeNull();
  });

  it("respeta el orden del menú, no el de creación en la base", () => {
    const rows = buildPieceRows([
      c({ slug: "tech-requirements", name: "Desarrollo" }),
      c({ slug: "kickoff", name: "Kickoff" }),
      c({ slug: "exploration", name: "Exploración" }),
    ]);
    expect(slugs(rows).indexOf("kickoff")).toBeLessThan(slugs(rows).indexOf("exploration"));
    expect(slugs(rows).indexOf("exploration")).toBeLessThan(
      slugs(rows).indexOf("tech-requirements"),
    );
  });

  it("usa el rótulo del registro, no el nombre guardado en la base", () => {
    // Es la promesa de F1: renombrar una pieza es cambiar su rótulo en un solo lugar.
    // Si el desplegable leyera `name`, los canvases viejos seguirían con el nombre viejo.
    const rows = buildPieceRows([c({ slug: "kickoff", name: "Nombre viejo en la base" })]);
    expect(de(rows, "kickoff").label).toBe("Kickoff");
  });
});

describe("los canvases sueltos del CSE", () => {
  it("van al final y no desaparecen", () => {
    const rows = buildPieceRows([
      c({ slug: null, id: "cx", name: "Notas de la reunión", hasContent: true }),
      c({ slug: "kickoff", name: "Kickoff" }),
    ]);
    const ultima = rows[rows.length - 1];
    expect(ultima.label).toBe("Notas de la reunión");
    expect(ultima.canvasId).toBe("cx");
    expect(ultima.agent).toBeNull();
    expect(ultima.state).toBe("generada");
  });

  it("no se confunden con una pieza del flujo aunque se llamen igual", () => {
    const rows = buildPieceRows([c({ slug: null, id: "cy", name: "Diagnóstico" })]);
    // La fila de la PIEZA sigue estando y sigue por activar; el canvas suelto es otro.
    expect(de(rows, "diagnosis").state).toBe("por_activar");
    expect(rows.filter((r) => r.label === "Diagnóstico")).toHaveLength(2);
  });
});

describe("las herramientas también llevan copias (Elías, 30 oct)", () => {
  it("un servicio recurrente tiene la exploración en su flujo, y «Nuevo artefacto» no depende del tipo de proyecto", () => {
    expect(PIEZAS_DE_UN_SERVICIO_RECURRENTE as readonly string[]).toContain("exploration");
    const panel = fs.readFileSync(path.join(process.cwd(), "components/clients/ProjectCanvasPanel.tsx"), "utf8");
    expect(panel).toContain("onNuevoArtefacto={(grupo) => setNuevoArtefacto(");
  });

  it("una copia de exploración sale debajo de la de siempre, y los cuestionarios sin canvas también tienen las suyas", () => {
    const filas = buildPieceRows([c({ slug: "exploration" }), c({ slug: null, id: "otra", tipoArtefacto: "exploration", name: "Marketing" })]);
    expect(slugs(filas)).toContain("copia:otra");
    const cuestionarios = buildPieceRows([c({ slug: null, id: "t", tipoArtefacto: "questionnaires", name: "Dirección" })]);
    expect(de(cuestionarios, "copia:t")).toMatchObject({ label: "Dirección", tipo: "questionnaires", esCopia: true });
  });

  it("un documento con nombre propio lo creó alguien: queda en la lista aunque esté vacío", () => {
    expect(de(buildPieceRows([c({ slug: "diagnosis", titulo: "Ventas" })]), "diagnosis").conNombre).toBe(true);
    expect(de(buildPieceRows([c({ slug: "diagnosis" })]), "diagnosis").conNombre).toBe(false);
  });
});

describe("las COPIAS de un tipo (etapa V3, docs/artefactos-plan.md)", () => {
  const copia = (id: string, tipo: string, over: Partial<CanvasParaFila> = {}): CanvasParaFila => ({
    id,
    slug: null,
    tipoArtefacto: tipo,
    name: `${tipo} ${id}`,
    ...over,
  });

  it("con una sola planificación, las filas son las de siempre (sin copias que mostrar)", () => {
    const sola = buildPieceRows([c({ slug: "planning", name: "Planificación", hasContent: true })]);
    expect(slugs(sola)).toEqual(slugs(buildPieceRows([])));
    expect(de(sola, "planning")).toMatchObject({ label: "Planificación", state: "generada", tipo: "planning", terminado: false });
  });

  it("tres planificaciones: tres filas juntas, en el orden de la persona (el de siempre es una más)", () => {
    const rows = buildPieceRows([
      c({ slug: "planning", name: "Planificación", order: 1, hasContent: true }),
      copia("a", "planning", { titulo: "Marketing", order: 0 }),
      copia("b", "planning", { titulo: "WhatsApp", order: 2, terminadoEn: "2026-10-29T10:00:00.000Z" }),
      c({ slug: "kickoff", name: "Kickoff" }),
    ]);
    const i = slugs(rows).indexOf("copia:a");
    expect(slugs(rows).slice(i, i + 3)).toEqual(["copia:a", "planning", "copia:b"]);
    expect(rows.find((r) => r.slug === "copia:a")).toMatchObject({ label: "Marketing", esCopia: true, tipo: "planning", agent: null, canvasId: "a" });
    expect(rows.find((r) => r.slug === "copia:b")?.terminado).toBe(true);
  });

  it("una copia sin el documento de siempre: la fila «por activar» del tipo va primero y la copia al lado", () => {
    const rows = buildPieceRows([copia("a", "diagnosis", { titulo: "Diagnóstico de marketing" })]);
    const i = slugs(rows).indexOf("diagnosis");
    expect(slugs(rows)[i + 1]).toBe("copia:a");
    expect(de(rows, "diagnosis").state).toBe("por_activar");
  });

  it("los tipos nuevos (sin fila en el flujo) van después del flujo y antes de los sueltos del CSE", () => {
    const rows = buildPieceRows([
      copia("i", "roadmap", { titulo: "Hoja de ruta 2027" }),
      copia("p", "adoption-plan", { titulo: "Adopción de ventas" }),
      c({ slug: null, id: "suelto", name: "Notas sueltas" }),
    ]);
    expect(slugs(rows).slice(-3)).toEqual(["copia:p", "copia:i", "custom:suelto"]);
  });

  it("una copia llamada como su pieza no se confunde con el de siempre", () => {
    const rows = buildPieceRows([copia("a", "planning", { name: "Planificación · copia", titulo: "Planificación" })]);
    expect(de(rows, "planning").canvasId).toBeNull();
    expect(rows.find((r) => r.slug === "copia:a")?.label).toBe("Planificación");
  });

  it("el widget no cuenta las copias", () => {
    const rows = buildPieceRows([copia("a", "planning")], { incluirCopias: false, incluirCustom: false });
    expect(slugs(rows)).not.toContain("copia:a");
  });
});
