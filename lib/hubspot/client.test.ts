/**
 * lib/hubspot/client.test.ts — el transporte cableado de verdad: el `client.ts` real, con la base y `fetch` falsos.
 *
 * ⭐ Lo que más importa: dos pedidos que reciben un 401 a la vez comparten UN refresh (antes, cada uno de los 14
 * lugares con su propio reintento refrescaba por su cuenta y guardaba encima del otro). Y el cliente del SDK que ven
 * los ~90 llamadores manda su `apiRequest` por el transporte sin que cambie su firma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const cuenta = {
    id: "acc-sistema",
    isSystem: true,
    accessToken: "viejo",
    refreshToken: "rt",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  return {
    cuenta,
    prisma: {
      hubspotAccount: {
        findFirst: vi.fn(async () => ({ ...cuenta })),
        findUnique: vi.fn(async () => ({ ...cuenta })),
        update: vi.fn(async ({ data }: { data: Partial<typeof cuenta> }) => {
          Object.assign(cuenta, data);
          return { ...cuenta };
        }),
      },
    },
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));
const eventos = vi.hoisted(() => ({
  pedido: vi.fn(),
  visto401: vi.fn(),
  renovado: vi.fn(),
  falla401: vi.fn(),
  visto429: vi.fn(),
  falla429: vi.fn(),
  cupo: vi.fn(),
}));
vi.mock("./registro-de-fallas", () => ({ eventosQueSeCuentan: eventos }));

import {
  _olvidarTokensParaPruebas,
  forceRefreshSystemToken,
  getHubspotClient,
  getSystemAccessToken,
  getSystemHubspotClient,
  pedirConToken,
  presupuestoVigente,
} from "./client";
import { enUnJob } from "@/lib/jobs/contexto";
import { PRESUPUESTO_DE_JOB, PRESUPUESTO_DE_RUTA } from "./transporte";
import { FalloAlLeerContactos, fetchCompanyContacts } from "./company-contacts";
import { asociacionesDeEmpresas } from "./contactos-y-tickets";

type Llamada = { url: string; auth: string | null };

/** Un HubSpot falso: el token «viejo» da 401, el refresh tarda un poco (para que los pedidos se crucen). */
function hubspotFalso() {
  const llamadas: Llamada[] = [];
  let emitidos = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    llamadas.push({ url, auth });
    if (url.endsWith("/oauth/v1/token")) {
      await new Promise((r) => setTimeout(r, 20));
      emitidos++;
      return new Response(JSON.stringify({ access_token: `nuevo-${emitidos}`, refresh_token: "rt", expires_in: 1800 }), { status: 200 });
    }
    if (auth === "Bearer viejo") return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ ok: true, auth }), { status: 200 });
  });
  return { fetch, llamadas, refrescos: () => llamadas.filter((l) => l.url.endsWith("/oauth/v1/token")).length };
}

beforeEach(() => {
  _olvidarTokensParaPruebas();
  Object.assign(db.cuenta, { accessToken: "viejo", refreshToken: "rt", expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("⭐ 401 con dos pedidos a la vez: un solo refresh", () => {
  it("dos clientes del sistema reciben 401 a la vez → UN refresh, y los dos entran con el token nuevo", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    const [a, b] = await Promise.all([getSystemHubspotClient(), getSystemHubspotClient()]);
    const [ra, rb] = await Promise.all([
      a.apiRequest({ method: "GET", path: "/crm/v3/objects/companies/1" }),
      b.apiRequest({ method: "POST", path: "/crm/v3/objects/contacts/search", body: { limit: 1 } }),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect(hs.refrescos()).toBe(1);
    expect(db.prisma.hubspotAccount.update).toHaveBeenCalledTimes(1);
    expect(db.cuenta.accessToken).toBe("nuevo-1");
    const conTokenNuevo = hs.llamadas.filter((l) => l.auth === "Bearer nuevo-1");
    expect(conTokenNuevo).toHaveLength(2);
  });

  it("un 401 que llega DESPUÉS de que otro ya renovó usa ese token sin refrescar otra vez", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    const a = await getSystemHubspotClient();
    const b = await getSystemHubspotClient(); // los dos con «viejo»
    expect((await a.apiRequest({ path: "/x" })).status).toBe(200);
    expect((await b.apiRequest({ path: "/y" })).status).toBe(200);
    expect(hs.refrescos()).toBe(1);
  });

  it("si otro proceso ya renovó (el token de la base no es el rechazado), lo usa sin refrescar", async () => {
    /* La edición que la pone en rojo: sacar la relectura de la base en renovarToken. Cada entorno (prod, el 3004 de
       cada PC, los scripts) volvería a refrescar por su cuenta cada vez que recibe un 401. */
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    const a = await getSystemHubspotClient(); // con «viejo»
    db.cuenta.accessToken = "de-otro-proceso"; // otro entorno ya renovó y guardó
    const r = await a.apiRequest({ path: "/x" });
    expect(r.status).toBe(200);
    expect(hs.refrescos()).toBe(0);
    expect(hs.llamadas.at(-1)?.auth).toBe("Bearer de-otro-proceso");
  });

  it("forceRefreshSystemToken (compatibilidad) comparte el refresh en curso", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    const a = await getSystemHubspotClient();
    await Promise.all([a.apiRequest({ path: "/x" }), forceRefreshSystemToken()]);
    expect(hs.refrescos()).toBe(1);
  });

  it("el token vencido se renueva una sola vez aunque lo pidan varios a la vez", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    db.cuenta.expiresAt = new Date(Date.now() + 60 * 1000); // vence en 1 minuto (< 5)
    const tokens = await Promise.all([getSystemAccessToken(), getSystemAccessToken(), getSystemHubspotClient().then(() => "c")]);
    expect(tokens.slice(0, 2)).toEqual(["nuevo-1", "nuevo-1"]);
    expect(hs.refrescos()).toBe(1);
  });

  it("si el token renovado no se puede guardar (base en solo lectura), se usa igual", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    db.prisma.hubspotAccount.update.mockRejectedValueOnce(new Error("cannot execute UPDATE in a read-only transaction"));
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await (await getSystemHubspotClient()).apiRequest({ path: "/x" });
    consola.mockRestore();
    expect(r.status).toBe(200);
    expect(hs.llamadas.at(-1)?.auth).toBe("Bearer nuevo-1");
  });

  it("también renueva el token de una cuenta de cliente (getHubspotClient)", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    const c = await getHubspotClient("acc-sistema");
    expect((await c.apiRequest({ path: "/x" })).status).toBe(200);
    expect(hs.refrescos()).toBe(1);
  });
});

