/**
 * lib/operaciones/herramientas.test.ts — las herramientas REALES de Nexus salen bien de su zod (fase 0.4): cada una es
 * un objeto con un nombre que acepta la API, y ninguna repite nombre.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

describe("las herramientas de Nexus", () => {
  it("cada operación del registro da una herramienta válida", async () => {
    const { herramientasDeNexus, OPERACIONES } = await import("./registro-server");
    const hs = herramientasDeNexus();
    expect(hs).toHaveLength(OPERACIONES.length);
    expect(new Set(hs.map((h) => h.name)).size).toBe(hs.length);
    for (const h of hs) {
      expect(h.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(h.input_schema.type, h.name).toBe("object");
      expect(h.description.length, h.name).toBeGreaterThan(20);
    }
    const crear = hs.find((h) => h.name === "tarea_crear")!;
    expect((crear.input_schema as { required?: string[] }).required).toEqual(["titulo"]);
    // Cargar el registro trae los módulos de Tareas, notas y siguiente paso enteros: con la suite completa corriendo en
    // paralelo pasa los 5 s de vitest.
  }, 60_000);
});
