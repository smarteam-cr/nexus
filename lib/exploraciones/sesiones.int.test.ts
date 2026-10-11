/**
 * lib/exploraciones/sesiones.int.test.ts — la exploración son sus sesiones (etapa A, 2026-10-09), contra
 * una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/sesiones.int.test.ts --project integration
 *
 * Lo que solo una base prueba:
 *   · una reunión unida que es de OTRO cliente no sale (el chokepoint, invariante 1);
 *   · una sesión unida a un evento se lista cuando aparece su fila de Meet (`gmeet_<evento>`), y antes no;
 *   · una reunión con solo notas ya leída no queda «sin leer»; sin leer, sí;
 *   · en un cliente lo leído antes que no es sesión va a «Fuera» (legado) y no es «sin leer»;
 *   · la lectura sola de un proyecto: la reunión unida por su evento sí; la del mismo día, no.
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerReunionNueva } from "./agente";
import { reunionesDeLaExploracion, reunionesSinLeer } from "./fuentes";
import type { SesionPlaneada } from "./guia";
import { leerLoLeido } from "./lo-leido";
import { contenidoVacio, propuestaVacia, type PropuestaDeExploracion } from "./contenido";

const HACE = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);

async function empresa(kind: "CLIENTE" | "PROSPECTO" = "CLIENTE") {
  return prisma.client.create({ data: { name: `Empresa ${kind} ${Math.random().toString(36).slice(2, 6)}`, kind }, select: { id: true } });
}

async function reunion(id: string, clientId: string, o: { horas?: number; transcript?: string | null; summary?: object | null; googleEventId?: string } = {}) {
  await prisma.firefliesSession.create({
    data: {
      id,
      title: `Reunión ${id}`,
      date: HACE(o.horas ?? 3),
      participants: ["ana@acme.test", "eli@smarteamcr.com"],
      transcript: o.transcript === undefined ? "Ana: Hola, hoy revisamos el embudo de ventas y lo que pasa con los leads que se pierden." : o.transcript,
      ...(o.summary ? { summary: o.summary } : {}),
      resolvedClientId: clientId,
      ...(o.googleEventId ? { googleEventId: o.googleEventId } : {}),
    },
  });
}

function opts(clientId: string, exploracionId: string, sesiones: SesionPlaneada[], propuesta: PropuestaDeExploracion = propuestaVacia(), projectId: string | null = null) {
  return { exploracionId, clientId, projectId, creadaEn: HACE(24 * 10), propuesta, leido: leerLoLeido(null), sesiones, fuera: [], elegidas: [] };
}

async function exploracion(clientId: string, o: { projectId?: string; sesiones?: SesionPlaneada[]; propuesta?: PropuestaDeExploracion; creadaHaceHoras?: number } = {}) {
  return prisma.exploracionDeVenta.create({
    data: {
      clientId,
      ...(o.projectId ? { projectId: o.projectId, marco: "cs" } : {}),
      creadaPor: "cse@prueba.test",
      areas: ["1"],
      perfilCierre: "con equipo",
      perfilDespues: "continua",
      contenido: { ...contenidoVacio(), sesiones: o.sesiones ?? [] } as never,
      propuesta: (o.propuesta ?? propuestaVacia()) as never,
      createdAt: HACE(o.creadaHaceHoras ?? 24 * 10),
    },
    select: { id: true },
  });
}

describe("la exploración de un cliente son sus sesiones", () => {
  it("una reunión unida que es de OTRO cliente no sale (el chokepoint)", async () => {
    const a = await empresa();
    const b = await empresa();
    await reunion("m-de-b", b.id);
    const sesiones: SesionPlaneada[] = [{ id: "s-a", reunion: { id: "m-de-b", origen: "meet" } }];
    const e = await exploracion(a.id, { sesiones });
    const lista = await reunionesDeLaExploracion(opts(a.id, e.id, sesiones));
    expect(lista.map((r) => r.id)).toEqual([]);
  });

  it("una sesión unida a un evento se lista cuando aparece su fila de Meet; antes, no", async () => {
    const a = await empresa();
    const sesiones: SesionPlaneada[] = [{ id: "s-a", evento: { id: "e1", calendario: "eli@smarteamcr.com", inicio: HACE(3).toISOString() } }];
    const e = await exploracion(a.id, { sesiones });
    expect(await reunionesDeLaExploracion(opts(a.id, e.id, sesiones))).toEqual([]);
    await reunion("gmeet_e1", a.id);
    const lista = await reunionesDeLaExploracion(opts(a.id, e.id, sesiones));
    expect(lista.map((r) => [r.id, r.texto])).toEqual([["gmeet_e1", "transcripcion"]]);
  });

  it("una reunión que no es sesión no se lista; lo leído antes va como «de antes» (Fuera) y no queda sin leer", async () => {
    const a = await empresa();
    await reunion("m-suelta", a.id);
    await reunion("m-leida-antes", a.id, { horas: 48 });
    const propuesta = propuestaVacia();
    propuesta.lecturas = { "meet:m-leida-antes": { etiqueta: "Reunión", resumen: "…", cobertura: [], en: HACE(40).toISOString(), corridaId: "r" } };
    propuesta.leidas.sesiones = ["m-leida-antes"];
    const e = await exploracion(a.id, { propuesta });
    const lista = await reunionesDeLaExploracion(opts(a.id, e.id, [], propuesta));
    expect(lista.map((r) => [r.id, r.legado ?? false])).toEqual([["m-leida-antes", true]]);
    expect(await reunionesSinLeer(opts(a.id, e.id, [], propuesta))).toEqual([]);
  });

  it("una reunión con solo notas: sin leer hasta que se lee con sus notas; ya leída, no se repite", async () => {
    const a = await empresa();
    await reunion("m-notas", a.id, { transcript: null, summary: { overview: "Revisaron el embudo." } });
    const sesiones: SesionPlaneada[] = [{ id: "s-a", reunion: { id: "m-notas", origen: "meet" } }];
    const e = await exploracion(a.id, { sesiones });
    expect((await reunionesSinLeer(opts(a.id, e.id, sesiones))).map((r) => r.id)).toEqual(["m-notas"]);
    const leida = propuestaVacia();
    leida.leidas.soloNotas = ["m-notas"];
    expect(await reunionesSinLeer(opts(a.id, e.id, sesiones, leida))).toEqual([]);
    const [r] = await reunionesDeLaExploracion(opts(a.id, e.id, sesiones, leida));
    expect(r).toMatchObject({ id: "m-notas", texto: "notas", leida: true });
  });
});

describe("la lectura sola en la exploración de un proyecto", () => {
  it("la reunión unida por su evento se lee sola; la del mismo día, no", async () => {
    const a = await empresa();
    const p = await prisma.project.create({ data: { clientId: a.id, name: "Implementación" }, select: { id: true } });
    await reunion("gmeet_e7", a.id, { horas: 2, googleEventId: "e7" });
    await reunion("m-mismo-dia", a.id, { horas: 2 });
    await exploracion(a.id, {
      projectId: p.id,
      sesiones: [
        { id: "s-a", evento: { id: "e7", calendario: "eli@smarteamcr.com", inicio: HACE(2).toISOString() } },
        { id: "s-b", fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) },
      ],
    });
    expect(await leerReunionNueva({ sesionId: "m-mismo-dia", fecha: HACE(2), clientId: a.id })).toBe("no-corresponde");
    expect(await leerReunionNueva({ sesionId: "gmeet_e7", fecha: HACE(2), clientId: a.id })).toBe("lanzada");
  });
});
