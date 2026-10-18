/**
 * lib/mi-dia/lecturas-server.ts — las cuentas de Éxito del cliente (`cargarCuentas`) y su lectura
 * (lib/cs/lectura-de-la-cuenta-server.ts), una vez por pedido. SERVER-ONLY.
 *
 * El inicio («Para ti») mide (`medirParaTi`, con «Tus cuentas en riesgo»), arma las cuentas del inicio
 * (`cuentasDelInicio`) y la cartera de Customer Success (`cargarCarteraDeCs`) sobre las mismas cuentas: sin esto, la
 * cartera se cargaba dos o tres veces por visita. `cache()` de React comparte la promesa dentro de un mismo render
 * del servidor; fuera de uno (una ruta, un script), es la llamada de siempre. La clave es un texto (no el array):
 * `cache` compara los argumentos por identidad.
 */
import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { cargarCuentas } from "@/lib/cs/cartera";
import type { CuentaDeCartera } from "@/lib/cs/cartera-reglas";
import { lecturasDesdeCuentas, type LecturaConCuenta } from "@/lib/cs/lectura-de-la-cuenta-server";

const claveDe = (clientIds: readonly string[]) => [...new Set(clientIds)].filter(Boolean).sort().join(",");

const cuentasPorClave = cache((ids: string): Promise<CuentaDeCartera[]> => (ids ? cargarCuentas(null, { clientIds: ids.split(",") }) : Promise.resolve([])));

/** Las cuentas de la cartera de Éxito del cliente, armadas una vez por pedido. */
export function cuentasDelPedido(clientIds: readonly string[]): Promise<CuentaDeCartera[]> {
  return cuentasPorClave(claveDe(clientIds));
}

const porClave = cache(async (ids: string, sinPlata: boolean, ahoraMs: number): Promise<Map<string, LecturaConCuenta>> => {
  if (!ids) return new Map();
  const lista = ids.split(",");
  const [cuentas, nombres] = await Promise.all([
    cuentasPorClave(ids),
    // El nombre del cliente, no el de la cartera (que puede ser su dominio): es lo que se lee en «Para ti».
    prisma.client.findMany({ where: { id: { in: lista } }, select: { id: true, name: true } }),
  ]);
  return lecturasDesdeCuentas(cuentas, new Map(nombres.map((n) => [n.id, n.name])), { sinPlata, ahora: new Date(ahoraMs) });
});

export function lecturasDelPedido(
  clientIds: readonly string[],
  opciones: { sinPlata: boolean; ahora: Date },
): Promise<Map<string, LecturaConCuenta>> {
  return porClave(claveDe(clientIds), opciones.sinPlata, opciones.ahora.getTime());
}
