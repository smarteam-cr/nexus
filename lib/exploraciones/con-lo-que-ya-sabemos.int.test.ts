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
  const e = await prisma.exploracionDeVenta.create({ data: { clientId: ae.id, creadaPor: "cse@smarteamcr.com" }, select: { id: true } });
  return { aeId: ae.id, taeId: tae.id, proyectoDeTae: proyectoDeTae.id, exploracionId: e.id };
}

async function leer(exploracionId: string, o: { proyectoDeContexto?: string | null; sesiones?: { id: string; reunion: string; deLoQueYaSabemos?: boolean }[] } = {}) {
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
