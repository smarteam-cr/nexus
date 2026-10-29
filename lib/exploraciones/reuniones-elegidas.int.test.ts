/**
 * lib/exploraciones/reuniones-elegidas.int.test.ts — «Actualizar escala» lee primero las reuniones que alguien eligió
 * (escala única, 2026-10-28), y siguen pasando por el chokepoint (invariante #1): un id elegido de OTRO cliente no sale.
 * Correr: `npx vitest run --project integration lib/exploraciones/reuniones-elegidas.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { proyectoDeContextoDeLaEmpresa } from "./escala-de-la-cuenta";
import { reunionesEnResumen } from "./fuentes";

vi.mock("server-only", () => ({}));

async function reunion(id: string, clientId: string, dia: string, resumen: string, correo: string) {
  return prisma.firefliesSession.create({
    data: {
      id,
      title: `Reunión ${id}`,
      date: new Date(`${dia}T15:00:00Z`),
      participants: [correo],
      resolvedClientId: clientId,
      summary: { overview: resumen },
    },
  });
}

describe("las reuniones elegidas, primero y por el chokepoint — DB real", () => {
  it("la elegida va primero aunque sea vieja; una elegida de otro cliente no sale", async () => {
    const a = await prisma.client.create({ data: { name: "Cliente A (test)" } });
    const b = await prisma.client.create({ data: { name: "Cliente B (test)" } });
    await reunion("vieja-de-a", a.id, "2026-03-01", "Contaron cómo llevan sus clientes en un Excel.", "ana@cliente-a.test");
    await reunion("nueva-de-a", a.id, "2026-07-01", "Revisaron el avance de la implementación.", "ana@cliente-a.test");
    await reunion("de-b", b.id, "2026-07-02", "Algo confidencial de Cliente B.", "beto@cliente-b.test");

    const r = await reunionesEnResumen(a.id, { elegidas: ["de-b", "vieja-de-a"] });

    expect(r.sesiones).toEqual(["vieja-de-a", "nueva-de-a"]);
    expect(r.fuentes[0].texto).toContain("Excel");
    expect(JSON.stringify(r.fuentes)).not.toContain("confidencial");
  });

  it("sin elegidas, la más nueva primero (como siempre)", async () => {
    const a = await prisma.client.create({ data: { name: "Cliente A (test)" } });
    await reunion("vieja", a.id, "2026-03-01", "Lo de marzo.", "ana@cliente-a.test");
    await reunion("nueva", a.id, "2026-07-01", "Lo de julio.", "ana@cliente-a.test");
    expect((await reunionesEnResumen(a.id)).sesiones).toEqual(["nueva", "vieja"]);
  });

  it("las elegidas ocupan como mucho la mitad: lo más reciente siempre entra", async () => {
    const a = await prisma.client.create({ data: { name: "Cliente A (test)" } });
    await reunion("e1", a.id, "2026-01-01", "Elegida uno.", "ana@cliente-a.test");
    await reunion("e2", a.id, "2026-01-02", "Elegida dos.", "ana@cliente-a.test");
    await reunion("reciente", a.id, "2026-07-01", "La de esta semana.", "ana@cliente-a.test");
    const r = await reunionesEnResumen(a.id, { elegidas: ["e1", "e2"], cuantas: 2 });
    expect(r.sesiones).toEqual(["e2", "reciente"]);
  });
});

describe("el proyecto de contexto de «Actualizar escala» — DB real", () => {
  it("solo uno de la misma empresa: el de otra no entra", async () => {
    const a = await prisma.client.create({ data: { name: "Cliente A (test)" } });
    const b = await prisma.client.create({ data: { name: "Cliente B (test)" } });
    const deA = await prisma.project.create({ data: { clientId: a.id, name: "Proyecto de A" } });
    const deB = await prisma.project.create({ data: { clientId: b.id, name: "Proyecto de B" } });
    expect(await proyectoDeContextoDeLaEmpresa(a.id, deA.id)).toBe(deA.id);
    expect(await proyectoDeContextoDeLaEmpresa(a.id, deB.id)).toBeNull();
    expect(await proyectoDeContextoDeLaEmpresa(a.id, null)).toBeNull();
  });
});
