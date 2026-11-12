/**
 * lib/artefactos/archivar-de-siempre.int.test.ts — archivar el documento de siempre de un tipo (Elías, 12 nov: todo menos el
 * Resumen se archiva), contra una base REAL. La regla (lib/artefactos/copias-server.ts › archivarArtefacto): el de siempre
 * SUELTA SU LUGAR y queda como una copia archivada, así lo que lo busca por `slug` ve un proyecto que nunca lo tuvo.
 * `npx vitest run --project integration lib/artefactos/archivar-de-siempre.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { ensurePieceCanvas } from "@/lib/pieces/ensure-canvas";
import { pieceByName } from "@/lib/pieces/registry";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { asegurarExploracionDelProyecto, exploracionVivaDelProyecto, hayExploracionAbierta, textoDeLaExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { motivoDeLaCopia } from "@/lib/invariantes/artefactos";
import { archivarArtefacto, crearCopia, documentosDelTipo, reactivarArtefacto } from "./copias-server";
import { selloDelDeSiempreVigente, tiposConElDeSiempreArchivado } from "./archivados-server";
import { ARCHIVADO_EL_DE_SIEMPRE, nombreDelArtefacto } from "./copias";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente archivar (test)", kind: "CLIENTE" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Proyecto", tags: [] } });
}

async function conPlanificacion() {
  const p = await proyecto();
  const deSiempre = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "planning", name: "Planificación", order: 3, sections: [] } });
  const s = await prisma.canvasSection.create({ data: { canvasId: deSiempre.id, key: "pipelines", label: "Pipelines", order: 0 } });
  await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: { intro: "Ventas en 6 etapas" }, source: "AGENT", status: "CONFIRMED" } });
  return { p, deSiempre };
}

describe("archivar el documento de siempre", () => {
  it("⛔ suelta su lugar: nadie lo encuentra por slug, queda como copia archivada con su nombre, y su enlace deja de abrir", async () => {
    const { p, deSiempre } = await conPlanificacion();
    const copia = await crearCopia({ projectId: p.id, tipo: "planning", nombre: "Marketing", porEmail: null });
    await prisma.accesoAlDocumento.create({ data: { canvasId: deSiempre.id, clientId: p.clientId, accessToken: "d".repeat(64) } });

    await archivarArtefacto(p.id, deSiempre.id, "ana@smarteam.test");

    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } });
    expect(fila).toMatchObject({ slug: null, tipoArtefacto: "planning", titulo: "Planificación", disabledReason: ARCHIVADO_EL_DE_SIEMPRE, disabledBy: "ana@smarteam.test" });
    expect(fila.disabledAt).not.toBeNull();
    // Su `name` nunca se resuelve como pieza: la lectura doble por nombre de canvasOf no lo encuentra.
    expect(pieceByName(fila.name)).toBeNull();
    expect(await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("planning") } })).toBeNull();
    expect(nombreDelArtefacto(fila)).toBe("Planificación");
    // Lo escrito sigue ahí.
    expect(await prisma.canvasBlock.count({ where: { section: { canvasId: deSiempre.id } } })).toBe(1);
    // La copia sigue viva y siendo copia; el archivado sale de los vivos.
    expect((await documentosDelTipo(p.id, "planning")).map((d) => d.id)).toEqual([copia.canvasId]);
    expect((await prisma.accesoAlDocumento.findUniqueOrThrow({ where: { canvasId: deSiempre.id } })).revokedAt).not.toBeNull();
    // INV65 lo acepta como copia sana.
    expect(motivoDeLaCopia(fila)).toBeNull();
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set(["planning"]));
  });

  it("⛔ lo que busca el de siempre ya no lo reenciende: activar la pieza crea uno nuevo, que toma el lugar", async () => {
    const { p, deSiempre } = await conPlanificacion();
    await archivarArtefacto(p.id, deSiempre.id, null);
    const r = await ensurePieceCanvas(p.id, "planning");
    expect(r.outcome).toBe("creada");
    expect(r.canvasId).not.toBe(deSiempre.id);
    expect((await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } })).disabledAt).not.toBeNull();
    // Con otro en su lugar, el tipo ya no cuenta como archivado.
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set());
  });

  it("recuperarlo con el lugar libre lo devuelve a su lugar, con su slug y su nombre de fábrica", async () => {
    const { p, deSiempre } = await conPlanificacion();
    await archivarArtefacto(p.id, deSiempre.id, null);
    expect(await reactivarArtefacto(p.id, deSiempre.id)).toEqual({ comoCopia: false });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } });
    expect(fila).toMatchObject({ slug: "planning", tipoArtefacto: null, name: "Planificación", titulo: null, disabledAt: null, disabledReason: null });
    expect((await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("planning") }, select: { id: true } }))?.id).toBe(deSiempre.id);
  });

  it("recuperarlo con otro en su lugar lo devuelve como copia; el cronograma y la entrega, no", async () => {
    const { p, deSiempre } = await conPlanificacion();
    await archivarArtefacto(p.id, deSiempre.id, null);
    const nuevo = await ensurePieceCanvas(p.id, "planning");
    expect(await reactivarArtefacto(p.id, deSiempre.id)).toEqual({ comoCopia: true });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre.id } });
    expect(fila).toMatchObject({ slug: null, tipoArtefacto: "planning", disabledAt: null });
    expect((await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("planning") }, select: { id: true } }))?.id).toBe(nuevo.canvasId);

    for (const [slug, name] of [
      ["timeline", "Cronograma"],
      ["delivery", "Entrega"],
    ] as const) {
      const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug, name, sections: [] } });
      await archivarArtefacto(p.id, viejo.id, null);
      await prisma.projectCanvas.create({ data: { projectId: p.id, slug, name, sections: [] } });
      await expect(reactivarArtefacto(p.id, viejo.id)).rejects.toMatchObject({ status: 409 });
    }
  });

  it("⛔ el cronograma archivado no toca las fechas del proyecto", async () => {
    const p = await proyecto();
    const inicio = new Date("2026-11-02T00:00:00Z");
    await prisma.projectTimeline.create({ data: { projectId: p.id, anchorStartDate: inicio } });
    const c = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "timeline", name: "Cronograma", sections: [] } });
    await archivarArtefacto(p.id, c.id, null);
    expect((await prisma.projectTimeline.findUniqueOrThrow({ where: { projectId: p.id } })).anchorStartDate).toEqual(inicio);
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set(["timeline"]));
    expect(motivoDeLaCopia(await prisma.projectCanvas.findUniqueOrThrow({ where: { id: c.id } }))).toBeNull();
  });

  it("⛔ el handoff no se archiva", async () => {
    const p = await proyecto();
    const h = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "handoff", name: "Handoff", sections: [] } });
    await expect(archivarArtefacto(p.id, h.id, null)).rejects.toMatchObject({ status: 400 });
  });

  it("un kickoff que vuelve como copia lleva sus secciones ocultas en su Json", async () => {
    const p = await proyecto();
    const k = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [{ key: "bienvenida", label: "Bienvenida" }] } });
    const oculta = await prisma.canvasSection.create({ data: { canvasId: k.id, key: "bienvenida", label: "Bienvenida", order: 0 } });
    await prisma.project.update({ where: { id: p.id }, data: { hiddenKickoffKeys: [oculta.id] } });
    await archivarArtefacto(p.id, k.id, null);
    await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [] } });
    expect(await reactivarArtefacto(p.id, k.id)).toEqual({ comoCopia: true });
    const json = (await prisma.projectCanvas.findUniqueOrThrow({ where: { id: k.id }, select: { sections: true } })).sections as Array<{ key: string; hidden?: boolean }>;
    expect(json.find((e) => e.key === "bienvenida")?.hidden).toBe(true);
  });
});

describe("la exploración de siempre se va con su documento", () => {
  const conRetos = (texto: string) => ({ contenido: { casillas: { retos: [{ texto }] } } as object });

  it("⛔ los agentes dejan de leerla, la viva pasa a la primera copia, y recuperarla la devuelve a su lugar", async () => {
    const p = await proyecto();
    const doc = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "exploration", name: "Exploración", sections: [] } });
    const deSiempre = await asegurarExploracionDelProyecto(p.id, "a@b.c");
    const copia = await crearCopia({ projectId: p.id, tipo: "exploration", nombre: "Marketing", porEmail: null });
    const deLaCopia = await asegurarExploracionDelProyecto(p.id, "a@b.c", copia.canvasId);
    if (!deSiempre.ok || !deLaCopia.ok) throw new Error("no se abrió");
    await prisma.exploracionDeVenta.update({ where: { id: deSiempre.id }, data: conRetos("Reto general") });
    await prisma.exploracionDeVenta.update({ where: { id: deLaCopia.id }, data: conRetos("Reto de marketing") });
    expect(await exploracionVivaDelProyecto(p.id)).toBe(deSiempre.id);

    await archivarArtefacto(p.id, doc.id, null);
    const texto = await textoDeLaExploracionDelProyecto(p.id);
    expect(texto).not.toContain("Reto general");
    expect(texto).toContain("Reto de marketing");
    expect(await hayExploracionAbierta(p.id)).toBe(false);
    expect(await exploracionVivaDelProyecto(p.id)).toBe(deLaCopia.id);
    expect(await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: deSiempre.id } })).toMatchObject({ canvasId: doc.id });

    await reactivarArtefacto(p.id, doc.id);
    expect(await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: deSiempre.id } })).toMatchObject({ canvasId: null, archivadaEn: null });
    expect(await textoDeLaExploracionDelProyecto(p.id)).toContain("Reto general");
  });

  it("⛔ archivada la única, los agentes no vuelven a la guía de exploración vieja", async () => {
    const p = await proyecto();
    await prisma.guiaDeExploracion.create({
      data: {
        projectId: p.id,
        contenido: { sesiones: [{ id: "s1", titulo: "Primera", preguntas: [{ id: "q1", texto: "¿Cómo venden hoy?", hecha: true, respuesta: "Por WhatsApp" }] }] },
      },
    });
    expect(await loadCanvasContext(p.id, "exploration")).toContain("Por WhatsApp");
    const doc = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "exploration", name: "Exploración", sections: [] } });
    await archivarArtefacto(p.id, doc.id, null);
    expect(await loadCanvasContext(p.id, "exploration")).not.toContain("Por WhatsApp");
  });
});

describe("⛔ el sello de publicado no pasa del archivado al nuevo (portal del kickoff y del requerimiento técnico)", () => {
  const dia = (d: number) => new Date(Date.UTC(2026, 10, d));

  it("compartir antes de que exista el documento sigue valiendo", async () => {
    const p = await proyecto();
    const req = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "tech-requirements", name: "Requerimiento técnico", sections: [], createdAt: dia(5) } });
    expect(await selloDelDeSiempreVigente(p.id, "tech-requirements", dia(3), req)).toBe(true);
  });

  it("archivado después del sello: el nuevo no es el publicado, hasta que se vuelve a publicar", async () => {
    const p = await proyecto();
    const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [], createdAt: dia(1) } });
    const sello = dia(2);
    expect(await selloDelDeSiempreVigente(p.id, "kickoff", sello, viejo)).toBe(true);
    await archivarArtefacto(p.id, viejo.id, null);
    const nuevo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [] } });
    expect(await selloDelDeSiempreVigente(p.id, "kickoff", sello, nuevo)).toBe(false);
    // Publicado de nuevo: el sello es posterior al archivo.
    expect(await selloDelDeSiempreVigente(p.id, "kickoff", new Date(Date.now() + 60_000), nuevo)).toBe(true);
  });

  it("el publicado recuperado como copia tampoco le deja el sello al nuevo", async () => {
    const p = await proyecto();
    const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [], createdAt: dia(1) } });
    const sello = dia(2);
    await archivarArtefacto(p.id, viejo.id, null);
    const nuevo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [] } });
    expect(await reactivarArtefacto(p.id, viejo.id)).toEqual({ comoCopia: true });
    expect(await selloDelDeSiempreVigente(p.id, "kickoff", sello, nuevo)).toBe(false);
  });

  it("recuperar el publicado a su lugar le devuelve su sello", async () => {
    const p = await proyecto();
    const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff", sections: [], createdAt: dia(1) } });
    await archivarArtefacto(p.id, viejo.id, null);
    await reactivarArtefacto(p.id, viejo.id);
    expect(await selloDelDeSiempreVigente(p.id, "kickoff", dia(2), viejo)).toBe(true);
  });
});

describe("quién ocupa el lugar", () => {
  it("una fila vieja del de siempre sin slug se archiva soltando su lugar: deja de encontrarse por su nombre", async () => {
    const p = await proyecto();
    const viejo = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: null, name: "Kickoff", sections: [] } });
    expect((await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("kickoff") }, select: { id: true } }))?.id).toBe(viejo.id);
    await archivarArtefacto(p.id, viejo.id, null);
    expect(await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("kickoff") } })).toBeNull();
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set(["kickoff"]));
  });

  it("una exploración nueva sin documento ocupa el lugar: el tipo deja de contar como archivado", async () => {
    const p = await proyecto();
    const doc = await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "exploration", name: "Exploración", sections: [] } });
    await asegurarExploracionDelProyecto(p.id, "a@b.c");
    await archivarArtefacto(p.id, doc.id, null);
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set(["exploration"]));
    await asegurarExploracionDelProyecto(p.id, "a@b.c");
    expect(await tiposConElDeSiempreArchivado(p.id)).toEqual(new Set());
  });
});
