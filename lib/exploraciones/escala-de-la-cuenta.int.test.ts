/**
 * lib/exploraciones/escala-de-la-cuenta.int.test.ts — abrir la escala de la cuenta contra una base REAL (escala única,
 * 2026-10-28; revisión de lo juntado, 2026-10-29). Lo que se escribe solo al entrar a la ficha:
 *   · trae lo medido en la preventa en DOS tandas: primero la edición, después los criterios propios de esa edición
 *     (con una sola tanda, o al revés, el escritor los rechaza y no se trae nada);
 *   · lo que no existe en la escala de la cuenta queda afuera y se cuenta para avisarlo;
 *   · una cuenta a la que alguien le quitó los niveles no se vuelve a llenar sola;
 *   · sin preventa, parte de la Exploración de un proyecto de la empresa.
 * Correr (con `npm run db:local -- up`): `npx vitest run --project integration lib/exploraciones/escala-de-la-cuenta.int.test.ts`.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";
import { ensureClientInfoProject } from "@/lib/canvas/strategy-project";
import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { contenidoVacio, type ContenidoDeExploracion } from "./contenido";
import { idsDeLaEscala } from "./escala-del-lienzo";
import { estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { abrirLaEscalaDeLaCuenta, laEscalaDeLaCuenta } from "./escala-de-la-cuenta";
import { aplicarCambios, escalaDeLaExploracion } from "./servidor";
import { guardarVersionDeLaEscala } from "./versiones-de-la-escala";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

/** Los criterios que solo existen en una edición (no en la general). */
function propiosDe(slug: string): string[] {
  const deLaGeneral = idsDeLaEscala(escalaDeLaExploracion(general, estadoDePrueba({}, { edicion: null }))).criterios;
  return [...idsDeLaEscala(escalaDeLaExploracion(general, estadoDePrueba({}, { edicion: slug }))).criterios].filter((c) => !deLaGeneral.has(c));
}
const CON_PROPIOS = general.ediciones.map((e) => ({ slug: e.slug, propios: propiosDe(e.slug) })).filter((e) => e.propios.length > 0);
const [EDICION, OTRA] = CON_PROPIOS;
const AREA = general.areas[0];
const DIM = AREA.dimensiones[0].id;

async function sembrarEscala() {
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
}

