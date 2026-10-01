/**
 * lib/exploraciones/servidor.int.test.ts — los cambios de una exploración contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/servidor.int.test.ts --project integration
 *
 * Lo que solo una base prueba:
 *   · aplicar operaciones guarda lo confirmado y sube la versión; descartar no la sube;
 *   · un cambio con una versión vieja es un conflicto, no una pisada;
 *   · el índice único PARCIAL del SQL: una sola exploración viva por empresa, y una archivada no
 *     estorba (Prisma no modela ese índice: si el SQL no lo creara, nadie se enteraría).
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { idDelItem, type ItemPropuesto } from "./contenido";
import { aplicarCambios, leerExploracion, listarExploraciones } from "./servidor";

const general = parsearEscala(leerArchivoDeLaEscala("escala"));

async function sembrar(propuestos: ItemPropuesto[] = []) {
  const c = await prisma.client.create({
    data: { name: "Prospecto de prueba", kind: "PROSPECTO", hubspotCompanyId: "999" },
    select: { id: true },
  });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      perfilCierre: "con equipo",
      perfilDespues: "continua",
      propuesta: { version: 1, items: propuestos, leidas: { sesiones: [], hubspot: [] }, corridas: [] } as never,
    },
    select: { id: true },
  });
  return { clientId: c.id, id: e.id };
}

const hipotesis = (texto: string): ItemPropuesto => {
  const destino = { tipo: "casilla" as const, clave: "hipotesis" as const };
  return { id: idDelItem(destino, texto), destino, valor: texto, fuentes: [{ id: "S1", etiqueta: "Reunión" }], corridaId: null, en: new Date().toISOString() };
};

describe("los cambios de una exploración", () => {
  it("un nivel queda guardado con la versión de la escala, y la versión de la fila sube", async () => {
    const { id } = await sembrar();
    const r = await aplicarCambios(id, 0, [{ op: "nivel", dimensionId: "1.3", estimado: { nivel: "I", fuente: "reunion", evidencia: "Excel" } }], general);
    expect(r.estado).toBe("ok");
    const fila = await leerExploracion(id);
    if (fila.estado !== "ok") throw new Error("no se leyó");
    expect(fila.fila.version).toBe(1);
    expect((fila.fila.contenido as { chequeo: Record<string, unknown> }).chequeo["1.3"]).toMatchObject({ nivel: "I", evidencia: "Excel" });
    expect((fila.fila.contenido as { escalaVersion: string }).escalaVersion).toBe(general.version);
  });

  it("con una versión vieja, cambiar lo confirmado es un conflicto y no pisa", async () => {
    const { id } = await sembrar();
    await aplicarCambios(id, 0, [{ op: "nota", paso: "r1-test", texto: "primera" }], general);
    const r = await aplicarCambios(id, 0, [{ op: "nota", paso: "r1-test", texto: "segunda" }], general);
    expect(r.estado).toBe("conflicto");
    const fila = await leerExploracion(id);
    if (fila.estado !== "ok") throw new Error("no se leyó");
    expect((fila.fila.contenido as { notas: Record<string, string> }).notas["r1-test"]).toBe("primera");
  });

  it("descartar lo propuesto no cambia lo confirmado: no sube la versión ni choca con una versión vieja", async () => {
    const h = hipotesis("Creemos que no miden la conversión");
    const { id } = await sembrar([h]);
    await aplicarCambios(id, 0, [{ op: "nota", paso: "r1-apertura", texto: "x" }], general); // versión 1
    const r = await aplicarCambios(id, 0, [{ op: "descartar", itemIds: [h.id] }], general);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect(r.fila.version).toBe(1);
    expect((r.fila.contenido as { descartadas: string[] }).descartadas).toContain(h.id);
  });

  it("usar lo propuesto lo confirma y lo saca de lo pendiente", async () => {
    const h = hipotesis("Creemos que el posventa vive en otra plataforma");
    const { id } = await sembrar([h]);
    const r = await aplicarCambios(id, 0, [{ op: "usar", itemId: h.id }], general);
    expect(r.estado).toBe("ok");
    if (r.estado !== "ok") return;
    expect((r.fila.contenido as { casillas: { hipotesis: string[] } }).casillas.hipotesis).toEqual(["Creemos que el posventa vive en otra plataforma"]);
    expect((r.fila.propuesta as { items: unknown[] }).items).toEqual([]);
  });

  it("un id de dimensión que la escala no tiene se rechaza y no se guarda nada", async () => {
    const { id } = await sembrar();
    const r = await aplicarCambios(
      id,
      0,
      [
        { op: "nota", paso: "r1-test", texto: "algo" },
        { op: "nivel", dimensionId: "9.9", estimado: { nivel: "I", fuente: "reunion" } },
      ],
      general,
    );
    expect(r.estado).toBe("invalido");
    const fila = await leerExploracion(id);
    if (fila.estado !== "ok") throw new Error("no se leyó");
    expect(fila.fila.version).toBe(0);
  });
});

describe("una sola exploración viva por empresa (el índice parcial del SQL)", () => {
  it("una segunda viva para la misma empresa choca; con la primera archivada, entra", async () => {
    const { clientId, id } = await sembrar();
    await expect(prisma.exploracionDeVenta.create({ data: { clientId, creadaPor: "otro@prueba.test" } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.exploracionDeVenta.update({ where: { id }, data: { archivadaEn: new Date() } });
    const otra = await prisma.exploracionDeVenta.create({ data: { clientId, creadaPor: "otro@prueba.test" }, select: { id: true } });
    expect(otra.id).not.toBe(id);
  });

  it("la lista muestra las vivas con su «qué sigue»", async () => {
    await sembrar();
    const lista = await listarExploraciones(general);
    expect(lista.estado).toBe("ok");
    if (lista.estado !== "ok") return;
    expect(lista.filas).toHaveLength(1);
    // Sin nada que haya dicho el cliente todavía, lo que sigue es la primera reunión, con la guía.
    expect(lista.filas[0].queSigue).toMatch(/^Haz la primera reunión/);
    expect(lista.filas[0].total).toBe(7);
  });
});
