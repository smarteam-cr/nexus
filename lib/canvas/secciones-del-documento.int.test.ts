/**
 * lib/canvas/secciones-del-documento.int.test.ts — «+ Agregar sección» y «Duplicar» contra una base REAL (2026-11-12).
 * `npx vitest run --project integration lib/canvas/secciones-del-documento.int.test.ts` (con `npm run db:local -- up`).
 *
 * El caso de Elías: un «Diagnóstico esencial» al que se le agrega una sección del completo. Ajustarlo a su plantilla (lo
 * que hacen generar, regenerar y «Escribirlo yo») no la oculta ni la borra; una del completo que nadie agregó, sí. Y una
 * copia hecha con «Duplicar» queda justo debajo de su original, con su contenido, también después del ajuste.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { DIAGNOSTICO_ESENCIAL_TEMPLATE, DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import { ensurePieceCanvas } from "@/lib/pieces/ensure-canvas";
import { empezarEnBlanco } from "@/lib/entregables/generar-server";
import { PLANTILLA_DEL_KICKOFF_RECURRENTE } from "@/lib/entregables/registro";
import { originalDeLaCopia } from "@/lib/landing/custom-sections";
import { prepararDiagnosticoEnBlanco } from "./diagnostico-generate";
import { agregarDelCatalogo, duplicarSeccion, ErrorDeSeccion, seccionesQueSePuedenAgregar } from "./secciones-del-documento-server";

const DEL_COMPLETO = "fortalezas";
const OTRA_DEL_COMPLETO = "preguntas";

async function diagnosticoEsencial() {
  const c = await prisma.client.create({ data: { name: "Cliente secciones (test)", kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: "Proyecto con diagnóstico esencial" } });
  const canvasId = await prepararDiagnosticoEnBlanco(p.id, DIAGNOSTICO_ESENCIAL_TEMPLATE);
  return { projectId: p.id, canvasId };
}

async function escribir(sectionId: string, data: object) {
  await prisma.canvasBlock.create({ data: { sectionId, blockType: "CARD", data, order: 0, source: "AGENT", status: "CONFIRMED" } });
}

async function filas(canvasId: string) {
  return prisma.canvasSection.findMany({ where: { canvasId }, orderBy: { order: "asc" }, include: { blocks: true } });
}

describe("una sección del catálogo agregada por una persona", () => {
  it("⭐ sobrevive al ajuste a la plantilla; la del completo que nadie agregó se oculta", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    const antes = (await filas(canvasId)).map((s) => s.key);
    expect(antes).not.toContain(DEL_COMPLETO);
    expect((await seccionesQueSePuedenAgregar(projectId, canvasId)).map((s) => s.key)).toContain(DEL_COMPLETO);

    const { id } = await agregarDelCatalogo(projectId, canvasId, DEL_COMPLETO);
    await escribir(id, { intro: "Lo que ya hacen bien", items: [] });
    // El control: una del completo con texto que NO agregó nadie (como queda al pasar de la completa a la esencial).
    const otra = await prisma.canvasSection.create({ data: { canvasId, key: OTRA_DEL_COMPLETO, label: "Preguntas", order: 99 } });
    await escribir(otra.id, { intro: "¿?", items: [] });

    // Lo que corre al generar, regenerar o «Escribirlo yo» con la plantilla esencial.
    await prepararDiagnosticoEnBlanco(projectId, DIAGNOSTICO_ESENCIAL_TEMPLATE);

    const despues = await filas(canvasId);
    expect(despues.map((s) => s.key)).toContain(DEL_COMPLETO);
    expect(despues.find((s) => s.key === DEL_COMPLETO)?.blocks).toHaveLength(1);
    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    const entradas = parseSectionEntries(c.sections);
    expect(entradas.find((e) => e.key === DEL_COMPLETO)).toMatchObject({ agregadaPorPersona: true });
    expect(entradas.find((e) => e.key === DEL_COMPLETO)?.hidden).not.toBe(true);
    expect(entradas.find((e) => e.key === OTRA_DEL_COMPLETO)).toMatchObject({ hidden: true, ocultaPorLaPlantilla: true });
    // Y ya no se ofrece: el documento la tiene.
    expect((await seccionesQueSePuedenAgregar(projectId, canvasId)).map((s) => s.key)).not.toContain(DEL_COMPLETO);
  });

  it("una que la plantilla ocultó vuelve a verse al agregarla, con lo que tenía", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    const s = await prisma.canvasSection.create({ data: { canvasId, key: DEL_COMPLETO, label: "Fortalezas", order: 99 } });
    await escribir(s.id, { intro: "Escrito antes", items: [] });
    await prepararDiagnosticoEnBlanco(projectId, DIAGNOSTICO_ESENCIAL_TEMPLATE);
    let c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(parseSectionEntries(c.sections).find((e) => e.key === DEL_COMPLETO)).toMatchObject({ hidden: true, ocultaPorLaPlantilla: true });

    expect((await seccionesQueSePuedenAgregar(projectId, canvasId)).find((x) => x.key === DEL_COMPLETO)?.ocultaPorLaPlantilla).toBe(true);
    await agregarDelCatalogo(projectId, canvasId, DEL_COMPLETO);
    await prepararDiagnosticoEnBlanco(projectId, DIAGNOSTICO_ESENCIAL_TEMPLATE);
    c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(parseSectionEntries(c.sections).find((e) => e.key === DEL_COMPLETO)).toMatchObject({ hidden: false, agregadaPorPersona: true });
    expect((await filas(canvasId)).find((x) => x.key === DEL_COMPLETO)?.blocks[0]?.data).toMatchObject({ intro: "Escrito antes" });
  });
});

describe("el kickoff y el cambio de plantilla", () => {
  it("⭐ el kickoff de un servicio recurrente conserva una del de siempre que agregó una persona", async () => {
    const c = await prisma.client.create({ data: { name: "Cliente kickoff agregado (test)", kind: "CLIENTE" } });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "Proyecto recurrente" } });
    const { canvasId } = await ensurePieceCanvas(p.id, "kickoff");
    await empezarEnBlanco({ projectId: p.id, slug: "kickoff", plantillaId: PLANTILLA_DEL_KICKOFF_RECURRENTE, porEmail: null });
    // «hoy_vs_sistema» es del kickoff de siempre: la plantilla del servicio no la trae y, vacía, la borra.
    expect((await filas(canvasId)).map((s) => s.key)).not.toContain("hoy_vs_sistema");
    await agregarDelCatalogo(p.id, canvasId, "hoy_vs_sistema");
    await empezarEnBlanco({ projectId: p.id, slug: "kickoff", plantillaId: PLANTILLA_DEL_KICKOFF_RECURRENTE, porEmail: null });
    expect((await filas(canvasId)).map((s) => s.key)).toContain("hoy_vs_sistema");
  });

  it("al pasar a la plantilla que ya la trae, la sección deja de estar marcada como agregada", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    await agregarDelCatalogo(projectId, canvasId, DEL_COMPLETO);
    await prepararDiagnosticoEnBlanco(projectId, DIAGNOSTICO_TEMPLATE);
    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(parseSectionEntries(c.sections).find((e) => e.key === DEL_COMPLETO)?.agregadaPorPersona).toBe(false);
  });
});

describe("«Duplicar»", () => {
  it("⛔ la copia de una sección oculta nace oculta (no sale al cliente)", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    const problema = (await filas(canvasId)).find((s) => s.key === "problema")!;
    const c0 = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    const conOculta = parseSectionEntries(c0.sections).map((e) => (e.key === "problema" ? { ...e, hidden: true } : e));
    await prisma.projectCanvas.update({ where: { id: canvasId }, data: { sections: conOculta as object[] } });
    const { key, oculta } = await duplicarSeccion(projectId, problema.id);
    expect(oculta).toBe(true);
    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(parseSectionEntries(c.sections).find((e) => e.key === key)?.hidden).toBe(true);
  });

  it("⭐ la copia nace justo debajo con su contenido y su nombre, y el ajuste a la plantilla la deja ahí", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    const objetivos = (await filas(canvasId)).find((s) => s.key === "objetivos")!;
    await escribir(objetivos.id, { intro: "Crecer", cuantitativos: [], cualitativos: [] });

    const { key } = await duplicarSeccion(projectId, objetivos.id);
    expect(originalDeLaCopia(key)).toBe("objetivos");
    let keys = (await filas(canvasId)).map((s) => s.key);
    expect(keys[keys.indexOf("objetivos") + 1]).toBe(key);
    const copia = (await filas(canvasId)).find((s) => s.key === key)!;
    expect(copia.titleOverride).toBe("Objetivos (copia)".replace("Objetivos", objetivos.label));
    expect(copia.blocks[0]).toMatchObject({ blockType: "CARD", source: "HUMAN", status: "CONFIRMED" });
    expect(copia.blocks[0].data).toMatchObject({ intro: "Crecer" });

    await prepararDiagnosticoEnBlanco(projectId, DIAGNOSTICO_ESENCIAL_TEMPLATE);
    keys = (await filas(canvasId)).map((s) => s.key);
    expect(keys[keys.indexOf("objetivos") + 1]).toBe(key);
  });

  it("la portada y el cierre no se duplican", async () => {
    const { projectId, canvasId } = await diagnosticoEsencial();
    for (const k of ["diagnostico", "cierre"]) {
      const s = (await filas(canvasId)).find((x) => x.key === k)!;
      await expect(duplicarSeccion(projectId, s.id)).rejects.toBeInstanceOf(ErrorDeSeccion);
    }
  });
});
