/**
 * lib/hubspot/transporte.test.ts — el pedido a HubSpot ante el 401, el 429 y el 403, con un `fetch` falso.
 *
 * El contrato que se cuida (docs/integracion-hubspot-plan.md › U6): un 401 renueva el token UNA vez; un 429 espera
 * lo que diga `Retry-After` mientras quepa en el presupuesto y, si no cabe, vuelve como 429 (quien lanzaba ante él
 * sigue lanzando); un 403 vuelve sin reintento («sin permiso»). El refresh único con dos pedidos a la vez se prueba
 * contra el `client.ts` real en `client.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PRESUPUESTO_DE_JOB,
  PRESUPUESTO_DE_RUTA,
  armarPedido,
  esperaPorLimite,
  frenoPorCupo,
  pedirAHubspot,
  type Credencial,
  type DependenciasDelTransporte,
} from "./transporte";

/** Un reloj falso: `esperar` lo adelanta, así las pruebas no esperan de verdad. */
function depsFalsas(respuestas: Array<Response | (() => Response)>) {
  let ahora = 1_000_000;
  const esperas: number[] = [];
  const pedidos: { url: string; init: RequestInit }[] = [];
  const eventos = {
    visto401: vi.fn(),
    renovado: vi.fn(),
    falla401: vi.fn(),
    visto429: vi.fn(),
    falla429: vi.fn(),
    cupo: vi.fn(),
  };
  const deps: DependenciasDelTransporte = {
    fetch: vi.fn(async (url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      const r = respuestas.shift();
      if (!r) throw new Error("el test no previó este pedido");
      return typeof r === "function" ? r() : r;
    }),
    esperar: vi.fn(async (ms: number) => {
      esperas.push(ms);
      ahora += ms;
    }),
    ahora: () => ahora,
    eventos,
    freno: { hasta: 0 },
  };
  return { deps, esperas, pedidos, eventos };
}

