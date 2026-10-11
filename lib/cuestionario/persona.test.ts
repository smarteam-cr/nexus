/**
 * lib/cuestionario/persona.test.ts — el cargo de una persona del cliente lo pone el equipo: lo escrito
 * manda y HubSpot completa lo que falta (2026-10-11).
 */
import { describe, expect, it } from "vitest";
import { armarPersona, errorSinNombre, hayQueBuscarEnHubspot, type BusquedaEnHubspot } from "./persona";

const encontrado = (nombre: string | null, cargo: string | null): BusquedaEnHubspot => ({
  estado: "encontrado",
  contacto: { nombre, cargo },
});
const sinContacto = (estado: "no-existe" | "no-se-pudo" | "correo-invalido"): BusquedaEnHubspot => ({ estado, contacto: null });

describe("hayQueBuscarEnHubspot", () => {
  it("sin correo no se busca", () => {
    expect(hayQueBuscarEnHubspot({ nombre: "Ana" })).toBe(false);
    expect(hayQueBuscarEnHubspot({ nombre: "Ana", email: "   " })).toBe(false);
  });
  it("con nombre y cargo escritos no hace falta", () => {
    expect(hayQueBuscarEnHubspot({ nombre: "Ana", cargo: "Gerente", email: "ana@x.com" })).toBe(false);
  });
  it("con correo y algo por completar, se busca", () => {
    expect(hayQueBuscarEnHubspot({ nombre: "Ana", email: "ana@x.com" })).toBe(true);
    expect(hayQueBuscarEnHubspot({ cargo: "Gerente", email: "ana@x.com" })).toBe(true);
  });
});

describe("armarPersona", () => {
  it("el cargo escrito gana sobre el de HubSpot", () => {
    const p = armarPersona({ nombre: "Ana", cargo: "Directora", email: "ana@x.com" }, encontrado("Ana P", "Gerente"));
    expect(p).toEqual({ nombre: "Ana", cargo: "Directora", email: "ana@x.com", aviso: null });
  });

  it("sin cargo escrito, toma el de HubSpot; sin nombre escrito, también el nombre", () => {
    const p = armarPersona({ email: "ana@x.com" }, encontrado("Ana Pérez", "Gerente de Ventas"));
    expect(p).toEqual({ nombre: "Ana Pérez", cargo: "Gerente de Ventas", email: "ana@x.com", aviso: null });
  });

  it("HubSpot encontró el contacto sin cargo: se agrega sin cargo y lo dice", () => {
    const p = armarPersona({ nombre: "Ana", email: "ana@x.com" }, encontrado("Ana", null));
    expect(p?.cargo).toBeNull();
    expect(p?.aviso).toMatch(/HubSpot no tiene el cargo de Ana/);
  });

  it("HubSpot contestó que no lo tiene: dice que no lo encontró", () => {
    const p = armarPersona({ nombre: "Ana", email: "ana@x.com" }, sinContacto("no-existe"));
    expect(p?.cargo).toBeNull();
    expect(p?.aviso).toMatch(/No encontramos a Ana en HubSpot/);
  });

  it("HubSpot falló (sin conexión, un 500, el tope): dice que no se pudo consultar, no que no existe", () => {
    const p = armarPersona({ nombre: "Ana", email: "ana@x.com" }, sinContacto("no-se-pudo"));
    expect(p?.cargo).toBeNull();
    expect(p?.aviso).toMatch(/No se pudo consultar HubSpot/);
    expect(p?.aviso).not.toMatch(/No encontramos/);
  });

  it("un correo que no se pudo buscar: lo dice, sin culpar a HubSpot", () => {
    const p = armarPersona({ nombre: "Ana", email: "ana@empresa" }, sinContacto("correo-invalido"));
    expect(p).toMatchObject({ email: "ana@empresa", cargo: null });
    expect(p?.aviso).toMatch(/no parece válido/);
    expect(p?.aviso).not.toMatch(/No encontramos/);
  });

  it("si HubSpot no encontró nada, no se usa ningún dato suyo", () => {
    const p = armarPersona({ nombre: "Ana", email: "ana@x.com" }, { estado: "no-se-pudo", contacto: { nombre: "X", cargo: "Y" } });
    expect(p?.cargo).toBeNull();
  });

  it("sin correo no hay nada que avisar: el cargo se agrega en la fila", () => {
    expect(armarPersona({ nombre: "Ana" }, null)).toEqual({ nombre: "Ana", cargo: null, email: null, aviso: null });
  });

  it("sin nombre escrito ni en HubSpot, no hay persona", () => {
    expect(armarPersona({ email: "ana@x.com" }, sinContacto("no-existe"))).toBeNull();
    expect(armarPersona({ email: "ana@x.com" }, encontrado(null, "Gerente"))).toBeNull();
  });

  it("limpia espacios y recorta", () => {
    const p = armarPersona({ nombre: "  Ana   Pérez ", cargo: "  ", email: " ana@x.com " }, encontrado(null, " CFO "));
    expect(p).toMatchObject({ nombre: "Ana Pérez", cargo: "CFO", email: "ana@x.com" });
  });
});

describe("errorSinNombre", () => {
  it("cada estado dice lo suyo: «no encontramos» solo si HubSpot contestó que no lo tiene", () => {
    expect(errorSinNombre(encontrado(null, "CFO"))).toMatch(/HubSpot no tiene el nombre/);
    expect(errorSinNombre(sinContacto("no-existe"))).toMatch(/No encontramos ese correo en HubSpot/);
    expect(errorSinNombre(sinContacto("no-se-pudo"))).toMatch(/No se pudo consultar HubSpot/);
    expect(errorSinNombre(sinContacto("correo-invalido"))).toMatch(/no parece válido/);
  });
});