async function exploracion(o: { clientId: string; projectId?: string; edicion: string | null; falta?: ContenidoDeExploracion["falta"]; nivel?: "I" | "F" }) {
  const contenido: ContenidoDeExploracion = {
    ...contenidoVacio(),
    chequeo: { [DIM]: { nivel: o.nivel ?? "I", fuente: "reunion", evidencia: "Cada uno lleva sus clientes en un Excel" } },
    falta: o.falta ?? {},
    edicionElegida: { por: "vendedor" },
  };
  return prisma.exploracionDeVenta.create({
    data: {
      clientId: o.clientId,
      projectId: o.projectId ?? null,
      marco: o.projectId ? "cs" : "venta",
      creadaPor: "vendedor@prueba.test",
      edicion: o.edicion,
      areas: [AREA.id],
      contenido: contenido as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

const laCuenta = (id: string) => prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id }, select: { edicion: true, contenido: true, version: true } });

describe("abrir la escala de la cuenta — DB real", () => {
  it("hay ediciones con criterios propios para probar el orden de las tandas", () => {
    expect(CON_PROPIOS.length).toBeGreaterThanOrEqual(2);
  });

  it("trae la edición primero y después lo medido, con el criterio propio de esa edición, y deja la versión del día", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    // La cuenta ya existe, sin medir nada y con OTRA edición: la tanda 1 tiene que cambiarla antes de la 2, o el criterio
    // propio de la edición de la preventa no existe todavía en la cuenta y no entra.
    const { projectId } = await ensureClientInfoProject(c.id);
    await prisma.exploracionDeVenta.create({ data: { clientId: c.id, projectId, marco: "cs", creadaPor: "cse@prueba.test", edicion: OTRA.slug, areas: [AREA.id] } });
    await exploracion({ clientId: c.id, edicion: EDICION.slug, falta: { [EDICION.propios[0]]: { estado: "tiene" } } });

    const r = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ traidas: 1, desde: "la preventa", afuera: 0, noSeTrajo: false });
    const f = await laCuenta(r.cuenta.exploracion.id);
    const contenido = f.contenido as unknown as ContenidoDeExploracion;
    expect(f.edicion).toBe(EDICION.slug);
    expect(contenido.chequeo[DIM]).toMatchObject({ nivel: "I", evidencia: "Cada uno lleva sus clientes en un Excel" });
    expect(contenido.falta[EDICION.propios[0]]).toEqual({ estado: "tiene" });
    await vi.waitFor(async () => expect(await prisma.versionDeLaEscala.count({ where: { exploracionId: r.cuenta.exploracion.id } })).toBe(1), { timeout: 5000 });
  });

  it("lo de otra edición queda afuera y se cuenta; lo demás entra igual", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    // Un criterio de OTRA edición: se marcó antes de cambiar de industria en la preventa, y cambiarla no lo borra.
    const ajeno = OTRA.propios.find((x) => !EDICION.propios.includes(x))!;
    await exploracion({ clientId: c.id, edicion: EDICION.slug, falta: { [ajeno]: { estado: "no_tiene" } } });

    const r = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ traidas: 1, afuera: 1, noSeTrajo: false });
    const contenido = (await laCuenta(r.cuenta.exploracion.id)).contenido as unknown as ContenidoDeExploracion;
    expect(contenido.chequeo[DIM]?.nivel).toBe("I");
    expect(contenido.falta[ajeno]).toBeUndefined();
  });

  it("una cuenta a la que alguien le quitó los niveles no se vuelve a llenar sola", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    await exploracion({ clientId: c.id, edicion: null });
    const primera = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!primera.ok) throw new Error(primera.error);
    const id = primera.cuenta.exploracion.id;
    await vi.waitFor(async () => expect(await prisma.versionDeLaEscala.count({ where: { exploracionId: id } })).toBe(1), { timeout: 5000 });

    const { version } = await laCuenta(id);
    const quitar = await aplicarCambios(id, version, [{ op: "nivel", dimensionId: DIM, estimado: null }], general, { quienPide: "cse@prueba.test" });
    expect(quitar.estado).toBe("ok");

    const segunda = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!segunda.ok) throw new Error(segunda.error);
    expect(segunda.traidas).toBe(0);
    expect(((await laCuenta(id)).contenido as unknown as ContenidoDeExploracion).chequeo).toEqual({});
  });

  it("sin preventa, parte de la Exploración de un proyecto de la empresa", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "Implementación Sales Hub" } });
    await exploracion({ clientId: c.id, projectId: p.id, edicion: null });

    const r = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ traidas: 1, desde: "la Exploración de «Implementación Sales Hub»" });
    expect(r.cuenta.exploracion.estado.contenido.chequeo[DIM]?.nivel).toBe("I");
  });

  it("nunca parte de lo medido en otra empresa", async () => {
    await sembrarEscala();
    const a = await prisma.client.create({ data: { name: "Cliente A (test)", kind: "CLIENTE" } });
    const b = await prisma.client.create({ data: { name: "Cliente B (test)", kind: "CLIENTE" } });
    await exploracion({ clientId: b.id, edicion: null });

    const r = await abrirLaEscalaDeLaCuenta(a.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r.traidas).toBe(0);
    expect(r.cuenta.exploracion.estado.contenido.chequeo).toEqual({});
  });

  it("la ficha se abre sola solo si hay algo que traer: un proyecto medido sí, una empresa sin nada no", async () => {
    await sembrarEscala();
    const conProyecto = await prisma.client.create({ data: { name: "Con proyecto (test)", kind: "CLIENTE" } });
    const p = await prisma.project.create({ data: { clientId: conProyecto.id, name: "Implementación" } });
    await exploracion({ clientId: conProyecto.id, projectId: p.id, edicion: null });
    const sinNada = await prisma.client.create({ data: { name: "Sin nada (test)", kind: "CLIENTE" } });

    expect(await laEscalaDeLaCuenta(conProyecto.id)).toMatchObject({ cuenta: null, faltaAbrir: true });
    expect(await laEscalaDeLaCuenta(sinNada.id)).toMatchObject({ cuenta: null, faltaAbrir: false });
  });

  it("con preventa y proyecto medidos, parte del que MIDIÓ último, no del que se tocó último", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "Implementación" } });
    const delProyecto = await exploracion({ clientId: c.id, projectId: p.id, edicion: null, nivel: "F" });
    await guardarVersionDeLaEscala(delProyecto.id, { origen: "cambio", email: "cse@prueba.test", hoy: "2026-09-01" });
    const preventa = await exploracion({ clientId: c.id, edicion: null, nivel: "I" });
    await guardarVersionDeLaEscala(preventa.id, { origen: "cambio", email: "vendedor@prueba.test", hoy: "2026-10-20" });
    // Después alguien solo abre el lienzo del proyecto: su `updatedAt` es el más nuevo, pero no midió nada.
    await prisma.exploracionDeVenta.update({ where: { id: delProyecto.id }, data: { responsableEmail: "cse@prueba.test" } });

    const r = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r.desde).toBe("la preventa");
    expect(r.cuenta.exploracion.estado.contenido.chequeo[DIM]?.nivel).toBe("I");
  });

  it("un proyecto de prueba no llena la escala real de la cuenta", async () => {
    await sembrarEscala();
    const c = await prisma.client.create({ data: { name: "Acme (test)", kind: "CLIENTE" } });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "Prueba de SmartLoop", esPrueba: true } });
    await exploracion({ clientId: c.id, projectId: p.id, edicion: null });

    expect((await laEscalaDeLaCuenta(c.id)).faltaAbrir).toBe(false);
    const r = await abrirLaEscalaDeLaCuenta(c.id, "cse@prueba.test");
    if (!r.ok) throw new Error(r.error);
    expect(r.traidas).toBe(0);
  });
});