const res = (status: number, headers: Record<string, string> = {}, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const credencialFija = (token = "t1"): Credencial => ({ token: () => token, renovar: null });

const authDe = (p: { init: RequestInit }) => (p.init.headers as Record<string, string>).Authorization;

describe("401: un solo refresh", () => {
  it("renueva el token y reintenta con el nuevo", async () => {
    const { deps, pedidos, eventos } = depsFalsas([res(401), res(200, {}, { ok: 1 })]);
    const renovar = vi.fn(async () => "t2");
    const r = await pedirAHubspot({ path: "/crm/v3/x" }, { token: () => "t1", renovar }, PRESUPUESTO_DE_RUTA, deps);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: 1 });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(renovar).toHaveBeenCalledWith("t1");
    expect(pedidos.map(authDe)).toEqual(["Bearer t1", "Bearer t2"]);
    expect(eventos.renovado).toHaveBeenCalledTimes(1);
    expect(eventos.falla401).not.toHaveBeenCalled();
  });

  it("si ni con el token nuevo entra, devuelve ese 401 (no renueva dos veces)", async () => {
    const { deps, eventos } = depsFalsas([res(401), res(401)]);
    const renovar = vi.fn(async () => "t2");
    const r = await pedirAHubspot({ path: "/x" }, { token: () => "t1", renovar }, PRESUPUESTO_DE_RUTA, deps);
    expect(r.status).toBe(401);
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(eventos.falla401).toHaveBeenCalledTimes(1);
  });

  it("si el refresh falla, devuelve el 401 sin lanzar", async () => {
    const { deps, eventos } = depsFalsas([res(401)]);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot(
      { path: "/x" },
      { token: () => "t1", renovar: async () => Promise.reject(new Error("refresh revocado")) },
      PRESUPUESTO_DE_RUTA,
      deps,
    );
    consola.mockRestore();
    expect(r.status).toBe(401);
    expect(eventos.falla401).toHaveBeenCalledTimes(1);
  });

  it("un token suelto (sin renovar) devuelve el 401 tal cual", async () => {
    const { deps } = depsFalsas([res(401)]);
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_RUTA, deps);
    expect(r.status).toBe(401);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("429: espera lo que diga Retry-After", () => {
  it("en un job espera los segundos de Retry-After y reintenta", async () => {
    const { deps, esperas, eventos } = depsFalsas([res(429, { "Retry-After": "3" }), res(200)]);
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    expect(r.status).toBe(200);
    expect(esperas).toEqual([3000]);
    expect(eventos.visto429).toHaveBeenCalledWith(3000);
    expect(eventos.falla429).not.toHaveBeenCalled();
  });

  it("sin Retry-After: 1 s, 2 s, 4 s", async () => {
    const { deps, esperas } = depsFalsas([res(429), res(429), res(429), res(200)]);
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    expect(r.status).toBe(200);
    expect(esperas).toEqual([1000, 2000, 4000]);
  });

  it("⭐ agotado: devuelve el 429 tal cual (los lectores reales se prueban en client.test.ts)", async () => {
    const respuestas = Array.from({ length: PRESUPUESTO_DE_JOB.reintentos429 + 1 }, () => res(429, { "Retry-After": "1" }));
    const { deps, eventos } = depsFalsas(respuestas);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    consola.mockRestore();
    expect(r.status).toBe(429);
    expect(deps.fetch).toHaveBeenCalledTimes(PRESUPUESTO_DE_JOB.reintentos429 + 1);
    expect(eventos.falla429).toHaveBeenCalledTimes(1);
  });

  it("en una ruta: 2 s como máximo; un Retry-After de 5 s no se espera y el 429 vuelve al instante", async () => {
    const { deps, esperas } = depsFalsas([res(429, { "Retry-After": "5" })]);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_RUTA, deps);
    consola.mockRestore();
    expect(r.status).toBe(429);
    expect(esperas).toEqual([]);
  });

  it("en una ruta: reintenta mientras quepa, y la suma de esperas no pasa de 2 s", async () => {
    const { deps, esperas } = depsFalsas([res(429, { "Retry-After": "1" }), res(429, { "Retry-After": "1" }), res(429, { "Retry-After": "1" })]);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_RUTA, deps);
    consola.mockRestore();
    expect(r.status).toBe(429);
    expect(esperas).toEqual([1000, 1000]);
    expect(deps.fetch).toHaveBeenCalledTimes(3);
  });

  it("en una ruta, un 429 de 1 s se espera y el reintento entra", async () => {
    const { deps, esperas } = depsFalsas([res(429, { "Retry-After": "1" }), res(200)]);
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_RUTA, deps);
    expect(r.status).toBe(200);
    expect(esperas).toEqual([1000]);
  });

  it("⭐ una ruta no se queda colgada por el freno de un job: si no cabe en sus 2 s, pide igual", async () => {
    /* La edición que la pone en rojo: esperar el freno sin mirar el presupuesto. Una pantalla quedaría esperando
       lo que un job recibió de Retry-After. */
    const { deps, esperas } = depsFalsas([res(200)]);
    deps.freno!.hasta = deps.ahora() + 30_000;
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_RUTA, deps);
    expect(r.status).toBe(200);
    expect(esperas).toEqual([]);
  });

  it("en un job, entre uno y tres minutos de espera total: se espera hasta 60 s cada vez, no más de 180 s", async () => {
    const respuestas = Array.from({ length: 4 }, () => res(429, { "Retry-After": "60" }));
    const { deps, esperas } = depsFalsas([...respuestas, res(200)]);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    consola.mockRestore();
    expect(esperas).toEqual([60_000, 60_000, 60_000]);
    expect(r.status).toBe(429);
  });

  it("cada intento lleva su propia señal (Next no le devuelve al reintento el 429 memorizado)", async () => {
    const { deps, pedidos } = depsFalsas([res(429, { "Retry-After": "1" }), res(200)]);
    await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    expect(pedidos[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(pedidos[0].init.signal).not.toBe(pedidos[1].init.signal);
  });

  it("en un job, una espera de más de un minuto no se hace (no es el límite de 10 s)", async () => {
    const { deps, esperas } = depsFalsas([res(429, { "Retry-After": "3600" })]);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    consola.mockRestore();
    expect(r.status).toBe(429);
    expect(esperas).toEqual([]);
  });

  it("un 429 frena a los demás pedidos del proceso", async () => {
    const { deps, esperas } = depsFalsas([res(429, { "Retry-After": "2" }), res(200), res(200)]);
    const freno = deps.freno!;
    const primero = pedirAHubspot({ path: "/a" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    await primero;
    expect(freno.hasta).toBeGreaterThan(0);
    // Un pedido que llega con el freno puesto espera lo que falte antes de pedir.
    freno.hasta = deps.ahora() + 1500;
    await pedirAHubspot({ path: "/b" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    expect(esperas).toEqual([2000, 1500]);
  });
});

describe("403: sin permiso, sin reintento", () => {
  it("vuelve como 403, una sola vez, sin renovar el token", async () => {
    const { deps } = depsFalsas([res(403)]);
    const renovar = vi.fn(async () => "t2");
    const r = await pedirAHubspot({ path: "/x" }, { token: () => "t1", renovar }, PRESUPUESTO_DE_JOB, deps);
    expect(r.status).toBe(403);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(renovar).not.toHaveBeenCalled();
  });

  it("un error de red sube como antes", async () => {
    const { deps } = depsFalsas([
      () => {
        throw new Error("ECONNRESET");
      },
    ]);
    await expect(pedirAHubspot({ path: "/x" }, credencialFija(), PRESUPUESTO_DE_JOB, deps)).rejects.toThrow(/ECONNRESET/);
  });
});

describe("el pedido se arma igual que en el SDK", () => {
  it("cuerpo en JSON, qs, encabezados y el token", () => {
    const { url, init } = armarPedido(
      { method: "POST", path: "/crm/v3/objects/companies/search", body: { limit: 1 }, qs: { archived: "false" }, headers: { "X-Uno": "1" } },
      "tok",
    );
    expect(url).toBe("https://api.hubapi.com/crm/v3/objects/companies/search?archived=false");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"limit":1}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer tok", "X-Uno": "1" });
  });

  it("GET por defecto, sin cuerpo, con la query que ya trae la ruta", () => {
    const { url, init } = armarPedido({ path: "/marketing/v3/forms?limit=100" }, "tok");
    expect(url).toBe("https://api.hubapi.com/marketing/v3/forms?limit=100");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("overlapUrl no se soporta: error, no un pedido distinto en silencio", () => {
    expect(() => armarPedido({ path: "/x", overlapUrl: "https://otro" } as never, "tok")).toThrow(/overlapUrl/);
  });
});

describe("los encabezados del límite", () => {
  it("Retry-After en segundos o como fecha", () => {
    expect(esperaPorLimite(new Headers({ "Retry-After": "2" }), 0, 0)).toBe(2000);
    const ahora = Date.parse("2026-10-24T12:00:00Z");
    expect(esperaPorLimite(new Headers({ "Retry-After": "Sat, 24 Oct 2026 12:00:05 GMT" }), 0, ahora)).toBe(5000);
    expect(esperaPorLimite(new Headers(), 2, 0)).toBe(4000);
  });

  it("con el cupo agotado frena un segundo; con menos del 10 % espacia los pedidos", () => {
    const h = (restante: number) =>
      new Headers({
        "X-HubSpot-RateLimit-Remaining": String(restante),
        "X-HubSpot-RateLimit-Max": "110",
        "X-HubSpot-RateLimit-Interval-Milliseconds": "10000",
      });
    expect(frenoPorCupo(h(0))).toEqual({ restante: 0, frenoMs: 1000 });
    expect(frenoPorCupo(h(5))).toEqual({ restante: 5, frenoMs: 91 });
    expect(frenoPorCupo(h(80))).toEqual({ restante: 80, frenoMs: 0 });
    expect(frenoPorCupo(new Headers())).toEqual({ restante: null, frenoMs: 0 });
  });

  it("el pedido siguiente respeta el freno del cupo", async () => {
    const { deps, esperas, eventos } = depsFalsas([res(200, { "X-HubSpot-RateLimit-Remaining": "0" }), res(200)]);
    await pedirAHubspot({ path: "/a" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    await pedirAHubspot({ path: "/b" }, credencialFija(), PRESUPUESTO_DE_JOB, deps);
    expect(esperas).toEqual([1000]);
    expect(eventos.cupo).toHaveBeenCalledWith(0);
  });
});
