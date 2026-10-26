/**
 * lib/clients/documentos-de-la-empresa-compartir.int.test.ts — un diagnóstico de un PROSPECTO, sin proyecto, de punta a
 * punta contra una base REAL (R3 etapas 2 y 3, 2026-10-27): se crea con las secciones de su plantilla, se comparte, la
 * vista del enlace lo abre (con lo oculto afuera), dejar de compartir lo cierra, y un enlace cruzado no abre nada
 * (INV64). Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { compartirDocumentoDeLaEmpresa, crearDocumentoDeLaEmpresa, dejarDeCompartirDocumentoDeLaEmpresa, estadoDeLoCompartido } from "./documentos-de-la-empresa-compartir";
import { documentoDeLaEmpresaParaElToken } from "@/lib/external/documento-de-la-empresa-view";
import { SECCIONES_DEL_DIAGNOSTICO_ESENCIAL, plantillaDelDocumento } from "@/lib/entregables/registro";
import { INV64 } from "@/lib/invariantes/documentos-de-la-empresa";

const tokenDe = (enlace: string | null) => (enlace ?? "").split("/").pop() ?? "";

describe("el diagnóstico de un prospecto, sin proyecto", () => {
  it("nace con las secciones de la esencial, se comparte con un enlace y dejar de compartir lo cierra", async () => {
    const c = await prisma.client.create({ data: { name: "Prospecto R3 (test)", kind: "PROSPECTO" } });
    const { canvasId, creado } = await crearDocumentoDeLaEmpresa(c.id, "diagnosis", null, "ana@smarteam.test");
    expect(creado).toBe(true);
    // Uno por pieza y empresa: pedirlo otra vez devuelve el mismo.
    expect(await crearDocumentoDeLaEmpresa(c.id, "diagnosis", null, null)).toEqual({ canvasId, creado: false });

    const canvas = await prisma.projectCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      select: { clientId: true, projectId: true, businessCaseId: true, sections: true, canvasSections: { orderBy: { order: "asc" }, select: { id: true, key: true } } },
    });
    expect(canvas).toMatchObject({ clientId: c.id, projectId: null, businessCaseId: null });
    expect(canvas.canvasSections.map((s) => s.key)).toEqual([...SECCIONES_DEL_DIAGNOSTICO_ESENCIAL]);
    expect(plantillaDelDocumento("diagnosis", canvas.sections)).toMatchObject({ guardada: true, plantilla: { id: "diagnostico-esencial" } });

    // Sin nada escrito no se comparte.
    const problema = canvas.canvasSections.find((s) => s.key === "problema")!;
    const desafio = canvas.canvasSections.find((s) => s.key === "desafio")!;
    const cierre = canvas.canvasSections.find((s) => s.key === "cierre")!;
    await prisma.canvasBlock.deleteMany({ where: { sectionId: cierre.id } });
    await expect(compartirDocumentoDeLaEmpresa(c.id, canvasId, null)).rejects.toMatchObject({ status: 409 });

    await prisma.canvasBlock.createMany({
      data: [
        { sectionId: problema.id, blockType: "CARD", data: { intro: "Las ventas dependen de dos personas." }, order: 0, source: "HUMAN", status: "CONFIRMED" },
        { sectionId: desafio.id, blockType: "CARD", data: { intro: "Un desafío interno." }, order: 0, source: "HUMAN", status: "CONFIRMED" },
      ],
    });
    const compartido = await compartirDocumentoDeLaEmpresa(c.id, canvasId, "ana@smarteam.test");
    expect(compartido.enlace).toMatch(/\/external\/documento\/[0-9a-f]{64}$/);
    const token = tokenDe(compartido.enlace);

    const vista = await documentoDeLaEmpresaParaElToken(token);
    expect(vista?.clientName).toBe("Prospecto R3 (test)");
    expect(vista?.rows.map((r) => r.key)).toEqual(["problema", "desafio"]);

    // Ocultar después de compartir: tiene efecto inmediato en el enlace, sin volver a compartir.
    await prisma.projectCanvas.update({ where: { id: canvasId }, data: { sections: [{ key: "desafio", label: "Desafío", hidden: true }] } });
    expect((await documentoDeLaEmpresaParaElToken(token))?.rows.map((r) => r.key)).toEqual(["problema"]);

    // Dejar de compartir cierra el enlace; volver a compartir crea uno nuevo.
    await dejarDeCompartirDocumentoDeLaEmpresa(canvasId);
    expect(await documentoDeLaEmpresaParaElToken(token)).toBeNull();
    expect((await estadoDeLoCompartido(canvasId)).enlace).toBeNull();
    const otraVez = await compartirDocumentoDeLaEmpresa(c.id, canvasId, null);
    expect(tokenDe(otraVez.enlace)).not.toBe(token);
    expect(await documentoDeLaEmpresaParaElToken(tokenDe(otraVez.enlace))).not.toBeNull();

    // Un token que no tiene la forma de uno no llega a la base.
    expect(await documentoDeLaEmpresaParaElToken("../../etc")).toBeNull();
    expect((await INV64.correr(prisma, new Date())).ok).toBe(true);
  });

  it("un enlace cruzado de empresa no abre nada y pone INV64 en rojo", async () => {
    const a = await prisma.client.create({ data: { name: "Empresa A (test)", kind: "PROSPECTO" } });
    const b = await prisma.client.create({ data: { name: "Empresa B (test)", kind: "PROSPECTO" } });
    const { canvasId } = await crearDocumentoDeLaEmpresa(b.id, "diagnosis", "diagnostico-estrategico", null);
    await prisma.projectCanvas.update({ where: { id: canvasId }, data: { publishedSnapshot: { sections: [{ key: "problema", titleOverride: null, eyebrowOverride: null, blocks: [{ blockType: "CARD", content: null, data: {} }] }] }, publishedSnapshotAt: new Date() } });
    const token = "a".repeat(64);
    // A mano y cruzado: el enlace dice A, el documento es de B.
    await prisma.accesoAlDocumento.create({ data: { canvasId, clientId: a.id, accessToken: token } });
    expect(await documentoDeLaEmpresaParaElToken(token)).toBeNull();
    const r = await INV64.correr(prisma, new Date());
    expect(r.ok).toBe(false);
  });
});
