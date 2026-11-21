/**
 * lib/exploraciones/resumen-anterior.int.test.ts — «Volver a la versión anterior» del Resumen de La escala, contra una
 * base REAL (21 nov).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/resumen-anterior.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que volver cambia el Resumen con la fila bloqueada y conserva lo demás del Json (también lo
 * que esta versión no conoce), que no toca la foto publicada ni la versión, que mientras Nexus rehace el Resumen no se
 * puede (409) y que una firma vieja no pisa nada. Y que un PATCH cualquiera de la exploración no pierde la anterior.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { leerContenido } from "./esquemas";
import { firmaParaVolver } from "./resumen-anterior";
import type { ResumenGuardado } from "./resumen-de-la-escala";
import { volverAlResumenAnterior } from "./resumen-de-la-escala-server";
import { aplicarCambios } from "./servidor";

const general = parsearEscala(leerArchivoDeLaEscala("escala"));

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

async function sembrar() {
  const c = await prisma.client.create({ data: { name: "Prospecto del Resumen", kind: "PROSPECTO" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      contenido: {
        resumenDeLaEscala: B,
        resumenAnterior: { resumen: A, en: "2026-11-21T15:00:05.000Z", por: "luis@prueba.test", motivo: "rehacer" },
        // Una clave que esta versión no conoce: no se pierde al volver.
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

/** La firma como la calcula la pantalla: del contenido que le llegó por la red. */
const firmaDe = async (id: string) => firmaParaVolver(JSON.parse(JSON.stringify((await leer(id)).c)));

describe("volver a la versión anterior, en la base", () => {
  it("restaura el Resumen, deja el de ahora como anterior y no toca lo publicado, la versión ni lo desconocido", async () => {
    const s = await sembrar();
    const r = await volverAlResumenAnterior({ exploracionId: s.id, email: "elias@prueba.test", firma: await firmaDe(s.id) });
    expect(r).toEqual({ ok: true });
    const f = await leer(s.id);
    expect(f.c.resumenDeLaEscala?.hicimos.texto).toBe("Escrito a mano por Ana.");
    expect(f.c.resumenAnterior?.resumen.at).toBe(B.at);
    expect(f.c.resumenAnterior).toMatchObject({ por: "elias@prueba.test", motivo: "volver" });
    expect(f.crudo.deUnaVersionNueva).toEqual({ algo: 1 });
    expect(f.version).toBe(s.version);
    expect(f.accesoALaEscala?.publicada).toEqual(FOTO);
    expect(f.accesoALaEscala?.publicadaEn?.toISOString()).toBe(s.publicadaEn.toISOString());

    // Se deshace con el mismo botón.
    expect(await volverAlResumenAnterior({ exploracionId: s.id, email: "elias@prueba.test", firma: await firmaDe(s.id) })).toEqual({ ok: true });
    expect((await leer(s.id)).c.resumenDeLaEscala?.at).toBe(B.at);
  });

  it("mientras Nexus rehace el Resumen, 409 y no cambia nada", async () => {
    const s = await sembrar();
    await prisma.agentRun.create({
      data: { agentSlug: AGENTE_DE_LA_EXPLORACION, clientId: s.clientId, status: "RUNNING", filters: { exploracion: s.id, modo: "resumen-de-la-escala" } },
    });
    const antes = await leer(s.id);
    const r = await volverAlResumenAnterior({ exploracionId: s.id, email: null, firma: await firmaDe(s.id) });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await leer(s.id)).contenido).toEqual(antes.contenido);
  });

  it("con una firma vieja (otra persona lo cambió), 409 y no pisa nada", async () => {
    const s = await sembrar();
    const vista = await firmaDe(s.id);
    const otra = (await leer(s.id)).c;
    await prisma.exploracionDeVenta.update({
      where: { id: s.id },
      data: { contenido: JSON.parse(JSON.stringify({ ...otra, resumenDeLaEscala: { ...B, hicimos: { ...B.hicimos, texto: "Lo cambió otra persona." } } })) },
    });
    const r = await volverAlResumenAnterior({ exploracionId: s.id, email: null, firma: vista });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((await leer(s.id)).c.resumenDeLaEscala?.hicimos.texto).toBe("Lo cambió otra persona.");
  });

  it("un PATCH cualquiera de la exploración no pierde la anterior", async () => {
    const s = await sembrar();
    const r = await aplicarCambios(s.id, s.version, [{ op: "sinPortal", valor: true }], general);
    expect(r.estado).toBe("ok");
    expect((await leer(s.id)).c.resumenAnterior?.resumen.at).toBe(A.at);
  });
});
