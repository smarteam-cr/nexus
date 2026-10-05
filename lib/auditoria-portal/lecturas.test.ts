import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  crearLector,
  motivoDeStatus,
  nuevoRegistro,
  pedir,
  REINTENTOS_POR_LIMITE,
  REINTENTOS_POR_RED,
  type DependenciasDeRed,
} from "./lecturas";

/**
 * lib/auditoria-portal/lecturas.test.ts — UN CERO NO ES LO MISMO QUE «NO PUDE LEER».
 *
 * La falla que ataca: hasta el 2026-10-03 la auditoría devolvía `{ total: 0 }` ante un 403, un 401,
 * un 429 agotado o un 500. La pantalla y la IA leían «0 tickets» donde lo que había era «sin permiso».
 */

type Respuesta = { status: number; body?: unknown; headers?: Record<string, string>; noJson?: boolean } | "throw";

function red(respuestas: Respuesta[]): { deps: DependenciasDeRed; llamadas: string[]; esperas: number[] } {
  const llamadas: string[] = [];
  const esperas: number[] = [];
  let i = 0;
  const deps: DependenciasDeRed = {
    fetch: async (url) => {
      llamadas.push(url);
      const r = respuestas[Math.min(i++, respuestas.length - 1)];
      if (r === "throw") throw new Error("ECONNRESET");
      return new Response(r.noJson ? "<html>" : JSON.stringify(r.body ?? {}), {
        status: r.status,
        headers: r.headers,
      });
    },
    esperar: async (ms) => {
      esperas.push(ms);
    },
  };
  return { deps, llamadas, esperas };
}

describe("motivoDeStatus", () => {
  it("separa permiso, credencial, límite y el resto", () => {
    expect(motivoDeStatus(403)).toBe("sin_permiso");
    expect(motivoDeStatus(401)).toBe("credencial");
    expect(motivoDeStatus(429)).toBe("limite");
    expect(motivoDeStatus(400)).toBe("error_hubspot");
    expect(motivoDeStatus(500)).toBe("error_hubspot");
  });
});

describe("pedir", () => {
  it("un 200 devuelve el cuerpo", async () => {
    const { deps } = red([{ status: 200, body: { total: 7 } }]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: true, valor: { total: 7 } });
  });

  it("un 403 es definitivo: no reintenta y dice «sin permiso»", async () => {
    const { deps, llamadas } = red([{ status: 403 }]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: false, motivo: "sin_permiso", status: 403 });
    expect(llamadas).toHaveLength(1);
  });

  it("un 429 espera Retry-After y reintenta", async () => {
    const { deps, esperas } = red([{ status: 429, headers: { "Retry-After": "3" } }, { status: 200, body: { total: 2 } }]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: true, valor: { total: 2 } });
    expect(esperas).toEqual([3000]);
  });

  it("los 429 agotados son «límite», no un cero", async () => {
    const { deps, llamadas, esperas } = red([{ status: 429 }]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: false, motivo: "limite", status: 429 });
    expect(llamadas).toHaveLength(REINTENTOS_POR_LIMITE + 1);
    expect(esperas).toEqual([1000, 2000, 4000]);
  });

  it("un error de red se reintenta y, si sigue, es «red»", async () => {
    const { deps, llamadas } = red(["throw"]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: false, motivo: "red" });
    expect(llamadas).toHaveLength(REINTENTOS_POR_RED + 1);
  });

  it("un 200 que no es JSON no se convierte en dato", async () => {
    const { deps } = red([{ status: 200, noJson: true }]);
    expect(await pedir("u", {}, deps)).toEqual({ ok: false, motivo: "error_hubspot", status: 200 });
  });
});

describe("crearLector", () => {
  const busqueda = { objeto: "tickets", filterGroups: [] };

  it("contar devuelve el total y cuenta el intento", async () => {
    const registro = nuevoRegistro();
    const { deps } = red([{ status: 200, body: { total: 0, results: [] } }]);
    const lector = crearLector("t", registro, deps);
    // Un cero que SÍ vino de HubSpot es un cero.
    expect(await lector.contar("totales", "Total de tickets", busqueda)).toBe(0);
    expect(registro).toEqual({ intentos: 1, fallidas: [] });
  });

  it("contar devuelve null y anota la falla con su motivo", async () => {
    const registro = nuevoRegistro();
    const { deps } = red([{ status: 403 }]);
    const lector = crearLector("t", registro, deps);
    expect(await lector.contar("totales", "Total de tickets", busqueda)).toBeNull();
    expect(registro.fallidas).toEqual([
      { bloque: "totales", que: "Total de tickets", motivo: "sin_permiso", status: 403 },
    ]);
  });

  it("un 200 sin `total` numérico es una falla, no un cero", async () => {
    const registro = nuevoRegistro();
    const { deps } = red([{ status: 200, body: { results: [] } }]);
    expect(await crearLector("t", registro, deps).contar("totales", "Total de tickets", busqueda)).toBeNull();
    expect(registro.fallidas[0]?.motivo).toBe("error_hubspot");
  });

  it("leer manda el token en la cabecera salvo que se pida lo contrario", async () => {
    const vistos: (RequestInit | undefined)[] = [];
    const deps: DependenciasDeRed = {
      fetch: async (_url, init) => {
        vistos.push(init);
        return new Response("{}", { status: 200 });
      },
      esperar: async () => {},
    };
    const lector = crearLector("secreto", nuevoRegistro(), deps);
    await lector.leer("workflows", "x", "/automation/v3/workflows");
    await lector.leer("cuenta", "y", "/oauth/v1/access-tokens/secreto", { conToken: false });
    expect((vistos[0]?.headers as Record<string, string>).Authorization).toBe("Bearer secreto");
    expect(vistos[1]?.headers).toBeUndefined();
  });
});

describe("⛔ la auditoría no le habla a HubSpot por fuera del lector", () => {
  const RAIZ = path.resolve(__dirname, "../..");
  const fuente = fs
    .readFileSync(path.join(RAIZ, "lib/hubspot/portal-analyzer.ts"), "utf8")
    // Los comentarios pueden NOMBRAR `fetch` para explicar la regla.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("portal-analyzer.ts no llama a fetch: todo pasa por crearLector", () => {
    expect(fuente, "volvió un fetch directo: un error suyo puede terminar en un cero").not.toMatch(/\bfetch\s*\(/);
  });

  it("no hay ceros de relleno", () => {
    expect(fuente).not.toMatch(/total:\s*0\b/);
  });
});
