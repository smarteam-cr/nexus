/**
 * lib/clients/empresa-de-hubspot-aviso.test.ts — el 409 de «empresa repetida» no le dice a nadie el nombre de una ficha a
 * la que no tiene acceso (R7b, revisión de la juntura del 2026-10-24). Si alguien simplifica el mensaje y vuelve a poner
 * el nombre siempre, esto se pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
/* El acceso, simulado: `tieneAcceso` decide si la persona puede abrir la otra ficha. */
const estado = vi.hoisted(() => ({ tieneAcceso: true, pedidos: [] as string[] }));
vi.mock("@/lib/auth/access", () => ({
  requireAccessToClient: async (id: string) => {
    estado.pedidos.push(id);
    if (!estado.tieneAcceso) throw new Error("403");
    return {};
  },
}));

const { cuerpoDeEmpresaRepetida, AVISO_SIN_ACCESO } = await import("./empresa-de-hubspot-aviso");

const FICHA = { id: "c-areya", name: "Areyá", kind: "CLIENTE" };

describe("cuerpoDeEmpresaRepetida", () => {
  beforeEach(() => {
    estado.pedidos = [];
  });

  it("a quien tiene acceso a la otra ficha le dice cuál es, para llevarlo a ella", async () => {
    estado.tieneAcceso = true;
    const c = await cuerpoDeEmpresaRepetida(FICHA);
    expect(c).toMatchObject({ clientIdExistente: "c-areya", nombreExistente: "Areyá" });
    expect(c.error).toContain("Areyá");
    expect(estado.pedidos).toEqual(["c-areya"]);
  });

  it("⛔ a quien NO tiene acceso no le dice ni el nombre ni el id", async () => {
    estado.tieneAcceso = false;
    const c = await cuerpoDeEmpresaRepetida(FICHA);
    expect(c).toEqual({ error: AVISO_SIN_ACCESO });
    expect(JSON.stringify(c)).not.toContain("Areyá");
    expect(JSON.stringify(c)).not.toContain("c-areya");
  });
});
