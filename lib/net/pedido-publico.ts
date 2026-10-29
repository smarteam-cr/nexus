/**
 * lib/net/pedido-publico.ts — pedir una URL de internet sin dejar que el servidor llegue a lo de adentro. SERVIDOR.
 *
 * Las reglas de qué es público viven en direccion-publica.ts. Acá:
 *   - antes de CADA pedido se resuelve el host y se rechaza si alguna de sus IPs es interna;
 *   - la conexión va a las IPs que se validaron (transporte.ts), sin volver a preguntarle al DNS: un dominio
 *     que responde una IP pública a la consulta y una interna a la conexión (DNS rebinding) no pasa;
 *   - las redirecciones se siguen a mano y cada destino pasa por la misma validación (forma + DNS);
 *     quien llama puede acotarlas más con `permitirSalto` (por ejemplo, solo dentro del mismo sitio);
 *   - la señal de corte cubre también la consulta de DNS;
 *   - el cuerpo se lee con tope de bytes.
 */
import "server-only";
import { lookup } from "node:dns/promises";
import { hostDeUrl, ipInterna, motivoUrlNoPublica, type MotivoUrlNoPublica } from "./direccion-publica";
import { pedirConIpFija } from "./transporte";

export type MotivoPedidoRechazado =
  | MotivoUrlNoPublica
  /** El host resuelve (al menos) a una IP interna. */
  | "IP_INTERNA"
  /** El host no resuelve. */
  | "SIN_DNS"
  /** Una redirección sin destino, o a un destino que quien llama no permite. */
  | "REDIRECCION"
  | "DEMASIADAS_REDIRECCIONES";

export class PedidoRechazado extends Error {
  readonly motivo: MotivoPedidoRechazado;
  /** La URL del salto que se rechazó. */
  readonly url: string;
  /** Qué salto se rechazó: 0 es la URL pedida, 1 la primera redirección… */
  readonly salto: number;
  constructor(motivo: MotivoPedidoRechazado, url: string, salto: number) {
    super(`Pedido rechazado (${motivo}, salto ${salto}): ${url}`);
    this.name = "PedidoRechazado";
    this.motivo = motivo;
    this.url = url;
    this.salto = salto;
  }
}

/** La promesa, o el corte de la señal si llega antes. */
function conCorte<T>(promesa: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promesa;
  signal.throwIfAborted();
  return new Promise<T>((resolver, rechazar) => {
    const alCortar = () => rechazar(signal.reason);
    signal.addEventListener("abort", alCortar, { once: true });
    promesa.then(resolver, rechazar).finally(() => signal.removeEventListener("abort", alCortar));
  });
}

export type ResolucionDelHost = { tipo: "publica"; ips: string[] } | { tipo: "interna" } | { tipo: "sin-dns" };

/** ¿El host resuelve, y solo a IPs públicas? Si sí, las IPs a las que conectarse, en el orden del DNS. */
export async function resolucionDelHost(host: string, signal?: AbortSignal): Promise<ResolucionDelHost> {
  let ips: { address: string }[];
  try {
    ips = await conCorte(lookup(host, { all: true, verbatim: true }), signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    return { tipo: "sin-dns" };
  }
  if (ips.length === 0) return { tipo: "sin-dns" };
  if (ips.some((d) => ipInterna(d.address))) return { tipo: "interna" };
  return { tipo: "publica", ips: ips.map((d) => d.address) };
}

/** Valida la forma y el DNS del salto, y devuelve las IPs públicas a las que conectarse. */
async function validarSalto(url: URL, salto: number, signal: AbortSignal | undefined): Promise<string[]> {
  const motivo = motivoUrlNoPublica(url);
  if (motivo) throw new PedidoRechazado(motivo, url.toString(), salto);
  const resolucion = await resolucionDelHost(hostDeUrl(url), signal);
  if (resolucion.tipo === "interna") throw new PedidoRechazado("IP_INTERNA", url.toString(), salto);
  if (resolucion.tipo === "sin-dns") throw new PedidoRechazado("SIN_DNS", url.toString(), salto);
  return resolucion.ips;
}

export interface OpcionesDelPedido {
  /** Encabezados y señal de corte; el método (GET) y las redirecciones los maneja esta función. */
  headers?: HeadersInit;
  signal?: AbortSignal;
  maxRedirecciones: number;
  /** Una condición más para seguir una redirección (la forma y el DNS se validan igual). */
  permitirSalto?: (destino: URL) => boolean;
}

/**
 * Pide la URL con GET y sigue las redirecciones a mano, validando cada salto. Devuelve la respuesta
 * final (que puede no ser 2xx) y la URL que la dio. Lanza `PedidoRechazado` si algún salto no es de
 * internet; los errores de red y de corte salen tal cual.
 */
export async function pedirUrlPublica(inicial: URL, opciones: OpcionesDelPedido): Promise<{ res: Response; url: URL }> {
  let url = inicial;
  for (let salto = 0; ; salto++) {
    const ips = await validarSalto(url, salto, opciones.signal);
    opciones.signal?.throwIfAborted();
    const res = await pedirConIpFija(url, ips, { headers: opciones.headers, signal: opciones.signal });
    if (res.status < 300 || res.status >= 400 || res.status === 304) return { res, url };

    await res.body?.cancel().catch(() => {});
    const destino = res.headers.get("location");
    if (!destino) throw new PedidoRechazado("REDIRECCION", url.toString(), salto + 1);
    let siguiente: URL;
    try {
      siguiente = new URL(destino, url);
    } catch {
      throw new PedidoRechazado("REDIRECCION", url.toString(), salto + 1);
    }
    if (salto >= opciones.maxRedirecciones) throw new PedidoRechazado("DEMASIADAS_REDIRECCIONES", siguiente.toString(), salto + 1);
    if (opciones.permitirSalto && !opciones.permitirSalto(siguiente)) throw new PedidoRechazado("REDIRECCION", siguiente.toString(), salto + 1);
    url = siguiente;
  }
}

/** Lee el cuerpo hasta `max` bytes. `cortado` dice si había más. */
export async function leerCuerpoHasta(res: Response, max: number): Promise<{ bytes: Buffer; cortado: boolean }> {
  if (!res.body) return { bytes: Buffer.alloc(0), cortado: false };
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return { bytes: Buffer.concat(partes), cortado: false };
    if (total + value.byteLength > max) {
      partes.push(value.subarray(0, max - total));
      await lector.cancel().catch(() => {});
      return { bytes: Buffer.concat(partes), cortado: true };
    }
    total += value.byteLength;
    partes.push(value);
  }
}
