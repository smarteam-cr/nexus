/**
 * lib/clients/personas-de-la-empresa.test.ts — una persona del cliente, una sola, desde sus tres fuentes con correo
 * (R6), sin colar gente del equipo ni de otros clientes.
 */
import { describe, expect, it } from "vitest";
import { aMirarSiEsCompartido, cambiosDePersona, unirPersonas } from "./personas-de-la-empresa";

const sinCompartidos = { dominios: new Set<string>(), correos: new Set<string>() };
const base = {
  contactos: [] as Parameters<typeof unirPersonas>[0]["contactos"],
  cuestionarios: [] as Parameters<typeof unirPersonas>[0]["cuestionarios"],
  reuniones: [] as Parameters<typeof unirPersonas>[0]["reuniones"],
  dominiosDeLaEmpresa: ["acme.com"],
  correosDelEquipo: ["eli@smarteamcr.com"],
  compartidos: sinCompartidos,
};
const D1 = new Date("2026-10-01T15:00:00Z");
const D2 = new Date("2026-10-20T15:00:00Z");

describe("unirPersonas", () => {
  it("el contacto, su cuestionario y sus reuniones son la misma persona (por correo, sin importar mayúsculas)", () => {
    const r = unirPersonas({
      ...base,
      contactos: [{ id: "c1", email: "Ana@Acme.com", nombre: "Ana Mora", cargo: "Gerente", vigente: true }],
      cuestionarios: [{ email: "ana@acme.com", nombre: "Ana M.", cargo: "Gerente comercial" }],
      reuniones: [
        { fecha: D1, participantes: ["ana@acme.com", "eli@smarteamcr.com"] },
        { fecha: D2, participantes: ["ANA@acme.com"] },
      ],
    });
    expect(r).toEqual([
      { correo: "ana@acme.com", nombre: "Ana Mora", cargo: "Gerente", contactoDeHubspotId: "c1", origenes: ["hubspot", "cuestionario", "reunion"], reuniones: 2, ultimaReunionAt: D2, lado: "empresa" },
    ]);
  });

  it("de las reuniones solo entra quien es del dominio de la empresa o ya es su contacto; nunca el equipo", () => {
    const r = unirPersonas({
      ...base,
      contactos: [{ id: "c2", email: "socio@consultora.com", nombre: "Socio", cargo: null, vigente: true }],
      reuniones: [{ fecha: D1, participantes: ["luis@acme.com", "otro@proveedor.com", "socio@consultora.com", "maria@smarteamcr.com"] }],
    });
    expect(r.map((p) => p.correo).sort()).toEqual(["luis@acme.com", "socio@consultora.com"]);
    expect(r.find((p) => p.correo === "socio@consultora.com")!.lado).toBe("externa");
  });

  it("alguien de fuera que también aparece en reuniones de otros clientes (una agencia) no entra; los de la empresa sí, aunque hayan ido a otra", () => {
    const r = unirPersonas({
      ...base,
      contactos: [{ id: "c9", email: "socio@agencia.com", nombre: "Socio", cargo: null, vigente: true }],
      reuniones: [{ fecha: D1, participantes: ["luis@acme.com", "ana@acme.com", "socio@agencia.com", "otro@agencia.com"] }],
      compartidos: { dominios: new Set(["acme.com", "agencia.com"]), correos: new Set(["ana@acme.com", "socio@agencia.com"]) },
    });
    expect(r.map((p) => [p.correo, p.reuniones])).toEqual([
      ["ana@acme.com", 1],
      ["luis@acme.com", 1],
      // El contacto de HubSpot entra igual, pero sus reuniones no cuentan: es gente compartida.
      ["socio@agencia.com", 0],
    ]);
  });

  it("un contacto de baja o sin correo válido no entra", () => {
    const r = unirPersonas({
      ...base,
      contactos: [
        { id: "c3", email: "baja@acme.com", nombre: "B", cargo: null, vigente: false },
        { id: "c4", email: "sin-arroba", nombre: "X", cargo: null, vigente: true },
      ],
    });
    expect(r).toEqual([]);
  });
});

describe("aMirarSiEsCompartido", () => {
  it("solo la gente de fuera del dominio de la empresa, y gmail como correo, nunca como dominio", () => {
    expect(aMirarSiEsCompartido(["Ana@Acme.com", "x@gmail.com", "socio@agencia.com", "sin-arroba"], ["acme.com"])).toEqual({
      dominios: ["agencia.com"],
      correos: ["x@gmail.com", "socio@agencia.com"],
    });
  });
});

describe("cambiosDePersona", () => {
  const antes = { nombre: "Ana", cargo: "Gerente", contactoDeHubspotId: "c1", origenes: ["hubspot"], reuniones: 1, ultimaReunionAt: D1, lado: "empresa", vigente: true };
  it("solo lo que cambió; un nombre no se borra porque una fuente dejó de decirlo", () => {
    expect(cambiosDePersona(antes, { correo: "a", nombre: null, cargo: "Gerente", contactoDeHubspotId: "c1", origenes: ["hubspot"], reuniones: 1, ultimaReunionAt: D1, lado: "empresa" })).toBeNull();
    expect(cambiosDePersona(antes, { correo: "a", nombre: "Ana", cargo: "Gerente", contactoDeHubspotId: "c1", origenes: ["reunion", "hubspot"], reuniones: 3, ultimaReunionAt: D2, lado: "empresa" })).toEqual({
      origenes: ["reunion", "hubspot"],
      reuniones: 3,
      ultimaReunionAt: D2,
    });
  });
  it("una que estaba de baja y vuelve a aparecer, vuelve", () => {
    expect(cambiosDePersona({ ...antes, vigente: false }, { correo: "a", nombre: "Ana", cargo: "Gerente", contactoDeHubspotId: "c1", origenes: ["hubspot"], reuniones: 1, ultimaReunionAt: D1, lado: "empresa" })).toEqual({ vigente: true });
  });
});
