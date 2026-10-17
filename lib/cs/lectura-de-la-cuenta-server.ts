/**
 * lib/cs/lectura-de-la-cuenta-server.ts — la lectura de una o varias cuentas (fase 1.2). SERVIDOR.
 *
 * Arma las cuentas con la MISMA carga que la cartera de Éxito del cliente (`cargarCuentas`), así el color y los
 * motivos que ve el CSE en la ficha son los que ve la CSL en la cartera. La regla vive en ./lectura-de-la-cuenta.ts.
 *
 * Quién la ve (`puedeVerLaLectura`): quien lidera Customer Success (la CSL y dirección) y el CSE de la cuenta, que es el
 * encargado en HubSpot de alguno de sus proyectos de Customer Success. Al CSE le llega sin lo que habla de plata.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { cargarCuentas, hoyEnCostaRica } from "./cartera";
import { saludDeLaCuenta } from "./cartera-reglas";
import { esLiderDeCs } from "./acceso";
import { esCseDeLaCuenta } from "./adopcion-del-cse-server";
import { lecturaDeLaCuenta, type LecturaDeLaCuenta } from "./lectura-de-la-cuenta";

export interface LecturaConCuenta extends LecturaDeLaCuenta {
  clientId: string;
  nombreDeLaCuenta: string;
}

/**
 * Las lecturas de esas cuentas. Una cuenta que no está en la cartera (sin proyecto ni suscripción activos, o que no es
 * un cliente) no tiene lectura: no hay nada que acompañar.
 */
export async function cargarLecturas(
  clientIds: readonly string[],
  opciones: { sinPlata?: boolean; ahora?: Date } = {},
): Promise<Map<string, LecturaConCuenta>> {
  const out = new Map<string, LecturaConCuenta>();
  const ids = [...new Set(clientIds)].filter(Boolean);
  if (ids.length === 0) return out;
  const [cuentas, nombres] = await Promise.all([
    cargarCuentas(null, { clientIds: ids }),
    // El nombre del cliente, no el de la cartera (que puede ser su dominio): es lo que se lee en «Para ti».
    prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.name]));
  const hoy = hoyEnCostaRica(opciones.ahora ?? new Date());
  for (const c of cuentas) {
    const lectura = lecturaDeLaCuenta(saludDeLaCuenta(c, hoy), c.alertas, { sinPlata: opciones.sinPlata });
    out.set(c.clientId, { ...lectura, clientId: c.clientId, nombreDeLaCuenta: nombrePorId.get(c.clientId) ?? c.nombre });
  }
  return out;
}

/** ¿Esta persona ve la lectura de la cuenta? null = no; si la ve, si es sin lo que habla de plata. */
export async function puedeVerLaLectura(
  clientId: string,
  persona: { rol: string | null | undefined; email: string | null | undefined },
): Promise<{ sinPlata: boolean } | null> {
  if (esLiderDeCs(persona.rol)) return { sinPlata: false };
  if (await esCseDeLaCuenta(clientId, persona.email)) return { sinPlata: true };
  return null;
}
