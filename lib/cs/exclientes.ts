/**
 * lib/cs/exclientes.ts — una cuenta marcada «excliente» sale de todo lo que pide atención (2026-10-17). PURO.
 *
 * Elías, validando «Para ti» en producción: Wherex ya no es cliente y seguía en las alertas y en las carteras, porque
 * en HubSpot quedó un proyecto activo. La regla: la clasificación CONFIRMADA «excliente» (`ClasificacionDeCuenta`,
 * lib/cs/clasificacion.ts) manda sobre los proyectos activos y las suscripciones.
 *
 * · Sale de: las alertas (no se crean ni se muestran: vigía, renovaciones, lectura de reuniones), «A quién llamar», las
 *   carteras del CSE y de la CSL, «Lo que importa hoy», «Cuenta sin acción» y los recordatorios de adopción.
 * · Se ve solo en Éxito del cliente › Cartera › «Fuera de la cartera», marcada «Excliente».
 * · Mientras siga algo activo (un proyecto en HubSpot, un servicio recurrente en Cobranza), la lista de limpieza
 *   (lib/limpieza) le pide al responsable cerrarlo.
 *
 * Lo propuesto por Nexus NO alcanza: solo lo que confirmó la CSL. Proponer «excliente» sigue siendo de
 * `proponerRelacion`; confirmar, de una persona.
 *
 * Un solo punto: las pantallas y los jobs leen `cuentasExcliente()` (./exclientes-server.ts) o, donde ya tienen la
 * clasificación a mano, `esExcliente()`. Nadie escribe `relacion: "excliente"` en una consulta.
 */

import type { Prisma } from "@prisma/client";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";


/** El valor de la relación que saca a una cuenta de todo lo que pide atención. */
export const EXCLIENTE = "excliente";

/**
 * Para las consultas que ya filtran clientes en la base (el vigía, las renovaciones): los que NO son exclientes. Un
 * cliente sin fila de clasificación pasa. ⚠ Pide la tabla `ClasificacionDeCuenta` (SQL del 2026-10-07, aplicado).
 */
export const CLIENTE_NO_EXCLIENTE_WHERE: Prisma.ClientWhereInput = { NOT: { clasificacion: { is: { relacion: EXCLIENTE } } } };

/** La cartera de Customer Success sin los exclientes: `CS_CLIENT_WHERE` y además no excliente. */
export const CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE: Prisma.ClientWhereInput = { AND: [CS_CLIENT_WHERE, CLIENTE_NO_EXCLIENTE_WHERE] };

/**
 ¿La CSL confirmó que la cuenta es un excliente? Lo propuesto no cuenta. */
export function esExcliente(g: { relacion: string | null } | null | undefined): boolean {
  return g?.relacion === EXCLIENTE;
}

/** Saca de una lista lo que es de un excliente (por su cuenta). */
export function sinExclientes<T>(items: readonly T[], exclientes: ReadonlySet<string>, cuenta: (x: T) => string | null | undefined): T[] {
  if (exclientes.size === 0) return [...items];
  return items.filter((x) => {
    const id = cuenta(x);
    return !id || !exclientes.has(id);
  });
}
