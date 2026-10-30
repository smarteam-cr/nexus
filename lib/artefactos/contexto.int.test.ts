/**
 * lib/artefactos/contexto.int.test.ts — EL CONTEXTO ES DE CADA COPIA, contra una base REAL (etapa V3b de
 * docs/artefactos-plan.md). Las reuniones elegidas y las notas de una copia no se cruzan con otra ni con su tipo, y una
 * reunión de otra empresa no entra aunque alguien mande su id. Correr con la base local:
 * `npx vitest run --project integration lib/artefactos/contexto.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));

import { prisma } from "@/lib/db/prisma";
import { documentoConContexto } from "@/lib/contexto/documento";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { crearCopia } from "./copias-server";
import { conReunionesDeLaCopia, piezaDeLasNotas, reunionesDeLaCopia } from "./contexto-de-la-copia";
import { documentoDeLasNotas, reunionesDelProyecto, reunionesParaElegir } from "./contexto-server";

async function proyectoConReunion(nombre: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: "Implementación", createdAt: new Date("2026-01-01T00:00:00Z") } });
  const s = await prisma.firefliesSession.create({
    data: {
      id: `s-${nombre}`,
      title: `Reunión con ${nombre}`,
      date: new Date("2026-09-10T15:00:00Z"),
      participants: [`ana@${nombre.toLowerCase()}.test`, "csm@smarteamcr.com"],
      resolvedClientId: c.id,
      transcript: `El cliente ${nombre} pidió el reporte semanal. `.repeat(20),
    },
  });
  await prisma.sessionProject.create({ data: { sessionId: s.id, projectId: p.id } });
  return { p, s };
}

describe("el contexto de una copia", () => {
  it("⛔ una reunión de otra empresa no entra aunque se mande su id", async () => {
    const a = await proyectoConReunion("Alfa");
    const b = await proyectoConReunion("Beta");
    expect(await reunionesDelProyecto(a.p.id, [a.s.id, b.s.id])).toEqual([a.s.id]);
  });

  it("las elegidas son de esa copia, y las notas también", async () => {
    const { p, s } = await proyectoConReunion("Gama");
    const uno = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-esencial", porEmail: null });
    const dos = await crearCopia({ projectId: p.id, tipo: "planning", plantillaId: "planificacion-esencial", porEmail: null });
    const fila = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: uno.canvasId }, select: { sections: true } });
    await prisma.projectCanvas.update({ where: { id: uno.canvasId }, data: { sections: conReunionesDeLaCopia(fila.sections, [s.id]) as never } });
    await prisma.notaDeContexto.create({ data: { projectId: p.id, pieza: piezaDeLasNotas(uno.canvasId), content: "Nota solo de la primera" } });

    expect((await reunionesParaElegir(p.id, uno.canvasId))?.find((r) => r.id === s.id)?.elegida).toBe(true);
    expect((await reunionesParaElegir(p.id, dos.canvasId))?.find((r) => r.id === s.id)?.elegida).toBe(false);

    const doc = documentoConContexto("planning")!;
    const leerDe = async (canvasId: string) => {
      const c = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { sections: true } });
      return cargarMaterialDelDocumento(p.id, doc, { deLaCopia: { reuniones: reunionesDeLaCopia(c.sections), notasDe: piezaDeLasNotas(canvasId) } });
    };
    const primera = await leerDe(uno.canvasId);
    expect(primera.sesionesUsadas).toEqual([s.id]);
    expect(primera.notas).toContain("Nota solo de la primera");
    const segunda = await leerDe(dos.canvasId);
    expect(segunda.sesionesUsadas).toEqual([]);
    expect(segunda.notas).not.toContain("Nota solo de la primera");
  });

  it("las notas de una copia se curan con la celda de su tipo; un id ajeno no es un documento", async () => {
    const { p } = await proyectoConReunion("Delta");
    const c = await crearCopia({ projectId: p.id, tipo: "adoption-plan", porEmail: null });
    expect(await documentoDeLasNotas(p.id, piezaDeLasNotas(c.canvasId))).toEqual({ pieza: piezaDeLasNotas(c.canvasId), seccion: "planificacion" });
    expect(await documentoDeLasNotas(p.id, "copia-no-existe")).toBeNull();
    expect((await documentoDeLasNotas(p.id, "diagnosis"))?.pieza).toBe("diagnosis");
  });
});
