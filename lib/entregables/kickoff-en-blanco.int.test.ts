/**
 * lib/entregables/kickoff-en-blanco.int.test.ts — «Escribirlo yo» del kickoff (2026-10-30), contra una base REAL: abrirlo
 * lo crea, y la plantilla elegida deja sus secciones y queda anotada. `npx vitest run --project integration <este archivo>`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { ensurePieceCanvas } from "@/lib/pieces/ensure-canvas";
import { plantillaDelDocumento, PLANTILLA_DEL_KICKOFF_RECURRENTE, SECCIONES_DEL_KICKOFF_RECURRENTE } from "./registro";
import { empezarEnBlanco } from "./generar-server";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente kickoff (test)", kind: "CLIENTE" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Proyecto sin kickoff" } });
}

describe("el kickoff en blanco", () => {
  it("un proyecto sin kickoff lo crea al abrirlo, y la plantilla del servicio deja solo sus secciones", async () => {
    const p = await proyecto();
    const { canvasId, outcome } = await ensurePieceCanvas(p.id, "kickoff");
    expect(outcome).toBe("creada");

    await empezarEnBlanco({ projectId: p.id, slug: "kickoff", plantillaId: PLANTILLA_DEL_KICKOFF_RECURRENTE, porEmail: null });

    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(plantillaDelDocumento("kickoff", c.sections)?.plantilla.id).toBe(PLANTILLA_DEL_KICKOFF_RECURRENTE);
    const keys = (await prisma.canvasSection.findMany({ where: { canvasId }, select: { key: true } })).map((s) => s.key);
    for (const k of SECCIONES_DEL_KICKOFF_RECURRENTE) expect(keys).toContain(k);
    // Lo de afuera, vacío, se va; lo que tiene algo no se borra.
    expect(keys).not.toContain("hoy_vs_sistema");
    expect(keys).toContain("horarios");
  });

  it("la de siempre queda anotada: el selector no vuelve a salir", async () => {
    const p = await proyecto();
    const { canvasId } = await ensurePieceCanvas(p.id, "kickoff");
    await empezarEnBlanco({ projectId: p.id, slug: "kickoff", plantillaId: "kickoff", porEmail: null });
    const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
    expect(plantillaDelDocumento("kickoff", c.sections)?.guardada).toBe(true);
  });
});
