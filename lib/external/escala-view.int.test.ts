/**
 * lib/external/escala-view.int.test.ts — el enlace de La escala contra una base REAL: abre lo de esa empresa, revocar lo
 * cierra, el enlace nuevo es otro, y un enlace cruzado o de una exploración archivada no abre nada. Correr con la base
 * local: `npx vitest run --project integration lib/external/escala-view.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/exploraciones/servidor", async (original) => {
  // La escala del repo: la base de pruebas no tiene una publicada.
  const real = await original<typeof import("@/lib/exploraciones/servidor")>();
  const { leerArchivoDeLaEscala } = await import("@/lib/escala/documento/archivos");
  const { parsearEscala } = await import("@/lib/escala/documento/parsear");
  return { ...real, escalaParaExplorar: async () => ({ estado: "ok" as const, general: parsearEscala(leerArchivoDeLaEscala("escala")), aviso: null }) };
});

import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { crearAcceso, estadoDelAcceso, revocarAcceso } from "@/lib/exploraciones/acceso-a-la-escala";
import { paginaParaElCse } from "@/lib/exploraciones/escala-para-el-cliente-server";
import { escalaParaElToken } from "./escala-view";

const tokenDe = (enlace: string | null) => (enlace ?? "").split("/").pop() ?? "";

async function preventa(nombre: string, chequeo: Record<string, { nivel: string; fuente: string; evidencia?: string; porQue?: string }>) {
  const client = await prisma.client.create({ data: { name: nombre, kind: "PROSPECTO" } });
  const e = await prisma.exploracionDeVenta.create({
    data: { clientId: client.id, areas: ["1"], perfilCierre: "con equipo", perfilDespues: "continua", creadaPor: "ana@smarteam.test", contenido: { chequeo } },
  });
  return { clientId: client.id, id: e.id };
}

describe("el enlace de La escala", () => {
  it("abre la escala de esa empresa, con la hipótesis usada «por explorar», y revocar lo cierra", async () => {
    const { id } = await preventa("Empresa A (test)", {
      "1.1": { nivel: "I", fuente: "reunion", evidencia: "CITA INTERNA", porQue: "PORQUE INTERNO" },
      "1.2": { nivel: "O", fuente: "hipotesis" },
    });
    const creado = await crearAcceso(id, "ana@smarteam.test");
    // Desde el 8 nov la hipótesis que el vendedor usó sale como nivel «por explorar» (escala-para-el-cliente.ts).
    expect(creado).toMatchObject({ estado: "activo", medidas: 2, porExplorar: 1 });
    expect(creado.enlace).toMatch(/\/external\/escala\/[0-9a-f]{64}$/);

    const token = tokenDe(creado.enlace);
    const d = await escalaParaElToken(token);
    expect(d).toMatchObject({ empresa: "Empresa A (test)", areas: [{ id: "1" }] });
    expect(d!.resultados[0].dimensiones.filter((x) => x.preguntada).map((x) => x.id)).toEqual(["1.1", "1.2"]);
    expect(d!.porExplorar["1"]).toEqual(["1.2"]);
    // Se anota que se abrió, y nada interno sale en el enlace.
    expect((await estadoDelAcceso(id)).ultimaVista).not.toBeNull();
    expect(JSON.stringify(d)).not.toMatch(/ana@smarteam\.test|CITA INTERNA|PORQUE INTERNO/);

    // Crear otra vez con uno vivo devuelve el mismo.
    expect((await crearAcceso(id, null)).enlace).toBe(creado.enlace);

    expect(await revocarAcceso(id)).toMatchObject({ estado: "revocado", enlace: null });
    expect(await escalaParaElToken(token)).toBeNull();

    const nuevo = await crearAcceso(id, null);
    expect(nuevo.enlace).not.toBe(creado.enlace);
    expect(await escalaParaElToken(token)).toBeNull();
    expect(await escalaParaElToken(tokenDe(nuevo.enlace))).not.toBeNull();
  });

  it("⛔ sin ningún equipo para mostrar no se crea; si lo usado se va después, abre vacía", async () => {
    const { id } = await preventa("Empresa B (test)", {});
    await expect(crearAcceso(id, null)).rejects.toMatchObject({ status: 409 });

    await prisma.exploracionDeVenta.update({ where: { id }, data: { contenido: { chequeo: { "1.1": { nivel: "I", fuente: "reunion" } } } } });
    const token = tokenDe((await crearAcceso(id, null)).enlace);
    await prisma.exploracionDeVenta.update({ where: { id }, data: { contenido: { chequeo: {} } } });
    expect(await escalaParaElToken(token)).toMatchObject({ empresa: "Empresa B (test)", resultados: [] });
  });

  it("⛔ un enlace de una exploración archivada, de un proyecto, o de un contenedor que hoy es de otra empresa, no abre nada", async () => {
    const a = await preventa("Empresa C (test)", { "1.1": { nivel: "I", fuente: "reunion" } });
    const token = tokenDe((await crearAcceso(a.id, null)).enlace);
    expect(await escalaParaElToken(token)).not.toBeNull();

    const otra = await prisma.client.create({ data: { name: "Otra empresa (test)", kind: "PROSPECTO" } });
    const ajeno = await prisma.project.create({ data: { name: "Información de otra", clientId: otra.id, serviceType: SENTINEL_SERVICE_TYPE } });
    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: ajeno.id } });
    expect(await escalaParaElToken(token)).toBeNull();

    const contenedor = await prisma.project.create({ data: { name: "Información", clientId: a.clientId, serviceType: SENTINEL_SERVICE_TYPE } });
    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: contenedor.id } });
    expect(await escalaParaElToken(token)).not.toBeNull();

    const proyecto = await prisma.project.create({ data: { name: "Un proyecto", clientId: a.clientId } });
    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: proyecto.id } });
    expect(await escalaParaElToken(token)).toBeNull();

    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: null, archivadaEn: new Date() } });
    expect(await escalaParaElToken(token)).toBeNull();
    expect(await escalaParaElToken("no-es-un-token")).toBeNull();
    expect(await escalaParaElToken("0".repeat(64))).toBeNull();
  });
});

describe("la escala interna editable (8 nov): la misma página, por el mismo cálculo", () => {
  async function conEdicion(nombre: string) {
    const p = await preventa(nombre, { "1.1": { nivel: "I", fuente: "reunion" }, "1.2": { nivel: "F", fuente: "vendedor" } });
    await prisma.exploracionDeVenta.update({
      where: { id: p.id },
      data: {
        contenido: {
          chequeo: { "1.1": { nivel: "I", fuente: "reunion" }, "1.2": { nivel: "F", fuente: "vendedor" } },
          textosDelRadar: { "1.1": { texto: "TEXTO DEL EQUIPO", nivel: "I" }, "1.2": { texto: "TEXTO VIEJO", nivel: "O" } },
          contextoDeLaEscala: { "1": "CONTEXTO DEL EQUIPO" },
        },
      },
    });
    return p;
  }

  it("lo que se edita adentro es lo que abre el enlace (el texto de la tarjeta, en su nivel); el contexto no sale", async () => {
    const { id } = await conEdicion("Empresa D (test)");
    const token = tokenDe((await crearAcceso(id, null)).enlace);
    const afuera = await escalaParaElToken(token);
    const adentro = await paginaParaElCse(id);
    expect(afuera!.detalles["1.1"].impacto).toBe("TEXTO DEL EQUIPO");
    expect(afuera!.detalles["1.2"].impacto).not.toBe("TEXTO VIEJO");
    // El contexto lo lee el agente de la descripción: ni afuera ni en la página de adentro.
    expect(JSON.stringify(afuera)).not.toContain("CONTEXTO DEL EQUIPO");
    expect(JSON.stringify(adentro)).not.toContain("CONTEXTO DEL EQUIPO");
    // Adentro, lo de las áreas que ve el cliente es IGUAL a lo de afuera; además vienen las otras, y cuáles ve.
    expect(adentro!.alCliente).toEqual(["1"]);
    expect(adentro!.areas.map((a) => a.id)).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(adentro!.resultados.find((r) => r.areaId === "1")).toEqual(afuera!.resultados[0]);
    expect(adentro!.detalles["1.1"]).toEqual(afuera!.detalles["1.1"]);
  });

  it("⛔ adentro tampoco cruza de empresa: con su contenedor en otra empresa no hay página; archivada sí (es interna)", async () => {
    const a = await conEdicion("Empresa E (test)");
    const otra = await prisma.client.create({ data: { name: "Otra empresa E (test)", kind: "PROSPECTO" } });
    const ajeno = await prisma.project.create({ data: { name: "Información de otra", clientId: otra.id, serviceType: SENTINEL_SERVICE_TYPE } });
    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: ajeno.id } });
    expect(await paginaParaElCse(a.id)).toBeNull();

    // La de un proyecto de su empresa no se comparte, pero adentro se ve y se edita.
    const proyecto = await prisma.project.create({ data: { name: "Un proyecto E", clientId: a.clientId } });
    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: proyecto.id } });
    expect((await paginaParaElCse(a.id))?.empresa).toBe("Empresa E (test)");

    await prisma.exploracionDeVenta.update({ where: { id: a.id }, data: { projectId: null, archivadaEn: new Date() } });
    expect((await paginaParaElCse(a.id))?.empresa).toBe("Empresa E (test)");
  });
});
