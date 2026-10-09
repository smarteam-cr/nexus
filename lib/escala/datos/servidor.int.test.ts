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
import {
  abrirBorrador,
  editarElBorrador,
  escalaDelBorrador,
  estadoDelBorrador,
  guardarLaImportacion,
  markdownDelBorrador,
  publicarElBorrador,
  reportesDelAncla,
  revisarElBorrador,
  verLaImportacion,
} from "./servidor";
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

  it("el editor cambia un criterio vinculado a su reporte de feedback, y agrega otro sin reusar un retirado", async () => {
    await publicada();
    await abrirBorrador("8.8.0", ELIAS);
    const reporte = await prisma.feedbackReporte.create({
      data: { autorEmail: "ana@test.local", tipo: "mejora", cuerpo: "«A tiempo» no dice cuánto.", pantalla: "Escala", ruta: "/escala/ventas", escalaAncla: "1.7.F1", escalaArea: "1" },
    });
    expect((await reportesDelAncla("1.7.F1")).map((r) => r.numero)).toEqual([reporte.numero]);
    expect(await reportesDelAncla("1.7.F2")).toEqual([]);

    const vista = (await escalaDelBorrador())!;
    const f1 = vista.escala.areas[0].dimensiones.find((d) => d.id === "1.7")!.niveles.find((n) => n.letra === "F")!.criterios.find((c) => c.id === "1.7.F1")!;
    const campos = { verificacion: f1.verificacion, riesgo: f1.riesgo, habito: f1.habito, perfil: f1.perfil, requiere: f1.requiere ?? [] };
    const r = await editarElBorrador({
      revision: 0,
      cambio: { tipo: "criterio", id: "1.7.F1", texto: `${f1.texto.slice(0, -1)} (en 14 días).`, ...campos },
      nota: "Plazo concreto",
      feedbackId: reporte.id,
      por: ELIAS,
    });
    expect(r).toEqual({ revision: 1, cambios: 1, id: "1.7.F1" });
    expect(await prisma.escalaCambio.findMany({ select: { ancla: true, origen: true, feedbackId: true, nota: true } })).toEqual([
      { ancla: "1.7.F1", origen: "editor", feedbackId: reporte.id, nota: "Plazo concreto" },
    ]);
    // La pantalla del editor lee el borrador nuevo (por su huella).
    const despues = (await escalaDelBorrador())!;
    expect(despues.revision).toBe(1);
    expect(despues.escala.areas[0].dimensiones.find((d) => d.id === "1.7")!.niveles.find((n) => n.letra === "F")!.criterios[0].texto).toMatch(/\(en 14 días\)\.$/);

    // Un criterio nuevo en 1.2.F: el 1.2.F1 está retirado en la especificación, así que no lo toma.
    const nuevo = await editarElBorrador({
      revision: 1,
      cambio: { tipo: "nuevo-criterio", nivel: "1.2.F", texto: "Cada negocio tiene su siguiente paso con fecha.", verificacion: "comprobable", riesgo: false, habito: false, perfil: null, requiere: [] },
      nota: null,
      feedbackId: null,
      por: ELIAS,
    });
    expect(nuevo.id).not.toBe("1.2.F1");
    expect(nuevo.id).toMatch(/^1\.2\.F\d+$/);

    // Cada guardado es una tanda de la bitácora; con la revisión vieja, frena.
    const estado = await estadoDelBorrador();
    expect(estado.estado === "ok" && estado.bitacora.map((t) => [t.origen, t.cambios.map((c) => c.ancla)])).toEqual([
      ["editor", [nuevo.id]],
      ["editor", ["1.7.F1"]],
    ]);
    await expect(editarElBorrador({ revision: 1, cambio: { tipo: "nivel", id: "1.7.F", frase: "Otra.", resultado: null }, nota: null, feedbackId: null, por: ELIAS })).rejects.toThrow(
      ErrorDelBorrador,
    );
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
