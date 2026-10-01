/**
 * lib/exploraciones/documentos.int.test.ts — las sesiones y los documentos sumados a mano, contra una
 * base REAL (la tabla nace en scripts/sql/2026-10-01-exploracion-documentos.sql).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/documentos.int.test.ts --project integration
 *
 * Lo que solo una base prueba: el tope por exploración, que la lista no traiga el texto pero sí su
 * largo, que el agente lea solo lo que todavía no leyó (o el que se le pidió), que quitar uno de otra
 * exploración no haga nada y que borrar la exploración se lleve sus documentos.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { borrarDocumento, crearDocumento, documentosParaLeer, listarDocumentos, MAX_DOCUMENTOS } from "./documentos";

async function sembrar() {
  const c = await prisma.client.create({ data: { name: "Prospecto de prueba", kind: "PROSPECTO", hubspotCompanyId: "999" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({ data: { clientId: c.id, creadaPor: "vendedor@prueba.test" }, select: { id: true } });
  return e.id;
}

const doc = (exploracionId: string, titulo: string, texto = "Lo que dijo el cliente en la sesión, con suficiente texto para leer.") =>
  crearDocumento({ exploracionId, titulo, origen: "pegado", texto, creadoPor: "vendedor@prueba.test" });

describe("lo que el vendedor suma a mano", () => {
  it("se lista sin el texto, con su largo, lo más nuevo primero", async () => {
    const id = await sembrar();
    const a = await doc(id, "Resumen del Smartflow");
    const b = await crearDocumento({ exploracionId: id, titulo: "Minuta", origen: "archivo", nombreArchivo: "minuta.pdf", fecha: "2026-10-02", texto: "x".repeat(500), creadoPor: "v@p.test" });
    expect(a.ok && b.ok).toBe(true);
    const lista = await listarDocumentos(id);
    expect(lista.map((d) => d.titulo)).toEqual(["Minuta", "Resumen del Smartflow"]);
    expect(lista[0]).toMatchObject({ origen: "archivo", nombreArchivo: "minuta.pdf", fecha: "2026-10-02", caracteres: 500 });
    expect(lista[0]).not.toHaveProperty("texto");
  });

  it("el agente lee lo que no leyó, o solo el que se le pidió", async () => {
    const id = await sembrar();
    const a = await doc(id, "Uno");
    const b = await doc(id, "Dos");
    if (!a.ok || !b.ok) throw new Error("no se crearon");
    expect((await documentosParaLeer(id, { excepto: [a.id], cuantos: 3 })).map((d) => d.titulo)).toEqual(["Dos"]);
    expect((await documentosParaLeer(id, { soloEste: a.id, cuantos: 1 })).map((d) => d.titulo)).toEqual(["Uno"]);
    expect((await documentosParaLeer(id, { soloEste: a.id, cuantos: 1 }))[0].texto).toContain("Lo que dijo el cliente");
  });

  it("tiene un tope por exploración", async () => {
    const id = await sembrar();
    await prisma.exploracionDocumento.createMany({
      data: Array.from({ length: MAX_DOCUMENTOS }, (_, i) => ({ exploracionId: id, titulo: `D${i}`, origen: "pegado", texto: "texto", creadoPor: "v@p.test" })),
    });
    const r = await doc(id, "Uno más");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("quitar uno de otra exploración no hace nada; borrar la exploración se lleva sus documentos", async () => {
    const id = await sembrar();
    const otra = await prisma.exploracionDeVenta.create({
      data: { clientId: (await prisma.client.create({ data: { name: "Otra", kind: "PROSPECTO" }, select: { id: true } })).id, creadaPor: "v@p.test" },
      select: { id: true },
    });
    const a = await doc(id, "Uno");
    if (!a.ok) throw new Error("no se creó");
    expect(await borrarDocumento(otra.id, a.id)).toBe(false);
    expect(await listarDocumentos(id)).toHaveLength(1);
    await prisma.exploracionDeVenta.delete({ where: { id } });
    expect(await prisma.exploracionDocumento.count({ where: { id: a.id } })).toBe(0);
  });
});
