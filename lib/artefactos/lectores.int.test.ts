/**
 * lib/artefactos/lectores.int.test.ts — LOS LECTORES LEEN TODAS LAS COPIAS (artefactos, etapa V3) contra una base REAL:
 * con un solo documento el texto del agente queda igual que antes; con dos planificaciones lee las dos, rotuladas y la
 * terminada primero; una copia archivada no se lee; `canvasOf` sigue devolviendo la de siempre; y la posición en la escala
 * sale del diagnóstico terminado. Correr con la base local: `npx vitest run --project integration lib/artefactos/lectores.int.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { posicionDelDiagnostico } from "@/lib/escala/contexto";
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
