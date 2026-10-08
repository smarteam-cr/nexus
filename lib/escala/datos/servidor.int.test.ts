/**
 * lib/escala/datos/servidor.int.test.ts — el borrador desde la pantalla, de punta a punta, contra una
 * base REAL, con la escala publicada de verdad.
 *
 * Abrir el borrador → subirle un `.md` con un cambio (primero se ve, después se guarda con su nota) →
 * revisarlo con las pruebas de siempre (frena por las ediciones hasta que se marcan revisadas) →
 * publicarlo: su `.md` pasa a ser lo que leen las pantallas y el borrador queda congelado.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { huellaDe } from "@/lib/escala/documento/huella";
import { generarMarkdown } from "./generar";
import { importarEscala } from "./importar";
import { abrirBorrador, estadoDelBorrador, guardarLaImportacion, markdownDelBorrador, publicarElBorrador, revisarElBorrador, verLaImportacion } from "./servidor";
import { ErrorDelBorrador, guardarPublicada } from "./versiones";

const ELIAS = "elias@test.local";
const texto = leerArchivoDeLaEscala("escala").replace(/\r\n?/g, "\n");
const CRITERIO = "no la improvisación de cada vendedor. `[1.7.F1";

/** La 8.7.0 publicada, como hoy en producción: sus tres documentos y sus datos. */
async function publicada() {
  const en = new Date("2026-10-02T10:00:00Z");
  for (const [documento, archivo, t] of [
    ["escala", "escala_rendimiento_smarteam.md", texto],
    ["especificacion", "especificacion_calculo_escala.md", leerArchivoDeLaEscala("especificacion")],
    ["manual", "manual_operacion_escala.md", leerArchivoDeLaEscala("manual")],
  ] as const) {
    const version = /^version: (.+)$/m.exec(t)![1].trim();
    await prisma.escalaDocumento.create({ data: { documento, version, escalaVersion: "8.7.0", archivo, texto: t, huella: huellaDe(t), publicadaEn: en } });
  }
  await guardarPublicada(prisma, { datos: importarEscala(texto), por: null, en });
}

describe("el borrador de la escala, desde la pantalla", () => {
  it("se abre, se le sube un cambio, se revisa y se publica", async () => {
    await publicada();
    expect(await estadoDelBorrador()).toMatchObject({ estado: "ok", borrador: null, publicada: "8.7.0", sugerida: "8.8.0" });

    await abrirBorrador("8.8.0", ELIAS);
    const md = (await markdownDelBorrador())!;
    expect(md.version).toBe("8.8.0");
    const editado = md.texto.replace(CRITERIO, "no la improvisación de cada vendedor (en 14 días). `[1.7.F1");

    // Primero se ve qué cambia; no se guarda nada.
    const vista = await verLaImportacion(editado, 0);
    expect(vista.cambios).toEqual([
      {
        ancla: "1.7.F1",
        donde: "Criterio 1.7.F1",
        accion: "cambiado",
        campo: "texto",
        antes: expect.stringMatching(/cada vendedor\.$/),
        despues: expect.stringMatching(/cada vendedor \(en 14 días\)\.$/),
      },
    ]);
    expect(await prisma.escalaCambio.count()).toBe(0);

    // Se guarda con su nota y queda en la bitácora.
    expect(await guardarLaImportacion({ texto: editado, revision: 0, nota: "caso de Wherex", por: ELIAS })).toEqual({ cambios: 1 });
    const estado = await estadoDelBorrador();
    if (estado.estado !== "ok" || !estado.borrador) throw new Error("sin borrador");
    expect(estado.borrador).toMatchObject({ version: "8.8.0", basadaEn: "8.7.0", revision: 1, totalDeCambios: 1, actualizadaPorEmail: ELIAS });
    expect(estado.bitacora).toMatchObject([{ autorEmail: ELIAS, origen: "importacion", nota: "caso de Wherex", cambios: [{ ancla: "1.7.F1" }] }]);

    // Con la revisión vieja, frena: alguien ya lo cambió.
    await expect(guardarLaImportacion({ texto: editado, revision: 0, nota: null, por: ELIAS })).rejects.toThrow(ErrorDelBorrador);

    // Las pruebas pasan; lo único que frena es lo que las ediciones dicen con sus palabras.
    const sinMirar = await revisarElBorrador(false);
    expect(sinMirar.pruebas.filter((p) => !p.ok)).toEqual([]);
    expect(sinMirar.pruebas.map((p) => p.nombre)).toEqual(expect.arrayContaining(["2 · Nada se regala", "3 · Los ejemplos cuadran", "7 · Documentos alineados"]));
    expect(sinMirar.cambios).toMatchObject({ nuevos: [], retirados: [], cambiados: ["1.7.F1"] });
    expect(sinMirar.edicionesViejas.length).toBeGreaterThan(0);
    expect(sinMirar.bloqueos).toHaveLength(1);
    await expect(publicarElBorrador({ revision: 1, edicionesRevisadas: false, por: ELIAS })).rejects.toThrow("No se publica");

    const revisada = await revisarElBorrador(true);
    expect(revisada.bloqueos).toEqual([]);
    expect(await publicarElBorrador({ revision: 1, edicionesRevisadas: true, por: ELIAS })).toEqual({ version: "8.8.0" });

    // Lo que leen las pantallas es la 8.8.0, generada desde los datos; el borrador quedó congelado.
    const vigente = await leerEscalaVigente();
    expect(vigente.estado === "ok" && vigente.escala.version).toBe("8.8.0");
    const doc = await prisma.escalaDocumento.findFirstOrThrow({ where: { documento: "escala", version: "8.8.0" } });
    const congelada = await prisma.escalaVersion.findUniqueOrThrow({ where: { version: "8.8.0" } });
    expect(congelada).toMatchObject({ estado: "publicada", publicadaPorEmail: ELIAS, huella: doc.huella });
    expect(doc.texto).toBe(generarMarkdown(importarEscala(editado)));
    expect(await estadoDelBorrador()).toMatchObject({ estado: "ok", borrador: null, publicada: "8.8.0", sugerida: "8.9.0" });
  });

  it("una línea que no se entiende vuelve con su número, y nada se guarda", async () => {
    await publicada();
    await abrirBorrador("8.8.0", ELIAS);
    const md = (await markdownDelBorrador())!.texto;
    const roto = md.replace(CRITERIO, "no la improvisación de cada vendedor. `[1.7.F1 evaluado");
    await expect(verLaImportacion(roto, 0)).rejects.toThrow(/^Línea \d+: /);
    expect(await prisma.escalaCambio.count()).toBe(0);
  });
});
