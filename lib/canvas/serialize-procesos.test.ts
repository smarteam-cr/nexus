/**
 * Tests del serializador de procesos para agentes y del fallback CARD del contexto.
 *
 * Los dos existen por el mismo agujero: los canvas TIPADOS y los flowcharts eran
 * invisibles para cualquier agente que los leyera — sin error, solo silencio. El
 * Diagnóstico lee los procesos y la Planificación lee el Diagnóstico: si esto se
 * rompe, generan documentos "correctos" con la mitad del contexto.
 */
import { describe, expect, it, vi } from "vitest";

// El serializador consulta Prisma vía readClientProcesos: se mockea la lectura para
// testear la SERIALIZACIÓN, que es lo que este archivo cubre.
const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findFirst: vi.fn().mockResolvedValue({ id: "strategy-1" }) },
    canvasBlock: { findMany: findManyMock },
  },
}));

import { serializeProcesosForPrompt } from "./read-procesos";

const flowchart = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  content: "Proceso de ventas",
  status: "CONFIRMED",
  data: {
    nodes: [
      { id: "n1", type: "pipeline_stage", data: { label: "Prospección" } },
      { id: "n2", type: "action", data: { label: "Llamada inicial", sublabel: "Vendedor · Teléfono" } },
      { id: "n3", type: "pain", data: { label: "Nadie registra la llamada", sublabel: "se pierde el historial" } },
      { id: "n4", type: "info", data: { label: "Fuente", detail: "Sesión con gerencia · Funciona: el cierre · No funciona: el seguimiento" } },
    ],
    edges: [
      { source: "n1", target: "n2" },
      { source: "n2", target: "n3" },
    ],
    ...over,
  },
});

describe("serializeProcesosForPrompt", () => {
  it("los dolores y las notas salen PRIMERO y marcados — son el insumo del diagnóstico", async () => {
    findManyMock.mockResolvedValueOnce([flowchart()]);
    const out = await serializeProcesosForPrompt("client-1");
    expect(out).toContain("### Proceso: Proceso de ventas");
    expect(out).toContain("⚠ DOLOR: Nadie registra la llamada — se pierde el historial");
    expect(out).toContain("NOTA: Fuente — Sesión con gerencia");
    // El dolor aparece antes que el recorrido del flujo.
    expect(out.indexOf("⚠ DOLOR")).toBeLessThan(out.indexOf("Flujo:"));
  });

  it("el flujo se narra como recorrido, no como geometría", async () => {
    findManyMock.mockResolvedValueOnce([flowchart()]);
    const out = await serializeProcesosForPrompt("client-1");
    expect(out).toContain("Prospección → Llamada inicial");
  });

  it("sin procesos devuelve vacío — y vacío es correcto, no un placeholder", async () => {
    findManyMock.mockResolvedValueOnce([]);
    expect(await serializeProcesosForPrompt("client-1")).toBe("");
  });

  it("tolera nodos con el shape viejo (label al tope, sin data)", async () => {
    findManyMock.mockResolvedValueOnce([
      flowchart({
        nodes: [
          { id: "n1", type: "pain", label: "Dolor plano" },
          { id: "n2", type: "action", label: "Paso" },
        ],
        edges: [{ source: "n2", target: "n1" }],
      }),
    ]);
    const out = await serializeProcesosForPrompt("client-1");
    expect(out).toContain("⚠ DOLOR: Dolor plano");
    expect(out).toContain("Paso → Dolor plano");
  });
});
