/**
 * lib/exploraciones/del-proyecto.int.test.ts — la exploración de un PROYECTO contra una base REAL
 * (2026-10-07: el lienzo de la preventa con las preguntas de Customer Success).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/del-proyecto.int.test.ts --project integration
 *
 * Lo que solo una base prueba:
 *   · los índices únicos PARCIALES del SQL: una preventa viva y la exploración de cada proyecto de la
 *     MISMA empresa conviven; dos exploraciones vivas del mismo proyecto, no;
 *   · abrirla dos veces devuelve la misma, con lo que dejó la preventa (áreas, edición, perfil);
 *   · una exploración de proyecto no aparece en la lista de preventas.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { asegurarExploracionDelProyecto } from "./del-proyecto";
import { listarExploraciones } from "./servidor";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

async function sembrar() {
  await prisma.escalaDocumento.upsert({
    where: { documento_version: { documento: "escala", version: general.version } },
    update: {},
    create: {
      documento: "escala",
      version: general.version,
      escalaVersion: general.version,
      archivo: "escala_rendimiento_smarteam.md",
      texto,
      huella: createHash("sha256").update(texto).digest("hex"),
    },
  });
  const c = await prisma.client.create({ data: { name: "Acme", kind: "CLIENTE", hubspotCompanyId: "4242" }, select: { id: true } });
  const p = await prisma.project.create({
    data: { clientId: c.id, name: "Implementación Service Hub", tags: ["service_hub"] },
    select: { id: true },
  });
  return { clientId: c.id, projectId: p.id };
}

describe("la exploración de un proyecto", () => {
  it("se abre una sola vez, como estrategia de Customer Success, con las áreas de los hubs vendidos", async () => {
    const { projectId } = await sembrar();
    const a = await asegurarExploracionDelProyecto(projectId, "cse@prueba.test");
    const b = await asegurarExploracionDelProyecto(projectId, "cse@prueba.test");
    if (!a.ok || !b.ok) throw new Error("no se abrió");
    expect(a.creada).toBe(true);
    expect(b).toMatchObject({ id: a.id, creada: false });
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila).toMatchObject({ projectId, marco: "cs", areas: ["3"], responsableEmail: "cse@prueba.test" });
  });

  it("convive con la preventa viva de la misma empresa, y no aparece en la lista de preventas", async () => {
    const { clientId, projectId } = await sembrar();
    const preventa = await prisma.exploracionDeVenta.create({ data: { clientId, creadaPor: "vendedor@prueba.test" }, select: { id: true } });
    const r = await asegurarExploracionDelProyecto(projectId, "cse@prueba.test");
    expect(r.ok).toBe(true);
    const lista = await listarExploraciones(general);
    if (lista.estado !== "ok") throw new Error("sin tablas");
    expect(lista.filas.map((f) => f.id)).toEqual([preventa.id]);
  });

  it("dos exploraciones vivas del mismo proyecto no entran (el índice del SQL)", async () => {
    const { clientId, projectId } = await sembrar();
    await prisma.exploracionDeVenta.create({ data: { clientId, projectId, marco: "cs", creadaPor: "a@prueba.test" } });
    await expect(prisma.exploracionDeVenta.create({ data: { clientId, projectId, marco: "cs", creadaPor: "b@prueba.test" } })).rejects.toThrow();
  });
});
