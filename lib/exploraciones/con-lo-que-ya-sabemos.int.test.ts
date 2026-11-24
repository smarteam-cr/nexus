/**
 * lib/exploraciones/con-lo-que-ya-sabemos.int.test.ts — «Ubicar con lo que ya sabemos» (24 nov, el TEC) contra una base
 * REAL, sin IA: lo que lee la preventa de un cliente sin sesiones, y que nunca lee lo de otra empresa.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/con-lo-que-ya-sabemos.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que el chokepoint (invariante #1) deja afuera la reunión de la otra ficha, que un proyecto
 * de contexto de otra empresa se ignora, que las sesiones van enteras primero y la base en resumen después sin repetirse,
 * y que un prospecto sin sesiones sigue sin gastar IA.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { loQueLeeUbicar } from "./agente";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);
const DIA = 24 * 60 * 60 * 1000;
// Una conversación de verdad (más de 400 caracteres dichos): una más corta es «una reunión casi sin conversación» y no se lee.
const CONVERSACION = [
  "Ivannia Mora: Los reportes los armamos a mano cada semana en Excel, y nadie confía en el número que sale al final.",
  "Ana Smarteam: ¿Cuánto tiempo les toma armar ese reporte cada semana, más o menos, entre las dos?",
  "Ivannia Mora: Medio día entre Cindy y yo, porque hay que cruzar lo de Fundatec con lo que está en HubSpot a mano.",
  "Ana Smarteam: ¿Y qué pasa cuando los números de Fundatec y de HubSpot no cuadran entre sí?",
  "Ivannia Mora: Gana el de Fundatec, siempre. HubSpot todavía no es la fuente de verdad para la dirección del programa.",
].join("\n");

async function sembrar(kind: "CLIENTE" | "PROSPECTO") {
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
  await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteamcr.com"] } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE (test)", kind }, select: { id: true } });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE (test)", kind: "CLIENTE" }, select: { id: true } });
  const ahora = Date.now();
  await prisma.firefliesSession.createMany({
    data: [
      {
        id: "ae-reportes",
        title: "AE | Reportes de Ventas",
        date: new Date(ahora - 3 * DIA),
        participants: ["cse@smarteamcr.com", "ivannia@ae.test"],
        summary: { overview: "La coordinadora contó que los reportes de matrícula se arman a mano cada semana en Excel." },
        transcript: CONVERSACION,
        resolvedClientId: ae.id,
      },
      {
        id: "ae-limpieza",
        title: "AE | Limpieza BBDD",
        date: new Date(ahora - 5 * DIA),
        participants: ["cse@smarteamcr.com", "cindy@ae.test"],
        summary: { overview: "Hay más de diez mil contactos duplicados en la base de AE." },
        resolvedClientId: ae.id,
      },
      {
        id: "tae-capacitacion",
        title: "TAE | Capacitación de ventas",
        date: new Date(ahora - 2 * DIA),
        participants: ["cse@smarteamcr.com", "alguien@tae.test"],
        summary: { overview: "Lo de TAE no puede entrar a la preventa de AE." },
        resolvedClientId: tae.id,
      },
    ],
  });
  const proyectoDeTae = await prisma.project.create({ data: { name: "TAE | SMARTLOOP (test)", clientId: tae.id }, select: { id: true } });
  const proyectoDeAe = await prisma.project.create({ data: { name: "AE | SMARTLOOP (test)", clientId: ae.id }, select: { id: true } });
  // Un cronograma en cada uno: el de TAE es contenido de verdad que NUNCA puede entrar a la preventa de AE.
  for (const [projectId, fase] of [[proyectoDeTae.id, "Fase de TAE"], [proyectoDeAe.id, "Fase de AE"]] as const) {
    await prisma.projectTimeline.create({ data: { projectId, phases: { create: [{ name: fase, order: 0, durationWeeks: 2 }] } } });
  }
  const e = await prisma.exploracionDeVenta.create({ data: { clientId: ae.id, creadaPor: "cse@smarteamcr.com" }, select: { id: true } });
  return { aeId: ae.id, taeId: tae.id, proyectoDeTae: proyectoDeTae.id, proyectoDeAe: proyectoDeAe.id, exploracionId: e.id };
}

async function leer(
  exploracionId: string,
  o: { proyectoDeContexto?: string | null; sesiones?: { id: string; reunion: string; deLoQueYaSabemos?: boolean }[]; fuera?: string[] } = {},
) {
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new Error("sin escala");
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") throw new Error("sin exploración");
  const estado = estadoDesdeFila(lectura.fila);
  if (o.sesiones) {
    estado.contenido.sesiones = o.sesiones.map((s) => ({
      id: s.id,
      fecha: "2026-11-01",
      hecha: true,
      reunion: { id: s.reunion, origen: "meet" as const },
      ...(s.deLoQueYaSabemos ? { deLoQueYaSabemos: true } : {}),
    }));
  }
  if (o.fuera) estado.contenido.fuera = o.fuera;
  const escala = escalaDeLaExploracion(escalaVig.general, estado);
  return loQueLeeUbicar(exploracionId, { fila: lectura.fila, estado, escala }, { proyectoDeContexto: o.proyectoDeContexto ?? null });
}

describe("«Ubicar con lo que ya sabemos» — DB real", { timeout: 30_000 }, () => {
  it("un cliente sin sesiones lee su base en resumen, sin nada de la otra ficha ni de su proyecto", async () => {
    const s = await sembrar("CLIENTE");
    const r = await leer(s.exploracionId, { proyectoDeContexto: s.proyectoDeTae });
    expect(r.conLoQueYaSabemos).toBe(true);
    expect(r.ctx.loQueYaSabemos).toBe("solo");
    expect(r.hayDelCliente).toBe(true);
    expect(r.leido.sesionesUsadas.sort()).toEqual(["ae-limpieza", "ae-reportes"]);
    const todo = r.leido.fuentes.map((f) => `${f.etiqueta} ${f.texto}`).join("\n");
    expect(todo).not.toContain("TAE");
    // El proyecto de otra empresa no entra como contexto: ni su handoff, ni su cronograma, ni su memoria.
    expect(r.leido.fuentes.some((f) => /^(V0|Q0|R0|K0|A1)$/.test(f.id))).toBe(false);
    expect(todo).not.toContain("Fase de TAE");
    // El de la propia empresa sí: su cronograma entra como contexto.
    const conElSuyo = await leer(s.exploracionId, { proyectoDeContexto: s.proyectoDeAe });
    expect(conElSuyo.leido.fuentes.find((f) => f.id === "R0")?.texto).toContain("Fase de AE");
    expect(r.ctx.objetivo).toBe("la preventa de un cliente, con lo que ya sabemos de la empresa");
  });

  it("con una sesión, su transcripción va entera primero y la base sigue en resumen, sin repetirla", async () => {
    const s = await sembrar("CLIENTE");
    const r = await leer(s.exploracionId, { sesiones: [{ id: "s-uno", reunion: "ae-reportes" }] });
    expect(r.ctx.loQueYaSabemos).toBe("ademas");
    const ses = r.leido.fuentes.filter((f) => /^S\d/.test(f.id));
    expect(ses.map((f) => f.id)).toEqual(["S1", "S2"]);
    expect(ses[0].texto).toContain("nadie confía en el número");
    expect(ses[1].etiqueta).toContain("(resumen): AE | Limpieza BBDD");
    expect(r.leido.sesionesUsadas).toEqual(["ae-reportes", "ae-limpieza"]);
  });

  it("con solo reuniones de trabajo, todo es base: el pedido las nombra así", async () => {
    const s = await sembrar("CLIENTE");
    const r = await leer(s.exploracionId, { sesiones: [{ id: "s-uno", reunion: "ae-reportes", deLoQueYaSabemos: true }] });
    expect(r.ctx.loQueYaSabemos).toBe("solo");
    expect(r.ctx.reuniones?.[0]).toMatchObject({ fuente: "S1", deTrabajo: true });
  });

  it("un prospecto sin sesiones sigue sin gastar IA: la corrida termina con el motivo", async () => {
    const s = await sembrar("PROSPECTO");
    // En un prospecto, sus reuniones entran solas como sesiones: sin ninguna, no hay sesión con texto.
    await prisma.firefliesSession.deleteMany({ where: { resolvedClientId: s.aeId } });
    await expect(leer(s.exploracionId)).rejects.toThrow(/Ninguna sesión de esta preventa tiene transcripción/);
  });
});

describe("el motivo de un Resumen sin reuniones, dicho donde se está", () => {
  it("la preventa de un cliente dice que sume reuniones de trabajo; la cuenta no habla de «preventa»", async () => {
    const { sinReunionesParaElResumen } = await import("./resumen-de-la-escala-server");
    expect(sinReunionesParaElResumen({ projectId: null, client: { kind: "CLIENTE" } })).toContain("suma reuniones de trabajo");
    expect(sinReunionesParaElResumen({ projectId: "p1", client: { kind: "CLIENTE" } })).not.toContain("preventa");
    expect(sinReunionesParaElResumen({ projectId: null, client: { kind: "PROSPECTO" } })).toContain("de esta preventa");
  });
});

describe("«Fuera de la exploración» y el análisis de venta — DB real", { timeout: 30_000 }, () => {
  it("lo que alguien sacó con «Fuera de la exploración» no vuelve por la base en resumen", async () => {
    const s = await sembrar("CLIENTE");
    const r = await leer(s.exploracionId, { fuera: ["meet:ae-limpieza"] });
    expect(r.leido.sesionesUsadas).toEqual(["ae-reportes"]);
  });

  it("una reunión de trabajo de la preventa de un cliente no la toma el análisis de venta; una de diagnóstico, sí", async () => {
    const s = await sembrar("CLIENTE");
    const { aplicarCambios } = await import("./servidor");
    const lectura = await leerExploracion(s.exploracionId);
    if (lectura.estado !== "ok") throw new Error("sin exploración");
    const r = await aplicarCambios(
      s.exploracionId,
      lectura.fila.version,
      [
        { op: "agregarSesion", sesion: { id: "s-trabajo", fecha: "2026-11-01", reunion: { id: "ae-reportes", origen: "meet" }, deLoQueYaSabemos: true } },
        { op: "agregarSesion", sesion: { id: "s-diagnostico", fecha: "2026-11-02", reunion: { id: "ae-limpieza", origen: "meet" } } },
      ],
      general,
    );
    expect(r.estado).toBe("ok");
    const { reunionesDeLasSesionesDeLaPreventa } = await import("./fuentes");
    const tomadas = await reunionesDeLasSesionesDeLaPreventa(s.aeId, ["ae-reportes", "ae-limpieza"]);
    expect([...tomadas]).toEqual(["ae-limpieza"]);
  });
});

describe("la marca y las sugeridas, fuera de la preventa de un cliente — DB real", { timeout: 30_000 }, () => {
  it("en un prospecto o un aliado la marca de reunión de trabajo se ignora al leer", async () => {
    for (const kind of ["PROSPECTO", "ALIADO"] as const) {
      const s = await sembrar(kind === "PROSPECTO" ? "PROSPECTO" : "CLIENTE");
      if (kind === "ALIADO") await prisma.client.update({ where: { id: s.aeId }, data: { kind: "ALIADO" } });
      const r = await leer(s.exploracionId, { sesiones: [{ id: "s-uno", reunion: "ae-reportes", deLoQueYaSabemos: true }] });
      expect(r.conLoQueYaSabemos, kind).toBe(false);
      expect(r.ctx.loQueYaSabemos, kind).toBeUndefined();
      expect(r.ctx.reuniones?.some((x) => x.deTrabajo), kind).toBe(false);
      await prisma.$executeRawUnsafe('TRUNCATE "ExploracionDeVenta", "FirefliesSession", "ProjectTimeline", "Project", "Client", "SessionCategory" CASCADE');
    }
  });

  it("lo medido de las sugeridas se recuerda 10 minutos por empresa y una reunión sin medir se vuelve a medir", async () => {
    const s = await sembrar("CLIENTE");
    const { reunionesDeTrabajoSugeridas, olvidarLoMedido, MEMORIA_DE_LO_MEDIDO_MS } = await import("./reuniones-de-trabajo-server");
    olvidarLoMedido();
    const pedidas: string[][] = [];
    const medir = async (ids: readonly string[]) => {
      pedidas.push([...ids]);
      return new Map(ids.map((id) => [id, { fuente: "transcripcion" as const, total: 100, smarteam: { palabras: 40, porcentaje: 40 }, cliente: { palabras: 60, porcentaje: 60 }, personas: [] }]));
    };
    const t0 = Date.now();
    const primera = await reunionesDeTrabajoSugeridas(s.aeId, { ahora: t0, medir });
    expect(primera.map((x) => x.sessionId)).toEqual(["ae-reportes"]);
    await reunionesDeTrabajoSugeridas(s.aeId, { ahora: t0 + 60_000, medir });
    expect(pedidas).toEqual([["ae-reportes"]]);
    await reunionesDeTrabajoSugeridas(s.aeId, { ahora: t0 + MEMORIA_DE_LO_MEDIDO_MS + 1, medir });
    expect(pedidas).toHaveLength(2);
    olvidarLoMedido();
  });
});

describe("una reunión de trabajo no se lee como sesión — DB real", { timeout: 30_000 }, () => {
  it("no queda «sin leer» y el agente no la lee como sesión (ni con el botón ni en la cola)", async () => {
    const s = await sembrar("CLIENTE");
    const { aplicarCambios } = await import("./servidor");
    const lectura = await leerExploracion(s.exploracionId);
    if (lectura.estado !== "ok") throw new Error("sin exploración");
    const r = await aplicarCambios(
      s.exploracionId,
      lectura.fila.version,
      [{ op: "agregarSesion", sesion: { id: "s-trabajo", fecha: "2026-11-01", reunion: { id: "ae-reportes", origen: "meet" }, deLoQueYaSabemos: true } }],
      general,
    );
    expect(r.estado).toBe("ok");
    const { reunionesSinLeer } = await import("./fuentes");
    const { lanzarCorrida } = await import("./agente");
    const { leerLoLeido } = await import("./lo-leido");
    const despues = await leerExploracion(s.exploracionId);
    if (despues.estado !== "ok") throw new Error("sin exploración");
    const estado = estadoDesdeFila(despues.fila);
    const sinLeer = await reunionesSinLeer({
      exploracionId: s.exploracionId,
      clientId: s.aeId,
      creadaEn: despues.fila.createdAt,
      propuesta: estado.propuesta,
      leido: leerLoLeido(despues.fila.test),
      sesiones: estado.contenido.sesiones,
      fuera: estado.contenido.fuera,
      elegidas: estado.contenido.reunionesElegidas,
    });
    expect(sinLeer.map((x) => x.id)).not.toContain("ae-reportes");
    const leer1 = await lanzarCorrida(s.exploracionId, "leer", { triggeredByEmail: "cse@smarteamcr.com", sesionId: "ae-reportes" });
    expect(leer1).toMatchObject({ ok: false, status: 409 });
  });
});
