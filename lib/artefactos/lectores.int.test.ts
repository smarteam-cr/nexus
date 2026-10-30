/**
 * lib/artefactos/lectores.int.test.ts — LOS LECTORES LEEN TODAS LAS COPIAS (artefactos, etapa V3) contra una base REAL:
 * con un solo documento el texto del agente queda igual que antes; con dos planificaciones lee las dos, rotuladas y la
 * terminada primero; una copia archivada no se lee; `canvasOf` sigue devolviendo la de siempre; y la posición en la escala
 * sale del diagnóstico terminado. Correr con la base local: `npx vitest run --project integration lib/artefactos/lectores.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const exploracionViva = vi.hoisted(() => ({ texto: "" }));
vi.mock("@/lib/exploraciones/del-proyecto", async (original) => ({
  ...(await original<typeof import("@/lib/exploraciones/del-proyecto")>()),
  textoDeLaExploracionDelProyecto: async () => exploracionViva.texto,
}));

import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { posicionDelDiagnostico } from "@/lib/escala/contexto";
import { desafioYObjetivosDelDiagnostico } from "@/lib/canvas/entrega-generate";
import { nivelesDeEscala } from "@/lib/carga/queries";
import { artefactosDelTipo } from "./lectores-server";
import { COMO_LEER_VARIAS_COPIAS } from "./copias";

async function proyecto() {
  const c = await prisma.client.create({ data: { name: "Cliente lectores (test)" } });
  return prisma.project.create({ data: { clientId: c.id, name: "Proyecto lectores (test)" } });
}

/** Un documento con UNA sección y un bloque CARD. */
async function documento(
  projectId: string,
  o: { slug?: string; tipoArtefacto?: string; name: string; order?: number; terminadoEn?: Date; disabledAt?: Date; key: string; label: string; data: object },
) {
  const canvas = await prisma.projectCanvas.create({
    data: {
      projectId,
      slug: o.slug ?? null,
      tipoArtefacto: o.tipoArtefacto ?? null,
      name: o.name,
      order: o.order ?? 0,
      terminadoEn: o.terminadoEn ?? null,
      disabledAt: o.disabledAt ?? null,
      sections: [{ key: o.key, label: o.label }],
    },
  });
  const s = await prisma.canvasSection.create({ data: { canvasId: canvas.id, key: o.key, label: o.label, order: 0 } });
  await prisma.canvasBlock.create({ data: { sectionId: s.id, blockType: "CARD", data: o.data, order: 0, source: "HUMAN", status: "CONFIRMED" } });
  return canvas.id;
}

describe("una copia en blanco y los lectores de un valor", () => {
  it("⛔ una copia recién creada (solo su cierre sembrado) no cambia lo que lee el agente", async () => {
    const p = await proyecto();
    await documento(p.id, { slug: "diagnosis", name: "Diagnóstico", key: "situacion_actual", label: "Situación actual", data: { intro: "Venden por WhatsApp." } });
    await documento(p.id, { tipoArtefacto: "diagnosis", name: "En blanco", key: "cierre", label: "Cierre", data: { headline: "Sigamos" } });
    expect(await loadCanvasContext(p.id, "diagnosis", { onlyConfirmed: false })).toBe("[Sección: Situación actual]\nintro: Venden por WhatsApp.");
  });

  it("la exploración viva sola queda tal cual; con copias, se suman rotuladas y las terminadas primero", async () => {
    const p = await proyecto();
    exploracionViva.texto = "LO DEL LIENZO";
    expect(await loadCanvasContext(p.id, "exploration", { onlyConfirmed: false })).toBe("LO DEL LIENZO");

    await documento(p.id, { tipoArtefacto: "exploration", name: "Borrador", order: 0, key: "ya_sabemos", label: "Lo que ya sabemos", data: { intro: "En construcción." } });
    await documento(p.id, { tipoArtefacto: "exploration", name: "Marketing", order: 1, terminadoEn: new Date(), key: "ya_sabemos", label: "Lo que ya sabemos", data: { intro: "Terminada." } });
    const texto = await loadCanvasContext(p.id, "exploration", { onlyConfirmed: false });
    exploracionViva.texto = "";
    expect(texto).toContain("LO DEL LIENZO");
    expect(texto.indexOf("LO DEL LIENZO")).toBeLessThan(texto.indexOf("Terminada."));
    expect(texto.indexOf("Terminada.")).toBeLessThan(texto.indexOf("En construcción."));
  });

  it("sin exploración viva, las copias se leen por el camino de siempre", async () => {
    const p = await proyecto();
    await documento(p.id, { tipoArtefacto: "exploration", name: "Explorar Marketing", terminadoEn: new Date(), key: "ya_sabemos", label: "Lo que ya sabemos", data: { intro: "Compran por feria." } });
    // Sin exploración viva ni guía: las copias, por el camino de siempre.
    expect(await loadCanvasContext(p.id, "exploration", { onlyConfirmed: false })).toContain("Compran por feria.");
  });

  it("el desafío que retoma la entrega: una copia terminada gana; una copia vacía no tapa al de siempre", async () => {
    const p = await proyecto();
    await documento(p.id, { slug: "diagnosis", name: "Diagnóstico", key: "desafio", label: "Desafío", data: { intro: "El de siempre", items: [{ title: "Uno", detail: "d" }] } });
    await documento(p.id, { tipoArtefacto: "diagnosis", name: "Vacía", order: -1, key: "objetivos", label: "Objetivos", data: {} });
    expect(JSON.stringify((await desafioYObjetivosDelDiagnostico(p.id)).desafio)).toContain("El de siempre");

    await documento(p.id, { tipoArtefacto: "diagnosis", name: "Terminada", order: 5, terminadoEn: new Date(), key: "desafio", label: "Desafío", data: { intro: "La terminada", items: [{ title: "Dos", detail: "d" }] } });
    expect(JSON.stringify((await desafioYObjetivosDelDiagnostico(p.id)).desafio)).toContain("La terminada");
  });

  it("una copia en construcción con un nivel más bajo no le baja la escala a la cuenta", async () => {
    const p = await proyecto();
    const nivel = (n: string) => ({ areas: [{ area: "Ventas", base: n, produccion: n }] });
    await documento(p.id, { slug: "diagnosis", name: "Diagnóstico", terminadoEn: new Date(), key: "escala", label: "Escala", data: nivel("Eficiente") });
    await documento(p.id, { tipoArtefacto: "diagnosis", name: "Borrador", key: "escala", label: "Escala", data: nivel("Deficiente") });
    const antes = await nivelesDeEscala([p.clientId]);
    await prisma.projectCanvas.deleteMany({ where: { projectId: p.id, tipoArtefacto: "diagnosis" } });
    expect(antes.size).toBe(1);
    expect(await nivelesDeEscala([p.clientId])).toEqual(antes);
  });
});

