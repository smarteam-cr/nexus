import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ getSystemHubspotClient: vi.fn() }));
vi.mock("./contacto-por-correo", () => ({ buscarContactoPorCorreo: vi.fn() }));

import { leerNotaDelTest } from "@/lib/exploraciones/llegadas";
import type { Intento } from "@/lib/tests-diagnostico/repositorio-server";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { configDelFormulario, cuerpoDelFormulario, notaDelIntento, partirElNombre, PROPIEDAD_DEL_RESULTADO } from "./test-del-diagnostico";

const base: Intento = {
  id: "c1",
  token: "t",
  area: "1",
  version: "web",
  edicion: null,
  escalaVersion: "8.9.1",
  preguntas: [],
  respuestas: {},
  paso: 3,
  estado: "en_curso",
  clientId: null,
  resultado: null,
  url: null,
  origen: { hutk: "abc", pagina: "https://nexus.smarteamcr.com/external/test/ventas?utm_source=li" },
  hubspotFormAt: null,
  hubspotNotaAt: null,
  hubspotIntentos: 0,
  hubspotError: null,
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
  terminadoAt: null,
  nombre: "Ana María Pérez",
  email: "ana@acme.com",
  telefono: null,
  puesto: "Gerente comercial",
  empresa: "Acme",
  dominio: "acme.com",
  industria: "Manufactura",
};

describe("el formulario de HubSpot", () => {
  it("la configuración exige un portal numérico y un GUID", () => {
    expect(configDelFormulario({})).toBeNull();
    expect(configDelFormulario({ TESTS_HUBSPOT_PORTAL_ID: "abc", TESTS_HUBSPOT_FORM_GUID: "x" })).toBeNull();
    expect(configDelFormulario({ TESTS_HUBSPOT_PORTAL_ID: "123", TESTS_HUBSPOT_FORM_GUID: "0f3c2c1e-1111-4222-8333-444455556666" })).toEqual({
      portalId: "123",
      formGuid: "0f3c2c1e-1111-4222-8333-444455556666",
    });
  });

  it("manda solo los campos con valor, la cookie y la página (la atribución de anuncios sigue igual)", () => {
    expect(partirElNombre("Ana María Pérez")).toEqual({ firstname: "Ana", lastname: "María Pérez" });
    const c = cuerpoDelFormulario(base);
    expect(c.fields.map((f) => f.name)).toEqual(["email", "firstname", "lastname", "jobtitle", "company", "website"]);
    expect(c.context).toEqual({ hutk: "abc", pageUri: "https://nexus.smarteamcr.com/external/test/ventas?utm_source=li", pageName: "Diagnóstico de Rendimiento" });
  });

  it("la propiedad del resultado es la de la aplicación vieja", () => {
    expect(PROPIEDAD_DEL_RESULTADO).toEqual({ "1": "url_ultimo_diag_sales", "2": "url_ultimo_diag_marketing", "3": "url_ultimo_diag_service" });
  });
});

describe("la nota del intento", () => {
  it("en curso no lleva nota; dejado y terminado, la que lee la preventa", () => {
    expect(notaDelIntento(base)).toBeNull();
    const dejada = leerNotaDelTest(notaDelIntento({ ...base, estado: "abandonado", preguntas: new Array(8).fill(null) as Intento["preguntas"] })!);
    expect(dejada).toMatchObject({ estado: "sinTerminar", areaId: "1", email: "ana@acme.com" });
    const resultado = { nivelNombre: "Funcional", recomendacion: null } as unknown as ResultadoDelTest;
    const url = "https://nexus.smarteamcr.com/external/test/resultado/" + "a".repeat(43) + "#x";
    const terminada = notaDelIntento({ ...base, estado: "terminado", resultado, url })!;
    expect(terminada).toContain("Funcional");
    expect(leerNotaDelTest(terminada)).toMatchObject({ estado: "terminado", areaId: "1" });
  });
});
