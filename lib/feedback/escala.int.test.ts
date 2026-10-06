/**
 * lib/feedback/escala.int.test.ts — el feedback que se manda desde la escala, de punta a punta, contra una
 * base REAL (2026-10-05: la escala ya no tiene comentarios propios).
 *
 * Mandar feedback sobre un criterio → el reporte queda anclado ahí, con el texto que se leía (lo congela el
 * servidor desde la versión publicada) → cuenta en su celda para quien revisa → llega a la bandeja con su
 * ancla y es privado como cualquier reporte → llevarlo a la hoja de ruta exige la fila del manual y con ella
 * sale en los cambios de la escala. Un reporte de pantalla nunca se mezcla.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { resolverAncla } from "@/lib/escala/documento/anclas";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { leerEscalaDelReporte } from "./escala";
import { cambiosDeLaEscala, contarPorAncla, contarPorArea } from "./escala-server";
import { crearReporte, decidir } from "./mutations";
import { datosDeBandeja, misReportes, reporteParaVer } from "./queries";

const texto = leerArchivoDeLaEscala("escala");
const escala = parsearEscala(texto);
const marketing = escala.areas.find((a) => a.id === "2")!;
const AUTORA = { email: "ana@test.local", nombre: "Ana Pérez", rol: "CSE" };
const REVISOR = "elias@test.local";
const CUERPO = "En esta tienda los segmentos salen de la plataforma de anuncios, no de un documento.";

/** La escala publicada en Nexus (cada prueba arranca con la base vacía). */
async function publicar() {
  await prisma.escalaDocumento.create({
    data: {
      documento: "escala",
      version: escala.version,
      escalaVersion: escala.version,
      archivo: "escala_rendimiento_smarteam.md",
      texto,
      huella: createHash("sha256").update(texto).digest("hex"),
    },
  });
}

function mandar(escalaPedida: { ancla: string; edicion?: string | null; perfilCierre?: string | null; perfilDespues?: string | null }, cuerpo = CUERPO) {
  return crearReporte(
    { tipo: "mejora", cuerpo, meFrena: false, pantalla: "Escala de Rendimiento", ruta: `/escala/${marketing.slug}?c=${escalaPedida.ancla}`, escala: escalaPedida },
    AUTORA,
  );
}

describe("el feedback sobre un criterio de la escala", () => {
  it("queda anclado con lo que se leía, cuenta para quien revisa y llega a la bandeja", async () => {
    await publicar();
    const r = await mandar({ ancla: "2.6.F1", edicion: null, perfilCierre: "transaccional", perfilDespues: null });

    const fila = await prisma.feedbackReporte.findUniqueOrThrow({ where: { id: r.id } });
    expect(fila.escalaAncla).toBe("2.6.F1");
    expect(fila.escalaArea).toBe("2");
    expect(fila.pantalla).toBe(`Escala · ${marketing.nombre}`);
    expect(fila.ruta).toBe(`/escala/${marketing.slug}?vista=matriz&c=2.6.F1`);
    const e = leerEscalaDelReporte(fila.escala);
    expect(e?.textoAnclado).toBe(resolverAncla(escala, "2.6.F1")!.texto);
    expect(e?.version).toBe(escala.version);
    expect(e?.perfil).toEqual({ cierre: "transaccional", despues: null });

    expect(await contarPorAncla("2")).toEqual({ "2.6.F1": { total: 1, abiertos: 1 } });
    expect(await contarPorArea()).toEqual({ "2": { total: 1, abiertos: 1 } });

    const bandeja = await datosDeBandeja();
    const enLaBandeja = bandeja.reportes.find((x) => x.id === r.id)!;
    expect(enLaBandeja.tipo).toBe("mejora");
    expect(enLaBandeja.escala).toEqual({ ancla: "2.6.F1" });
    expect(bandeja.sinRevisar).toBe(1);

    const detalle = await reporteParaVer(r.id, { email: REVISOR, esRevisor: true });
    expect(detalle?.escala?.ancla).toBe("2.6.F1");
    expect(detalle?.escala?.textoDeHoy).toBe(detalle?.escala?.textoAnclado);
    expect(detalle?.escala?.sugerida.que).toBe(`\`2.6.F1\` — ${CUERPO}`);
  });

  it("es privado como todo el feedback: lo ven quien lo mandó y quien revisa", async () => {
    await publicar();
    const r = await mandar({ ancla: "2.6.F1" });
    expect((await misReportes(AUTORA.email)).map((x) => x.id)).toEqual([r.id]);
    expect(await reporteParaVer(r.id, { email: AUTORA.email, esRevisor: false })).not.toBeNull();
    expect(await reporteParaVer(r.id, { email: "marco@test.local", esRevisor: false })).toBeNull();
  });

  it("con una edición, el texto que se congela es el de esa edición", async () => {
    await publicar();
    const ed = escala.ediciones[0];
    const conLaEdicion = aplicarEdicion(escala, ed.slug);
    const criterio = conLaEdicion.areas[0].dimensiones[0].niveles.find((n) => n.letra === "F")!.criterios[0];
    const r = await mandar({ ancla: criterio.id, edicion: ed.slug });
    const e = leerEscalaDelReporte((await prisma.feedbackReporte.findUniqueOrThrow({ where: { id: r.id } })).escala);
    expect(e?.edicion).toBe(ed.slug);
    expect(e?.textoAnclado).toBe(criterio.texto);
  });

  it("lo que no existe no entra: un ancla, una edición, o la escala sin publicar", async () => {
    await expect(mandar({ ancla: "2.6.F1" })).rejects.toThrow(/no está publicada/);
    await publicar();
    await expect(mandar({ ancla: "2.6.F99" })).rejects.toThrow(/no existe en la versión/);
    await expect(mandar({ ancla: "2.6.F1", edicion: "no-existe" })).rejects.toThrow(/no tiene la edición/);
    expect(await prisma.feedbackReporte.count()).toBe(0);
  });

  it("llevarlo a la hoja de ruta exige la fila del manual; con ella, sale en los cambios de la escala", async () => {
    await publicar();
    const r = await mandar({ ancla: "2.6.F1" });
    const tema = { titulo: "Segmentos desde la plataforma de anuncios", columna: "planeado" as const };
    await expect(decidir(r.id, { accion: "llevar", nuevo: tema, avisar: true }, REVISOR)).rejects.toThrow(/fila del manual/);

    const cambio = { que: "`2.6.F1` — aceptar segmentos definidos en la plataforma de anuncios", caso: "Tienda X", decision: "El nivel de Segmentación." };
    await decidir(r.id, { accion: "llevar", nuevo: tema, avisar: true, cambio }, REVISOR);
    expect(await contarPorAncla("2")).toEqual({ "2.6.F1": { total: 1, abiertos: 0 } });
    const cambios = await cambiosDeLaEscala();
    expect(cambios.map((c) => c.cambio)).toEqual([cambio]);
    expect(cambios[0].autor).toBe(AUTORA.email);
  });

  it("un reporte de pantalla nunca se mezcla con los de la escala", async () => {
    await publicar();
    const r = await crearReporte({ tipo: "mejora", cuerpo: "Ver la próxima reunión en la lista", meFrena: false, pantalla: "Clientes", ruta: "/clients" }, AUTORA);
    expect(await contarPorArea()).toEqual({});
    expect((await datosDeBandeja()).reportes.find((x) => x.id === r.id)?.escala).toBeNull();
    await decidir(r.id, { accion: "llevar", nuevo: { titulo: "Próxima reunión", columna: "decidir" }, avisar: false }, REVISOR);
    expect(await cambiosDeLaEscala()).toEqual([]);
  });
});
