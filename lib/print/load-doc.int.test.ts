/**
 * lib/print/load-doc.int.test.ts — el PDF de un documento elegido por su id (artefactos, etapa V3) contra una base REAL: el
 * export pasa `yaAutorizado` y solo autoriza el PROYECTO, así que esta verificación es la barrera entre un proyecto y otro.
 * Correr con la base local: `npx vitest run --project integration lib/print/load-doc.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { crearCopia } from "@/lib/artefactos/copias-server";
import { loadPrintDoc } from "./load-doc";
import { printDocType } from "./doc-types";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente PDF (test)", kind: "CLIENTE" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Implementación PDF" } });
}

const opts = (canvasId?: string) => ({ yaAutorizado: true, canvasId: canvasId ?? null });

describe("el PDF de una copia", () => {
  it("⛔ no imprime un documento de otro proyecto, ni uno archivado, ni uno de otro tipo", async () => {
    const p = await proyecto();
    const otro = await proyecto();
    const mia = await crearCopia({ projectId: p.id, tipo: "planning", nombre: "Marketing", porEmail: null });
    const ajena = await crearCopia({ projectId: otro.id, tipo: "planning", porEmail: null });
    const planning = printDocType("planning")!;

    expect(await loadPrintDoc(planning, p.id, opts(ajena.canvasId))).toBeNull();
    expect(await loadPrintDoc(printDocType("diagnosis")!, p.id, opts(mia.canvasId))).toBeNull();
    expect((await loadPrintDoc(planning, p.id, opts(mia.canvasId)))?.docTitle).toBe("Marketing");

    await prisma.projectCanvas.update({ where: { id: mia.canvasId }, data: { disabledAt: new Date() } });
    expect(await loadPrintDoc(planning, p.id, opts(mia.canvasId))).toBeNull();
  });

  it("un tipo nuevo solo se imprime con su id, y una copia del kickoff no suma el cronograma del proyecto", async () => {
    const p = await proyecto();
    expect(await loadPrintDoc(printDocType("adoption-plan")!, p.id, opts())).toBeNull();
    const a = await crearCopia({ projectId: p.id, tipo: "adoption-plan", porEmail: null });
    expect(await loadPrintDoc(printDocType("adoption-plan")!, p.id, opts(a.canvasId))).not.toBeNull();

    const k = await crearCopia({ projectId: p.id, tipo: "kickoff", porEmail: null });
    const doc = await loadPrintDoc(printDocType("kickoff")!, p.id, opts(k.canvasId));
    expect(doc?.rows.map((r) => r.key)).not.toContain("cronograma");
    expect(doc?.rows.map((r) => r.key)).not.toContain("procesos");
  });

  it("sin id, el documento de siempre con el título de su tipo", async () => {
    const p = await proyecto();
    await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "planning", name: "Planificación", titulo: "Plan general", sections: [] } });
    await crearCopia({ projectId: p.id, tipo: "planning", porEmail: null });
    const tipo = printDocType("planning")!;
    expect((await loadPrintDoc(tipo, p.id, opts()))?.docTitle).toBe(tipo.label);
  });
});
