import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ getSystemHubspotClient: vi.fn() }));
vi.mock("./contacto-por-correo", () => ({ buscarContactoPorCorreo: vi.fn() }));

import { enlaceDelResultado, leerNotaDelTest } from "@/lib/exploraciones/llegadas";
import type { Intento } from "@/lib/tests-diagnostico/repositorio-server";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { getSystemHubspotClient } from "./client";
import { buscarContactoPorCorreo } from "./contacto-por-correo";
import {
  configDelFormulario,
  cuerpoDelFormulario,
  dejarNotaYResultado,
  enviarFormulario,
  notaDelIntento,
  partirElNombre,
  propiedadesDelContacto,
  PROPIEDAD_DEL_RESULTADO,
} from "./test-del-diagnostico";

/** Ocho preguntas sin contestar: solo cuentan para «Llegó a la pregunta N de 8». */
const ochoPreguntas = Array.from({ length: 8 }, (_, n) => ({
  id: `q${n}`,
  publico: `x${n}`,
  opcionesPublicas: {},
  dimensionId: `1.${n}`,
  texto: `Pregunta ${n + 1}`,
  ayuda: null,
  opciones: [],
})) as Intento["preguntas"];

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

  it("solo con el correo: ni nombre, ni apellido, ni empresa, ni cargo, ni teléfono; la cookie y la página sí", () => {
    const c = cuerpoDelFormulario({ ...base, telefono: "+50688887777" }, "solo-correo");
    expect(c.fields).toEqual([{ objectTypeId: "0-1", name: "email", value: "ana@acme.com" }]);
    expect(c.context).toEqual(cuerpoDelFormulario(base).context);
  });

  it("la propiedad del resultado es la de la aplicación vieja", () => {
    expect(PROPIEDAD_DEL_RESULTADO).toEqual({ "1": "url_ultimo_diag_sales", "2": "url_ultimo_diag_marketing", "3": "url_ultimo_diag_service" });
  });
});

