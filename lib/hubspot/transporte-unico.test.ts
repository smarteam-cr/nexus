/**
 * lib/hubspot/transporte-unico.test.ts — NADIE HABLA CON HUBSPOT FUERA DEL TRANSPORTE (U6, 2026-10-24).
 *
 * Hasta el 2026-10-24 el reintento ante un 401 estaba copiado en 14 lugares, el bloque de refrescar y guardar el
 * token en 5, y 7 scripts llamaban a `oauth/v1/token` por su cuenta (alguno refrescaba SIN guardar). Cada copia
 * envejecía por separado y ninguna esperaba ante un 429. Ahora el pedido es uno (lib/hubspot/transporte.ts, cableado
 * en lib/hubspot/client.ts) y esta prueba impide que vuelva una copia:
 *
 * 1. El literal `api.hubapi.com` solo aparece en el transporte y en client.ts (el OAuth). La única excepción es la
 *    auditoría de portales (`lib/auditoria-portal/lecturas.ts`): es el motor separado de auditoría, no importa nada
 *    de Nexus a propósito, lee con el token de un portal de cliente que no se renueva y ya espera `Retry-After`
 *    (fue el molde de esto). Si se suma otra excepción, va acá con su razón.
 * 2. `oauth/v1/token` (el refresh) solo en client.ts.
 * 3. Nadie fuera de client.ts llama a `forceRefreshSystemToken` ni a `refreshAccessToken`: el 401 lo resuelve el
 *    transporte, y un refresh suelto que no guarda rompe el token de los demás entornos.
 * 4. Nadie arma un cliente del SDK con un token a mano (`new Client({ accessToken })`): ese cliente no pasa por el
 *    transporte. Se pide con `getSystemHubspotClient` / `getHubspotClient`, o `pedirConToken` para un token suelto.
 *
 * Los comentarios cuentan: una URL escrita en un comentario es la semilla de la próxima copia. Si hace falta nombrar
 * el host en un comentario, se nombra el transporte.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, "/");

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return out;
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.(tsx?|m?js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  recorrer(abs);
  return out;
}

const RAICES = fs
  .readdirSync(RAIZ, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.(tsx?|m?js)$/.test(e.name))
  .map((e) => path.join(RAIZ, e.name));

const TODO = [...archivosDe("lib"), ...archivosDe("app"), ...archivosDe("components"), ...archivosDe("hooks"), ...archivosDe("scripts"), ...RAICES];

const TRANSPORTE = new Set(["lib/hubspot/client.ts", "lib/hubspot/transporte.ts"]);
const EXCEPCIONES_DEL_HOST: Record<string, string> = {
  "lib/auditoria-portal/lecturas.ts": "motor de auditoría separado: token de un portal de cliente, fetch inyectado, ya espera Retry-After",
};

function quienesDicen(patron: RegExp, permitidos: (f: string) => boolean): string[] {
  return TODO.map((f) => [rel(f), fs.readFileSync(f, "utf8")] as const)
    .filter(([r, src]) => !permitidos(r) && patron.test(src))
    .map(([r]) => r)
    .sort();
}

describe("un solo transporte para HubSpot", () => {
  it("la prueba ve el código (si no encuentra el transporte, no está mirando nada)", () => {
    const vistos = new Set(TODO.map(rel));
    for (const f of TRANSPORTE) expect(vistos.has(f), f).toBe(true);
    expect(TODO.length).toBeGreaterThan(500);
  });

  it("⭐ nadie nombra el host de la API de HubSpot fuera del transporte", () => {
    const fuera = quienesDicen(/api\.hubapi\.com/, (r) => TRANSPORTE.has(r) || r in EXCEPCIONES_DEL_HOST);
    expect(
      fuera,
      "Estos archivos le hablan a HubSpot por su cuenta: usa getSystemHubspotClient().apiRequest(...) (o getHubspotClient / pedirConToken) de lib/hubspot/client.ts",
    ).toEqual([]);
  });

  it("el refresh del token (oauth/v1/token) vive solo en client.ts", () => {
    expect(quienesDicen(/oauth\/v1\/token/, (r) => r === "lib/hubspot/client.ts")).toEqual([]);
  });

  it("nadie fuera de client.ts refresca el token a mano", () => {
    const fuera = quienesDicen(/\b(forceRefreshSystemToken|refreshAccessToken)\s*\(/, (r) => r === "lib/hubspot/client.ts");
    expect(fuera, "El 401 lo resuelve el transporte; para un token, getSystemAccessToken / getAccountAccessToken").toEqual([]);
  });

  it("nadie arma un cliente del SDK con un token a mano", () => {
    const fuera = quienesDicen(/new\s+\w*Client\s*\(\s*\{\s*accessToken/, (r) => r === "lib/hubspot/client.ts");
    expect(fuera, "Ese cliente no pasa por el transporte: pídelo a lib/hubspot/client.ts").toEqual([]);
  });

  it("la excepción sigue existiendo (si se borra el archivo, se borra la excepción)", () => {
    for (const f of Object.keys(EXCEPCIONES_DEL_HOST)) expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(true);
  });
});
