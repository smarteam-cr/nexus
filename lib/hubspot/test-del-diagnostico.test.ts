import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ getSystemHubspotClient: vi.fn() }));
vi.mock("./contacto-por-correo", () => ({ buscarContactoPorCorreo: vi.fn() }));

import { leerNotaDelTest } from "@/lib/exploraciones/llegadas";
import type { Intento } from "@/lib/tests-diagnostico/repositorio-server";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { getSystemHubspotClient } from "./client";
import { buscarContactoPorCorreo } from "./contacto-por-correo";
import {
  configDelFormulario,
  cuerpoDelFormulario,
  dejarNotaYResultado,
  notaDelIntento,
  partirElNombre,
  propiedadesDelContacto,
  PROPIEDAD_DEL_RESULTADO,
} from "./test-del-diagnostico";

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
  usoDeCrm: null,
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

describe("lo que se escribe en el contacto", () => {
  const url = "https://nexus.smarteamcr.com/external/test/resultado/" + "a".repeat(43);

  it("cómo gestionan a sus clientes va en la propiedad que ya existe, con el valor exacto", () => {
    expect(propiedadesDelContacto({ ...base, usoDeCrm: "Salesforce" })).toEqual({ como_gestionan_actualmente_a_sus_clientes: "Salesforce" });
    expect(propiedadesDelContacto({ ...base, estado: "terminado", url, usoDeCrm: "No lo sé" })).toEqual({
      url_ultimo_diag_sales: url,
      como_gestionan_actualmente_a_sus_clientes: "No lo sé",
    });
  });

  it("⛔ ni por el formulario (que lo rechazaría entero) ni con un texto que no es de la propiedad", () => {
    const conCrm: Intento = { ...base, puesto: null, usoDeCrm: "HubSpot" };
    expect(cuerpoDelFormulario(conCrm).fields.map((f) => f.name)).not.toContain(
      "como_gestionan_actualmente_a_sus_clientes",
    );
    expect(propiedadesDelContacto({ ...base, usoDeCrm: "Excel" })).toEqual({});
    expect(propiedadesDelContacto(base)).toEqual({});
  });
});

describe("la nota del intento", () => {
  it("dice cómo gestionan a sus clientes sin romper lo que lee la preventa", () => {
    const nota = notaDelIntento({ ...base, puesto: null, usoDeCrm: "Aún no usamos ninguna herramienta", estado: "abandonado", preguntas: new Array(8).fill(null) as Intento["preguntas"] })!;
    expect(nota).toContain("Cómo gestionan hoy a sus clientes: Aún no usamos ninguna herramienta");
    expect(leerNotaDelTest(nota)).toMatchObject({ estado: "sinTerminar", contacto: "Ana María Pérez", email: "ana@acme.com", dominio: "acme.com" });
  });

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

describe("el uso de CRM en el contacto, si HubSpot falla", () => {
  const llamadas: { path: string; body: unknown }[] = [];
  const conRespuestas = (statusDelPatch: number[]) => {
    llamadas.length = 0;
    const cola = [...statusDelPatch];
    vi.mocked(buscarContactoPorCorreo).mockResolvedValue({ estado: "encontrado", contacto: { id: "77" } } as never);
    vi.mocked(getSystemHubspotClient).mockResolvedValue({
      apiRequest: vi.fn(async (o: { path: string; body: unknown; method: string }) => {
        llamadas.push({ path: o.path, body: o.body });
        return { status: o.method === "PATCH" ? (cola.shift() ?? 200) : 201, text: async () => "" };
      }),
    } as never);
  };
  const dejado: Intento = { ...base, puesto: null, usoDeCrm: "HubSpot", estado: "abandonado", preguntas: new Array(8).fill(null) as Intento["preguntas"] };

  it("⛔ una falla pasajera (5xx) NO descarta el dato: lanza, no deja la nota, y el job lo reintenta todo", async () => {
    conRespuestas([503]);
    await expect(dejarNotaYResultado(dejado)).rejects.toThrow();
    expect(llamadas.map((l) => l.path)).toEqual(["/crm/v3/objects/contacts/77"]);
  });

  it("si HubSpot rechaza el VALOR (400), la nota sale igual, sin el dato", async () => {
    conRespuestas([400]);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await dejarNotaYResultado(dejado);
    expect(llamadas.map((l) => l.path)).toEqual(["/crm/v3/objects/contacts/77", "/crm/v3/objects/notes"]);
  });

  it("con el valor bueno, va en el contacto y después la nota", async () => {
    conRespuestas([200]);
    await dejarNotaYResultado(dejado);
    expect(llamadas[0].body).toEqual({ properties: { como_gestionan_actualmente_a_sus_clientes: "HubSpot" } });
    expect(llamadas[1].path).toBe("/crm/v3/objects/notes");
  });
});
