/**
 * lib/hubspot/contacto-por-correo.test.ts — buscar un contacto por correo nunca lanza: sin contacto,
 * sin permiso o con HubSpot caído devuelve null. HubSpot es falso: `apiRequest` contesta lo que diga cada test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hubspot = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const refrescar = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./client", () => ({
  getSystemHubspotClient: async () => hubspot,
  forceRefreshSystemToken: refrescar,
}));

import { buscarContactoPorCorreo, correoBuscable, leerContactoEncontrado } from "./contacto-por-correo";

const respuesta = (status: number, body: unknown = {}) => ({ status, json: async () => body });

beforeEach(() => {
  hubspot.apiRequest.mockReset();
  refrescar.mockClear();
});

describe("correoBuscable", () => {
  it("normaliza y descarta lo que no es un correo", () => {
    expect(correoBuscable(" Ana@X.com ")).toBe("ana@x.com");
    expect(correoBuscable("ana")).toBeNull();
    expect(correoBuscable(null)).toBeNull();
  });
});

describe("leerContactoEncontrado", () => {
  it("arma el nombre y el cargo, y prefiere el correo exacto", () => {
    const json = {
      results: [
        { id: "1", properties: { email: "otra@x.com", firstname: "Otra", jobtitle: "Nada" } },
        { id: "2", properties: { email: "ANA@x.com", firstname: " Ana ", lastname: "Pérez", jobtitle: " Gerente " } },
      ],
    };
    expect(leerContactoEncontrado(json, "ana@x.com")).toEqual({ id: "2", nombre: "Ana Pérez", cargo: "Gerente" });
  });
  it("sin nombre ni cargo los deja en null; sin resultados, null", () => {
    expect(leerContactoEncontrado({ results: [{ id: "3", properties: { email: "a@x.com" } }] }, "a@x.com")).toEqual({
      id: "3",
      nombre: null,
      cargo: null,
    });
    expect(leerContactoEncontrado({ results: [] }, "a@x.com")).toBeNull();
    expect(leerContactoEncontrado(null, "a@x.com")).toBeNull();
  });
});

describe("buscarContactoPorCorreo", () => {
  const callarConsola = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("busca por correo y devuelve el contacto", async () => {
    hubspot.apiRequest.mockResolvedValue(
      respuesta(200, { results: [{ id: "9", properties: { email: "ana@x.com", firstname: "Ana", jobtitle: "CFO" } }] }),
    );
    expect(await buscarContactoPorCorreo("Ana@x.com")).toEqual({
      estado: "encontrado",
      contacto: { id: "9", nombre: "Ana", cargo: "CFO" },
    });
    const pedido = hubspot.apiRequest.mock.calls[0][0];
    expect(pedido.path).toBe("/crm/v3/objects/contacts/search");
    expect(pedido.body.filterGroups[0].filters[0]).toEqual({ propertyName: "email", operator: "EQ", value: "ana@x.com" });
  });

  it("un 200 sin ese contacto: no-existe", async () => {
    hubspot.apiRequest.mockResolvedValue(respuesta(200, { results: [] }));
    expect(await buscarContactoPorCorreo("a@x.com")).toEqual({ estado: "no-existe", contacto: null });
  });

  it("un correo inválido no le pregunta nada a HubSpot y lo dice", async () => {
    expect(await buscarContactoPorCorreo("no-es-correo")).toEqual({ estado: "correo-invalido", contacto: null });
    expect(await buscarContactoPorCorreo("ana@empresa")).toEqual({ estado: "correo-invalido", contacto: null });
    expect(hubspot.apiRequest).not.toHaveBeenCalled();
  });

  it("401: renueva el token y reintenta una vez", async () => {
    hubspot.apiRequest
      .mockResolvedValueOnce(respuesta(401))
      .mockResolvedValueOnce(respuesta(200, { results: [{ id: "9", properties: { email: "a@x.com", jobtitle: "CFO" } }] }));
    expect(await buscarContactoPorCorreo("a@x.com")).toEqual({
      estado: "encontrado",
      contacto: { id: "9", nombre: null, cargo: "CFO" },
    });
    expect(refrescar).toHaveBeenCalledTimes(1);
  });

  it("403, 500 o la red: no-se-pudo, sin lanzar (nunca «no-existe»)", async () => {
    const consola = callarConsola();
    hubspot.apiRequest.mockResolvedValueOnce(respuesta(403));
    expect(await buscarContactoPorCorreo("a@x.com")).toEqual({ estado: "no-se-pudo", contacto: null });
    hubspot.apiRequest.mockResolvedValueOnce(respuesta(500));
    expect(await buscarContactoPorCorreo("a@x.com")).toEqual({ estado: "no-se-pudo", contacto: null });
    hubspot.apiRequest.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await buscarContactoPorCorreo("a@x.com")).toEqual({ estado: "no-se-pudo", contacto: null });
    consola.mockRestore();
  });

  it("vence el tope: no-se-pudo, y lo que falle después queda en el log, no suelto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const consola = callarConsola();
    const sueltos: unknown[] = [];
    const alSoltar = (e: unknown) => sueltos.push(e);
    process.on("unhandledRejection", alSoltar);
    try {
      let fallar: (e: Error) => void = () => {};
      hubspot.apiRequest.mockReturnValueOnce(new Promise((_, reject) => (fallar = reject)));
      const r = buscarContactoPorCorreo("a@x.com");
      await vi.advanceTimersByTimeAsync(4000);
      expect(await r).toEqual({ estado: "no-se-pudo", contacto: null });
      fallar(new Error("ECONNRESET tarde"));
      await vi.advanceTimersByTimeAsync(0);
      await new Promise((resolve) => setImmediate(resolve));
      expect(sueltos).toEqual([]);
      expect(consola).toHaveBeenCalledWith("[hubspot/contacto-por-correo]", "ECONNRESET tarde");
    } finally {
      process.off("unhandledRejection", alSoltar);
      consola.mockRestore();
      vi.useRealTimers();
    }
  });
});
