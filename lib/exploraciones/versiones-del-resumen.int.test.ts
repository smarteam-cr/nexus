/**
 * lib/exploraciones/versiones-del-resumen.int.test.ts — el historial de versiones del Resumen de La escala, contra una base
 * REAL (21 nov). Reemplaza a la prueba de «Volver a la versión anterior».
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/versiones-del-resumen.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que la anterior que guardaba el botón de la mañana entra al historial una vez; que usar una
 * versión cambia el Resumen con la fila bloqueada, conserva lo demás del Json, no toca la foto publicada ni la versión, y
 * deja guardado el de antes; que mientras Nexus rehace el Resumen, o con una firma vieja, no cambia nada (409); que
 * publicar marca «Lo que ve el cliente»; y el tope de 30, que no se lleva las publicadas.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { guardarVersion, VERSIONES_POR_DOCUMENTO } from "@/lib/versiones/guardar-server";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { leerContenido } from "./esquemas";
import type { ResumenGuardado } from "./resumen-de-la-escala";
import { seRehaceElResumen } from "./resumen-de-la-escala-server";
import { guardarAlPublicar, guardarAlRehacer, historialDelResumen, huellaDelResumen, usarVersionDelResumen } from "./versiones-del-resumen-server";

const CITA = { reunion: "gmeet_r1", fecha: "2026-11-05T16:00:00.000Z", turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano" };
const resumen = (at: string, tesis: string, aMano: string | null = null): ResumenGuardado => ({
  v: 2,
  at,
  por: null,
  modelo: "claude-sonnet-4-6",
  agentRunId: null,
  hicimos: { sesiones: [], personas: 1, texto: aMano },
  datosRojos: [],
  areas: {},
  entendimos: [],
  falta: [],
  negocio: { tesis: [{ id: "n1", texto: tesis, citas: [CITA] }] },
  operativas: [],
  puntos: [],
});
const A = resumen("2026-11-18T18:00:00.000Z", "Las ventas se anotan a mano.", "Escrito a mano por Ana.");
const B = resumen("2026-11-21T15:00:00.000Z", "Nadie ve el mes de ventas.");
const FOTO = { formato: "prueba", lo: "que ve el cliente" };

async function sembrar(o: { conAnterior?: boolean } = {}) {
  const c = await prisma.client.create({ data: { name: "Prospecto del historial", kind: "PROSPECTO" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      contenido: {
        resumenDeLaEscala: B,
        ...(o.conAnterior !== false ? { resumenAnterior: { resumen: A, en: "2026-11-21T15:00:05.000Z", por: "luis@prueba.test", motivo: "rehacer" } } : {}),
        // Una clave que esta versión no conoce: no se pierde al usar una versión.
        deUnaVersionNueva: { algo: 1 },
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, version: true },
  });
  const publicadaEn = new Date("2026-11-20T12:00:00.000Z");
  await prisma.accesoALaEscala.create({ data: { exploracionId: e.id, accessToken: `t${e.id}`.padEnd(64, "0").slice(0, 64), publicada: FOTO, publicadaEn, publicadaPor: "ana@prueba.test" } });
  return { clientId: c.id, id: e.id, version: e.version, publicadaEn };
}

async function leer(id: string) {
  const f = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id }, select: { contenido: true, version: true, accesoALaEscala: { select: { publicada: true, publicadaEn: true } } } });
  return { ...f, c: leerContenido(f.contenido), crudo: f.contenido as Record<string, unknown> };
}

const sinCorrida = (id: string) => (tx: Prisma.TransactionClient) => seRehaceElResumen(tx, id);

describe("el historial del Resumen, en la base", () => {
  it("la anterior del botón de la mañana entra una vez, con su fecha, y la de hoy sale como actual sin guardar", async () => {
    const s = await sembrar();
    const h = await historialDelResumen(s.id);
    expect(h?.firma).toBe(huellaDelResumen(B));
    expect(h?.versiones.map((v) => [v.id === null, v.esActual, v.tipo])).toEqual([
      [true, true, "edicion"],
      [false, false, "guardada"],
    ]);
    expect(h?.versiones[1].quien).toBe("luis@prueba.test");
    // Abrirlo otra vez no la duplica.
    expect((await historialDelResumen(s.id))?.versiones).toHaveLength(2);
  });

  it("usar una versión pone ese Resumen, guarda el de antes y no toca lo publicado, la versión ni lo desconocido", async () => {
    const s = await sembrar();
    const h = await historialDelResumen(s.id);
    const vieja = h!.versiones.find((v) => v.id)!;
    const r = await usarVersionDelResumen({ exploracionId: s.id, versionId: vieja.id!, email: "elias@prueba.test", firma: h!.firma, enCurso: sinCorrida(s.id) });
    expect(r).toEqual({ ok: true });
    const f = await leer(s.id);
    expect(f.c.resumenDeLaEscala?.hicimos.texto).toBe("Escrito a mano por Ana.");
    expect(f.crudo.deUnaVersionNueva).toEqual({ algo: 1 });
    expect(f.version).toBe(s.version);
    expect(f.accesoALaEscala?.publicada).toEqual(FOTO);
    expect(f.accesoALaEscala?.publicadaEn?.toISOString()).toBe(s.publicadaEn.toISOString());

    const despues = await historialDelResumen(s.id);
    expect(despues?.versiones[0]).toMatchObject({ tipo: "restaurado", esActual: true, quien: "elias@prueba.test" });
    // El de antes (B) quedó guardado: se puede volver a él.
    const deB = await prisma.versionDeDocumento.findFirst({ where: { exploracionId: s.id, huella: huellaDelResumen(B)! }, select: { id: true } });
    expect(deB).not.toBeNull();
  });

  it("mientras Nexus rehace el Resumen, 409 y no cambia nada", async () => {
    const s = await sembrar();
    const h = await historialDelResumen(s.id);
    await prisma.agentRun.create({
      data: { agentSlug: AGENTE_DE_LA_EXPLORACION, clientId: s.clientId, status: "RUNNING", filters: { exploracion: s.id, modo: "resumen-de-la-escala" } },
    });
    const antes = await leer(s.id);
    const r = await usarVersionDelResumen({ exploracionId: s.id, versionId: h!.versiones[1].id!, email: null, firma: h!.firma, enCurso: sinCorrida(s.id) });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await leer(s.id)).contenido).toEqual(antes.contenido);
  });

  it("con una firma vieja (otra persona lo cambió), 409 y no pisa nada", async () => {
    const s = await sembrar();
    const h = await historialDelResumen(s.id);
    const otra = (await leer(s.id)).c;
    await prisma.exploracionDeVenta.update({
      where: { id: s.id },
      data: { contenido: JSON.parse(JSON.stringify({ ...otra, resumenDeLaEscala: { ...B, hicimos: { ...B.hicimos, texto: "Lo cambió otra persona." } } })) },
    });
    const r = await usarVersionDelResumen({ exploracionId: s.id, versionId: h!.versiones[1].id!, email: null, firma: h!.firma, enCurso: sinCorrida(s.id) });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await leer(s.id)).c.resumenDeLaEscala?.hicimos.texto).toBe("Lo cambió otra persona.");
  });

  it("una versión de otra exploración es un 404", async () => {
    const s = await sembrar();
    const otra = await sembrar();
    const h = await historialDelResumen(otra.id);
    const r = await usarVersionDelResumen({ exploracionId: s.id, versionId: h!.versiones[1].id!, email: null, firma: huellaDelResumen(B), enCurso: sinCorrida(s.id) });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("rehacer guarda el de antes y el nuevo; publicar marca «Lo que ve el cliente»", async () => {
    const s = await sembrar({ conAnterior: false });
    await guardarAlRehacer(s.id, { antes: A, nuevo: B, email: "elias@prueba.test" });
    let h = await historialDelResumen(s.id);
    expect(h?.versiones.map((v) => [v.tipo, v.esActual])).toEqual([
      ["ia", true],
      ["guardada", false],
    ]);
    expect(h?.versiones.some((v) => v.esLoQueVeElCliente)).toBe(false);
    await guardarAlPublicar(s.id, "ana@prueba.test");
    h = await historialDelResumen(s.id);
    // Igual a la última: se marca esa, no se guarda otra.
    expect(h?.versiones).toHaveLength(2);
    expect(h?.versiones[0]).toMatchObject({ tipo: "ia", esActual: true, esLoQueVeElCliente: true });
  });

  it("guarda las últimas 30 y nunca se lleva una publicada", async () => {
    const s = await sembrar({ conAnterior: false });
    await guardarVersion({ exploracionId: s.id }, { tipo: "publicado", nota: "Al publicar", creadaPor: null, huella: "pub", contenido: A, publicada: true, protegida: true, createdAt: new Date("2026-01-01T00:00:00.000Z") });
    for (let i = 0; i < VERSIONES_POR_DOCUMENTO + 3; i++) {
      await guardarVersion({ exploracionId: s.id }, { tipo: "ia", nota: "x", creadaPor: null, huella: `h${i}`, contenido: { i }, createdAt: new Date(Date.UTC(2026, 1, 1, 0, i)) });
    }
    const filas = await prisma.versionDeDocumento.findMany({ where: { exploracionId: s.id }, select: { huella: true, protegida: true } });
    expect(filas.filter((f) => !f.protegida)).toHaveLength(VERSIONES_POR_DOCUMENTO);
    expect(filas.some((f) => f.huella === "pub")).toBe(true);
    expect(filas.some((f) => f.huella === "h0")).toBe(false);
  });
});