describe("los lectores y las copias", () => {
  it("con un solo diagnóstico, el texto del agente es el de siempre (sin rótulo ni aviso)", async () => {
    const p = await proyecto();
    await documento(p.id, { slug: "diagnosis", name: "Diagnóstico", key: "situacion_actual", label: "Situación actual", data: { intro: "Venden por WhatsApp." } });
    const texto = await loadCanvasContext(p.id, "diagnosis", { onlyConfirmed: false });
    expect(texto).toBe("[Sección: Situación actual]\nintro: Venden por WhatsApp.");
  });

  it("con dos planificaciones lee las dos, rotuladas, la terminada primero; la archivada no", async () => {
    const p = await proyecto();
    const deSiempre = await documento(p.id, { slug: "planning", name: "Planificación", order: 0, key: "pipelines", label: "Pipelines", data: { intro: "Pipeline de ventas." } });
    await documento(p.id, {
      tipoArtefacto: "planning",
      name: "Marketing",
      order: 1,
      terminadoEn: new Date("2026-10-28T12:00:00Z"),
      key: "pipelines",
      label: "Pipelines",
      data: { intro: "Pipeline de campañas." },
    });
    await documento(p.id, {
      tipoArtefacto: "planning",
      name: "WhatsApp",
      order: 2,
      disabledAt: new Date(),
      key: "pipelines",
      label: "Pipelines",
      data: { intro: "No debería leerse." },
    });

    const texto = await loadCanvasContext(p.id, "planning", { onlyConfirmed: false });
    expect(texto).toBe(
      `${COMO_LEER_VARIAS_COPIAS}\n\n` +
        "=== Planificación — Marketing (terminado) ===\n[Sección: Pipelines]\nintro: Pipeline de campañas.\n\n" +
        "=== Planificación (en construcción) ===\n[Sección: Pipelines]\nintro: Pipeline de ventas.",
    );
    expect(texto).not.toContain("No debería leerse");

    // Las 105 búsquedas por tipo siguen devolviendo la de siempre.
    const encontrada = await prisma.projectCanvas.findFirst({ where: { projectId: p.id, ...canvasOf("planning") }, select: { id: true } });
    expect(encontrada?.id).toBe(deSiempre);

    const lista = await artefactosDelTipo(p.id, "planning");
    expect(lista.map((d) => [d.nombre, d.estado, d.esCopia])).toEqual([
      ["Planificación", "en_construccion", false],
      ["Marketing", "terminado", true],
    ]);
  });

  it("la posición en la escala sale del diagnóstico terminado, y una copia vacía no tapa la de siempre", async () => {
    const p = await proyecto();
    const area = (base: string) => ({ areas: [{ area: "Ventas", base }] });
    await documento(p.id, { slug: "diagnosis", name: "Diagnóstico", order: 0, key: "escala", label: "Escala", data: area("Inicial") });
    expect((await posicionDelDiagnostico(p.id))?.areas[0].base).toBe("Inicial");

    // Una copia en construcción, sin posición: la de siempre sigue mandando.
    await documento(p.id, { tipoArtefacto: "diagnosis", name: "Marketing", order: 1, key: "escala", label: "Escala", data: {} });
    expect((await posicionDelDiagnostico(p.id))?.areas[0].base).toBe("Inicial");

    // Una copia terminada con posición: manda ella.
    await documento(p.id, {
      tipoArtefacto: "diagnosis",
      name: "De uso",
      order: 2,
      terminadoEn: new Date(),
      key: "escala",
      label: "Escala",
      data: area("Eficiente"),
    });
    expect((await posicionDelDiagnostico(p.id))?.areas[0].base).toBe("Eficiente");
  });
});
