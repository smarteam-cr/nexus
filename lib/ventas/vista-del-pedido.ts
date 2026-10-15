/**
 * lib/ventas/vista-del-pedido.ts — la vista de Ventas, una sola vez por pedido. SERVER-ONLY.
 *
 * «Para ti» la necesita dos veces en el mismo render: la fuente de negocios (las preguntas) y la sección de Ventas (la
 * cartera). `cache` de React la calcula una vez por pedido; fuera de un render (el número del menú) se calcula de nuevo.
 */
import "server-only";
import { cache } from "react";
import { vistaDeVentas } from "./cartera-server";

const porPedido = cache((id: string, email: string, hoyISO: string, ahoraMs: number) =>
  vistaDeVentas({ id, email }, new Date(ahoraMs), hoyISO),
);

export function vistaDeVentasDelPedido(id: string, email: string, hoyISO: string, ahora: Date) {
  // Redondeado al minuto: dos llamadas del mismo render comparten la clave aunque pidan la hora por separado.
  return porPedido(id, email, hoyISO, Math.floor(ahora.getTime() / 60_000) * 60_000);
}
