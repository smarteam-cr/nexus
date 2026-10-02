/**
 * lib/cobranza/mercury/transporte.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/mercury --project unit`.
 *
 * El cliente de la API con un `fetch` de mentira: que lea todas las páginas (con el cursor que dice Mercury y, en los
 * movimientos, que no lo dice), que cada error diga su clase, que solo pida GET y que el token no aparezca nunca en un
 * mensaje.
 */
import { describe, it, expect } from "vitest";
import { configDesdeEntorno, crearTransporteHttp } from "./transporte-http";
import { MercuryError, claseDeStatus, esTransitorio } from "./transporte";

type Pedido = { url: string; init: RequestInit | undefined };

function fetchDe(respuestas: Array<{ status?: number; body: unknown }>) {
  const pedidos: Pedido[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init });
    const r = respuestas.shift() ?? { body: {} };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, pedidos };
}

const TOKEN = "secret-token:mercury_production_wma_SECRETO";

describe("el cliente de la API de Mercury", () => {
  it("lee todas las páginas de facturas siguiendo `nextPage`", async () => {
    const { f, pedidos } = fetchDe([
      { body: { invoices: [{ id: "a" }, { id: "b" }], page: { nextPage: "b" } } },
      { body: { invoices: [{ id: "c" }], page: {} } },
    ]);
    const t = crearTransporteHttp({ token: TOKEN, fetch: f });
    expect((await t.facturas()).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(pedidos[1]!.url).toContain("start_after=b");
    expect(pedidos.every((p) => p.init?.method === "GET"), "⛔ solo lee").toBe(true);
    expect((pedidos[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("los movimientos no dicen la página siguiente: se sigue desde el último mientras la página venga llena", async () => {
    const llena = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}` }));
    const { f, pedidos } = fetchDe([{ body: { transactions: llena, page: {} } }, { body: { transactions: [{ id: "t1000" }], page: {} } }]);
    const t = crearTransporteHttp({ token: TOKEN, fetch: f });
    expect(await t.movimientos("2025-01-01")).toHaveLength(1001);
    expect(pedidos[0]!.url).toContain("start=2025-01-01");
    expect(pedidos[1]!.url).toContain("start_after=t999");
  });

  it("⛔ un token rechazado es TOKEN, y el token no aparece en el mensaje aunque Mercury lo repita", async () => {
    const { f } = fetchDe([{ status: 401, body: `{"error":"invalid token ${TOKEN}"}` }]);
    const t = crearTransporteHttp({ token: TOKEN, fetch: f });
    const e = await t.clientes().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MercuryError);
    expect((e as MercuryError).clase).toBe("TOKEN");
    expect((e as MercuryError).message).not.toContain("SECRETO");
  });

  it("cada error dice su clase, y solo la red y el «esperá» se reintentan", () => {
    expect([401, 403, 429, 500, 404].map(claseDeStatus)).toEqual(["TOKEN", "PERMISO", "LIMITE", "RED", "PROTOCOLO"]);
    expect(["RED", "LIMITE", "TOKEN", "PERMISO", "PROTOCOLO"].map((c) => esTransitorio(c as never))).toEqual([true, true, false, false, false]);
  });

  it("el token del .env, con o sin comillas; sin token, TOKEN", () => {
    expect(configDesdeEntorno({ MERCURY_API_TOKEN: `"${TOKEN}"` }).token).toBe(TOKEN);
    expect(configDesdeEntorno({ MERCURY_API_TOKEN: TOKEN }).token).toBe(TOKEN);
    expect(() => configDesdeEntorno({})).toThrow(MercuryError);
  });
});
