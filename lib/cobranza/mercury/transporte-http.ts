/**
 * lib/cobranza/mercury/transporte-http.ts
 *
 * El ÚNICO archivo del módulo que habla con Mercury por la red (lo vigila guardas.test.ts). Implementa el puerto de
 * transporte.ts con la API REST v1: `Authorization: Bearer <token>`, páginas de hasta 1000 y cursor `start_after`.
 *
 * ⛔ Solo GET. El token es de solo lectura, y además acá no hay una sola línea que pida otra cosa: si algún día
 * Nexus tiene que escribir en Mercury, va en otro archivo, con su propia decisión escrita.
 * ⛔ El token nunca se imprime ni viaja en un mensaje de error.
 */
import { claseDeStatus, MercuryError, type MercuryTransport } from "./transporte";

const BASE = "https://api.mercury.com/api/v1";
/** Una página: el máximo que acepta la API. */
const POR_PAGINA = 1000;
/** Un tope de páginas por pedido: con 1000 por página es un millón de filas. Si se pasa, algo está mal. */
const MAX_PAGINAS = 100;

export interface ConfigMercury {
  token: string;
  /** Cuánto se espera cada respuesta. */
  timeoutMs?: number;
  /** Solo para pruebas. */
  fetch?: typeof fetch;
}

/**
 * El token del `.env`. Se le sacan las comillas si las trae: `MERCURY_API_TOKEN="secret-token:…"` es la forma en que
 * cualquiera lo pega, y dotenv no siempre las saca.
 */
export function configDesdeEntorno(env: Record<string, string | undefined> = process.env): ConfigMercury {
  const token = (env.MERCURY_API_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
  if (!token) throw new MercuryError("TOKEN", "Falta MERCURY_API_TOKEN en el .env de este servidor.");
  return { token };
}

export function crearTransporteHttp(config: ConfigMercury): MercuryTransport {
  const f = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 60_000;

  async function pedir(path: string): Promise<Record<string, unknown>> {
    let r: Response;
    try {
      r = await f(`${BASE}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new MercuryError("RED", `${path.split("?")[0]}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const texto = await r.text();
    if (!r.ok) {
      /* El cuerpo puede repetir el encabezado: se recorta y se le saca cualquier cosa con forma de token. */
      const limpio = texto.replace(/secret-token:[^\s"']+/g, "secret-token:…").slice(0, 200);
      throw new MercuryError(claseDeStatus(r.status), `${path.split("?")[0]} respondió ${r.status}: ${limpio}`);
    }
    try {
      return JSON.parse(texto) as Record<string, unknown>;
    } catch {
      throw new MercuryError("PROTOCOLO", `${path.split("?")[0]} no devolvió JSON: ${texto.slice(0, 120)}`);
    }
  }

  /**
   * Todas las páginas de una lista. Mercury dice la siguiente en `page.nextPage`; los movimientos no la dicen, así que
   * se sigue desde el último id mientras la página venga llena.
   */
  async function todas(ruta: string, clave: string, extra = ""): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < MAX_PAGINAS; i++) {
      const q = `${ruta}?limit=${POR_PAGINA}&order=asc${extra}${cursor ? `&start_after=${encodeURIComponent(cursor)}` : ""}`;
      const r = await pedir(q);
      const filas = r[clave];
      if (!Array.isArray(filas)) throw new MercuryError("PROTOCOLO", `${ruta} no trajo «${clave}».`);
      out.push(...(filas as Record<string, unknown>[]));
      const siguiente = (r.page as { nextPage?: unknown } | undefined)?.nextPage;
      if (typeof siguiente === "string" && siguiente) cursor = siguiente;
      else if (filas.length === POR_PAGINA) cursor = String((filas[filas.length - 1] as { id?: unknown }).id ?? "");
      else return out;
      if (!cursor) return out;
    }
    throw new MercuryError("PROTOCOLO", `${ruta} pasó de ${MAX_PAGINAS} páginas: no se siguió leyendo.`);
  }

  return {
    facturas: () => todas("/ar/invoices", "invoices"),
    clientes: () => todas("/ar/customers", "customers"),
    movimientos: (desde) => todas("/transactions", "transactions", `&start=${encodeURIComponent(desde)}`),
  };
}
