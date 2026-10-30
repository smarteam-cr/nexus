import { describe, expect, it, vi } from "vitest";

/**
 * «CSE Encargado» está de salida (2026-10-30, lib/hubspot/encargados.ts): el día que HubSpot la borre, los tres lugares
 * que la escriben tienen que seguir. Se prueba con el recorrido real de cada uno; la respuesta de HubSpot la escribimos
 * nosotros: nadie vio el rechazo real, porque no se escribió nada allá.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { escribirEncargadosEnLaEmpresa } from "./encargados-de-la-cuenta";
import { actualizarEncargadosDelProyecto } from "./project-record";

type Cliente = Parameters<typeof actualizarEncargadosDelProyecto>[0];
type Pedido = { method: string; path: string; body?: { properties?: Record<string, string>; inputs?: { id: string; properties: Record<string, string> }[] } };

const rechazo = () =>
  new Response(JSON.stringify({ category: "VALIDATION_ERROR", message: 'Property values were not valid: [{"error":"PROPERTY_DOESNT_EXIST","name":"cse_encargado"}]' }), { status: 400 });

/** Un HubSpot donde `cse_encargado` ya no existe en ningún objeto. */
function hubspotSinLaPropiedad() {
  const pedidos: Pedido[] = [];
  const apiRequest = async (p: Pedido) => {
    pedidos.push(p);
    if (p.path.includes("/associations/contacts")) return Response.json({ results: [{ toObjectId: 1 }, { toObjectId: 2 }] });
    const escrito = p.body?.properties ?? p.body?.inputs?.[0]?.properties;
    return escrito && "cse_encargado" in escrito ? rechazo() : Response.json({});
  };
  return { hs: { apiRequest } as unknown as Cliente, pedidos };
}

const propiedadesFinales = (pedidos: Pedido[], fin: string) => {
  const p = pedidos.filter((x) => x.path.endsWith(fin)).at(-1);
  return p?.body?.properties ?? p?.body?.inputs?.[0]?.properties;
};

describe("con «CSE Encargado» borrada de HubSpot", () => {
  it("el pase del proyecto no se cae y deja al propietario y a la CSL", async () => {
    const { hs, pedidos } = hubspotSinLaPropiedad();
    await actualizarEncargadosDelProyecto(hs, "123", { cse: "1", csl: "2" });
    expect(propiedadesFinales(pedidos, "/123")).toEqual({ hubspot_owner_id: "1", csl_encargado: "2" });
  });

  it("la empresa y los contactos también entran, sin error", async () => {
    const { hs, pedidos } = hubspotSinLaPropiedad();
    const r = await escribirEncargadosEnLaEmpresa(hs as never, "55", { cse: "1", csl: "2" });
    expect(r).toEqual({ empresa: true, contactos: 2, contactosFallidos: 0, error: null });
    expect(propiedadesFinales(pedidos, "/companies/55")).toEqual({ csl_encargado: "2" });
    expect(propiedadesFinales(pedidos, "/batch/update")).toEqual({ csl_encargado: "2" });
  });
});

describe("el pase del proyecto", () => {
  it("⛔ otro rechazo de HubSpot sigue frenando el pase", async () => {
    const hs = { apiRequest: async () => new Response('{"message":"owner no válido"}', { status: 400 }) } as unknown as Cliente;
    await expect(actualizarEncargadosDelProyecto(hs, "123", { cse: "1", csl: "2" })).rejects.toThrow(/400/);
  });

  it("en un pipeline sin declarar no escribe el propietario", async () => {
    const pedidos: Pedido[] = [];
    const hs = {
      apiRequest: async (p: Pedido) => {
        pedidos.push(p);
        return Response.json({});
      },
    } as unknown as Cliente;
    await actualizarEncargadosDelProyecto(hs, "123", { cse: "1", csl: "2" }, { propietario: false });
    expect(pedidos[0].body?.properties).toEqual({ cse_encargado: "1", csl_encargado: "2" });
  });
});