describe("el contrato de errores no cambia", () => {
  it("403: vuelve como 403, sin refrescar ni reintentar", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const r = await (await getSystemHubspotClient()).apiRequest({ path: "/crm/v3/objects/tickets" });
    expect(r.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("una Private App (sin refresh token) no intenta renovar: el 401 vuelve", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    db.cuenta.refreshToken = "";
    const r = await (await getHubspotClient("acc-sistema")).apiRequest({ path: "/x" });
    expect(r.status).toBe(401);
    expect(hs.refrescos()).toBe(0);
  });

  it("un token suelto (pedirConToken) no se renueva: el 401 vuelve", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const r = await pedirConToken("suelto", { path: "/account-info/v3/details" });
    expect(r.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("el registro ve lo que pasa (si no, «0 fallas» sería un éxito falso)", () => {
  it("cada pedido, el 401, la renovación, el 429 y la falla llegan a los eventos que se cuentan", async () => {
    const hs = hubspotFalso();
    vi.stubGlobal("fetch", hs.fetch);
    await (await getSystemHubspotClient()).apiRequest({ path: "/x" });
    expect(eventos.visto401).toHaveBeenCalledTimes(1);
    expect(eventos.renovado).toHaveBeenCalledTimes(1);
    expect(eventos.pedido).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "3600" } })));
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await (await getSystemHubspotClient()).apiRequest({ path: "/y" });
    consola.mockRestore();
    expect(eventos.visto429).toHaveBeenCalledTimes(1);
    expect(eventos.falla429).toHaveBeenCalledTimes(1);
  });
});

describe("el contrato del 429 agotado, con los lectores reales", () => {
  /** HubSpot pide esperar una hora: no cabe en ningún presupuesto, el 429 vuelve al lector al instante. */
  const limiteDeUnaHora = () => vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "3600" } }));

  it("⭐ fetchCompanyContacts LANZA (cs-signals conserva los contactos de la copia anterior)", async () => {
    vi.stubGlobal("fetch", limiteDeUnaHora());
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchCompanyContacts(await getSystemHubspotClient(), "hs-1")).rejects.toBeInstanceOf(FalloAlLeerContactos);
    consola.mockRestore();
  });

  it("⭐ la copia en lote de contactos y tickets marca esas empresas como ilegibles (y no le da de baja a nadie)", async () => {
    vi.stubGlobal("fetch", limiteDeUnaHora());
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await asociacionesDeEmpresas(await getSystemHubspotClient(), ["hs-1", "hs-2"], "contacts");
    consola.mockRestore();
    expect([...r.ilegibles].sort()).toEqual(["hs-1", "hs-2"]);
    expect(r.porEmpresa.size).toBe(0);
  });
});

describe("dos presupuestos de espera", () => {
  const runtime = process.env.NEXT_RUNTIME;
  afterEach(() => {
    if (runtime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = runtime;
  });

  it("dentro de Next, una ruta tiene 2 s; un job del scheduler, lo que diga Retry-After", () => {
    process.env.NEXT_RUNTIME = "nodejs";
    expect(presupuestoVigente()).toBe(PRESUPUESTO_DE_RUTA);
    expect(enUnJob("cs-signals", () => presupuestoVigente())).toBe(PRESUPUESTO_DE_JOB);
  });

  it("fuera de Next (un script) es el de job", () => {
    delete process.env.NEXT_RUNTIME;
    expect(presupuestoVigente()).toBe(PRESUPUESTO_DE_JOB);
  });

  it("el contexto del job viaja por la cadena de await", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const visto = await enUnJob("comunicaciones", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return presupuestoVigente();
    });
    expect(visto).toBe(PRESUPUESTO_DE_JOB);
  });
});