describe("el envío del formulario, según el correo ya sea contacto (pregunta 39)", () => {
  const cfg = { portalId: "6553628", formGuid: "0f3c2c1e-1111-4222-8333-444455556666" };
  const enviar = async (estado: string, ultimoIntento = false) => {
    vi.mocked(buscarContactoPorCorreo).mockResolvedValue({ estado, contacto: estado === "encontrado" ? { id: "77" } : null } as never);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const envio = await enviarFormulario({ ...base, telefono: "+50688887777" }, cfg, { ultimoIntento });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const cuerpo = JSON.parse(String(init.body)) as ReturnType<typeof cuerpoDelFormulario>;
      return { envio, url, campos: cuerpo.fields.map((f) => f.name), context: cuerpo.context };
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it("contacto NUEVO: el formulario va completo, como siempre", async () => {
    const r = await enviar("no-existe");
    expect(r.envio).toBe("completo");
    expect(r.url).toBe(`https://api.hsforms.com/submissions/v3/integration/submit/${cfg.portalId}/${cfg.formGuid}`);
    expect(r.campos).toEqual(["email", "firstname", "lastname", "phone", "jobtitle", "company", "website"]);
  });

  it("⛔ contacto que YA EXISTE: el mismo formulario, solo con el correo y la atribución (no le pisa los datos)", async () => {
    const r = await enviar("encontrado");
    expect(r.envio).toBe("solo-correo");
    expect(r.url).toBe(`https://api.hsforms.com/submissions/v3/integration/submit/${cfg.portalId}/${cfg.formGuid}`);
    expect(r.campos).toEqual(["email"]);
    expect(r.context).toMatchObject({ hutk: "abc", pageUri: base.origen!.pagina });
  });

  it("⛔ si la búsqueda falla (HubSpot no contestó): no manda nada y el job reintenta; en el último intento, solo el correo", async () => {
    await expect(enviar("no-se-pudo")).rejects.toThrow(/No se pudo buscar el contacto/);
    expect((await enviar("no-se-pudo", true)).campos).toEqual(["email"]);
    expect((await enviar("correo-invalido")).campos).toEqual(["email"]);
  });

  it("si HubSpot rechaza el envío, lanza (el job lo reintenta); con solo el correo, dice que el formulario exige más", async () => {
    const rechazo = async (estado: string) => {
      vi.mocked(buscarContactoPorCorreo).mockResolvedValue({ estado, contacto: null } as never);
      vi.stubGlobal("fetch", vi.fn(async () => new Response("REQUIRED_FIELD", { status: 400 })));
      try {
        return await enviarFormulario(base, cfg).then(
          () => "",
          (e: Error) => e.message,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    };
    expect(await rechazo("no-existe")).toMatch(/400 REQUIRED_FIELD\)\.$/);
    expect(await rechazo("encontrado")).toMatch(/deja obligatorio solo el correo/);
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
    const nota = notaDelIntento({ ...base, puesto: null, usoDeCrm: "Aún no usamos ninguna herramienta", estado: "abandonado", preguntas: ochoPreguntas })!;
    expect(nota).toContain("Cómo gestionan hoy a sus clientes: Aún no usamos ninguna herramienta");
    expect(leerNotaDelTest(nota)).toMatchObject({ estado: "sinTerminar", contacto: "Ana María Pérez", email: "ana@acme.com", dominio: "acme.com" });
  });

  it("en curso no lleva nota; dejado y terminado, la que lee la preventa", () => {
    expect(notaDelIntento(base)).toBeNull();
    const dejada = leerNotaDelTest(notaDelIntento({ ...base, estado: "abandonado", preguntas: ochoPreguntas })!);
    expect(dejada).toMatchObject({ estado: "sinTerminar", areaId: "1", email: "ana@acme.com" });
    const resultado = { nivelNombre: "Funcional", recomendacion: null } as unknown as ResultadoDelTest;
    const url = "https://nexus.smarteamcr.com/external/test/resultado/" + "a".repeat(43) + "#x";
    const terminada = notaDelIntento({ ...base, estado: "terminado", resultado, url })!;
    expect(terminada).toContain("Funcional");
    expect(leerNotaDelTest(terminada)).toMatchObject({ estado: "terminado", areaId: "1" });
  });
});

describe("las respuestas en la nota", () => {
  const preguntas = [
    { id: "p1", publico: "x1", opcionesPublicas: {}, dimensionId: "1.1", texto: "¿Quién da seguimiento?", ayuda: null, opciones: [{ id: "a", texto: "Cada vendedor <a su modo>", nivel: "I" }] },
    { id: "p2", publico: "x2", opcionesPublicas: {}, dimensionId: "1.2", texto: "¿Miden el embudo?", ayuda: null, opciones: [{ id: "b", texto: "Sí", nivel: "E" }] },
    { id: "p3", publico: "x3", opcionesPublicas: {}, dimensionId: "1.3", texto: "¿Sin contestar?", ayuda: null, opciones: [{ id: "c", texto: "Nunca sale", nivel: "O" }] },
  ] as Intento["preguntas"];
  // Un matiz con un enlace a OTRO resultado: la preventa tiene que seguir leyendo el del test.
  const otro = "https://dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#otro";
  const anidado = "hthttps://tps://x.com/resultado.html#otro2";
  const respuestas = { p1: { opcion: "a", matiz: `Depende. Quién: nadie. Empresa: x.com ${otro} ${anidado}` }, p2: { opcion: "no-se" } };

  it("terminado: el título y lo que lee la preventa quedan igual, y abajo cada pregunta con lo que eligió", () => {
    const resultado = { nivelNombre: "Funcional", recomendacion: null } as unknown as ResultadoDelTest;
    const url = "https://nexus.smarteamcr.com/external/test/resultado/" + "a".repeat(43) + "#x";
    const nota = notaDelIntento({ ...base, estado: "terminado", resultado, url, preguntas, respuestas })!;
    expect(nota.startsWith("<p><strong>📊 Diagnóstico de Rendimiento — Ventas · Funcional (estimado)</strong></p>")).toBe(true);
    expect(nota).toContain("<p>1. ¿Quién da seguimiento?<br>→ Cada vendedor &lt;a su modo&gt;<br>Matiz: «Depende.");
    expect(nota).toContain("<p>2. ¿Miden el embudo?<br>→ No lo sé</p>");
    expect(nota).not.toContain("¿Sin contestar?");
    expect(nota.indexOf("Respuestas")).toBeGreaterThan(nota.indexOf("Resultado:"));
    expect(leerNotaDelTest(nota)).toMatchObject({ estado: "terminado", areaId: "1", contacto: "Ana María Pérez", email: "ana@acme.com", dominio: "acme.com" });
    expect(enlaceDelResultado(nota)).toBe(url);
    expect(nota).toContain("https: //dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#otro hthttps: //tps: //x.com");
    expect(nota.slice(nota.indexOf("Matiz:"))).not.toContain("://");
  });

  it("dejado a medias: las que alcanzó a contestar", () => {
    const nota = notaDelIntento({ ...base, estado: "abandonado", preguntas, respuestas: { p2: { opcion: "b" } } })!;
    expect(nota).toContain("<p>1. ¿Miden el embudo?<br>→ Sí</p>");
    expect(nota).not.toContain("¿Quién da seguimiento?");
    expect(leerNotaDelTest(nota)).toMatchObject({ estado: "sinTerminar", email: "ana@acme.com" });
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
  const dejado: Intento = { ...base, puesto: null, usoDeCrm: "HubSpot", estado: "abandonado", preguntas: ochoPreguntas };

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
