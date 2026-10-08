/**
 * lib/escala/datos/versiones.int.test.ts — las reglas del borrador de la escala, contra una base REAL.
 *
 * Migrar la publicada → abrir el borrador → cambiarlo en bloque (con bitácora) → publicarlo
 * congelado. Y lo que no se puede: dos borradores, pisar un cambio ajeno, tocar una publicada.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generarMarkdown } from "./generar";
import { importarEscala } from "./importar";
import { MINI_EN_UNA_FORMA } from "./mini.fixture";
import {
  congelarBorrador,
  crearBorrador,
  descartarBorrador,
  ErrorDelBorrador,
  guardarEnElBorrador,
  guardarPublicada,
  leerBorrador,
  leerVersion,
  prepararImportacion,
  ultimaPublicada,
} from "./versiones";

const POR = "elias@test.local";

/** La 9.9.9 de juguete, publicada como datos. */
async function publicada() {
  await guardarPublicada(prisma, { datos: importarEscala(MINI_EN_UNA_FORMA), por: POR, en: new Date("2030-01-01") });
}

/** El `.md` del borrador con un reemplazo. */
function editado(md: string, de: string, a: string): string {
  if (!md.includes(de)) throw new Error(`el borrador no trae «${de}»`);
  return md.replace(de, a);
}

describe("el borrador de la escala", () => {
  it("se abre desde la última publicada, con la versión que va a ser", async () => {
    await publicada();
    const b = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    expect(b).toMatchObject({ version: "9.10.0", estado: "borrador", basadaEn: "9.9.9", revision: 0 });
    expect(generarMarkdown(b.datos)).toBe(MINI_EN_UNA_FORMA.replace("version: 9.9.9", "version: 9.10.0"));
    expect((await leerBorrador(prisma))?.version).toBe("9.10.0");
  });

  it("hay uno solo a la vez, y su versión tiene que ser posterior", async () => {
    await publicada();
    await expect(crearBorrador(prisma, { version: "9.9.8", por: POR })).rejects.toThrow("posterior");
    await crearBorrador(prisma, { version: "9.10.0", por: POR });
    await expect(crearBorrador(prisma, { version: "9.11.0", por: POR })).rejects.toThrow("Ya hay un borrador");
  });

  it("la base también lo impide: dos borradores no caben (índice único parcial)", async () => {
    await publicada();
    await crearBorrador(prisma, { version: "9.10.0", por: POR });
    const otro = { ...(await leerBorrador(prisma))! };
    await expect(
      prisma.escalaVersion.create({
        data: { version: "9.11.0", estado: "borrador", formato: 1, datos: otro.datos as unknown as Prisma.InputJsonValue, huella: "x" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("los cambios en bloque quedan en la bitácora, anclados", async () => {
    await publicada();
    const b = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    const md = editado(generarMarkdown(b.datos), "Hay un pipeline configurado.", "Hay un pipeline con sus etapas.");
    const { datos, cambios } = prepararImportacion(b, md);
    const r = await guardarEnElBorrador(prisma, { borrador: b, datos, cambios, origen: "importacion", por: POR, nota: "caso real" });
    expect(r.revision).toBe(1);
    const bitacora = await prisma.escalaCambio.findMany({ where: { versionId: b.id } });
    expect(bitacora).toMatchObject([{ ancla: "1.1.F1", tipoDeAncla: "criterio", accion: "cambiado", campo: "texto", origen: "importacion", nota: "caso real", autorEmail: POR, lote: r.lote }]);
    expect(generarMarkdown((await leerBorrador(prisma))!.datos)).toBe(md);
  });

  it("no pisa un cambio ajeno: si el borrador cambió desde que se leyó, frena", async () => {
    await publicada();
    const leido = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    const md = generarMarkdown(leido.datos);
    const primero = prepararImportacion(leido, editado(md, "Nada escrito.", "Nada escrito en ningún lado."));
    await guardarEnElBorrador(prisma, { borrador: leido, ...primero, origen: "importacion", por: POR });
    const segundo = prepararImportacion(leido, editado(md, "Etapas de palabra.", "Etapas dichas de palabra."));
    await expect(guardarEnElBorrador(prisma, { borrador: leido, ...segundo, origen: "importacion", por: POR })).rejects.toThrow(ErrorDelBorrador);
    expect(await prisma.escalaCambio.count()).toBe(1);
  });

  it("lo que entra tiene que decir la versión del borrador", async () => {
    await publicada();
    const b = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    expect(() => prepararImportacion(b, MINI_EN_UNA_FORMA)).toThrow("el borrador es la 9.10.0");
  });

  it("al publicarse se congela: ya no es borrador y nada lo cambia", async () => {
    await publicada();
    const b = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    await prisma.$transaction((tx) => congelarBorrador(tx, { borrador: b, por: POR, en: new Date("2030-02-01") }));
    expect(await leerBorrador(prisma)).toBeNull();
    expect((await ultimaPublicada(prisma))?.version).toBe("9.10.0");
    const md = editado(generarMarkdown(b.datos), "Nada escrito.", "Otra cosa.");
    const { datos, cambios } = prepararImportacion(b, md);
    await expect(guardarEnElBorrador(prisma, { borrador: b, datos, cambios, origen: "importacion", por: POR })).rejects.toThrow("ya se publicó");
    expect(await descartarBorrador(prisma)).toBeNull();
    expect(await leerVersion(prisma, "9.10.0")).toMatchObject({ estado: "publicada" });
  });

  it("descartar se lleva el borrador y su bitácora, nunca una publicada", async () => {
    await publicada();
    const b = await crearBorrador(prisma, { version: "9.10.0", por: POR });
    const md = editado(generarMarkdown(b.datos), "Nada escrito.", "Otra cosa.");
    await guardarEnElBorrador(prisma, { borrador: b, ...prepararImportacion(b, md), origen: "importacion", por: POR });
    expect(await descartarBorrador(prisma)).toBe("9.10.0");
    expect(await prisma.escalaCambio.count()).toBe(0);
    expect((await prisma.escalaVersion.findMany()).map((v) => `${v.version} ${v.estado}`)).toEqual(["9.9.9 publicada"]);
  });
});
