/**
 * lib/clients/escritura-en-hubspot.int.test.ts — la escritura en HubSpot y la copia de vuelta contra una base REAL, con un
 * HubSpot simulado (R2, revisión del 2026-10-25): una empresa fusionada no recibe nada; si HubSpot rechaza el envío
 * entero, lo que acepta queda escrito con su rastro y lo que no, con su error; y un valor de HubSpot que volvió al que
 * escribió Nexus después de que alguien lo cambió allá entra (no es un eco).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Pedido = { method: string; path: string; body?: { properties?: Record<string, string> } };
const pedidos: Pedido[] = [];
let responder: (p: Pedido) => { status: number; json?: unknown } = () => ({ status: 200, json: {} });
vi.mock("@/lib/hubspot/client", () => ({
  getSystemHubspotClient: async () => ({
    apiRequest: async (p: Pedido) => {
      pedidos.push(p);
      const r = responder(p);
      return { ok: r.status < 300, status: r.status, json: async () => r.json ?? {}, text: async () => JSON.stringify(r.json ?? {}) };
    },
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { proponerDato } from "./datos-de-la-empresa-server";
import { escribirEnHubspot } from "./escritura-en-hubspot-server";
import { copiarEmpresasDeHubspot } from "./copia-de-hubspot-server";

beforeEach(() => {
  pedidos.length = 0;
  vi.stubEnv("EMPRESA_HUBSPOT_ESCRITURA", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("la escritura en HubSpot", () => {
  it("una empresa fusionada en HubSpot (vuelve con otro id) no recibe ninguna escritura", async () => {
    const c = await prisma.client.create({ data: { name: "Fusionada (test)", hubspotCompanyId: "111" } });
    responder = (p) => (p.method === "GET" ? { status: 200, json: { id: "999", properties: {} } } : { status: 200 });
    const r = await proponerDato({ clientId: c.id, clave: "trafico", valor: "10k_50k", fuente: "persona", puedeDecidir: true });
    const estado = await escribirEnHubspot(c.id, r);
    expect(estado.estado).toBe("fallo");
    expect(pedidos.filter((p) => p.method === "PATCH")).toEqual([]);
  });

  it("si HubSpot rechaza el envío entero, prueba de a una: lo que acepta queda con su rastro y lo otro con su error", async () => {
    const c = await prisma.client.create({ data: { name: "Rechazo (test)", hubspotCompanyId: "222" } });
    responder = (p) => {
      if (p.method === "GET") return { status: 200, json: { id: "222", properties: { tam__potencial: "1000" } } };
      const props = Object.keys(p.body?.properties ?? {});
      return props.length === 1 && props[0] !== "nexus_tam_fuente" ? { status: 200 } : { status: 400, json: { message: "Property values were not valid" } };
    };
    const r = await proponerDato({ clientId: c.id, clave: "tamUsd", valor: 50000, fuente: "persona", puedeDecidir: true });
    const estado = await escribirEnHubspot(c.id, r);
    expect(estado.estado).toBe("fallo");
    const fila = await prisma.propuestaDeDato.findFirstOrThrow({ where: { clientId: c.id, campo: "tamUsd", estado: "aplicada" } });
    // El TAM sí entró (su fuente no): su fila guarda lo que había para volver atrás.
    expect(fila).toMatchObject({ hubspotPropiedad: "tam__potencial", hubspotAnterior: "1000", hubspotError: null });
    expect(fila.hubspotEscritaAt).toBeInstanceOf(Date);
  });
});

describe("la copia desde HubSpot", () => {
  it("lo que Nexus acaba de escribir no vuelve; si alguien lo cambió allá y lo regresó a ese valor, sí entra", async () => {
    const c = await prisma.client.create({ data: { name: "Eco (test)", hubspotCompanyId: "333" } });
    let empleados = "";
    responder = (p) => {
      if (p.method === "GET") return { status: 200, json: { id: "333", properties: { numberofemployees: empleados } } };
      if (p.path.endsWith("/batch/read")) return { status: 200, json: { results: [{ id: "333", properties: { numberofemployees: empleados, hs_lastmodifieddate: new Date().toISOString() } }] } };
      if (p.method === "PATCH") empleados = p.body?.properties?.numberofemployees ?? empleados;
      return { status: 200 };
    };
    // La investigación llena los empleados (HubSpot estaba vacío): Nexus escribe 100 allá.
    const r = await proponerDato({ clientId: c.id, clave: "empleados", valor: 100, fuente: "investigacion" });
    await escribirEnHubspot(c.id, r);
    expect(empleados).toBe("100");
    const deNexus = async () => (await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { empleados: true } })).empleados;
    // La copia lee 100: es el eco, no pasa nada.
    const eco = await copiarEmpresasDeHubspot({ apply: true, soloClientId: c.id });
    expect(eco.aplicados + eco.propuestas).toBe(0);

    // Ventas lo cambia allá a 200: manda HubSpot, se aplica.
    empleados = "200";
    await copiarEmpresasDeHubspot({ apply: true, soloClientId: c.id });
    expect(await deNexus()).toBe(200);
    // Y lo vuelve a 100, el valor que había escrito Nexus: no es un eco, entra.
    empleados = "100";
    await copiarEmpresasDeHubspot({ apply: true, soloClientId: c.id });
    expect(await deNexus()).toBe(100);
  });

  it("una empresa que no vuelve de HubSpot queda anotada en el registro", async () => {
    const c = await prisma.client.create({ data: { name: "Perdida (test)", hubspotCompanyId: "444" } });
    responder = () => ({ status: 200, json: { results: [] } });
    const r = await copiarEmpresasDeHubspot({ apply: false, soloClientId: c.id });
    expect(r.errores[0]).toContain("no volvió de HubSpot");
  });
});
