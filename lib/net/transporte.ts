/**
 * lib/net/transporte.ts — un GET que se conecta a las IPs que se le dan, no a las que diga el DNS. SERVIDOR.
 *
 * Es lo que cierra el DNS rebinding en pedido-publico.ts: las IPs que se validaron son las mismas a las
 * que se conecta, porque la conexión no vuelve a preguntarle al DNS (un `lookup` propio que las devuelve).
 * Se le dan todas, no solo la primera: si una no responde (una IPv6 sin salida, por ejemplo), Node prueba
 * la siguiente, como haría con el DNS.
 * El `fetch` de Node no deja hacerlo sin sumar `undici` como dependencia; `node:http(s)` sí. El nombre
 * del host sigue yendo en el encabezado `Host` y en el SNI, así que el certificado se valida contra el
 * dominio de siempre.
 *   - No sigue redirecciones: las sigue pedido-publico.ts, validando cada salto.
 *   - Descomprime gzip, deflate y br, como `fetch`.
 *   - Devuelve una `Response` web, para que quien llama la lea igual que la de `fetch`.
 */
import "server-only";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

/** Respuestas que no pueden llevar cuerpo (el constructor de `Response` lo rechaza). */
const SIN_CUERPO = new Set([101, 204, 205, 304]);

function decodificador(encoding: string | undefined): NodeJS.ReadWriteStream | null {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/** Un `lookup` que siempre contesta las mismas IPs, sin consultar el DNS. */
function lookupFijo(ips: string[]): LookupFunction {
  const direcciones = ips.map((address) => ({ address, family: isIP(address) }));
  return (_host, opciones, callback) => {
    if (opciones?.all) (callback as (e: null, a: { address: string; family: number }[]) => void)(null, direcciones);
    else callback(null, direcciones[0].address, direcciones[0].family);
  };
}

export interface PedidoConIpFija {
  headers?: HeadersInit;
  signal?: AbortSignal;
}

/** GET a `url` conectándose a `ips`. Los errores de red y de corte salen como los de `fetch` (rechazo de la promesa). */
export function pedirConIpFija(url: URL, ips: string[], opciones: PedidoConIpFija = {}): Promise<Response> {
  if (ips.length === 0) return Promise.reject(new Error("pedirConIpFija: sin IPs"));
  const cliente = url.protocol === "https:" ? https : http;
  const headers: Record<string, string> = { "accept-encoding": "gzip, deflate, br" };
  new Headers(opciones.headers).forEach((valor, clave) => {
    headers[clave] = valor;
  });

  return new Promise<Response>((resolver, rechazar) => {
    const req = cliente.request(
      url,
      { method: "GET", headers, signal: opciones.signal, lookup: lookupFijo(ips), agent: false },
      (res) => {
        const status = res.statusCode ?? 0;
        const encabezados = new Headers();
        for (const [clave, valor] of Object.entries(res.headers)) {
          if (valor === undefined) continue;
          for (const v of Array.isArray(valor) ? valor : [valor]) encabezados.append(clave, v);
        }
        if (SIN_CUERPO.has(status)) {
          res.resume();
          resolver(new Response(null, { status, headers: encabezados }));
          return;
        }
        let cuerpo: Readable = res;
        const d = decodificador(res.headers["content-encoding"]);
        if (d) {
          cuerpo = res.pipe(d) as unknown as Readable;
          res.on("error", (e) => cuerpo.destroy(e));
          // Si se deja de leer (tope de bytes, compresión dañada), se cierra también la conexión.
          cuerpo.on("close", () => res.destroy());
          encabezados.delete("content-encoding");
          encabezados.delete("content-length");
        }
        try {
          resolver(new Response(Readable.toWeb(cuerpo) as ReadableStream<Uint8Array>, { status, headers: encabezados }));
        } catch (e) {
          res.destroy();
          rechazar(e);
        }
      },
    );
    req.on("error", rechazar);
    req.end();
  });
}
